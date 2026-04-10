import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../gemini/gemini.service';
import {
  NegotiationStatus,
  PropertyStatus,
  PropertyType,
  AiActionType,
  DealStatus,
  Prisma,
} from '@prisma/client';
import { NegotiationAction, NegotiationResult, ActionResult, COMMISSION_RATE } from './negotiation.types';
import { ConversationContext, ConversationResponse } from '../common';
import {
  INITIAL_OFFER_FACTOR,
  MAX_ROUNDS,
  CONCESSION_SCHEDULE,
} from './constants/negotiation.constants';

@Injectable()
export class NegotiationService {
  private readonly logger = new Logger(NegotiationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  // ─── T49: startNegotiation ──────────────────────────────────

  /**
   * Start a new negotiation for a property.
   *
   * - minPrice  = property listing price (the floor the seller will accept).
   * - Initial offer = buyerMaxPrice × 0.85  (anchor strategy per constitution).
   */
  async startNegotiation(
    propertyId: string,
    buyerId: string,
    buyerMaxPrice: number,
  ): Promise<NegotiationResult> {
    this.logger.log(`startNegotiation: property=${propertyId} buyer=${buyerId}`);

    // ── 1. Load and validate the property ──────────────────────
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }
    if (property.propertyStatus !== PropertyStatus.ACTIVE) {
      throw new BadRequestException(`Property ${propertyId} is not ACTIVE`);
    }
    if (property.userId === buyerId) {
      throw new BadRequestException('Buyer cannot be the seller of the property');
    }

    // ── 2. Prevent duplicate active negotiation ─────────────────
    const existing = await this.prisma.negotiation.findFirst({
      where: { propertyId, buyerId, status: NegotiationStatus.ACTIVE },
    });
    if (existing) {
      throw new ConflictException(
        'An active negotiation already exists for this property and buyer',
      );
    }

    // ── 3. Compute initial offer ────────────────────────────────
    const minPrice = this.round2dp(Number(property.price)); // listing price = floor
    const initialOffer = this.round2dp(buyerMaxPrice * INITIAL_OFFER_FACTOR);

    // ── 4. Persist atomically ───────────────────────────────────
    return this.prisma.$transaction(async (tx) => {
      const negotiation = await tx.negotiation.create({
        data: {
          propertyId,
          buyerId,
          sellerId: property.userId,
          status: NegotiationStatus.ACTIVE,
          currentOffer: initialOffer,
          minPrice,       // listing price — serves as floor for auto-accept
          maxPrice: buyerMaxPrice,
          roundNumber: 1, // round 1 = initial offer
        },
      });

      await tx.offer.create({
        data: {
          negotiationId: negotiation.id,
          amount: initialOffer,
          round: 1,
          createdBy: 'SYSTEM',
        },
      });

      const message = await this.formatMessageWithGemini('counter', initialOffer, 1);

      await tx.aiLog.create({
        data: {
          negotiationId: negotiation.id,
          actionType: AiActionType.ASK,
          message,
          data: { initialOffer, buyerMaxPrice, minPrice } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `Negotiation ${negotiation.id} created — initial offer: ${initialOffer} EGP`,
      );

      return {
        negotiationId: negotiation.id,
        propertyId,
        buyerId,
        sellerId: property.userId,
        initialOffer,
        minPrice,
        maxPrice: buyerMaxPrice,
        roundNumber: 1,
        status: NegotiationStatus.ACTIVE,
        message,
      };
    });
  }

  // ─── T52: handleAction ──────────────────────────────────────

  /**
   * Handle one of the 3 user actions: accept | reject | request_counter.
   *
   * request_counter flow:
   *   - Increment roundNumber.
   *   - If roundNumber > MAX_ROUNDS (6) → auto-FAIL.
   *   - Else → calculateCounterOffer() using the constitution formula.
   *   - If counterOffer >= minPrice (listing price) → auto-accept, create Deal.
   */
  async handleAction(
    negotiationId: string,
    action: NegotiationAction,
  ): Promise<ActionResult> {
    this.logger.log(`handleAction: negotiation=${negotiationId} action=${action}`);

    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: { property: true },
    });

    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }
    if (negotiation.status !== NegotiationStatus.ACTIVE) {
      throw new BadRequestException(
        `Negotiation ${negotiationId} is already ${negotiation.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Working copies — mutated per action branch
      let status: NegotiationStatus = NegotiationStatus.ACTIVE;
      let roundNumber = negotiation.roundNumber;
      let currentOffer = Number(negotiation.currentOffer);
      const minPrice = Number(negotiation.minPrice ?? 0);
      const maxPrice = Number(negotiation.maxPrice ?? currentOffer);
      let dealId: string | null = null;
      let autoAccepted = false;
      let actionType: AiActionType;
      let message: string;

      // ── Branch on action ────────────────────────────────────

      if (action === 'accept') {
        // Explicit accept at the current standing offer
        ({ dealId, status, actionType, message } = await this.executeAccept(
          tx,
          negotiationId,
          negotiation.buyerId,
          negotiation.sellerId,
          negotiation.propertyId,
          negotiation.property.type,
          currentOffer,
        ));

      } else if (action === 'reject') {
        // Explicit reject — no Deal created
        status = NegotiationStatus.FAILED;
        actionType = AiActionType.REJECT;
        message = await this.formatMessageWithGemini('reject', undefined, roundNumber);

      } else {
        // request_counter — calculate next offer
        roundNumber += 1;

        if (roundNumber > MAX_ROUNDS) {
          // Round 7 reached → auto-fail (constitution: max 6 rounds)
          status = NegotiationStatus.FAILED;
          actionType = AiActionType.REJECT;
          message = await this.formatMessageWithGemini('reject', undefined, roundNumber);
          this.logger.log(
            `Negotiation ${negotiationId} auto-failed — exceeded MAX_ROUNDS (${MAX_ROUNDS})`,
          );
        } else {
          // Constitution formula: currentOffer + (gap × rate), clamped
          currentOffer = this.calculateCounterOffer(
            currentOffer,
            minPrice,
            maxPrice,
            roundNumber,
          );

          await tx.offer.create({
            data: {
              negotiationId,
              amount: currentOffer,
              round: roundNumber,
              createdBy: 'SYSTEM',
            },
          });

          if (currentOffer >= minPrice) {
            // Auto-accept: counter offer has reached or exceeded the listing price
            autoAccepted = true;
            this.logger.log(
              `Negotiation ${negotiationId} auto-accepted at round ${roundNumber}` +
              ` — offer ${currentOffer} >= minPrice ${minPrice}`,
            );
            ({ dealId, status, actionType, message } = await this.executeAccept(
              tx,
              negotiationId,
              negotiation.buyerId,
              negotiation.sellerId,
              negotiation.propertyId,
              negotiation.property.type,
              currentOffer,
            ));
          } else {
            // Keep negotiating
            status = NegotiationStatus.ACTIVE;
            actionType = AiActionType.COUNTER;
            message = await this.formatMessageWithGemini('counter', currentOffer, roundNumber);
          }
        }
      }

      // ── Persist final state ─────────────────────────────────
      await tx.negotiation.update({
        where: { id: negotiationId },
        data: { status, roundNumber, currentOffer },
      });

      await tx.aiLog.create({
        data: {
          negotiationId,
          actionType,
          message,
          data: {
            action,
            currentOffer,
            roundNumber,
            status,
            autoAccepted,
          } as Prisma.InputJsonValue,
        },
      });

      // Build base result
      const result: ActionResult = {
        negotiationId,
        action,
        status,
        roundNumber,
        currentOffer: status === NegotiationStatus.FAILED ? null : currentOffer,
        dealId,
        autoAccepted,
        message,
      };

      // When AGREED → signal frontend to show payment UI
      if (status === NegotiationStatus.AGREED && dealId) {
        const agreedPrice = this.round2dp(currentOffer);
        result.paymentRequired = true;
        result.finalPrice = agreedPrice;
        result.fee = this.round2dp(agreedPrice * COMMISSION_RATE);
      }

      return result;
    });
  }

  // ─── T53: getStatus ─────────────────────────────────────────

  /**
   * Fetch the full negotiation state, all offers in round order, and any deals.
   */
  async getStatus(negotiationId: string) {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: {
        offers: { orderBy: { round: 'asc' } },
        deals: true,
      },
    });

    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }

    return {
      negotiation,
      offers: negotiation.offers,
      deals: negotiation.deals,
      currentRound: negotiation.roundNumber,
      maxRounds: MAX_ROUNDS,
    };
  }

  // ─── T50: getConcessionRate ──────────────────────────────────

  /**
   * Returns the concession rate for a given round.
   * Round 1–2 → 5% | Round 3–5 → 10% | Round 6+ → 15%
   */
  getConcessionRate(round: number): number {
    const schedule = CONCESSION_SCHEDULE.find(
      (s) => round >= s.minRound && round <= s.maxRound,
    );
    return schedule?.rate ?? 0.15;
  }

  // ─── T51: calculateCounterOffer ─────────────────────────────

  /**
   * Constitution formula:
   *   gap        = maxPrice − minPrice
   *   concession = gap × concessionRate(round)
   *   next       = currentOffer + concession
   *   next       = clamp(next, minPrice, maxPrice)
   */
  calculateCounterOffer(
    currentOffer: number,
    minPrice: number,
    maxPrice: number,
    round: number,
  ): number {
    const gap = maxPrice - minPrice;
    const rate = this.getConcessionRate(round);
    const concession = gap * rate;
    const next = currentOffer + concession;
    return this.round2dp(Math.min(Math.max(next, minPrice), maxPrice));
  }

  // ─── T54: formatMessageWithGemini ───────────────────────────

  /**
   * Format a negotiation message using Gemini for natural Egyptian Arabic.
   *
   * Gemini receives structured context (action, price, round) and returns
   * a polished Arabic message.  It has NO visibility into offer amounts or
   * business logic — it only phrases the pre-decided outcome.
   *
   * Falls back to the hardcoded formatMessage() if Gemini fails for any reason
   * (network error, quota exceeded, bad JSON, etc.).
   */
  async formatMessageWithGemini(
    context: 'counter' | 'accept' | 'reject',
    price?: number,
    round?: number,
  ): Promise<string> {
    const fallback = this.formatMessage(context, price);

    try {
      const prompt = JSON.stringify({
        context,
        ...(price !== undefined && { price, formattedPrice: this.formatPrice(price) }),
        ...(round !== undefined && { round, maxRounds: MAX_ROUNDS }),
      });

      const systemInstruction =
        'أنت مساعد تفاوض عقاري مؤدب. مهمتك فقط صياغة رسالة قصيرة بالعامية المصرية المهذبة ' +
        'بناءً على السياق المُعطى. لا تقترح أسعاراً ولا تتخذ قرارات. ' +
        'أعد JSON فقط بالشكل: { "message": "..." }';

      const responseSchema = {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      };

      const result = await this.gemini.sendMessage(prompt, systemInstruction, responseSchema);
      const geminiMessage = result['message'];

      if (typeof geminiMessage === 'string' && geminiMessage.trim().length > 0) {
        return geminiMessage.trim();
      }

      this.logger.warn(`Gemini returned empty message for context=${context}, using fallback`);
      return fallback;
    } catch (error) {
      this.logger.warn(
        `Gemini message formatting failed for context=${context} — using fallback. Error: ${error}`,
      );
      return fallback;
    }
  }

  /**
   * Sync fallback messages — used when Gemini is unavailable.
   * Also the source of truth for the expected Arabic phrasing.
   */
  formatMessage(context: 'counter' | 'accept' | 'reject', price?: number): string {
    const formatted = price !== undefined ? this.formatPrice(price) : '';
    switch (context) {
      case 'counter':
        return `بكل احترام، السعر الحالي هو ${formatted} جنيه. هل يناسب حضرتك؟`;
      case 'accept':
        return `تم الاتفاق على ${formatted} جنيه. برجاء استكمال الدفع.`;
      case 'reject':
        return `نأسف، لم نتمكن من الوصول لاتفاق مناسب.`;
    }
  }

  // ─── Private helpers ─────────────────────────────────────────

  /**
   * Entry point used by ConversationEngineService.
   * Maps the raw input string to a NegotiationAction via mapTextToAction(),
   * then delegates to handleAction().
   */
  async handleMessage(
    context: ConversationContext,
    input: string,
  ): Promise<ConversationResponse> {
    const action = this.mapTextToAction(input);

    const result = await this.handleAction(context.entityId, action);

    return {
      message: result.message,
      data: result,
    };
  }

  private mapTextToAction(text: string): NegotiationAction {
    const lower = text.toLowerCase();

    // Check negation BEFORE affirmation — 'مش موافق' contains 'موافق'
    if (lower.includes('مش موافق') || /(?:^|\s)لا(?:\s|$)/.test(lower)) {
      return 'reject';
    }

    if (lower.includes('موافق') || lower.includes('تمام')) {
      return 'accept';
    }

    return 'request_counter';
  }

  /**
   * Shared accept logic — used by explicit `accept` and auto-accept.
   * Creates a Deal and updates Property status inside the caller's transaction.
   */
  private async executeAccept(
    tx: Prisma.TransactionClient,
    negotiationId: string,
    buyerId: string,
    sellerId: string,
    propertyId: string,
    propertyType: PropertyType,
    finalPrice: number,
  ): Promise<{
    dealId: string;
    status: NegotiationStatus;
    actionType: AiActionType;
    message: string;
  }> {
    const deal = await tx.deal.create({
      data: {
        negotiationId,
        buyerId,
        sellerId,
        finalPrice,
        status: DealStatus.PENDING,
      },
    });

    const newPropertyStatus =
      propertyType === PropertyType.SALE
        ? PropertyStatus.SOLD
        : PropertyStatus.RENTED;

    await tx.property.update({
      where: { id: propertyId },
      data: { propertyStatus: newPropertyStatus },
    });

    return {
      dealId: deal.id,
      status: NegotiationStatus.AGREED,
      actionType: AiActionType.ACCEPT,
      message: await this.formatMessageWithGemini('accept', finalPrice),
    };
  }

  /** Format price with comma grouping in Western Arabic numerals — e.g. 2,500,000 */
  private formatPrice(price: number): string {
    return price.toLocaleString('en-EG');
  }

  /** Round a monetary value to 2 decimal places */
  private round2dp(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
