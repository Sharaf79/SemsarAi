import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../gemini/gemini.service';
import { GemmaClient, GemmaChatMessage } from './gemma.client';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { PaymentsService } from '../payments/payments.service';
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

interface EscalationTokenPayload {
  escalationId: string;
}

@Injectable()
export class NegotiationService {
  private readonly logger = new Logger(NegotiationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly gemma: GemmaClient,
    private readonly whatsapp: WhatsAppService,
    private readonly jwtService: JwtService,
    private readonly payments: PaymentsService,
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
        escalations: { orderBy: { createdAt: 'desc' }, take: 1 },
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
      latestEscalation: negotiation.escalations?.[0] ?? null,
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

  // ─── Voice/Chat Negotiation Phase ───────────────────────────────

  /**
   * Free-form chat with the Gemma negotiator. Backend supplies the system
   * prompt + property context; client supplies prior history and the user's
   * new message. Always logs the turn to AiLog.
   *
   * On any Gemma failure returns a deterministic Arabic fallback so the
   * frontend never breaks.
   */
  async chatWithGemma(
    negotiationId: string,
    history: GemmaChatMessage[],
    userMessage: string,
  ): Promise<{ reply: string }> {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: { property: true },
    });
    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }

    const property = negotiation.property;
    const systemPrompt =
      'أنت مفاوض عقارات محترف باللغة العربية المصرية المهذبة. ' +
      'كن مختصرًا، مقنعًا، ومحترمًا. ' +
      'لا تفصح أبدًا عن رقم هاتف المالك. ' +
      'لا تذكر السعر الأدنى المقبول للبائع. ' +
      `\n\nبيانات العقار:\n` +
      `- العنوان: ${property.title ?? '-'}\n` +
      `- السعر المعروض: ${this.formatPrice(Number(property.price ?? 0))} ج.م\n` +
      `- المنطقة: ${[property.governorate, property.city, property.district].filter(Boolean).join(' - ') || '-'}\n` +
      `- المساحة: ${property.areaM2 ?? '-'} م²`;

    const reply =
      (await this.gemma.chat(systemPrompt, history, userMessage)) ??
      'اتفضل تفاوض معايا على السعر.';

    await this.prisma.aiLog
      .create({
        data: {
          negotiationId,
          actionType: AiActionType.ASK,
          message: reply,
          data: { userMessage, replyChars: reply.length } as Prisma.InputJsonValue,
        },
      })
      .catch((err) => this.logger.warn(`aiLog (chat) failed: ${err}`));

    return { reply };
  }

  /**
   * Buyer proposes a price during negotiation.
   *
   * - IN_BAND or ABOVE_MAX → auto-accept (clamp to maxPrice if above), create
   *   Deal, create deposit Payment, return depositRequired=true.
   * - BELOW_MIN → create NegotiationEscalation, send WhatsApp link to seller.
   */
  async proposePrice(
    negotiationId: string,
    proposedPrice: number,
  ): Promise<{
    decision: 'IN_BAND' | 'BELOW_MIN' | 'ABOVE_MAX';
    message: string;
    depositRequired?: boolean;
    paymentId?: string;
    dealId?: string;
    agreedPrice?: number;
    escalationId?: string;
  }> {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: { property: true, seller: true },
    });
    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }
    if (negotiation.status !== NegotiationStatus.ACTIVE) {
      throw new BadRequestException(
        `Negotiation ${negotiationId} is already ${negotiation.status}`,
      );
    }

    const property = negotiation.property;
    const listed = Number(property.price ?? 0);
    const minPrice = property.minPrice
      ? Number(property.minPrice)
      : this.round2dp(listed * 0.9);
    const maxPrice = property.maxPrice
      ? Number(property.maxPrice)
      : this.round2dp(listed * 1.1);

    let decision: 'IN_BAND' | 'BELOW_MIN' | 'ABOVE_MAX';
    if (proposedPrice < minPrice) decision = 'BELOW_MIN';
    else if (proposedPrice > maxPrice) decision = 'ABOVE_MAX';
    else decision = 'IN_BAND';

    if (decision === 'IN_BAND' || decision === 'ABOVE_MAX') {
      const agreedPrice = this.round2dp(
        decision === 'ABOVE_MAX' ? maxPrice : proposedPrice,
      );

      const accept = await this.prisma.$transaction(async (tx) => {
        const result = await this.executeAccept(
          tx,
          negotiationId,
          negotiation.buyerId,
          negotiation.sellerId,
          negotiation.propertyId,
          property.type,
          agreedPrice,
        );

        await tx.negotiation.update({
          where: { id: negotiationId },
          data: {
            status: NegotiationStatus.AGREED,
            currentOffer: agreedPrice,
          },
        });

        await tx.aiLog.create({
          data: {
            negotiationId,
            actionType: AiActionType.ACCEPT,
            message: result.message,
            data: { decision, proposedPrice, agreedPrice } as Prisma.InputJsonValue,
          },
        });

        return result;
      });

      const deposit = await this.payments.initiateDeposit(
        accept.dealId,
        negotiation.buyerId,
      );

      return {
        decision,
        message: accept.message,
        depositRequired: true,
        paymentId: deposit.paymentId,
        dealId: accept.dealId,
        agreedPrice,
      };
    }

    // BELOW_MIN → escalate to seller
    const escalation = await this.prisma.negotiationEscalation.create({
      data: {
        negotiationId,
        buyerOffer: proposedPrice,
        token: 'pending',
        status: 'PENDING',
      },
    });
    const token = this.jwtService.sign(
      { escalationId: escalation.id } as EscalationTokenPayload,
      { expiresIn: '48h' },
    );
    await this.prisma.negotiationEscalation.update({
      where: { id: escalation.id },
      data: { token },
    });

    await this.escalateToSeller(negotiation.seller.phone, property.title ?? 'عقار', proposedPrice, token).catch(
      (err) => this.logger.warn(`escalateToSeller failed: ${err}`),
    );

    await this.prisma.aiLog.create({
      data: {
        negotiationId,
        actionType: AiActionType.ASK,
        message: 'بنراجع مع البائع، هتوصلك الإجابة هنا.',
        data: {
          decision,
          proposedPrice,
          escalationId: escalation.id,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      decision,
      message: 'بنراجع مع البائع، هتوصلك الإجابة هنا.',
      escalationId: escalation.id,
    };
  }

  private async escalateToSeller(
    sellerPhone: string,
    propertyTitle: string,
    buyerOffer: number,
    token: string,
  ): Promise<void> {
    if (!sellerPhone) {
      this.logger.warn('escalateToSeller: seller has no phone — skipping');
      return;
    }
    const baseUrl =
      process.env.PUBLIC_FRONTEND_URL ?? 'http://localhost:5174';
    const url = `${baseUrl.replace(/\/$/, '')}/seller-action/${token}`;
    const body =
      `عرض جدي لعقارك "${propertyTitle}"\n` +
      `السعر المقترح: ${this.formatPrice(buyerOffer)} ج.م\n` +
      `There is a serious buyer.\n` +
      `افتح الرابط للرد: ${url}`;
    await this.whatsapp.sendTextMessage(sellerPhone, body);
  }

  /**
   * Resolve an escalation token (public — auth is the token itself).
   * Returns a safe summary the seller's browser can render.
   */
  async getEscalationByToken(token: string) {
    let payload: EscalationTokenPayload;
    try {
      payload = this.jwtService.verify<EscalationTokenPayload>(token);
    } catch {
      throw new NotFoundException('Invalid or expired link');
    }

    const escalation = await this.prisma.negotiationEscalation.findUnique({
      where: { id: payload.escalationId },
      include: {
        negotiation: {
          include: {
            property: { select: { id: true, title: true, price: true, media: true } },
            buyer: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!escalation) {
      throw new NotFoundException('Escalation not found');
    }
    if (escalation.status === 'RESOLVED') {
      throw new BadRequestException('This request has already been resolved');
    }

    return {
      escalationId: escalation.id,
      buyerOffer: Number(escalation.buyerOffer),
      status: escalation.status,
      property: {
        id: escalation.negotiation.property.id,
        title: escalation.negotiation.property.title,
        price: Number(escalation.negotiation.property.price ?? 0),
        media: escalation.negotiation.property.media,
      },
      buyerName: escalation.negotiation.buyer.name,
      createdAt: escalation.createdAt,
    };
  }

  /**
   * Apply a seller's action on an escalation token.
   *  - ACCEPT → create Deal at buyerOffer, create deposit payment.
   *  - REJECT → mark negotiation FAILED.
   *  - COUNTER → store sellerCounter, create system Offer at counterPrice,
   *              keep negotiation ACTIVE so the buyer's chat can resume.
   */
  async applySellerAction(
    token: string,
    action: 'ACCEPT' | 'REJECT' | 'COUNTER',
    counterPrice?: number,
  ): Promise<{
    escalationId: string;
    action: string;
    negotiationStatus: NegotiationStatus;
    dealId?: string;
    paymentId?: string;
    counterPrice?: number;
  }> {
    let payload: EscalationTokenPayload;
    try {
      payload = this.jwtService.verify<EscalationTokenPayload>(token);
    } catch {
      throw new NotFoundException('Invalid or expired link');
    }

    const escalation = await this.prisma.negotiationEscalation.findUnique({
      where: { id: payload.escalationId },
      include: {
        negotiation: { include: { property: true } },
      },
    });
    if (!escalation) {
      throw new NotFoundException('Escalation not found');
    }
    if (escalation.status === 'RESOLVED') {
      throw new ConflictException('This request was already resolved');
    }

    const negotiation = escalation.negotiation;
    const buyerOffer = Number(escalation.buyerOffer);

    if (action === 'ACCEPT') {
      const accepted = await this.prisma.$transaction(async (tx) => {
        const result = await this.executeAccept(
          tx,
          negotiation.id,
          negotiation.buyerId,
          negotiation.sellerId,
          negotiation.propertyId,
          negotiation.property.type,
          buyerOffer,
        );
        await tx.negotiation.update({
          where: { id: negotiation.id },
          data: { status: NegotiationStatus.AGREED, currentOffer: buyerOffer },
        });
        await tx.negotiationEscalation.update({
          where: { id: escalation.id },
          data: {
            status: 'RESOLVED',
            sellerAction: 'ACCEPT',
            resolvedAt: new Date(),
          },
        });
        await tx.aiLog.create({
          data: {
            negotiationId: negotiation.id,
            actionType: AiActionType.ACCEPT,
            message: 'Seller accepted via escalation link.',
            data: { escalationId: escalation.id, buyerOffer } as Prisma.InputJsonValue,
          },
        });
        return result;
      });

      const deposit = await this.payments.initiateDeposit(
        accepted.dealId,
        negotiation.buyerId,
      );

      return {
        escalationId: escalation.id,
        action: 'ACCEPT',
        negotiationStatus: NegotiationStatus.AGREED,
        dealId: accepted.dealId,
        paymentId: deposit.paymentId,
      };
    }

    if (action === 'REJECT') {
      await this.prisma.$transaction(async (tx) => {
        await tx.negotiation.update({
          where: { id: negotiation.id },
          data: { status: NegotiationStatus.FAILED },
        });
        await tx.negotiationEscalation.update({
          where: { id: escalation.id },
          data: {
            status: 'RESOLVED',
            sellerAction: 'REJECT',
            resolvedAt: new Date(),
          },
        });
        await tx.aiLog.create({
          data: {
            negotiationId: negotiation.id,
            actionType: AiActionType.REJECT,
            message: 'Seller rejected via escalation link.',
            data: { escalationId: escalation.id } as Prisma.InputJsonValue,
          },
        });
      });

      return {
        escalationId: escalation.id,
        action: 'REJECT',
        negotiationStatus: NegotiationStatus.FAILED,
      };
    }

    // COUNTER
    if (typeof counterPrice !== 'number' || !(counterPrice > 0)) {
      throw new BadRequestException('counterPrice is required for COUNTER');
    }
    const newRound = negotiation.roundNumber + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.create({
        data: {
          negotiationId: negotiation.id,
          amount: counterPrice,
          round: newRound,
          createdBy: 'SELLER',
        },
      });
      await tx.negotiation.update({
        where: { id: negotiation.id },
        data: {
          currentOffer: counterPrice,
          roundNumber: newRound,
        },
      });
      await tx.negotiationEscalation.update({
        where: { id: escalation.id },
        data: {
          status: 'RESOLVED',
          sellerAction: 'COUNTER',
          sellerCounter: counterPrice,
          resolvedAt: new Date(),
        },
      });
      await tx.aiLog.create({
        data: {
          negotiationId: negotiation.id,
          actionType: AiActionType.COUNTER,
          message: `Seller countered at ${this.formatPrice(counterPrice)} EGP.`,
          data: {
            escalationId: escalation.id,
            counterPrice,
            round: newRound,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return {
      escalationId: escalation.id,
      action: 'COUNTER',
      negotiationStatus: NegotiationStatus.ACTIVE,
      counterPrice,
    };
  }
}
