import { randomUUID } from 'node:crypto';
import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GemmaClient, type GemmaChatMessage } from './gemma.client';
import { JwtService } from '@nestjs/jwt';
import { PaymentsService } from '../payments/payments.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { NotificationsService } from '../notifications/notifications.service';
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
import { NegotiationGateway } from './negotiation.gateway';
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
    private readonly gemma: GemmaClient,
    private readonly jwtService: JwtService,
    private readonly payments: PaymentsService,
    private readonly whatsapp: WhatsAppService,
    private readonly notifications: NotificationsService,
    private readonly gateway: NegotiationGateway,
  ) {}

  // ─── T12: messageWriter helper ────────────────────────────────

  /** Track pending emissions per transaction so they only fire on commit. */
  private readonly pendingTxEmits = new WeakMap<
    Prisma.TransactionClient,
    Array<() => void>
  >();

  /**
   * In-memory rate limiter for REST message sends.
   * Keyed on `${userId}:${negotiationId}`. 6 messages per rolling 60s window.
   */
  private readonly msgRateLimits = new Map<
    string,
    { count: number; windowStart: number }
  >();

  assertMessageRateLimit(negotiationId: string, userId: string): void {
    const key = `${userId}:${negotiationId}`;
    const now = Date.now();
    const cur = this.msgRateLimits.get(key);
    if (!cur || now - cur.windowStart > 60_000) {
      this.msgRateLimits.set(key, { count: 1, windowStart: now });
      return;
    }
    cur.count += 1;
    if (cur.count > 6) {
      throw new BadRequestException(
        'Rate limit exceeded — max 6 messages per minute',
      );
    }
  }

  /**
   * Persist a NegotiationMessage row and emit it to the negotiation room.
   *
   * Transaction safety:
   *   - When called WITHOUT a tx, persistence and emission happen in order.
   *   - When called WITH a tx, the emission is deferred until the caller
   *     invokes `flushTxEmits(tx)` AFTER `await tx.$commit()` (or after the
   *     surrounding $transaction callback returns, since Prisma commits then).
   *     Use `runInTransaction()` for the typical pattern.
   *
   * @returns the created message row (with id)
   */
  async messageWriter(params: {
    negotiationId: string;
    senderRole: 'BUYER' | 'SELLER' | 'AI' | 'SYSTEM';
    senderUserId?: string | null;
    body: string;
    kind?: 'TEXT' | 'OFFER' | 'ACTION' | 'NOTICE';
    meta?: Record<string, unknown> | null;
    clientId?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    const db = params.tx ?? this.prisma;

    const message = await db.negotiationMessage.create({
      data: {
        negotiationId: params.negotiationId,
        senderRole: params.senderRole,
        senderUserId: params.senderUserId ?? null,
        body: params.body,
        kind: params.kind ?? 'TEXT',
        meta: params.meta ? (params.meta as Prisma.InputJsonValue) : undefined,
        clientId: params.clientId ?? null,
      },
    });

    await db.negotiation.update({
      where: { id: params.negotiationId },
      data: { lastActivityAt: new Date() },
    }).catch((err) =>
      this.logger.warn(`Failed to update lastActivityAt: ${(err as Error).message}`),
    );

    const emit = () => this.gateway.emitMessage(params.negotiationId, message);
    if (params.tx) {
      const queue = this.pendingTxEmits.get(params.tx) ?? [];
      queue.push(emit);
      this.pendingTxEmits.set(params.tx, queue);
    } else {
      emit();
    }

    return message;
  }

  /**
   * Run a callback inside a Prisma transaction; emit deferred socket events
   * only after the transaction commits successfully. Roll back ⇒ no emit.
   */
  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let usedTx: Prisma.TransactionClient | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      usedTx = tx;
      return fn(tx);
    });
    if (usedTx) {
      const queue = this.pendingTxEmits.get(usedTx);
      if (queue) {
        for (const emit of queue) {
          try {
            emit();
          } catch (err) {
            this.logger.warn(
              `Deferred socket emit failed: ${(err as Error).message}`,
            );
          }
        }
        this.pendingTxEmits.delete(usedTx);
      }
    }
    return result;
  }

  /**
   * Wrap a Gemini/AI call with ai_thinking:true/false events.
   * Uses try/finally to guarantee the false event is always emitted.
   */
  async withAiThinking<T>(
    negotiationId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    this.gateway.emitAiThinking(negotiationId, true);
    try {
      return await fn();
    } finally {
      this.gateway.emitAiThinking(negotiationId, false);
    }
  }

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

    // ── 2. Resume existing active negotiation if one exists ─────
    const existing = await this.prisma.negotiation.findFirst({
      where: { propertyId, buyerId, status: NegotiationStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      this.logger.log(
        `Resuming existing negotiation ${existing.id} for property=${propertyId} buyer=${buyerId}`,
      );
      const currentOffer = this.round2dp(Number(existing.currentOffer ?? 0));
      const resumeMessage = `أهلاً بعودتك! إحنا في الجولة ${existing.roundNumber} من التفاوض، والعرض الحالي هو ${currentOffer.toLocaleString('ar-EG')} جنيه. تحب تكمل؟`;
      return {
        negotiationId: existing.id,
        propertyId: existing.propertyId,
        buyerId: existing.buyerId,
        sellerId: existing.sellerId,
        initialOffer: currentOffer,
        minPrice: this.round2dp(Number(existing.minPrice)),
        maxPrice: this.round2dp(Number(existing.maxPrice)),
        roundNumber: existing.roundNumber,
        status: existing.status,
        message: resumeMessage,
      };
    }

    // ── 3. Compute initial offer ────────────────────────────────
    const minPrice = this.round2dp(Number(property.price)); // listing price = floor
    const initialOffer = this.round2dp(buyerMaxPrice * INITIAL_OFFER_FACTOR);

    // ── 4. Persist atomically ───────────────────────────────────
    const negotiation = await this.prisma.$transaction(async (tx) => {
      const neg = await tx.negotiation.create({
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
          negotiationId: neg.id,
          amount: initialOffer,
          round: 1,
          createdBy: 'SYSTEM',
        },
      });

      this.logger.log(
        `Negotiation ${neg.id} created — initial offer: ${initialOffer} EGP`,
      );

      return neg;
    });

    // ── 5. Generate AI message OUTSIDE transaction ──────────────
    let message: string;
    try {
      message = await this.formatMessageWithGemini('counter', initialOffer, 1, negotiation.id);
    } catch {
      message = `أهلاً بك! عرضنا الأولي على العقار هو ${initialOffer.toLocaleString('ar-EG')} جنيه. هل يناسبك السعر؟`;
    }

    await this.prisma.aiLog.create({
      data: {
        negotiationId: negotiation.id,
        actionType: AiActionType.ASK,
        message,
        data: { initialOffer, buyerMaxPrice, minPrice } as Prisma.InputJsonValue,
      },
    });

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
        message = await this.formatMessageWithGemini('reject', undefined, roundNumber, negotiationId);

        // ── T17: NEGOTIATION_FAILED notification (explicit reject) ──
        try {
          const notifResult = await this.notifications.createForBoth({
            negotiationId,
            buyerId: negotiation.buyerId,
            sellerId: negotiation.sellerId,
            type: 'NEGOTIATION_FAILED' as any,
            payload: { action: 'reject' },
            propertyTitle: negotiation.property.title ?? 'عقار',
            tx: undefined,
          });
          if (notifResult.buyerNotificationId) {
            this.notifications.sendWhatsApp(notifResult.buyerNotificationId).catch(() => {});
          }
          if (notifResult.sellerNotificationId) {
            this.notifications.sendWhatsApp(notifResult.sellerNotificationId).catch(() => {});
          }
        } catch (err) {
          this.logger.warn(`Notification fan-out (NEGOTIATION_FAILED-reject) failed: ${(err as Error).message}`);
        }

      } else {
        // request_counter — calculate next offer
        roundNumber += 1;

        if (roundNumber > MAX_ROUNDS) {
          // Round 7 reached → auto-fail (constitution: max 6 rounds)
          status = NegotiationStatus.FAILED;
          actionType = AiActionType.REJECT;
          message = await this.formatMessageWithGemini('reject', undefined, roundNumber, negotiationId);
          this.logger.log(
            `Negotiation ${negotiationId} auto-failed — exceeded MAX_ROUNDS (${MAX_ROUNDS})`,
          );

          // ── T17: NEGOTIATION_FAILED notification (max rounds) ──
          try {
            const notifResult = await this.notifications.createForBoth({
              negotiationId,
              buyerId: negotiation.buyerId,
              sellerId: negotiation.sellerId,
              type: 'NEGOTIATION_FAILED' as any,
              payload: { action: 'max_rounds', roundNumber },
              propertyTitle: negotiation.property.title ?? 'عقار',
              tx: undefined,
            });
            if (notifResult.buyerNotificationId) {
              this.notifications.sendWhatsApp(notifResult.buyerNotificationId).catch(() => {});
            }
            if (notifResult.sellerNotificationId) {
              this.notifications.sendWhatsApp(notifResult.sellerNotificationId).catch(() => {});
            }
          } catch (err) {
            this.logger.warn(`Notification fan-out (NEGOTIATION_FAILED-rounds) failed: ${(err as Error).message}`);
          }
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
            message = await this.formatMessageWithGemini('counter', currentOffer, roundNumber, negotiationId);
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
      offers: negotiation.offers ?? [],
      deals: negotiation.deals ?? [],
      currentRound: negotiation.roundNumber,
      maxRounds: MAX_ROUNDS,
      latestEscalation: negotiation.escalations?.[0] ?? null,
    };
  }

  // ─── T14: Message Query Methods ────────────────────────────

  /**
   * Verify that a user is the buyer or seller of a negotiation.
   * Throws NotFoundException if the negotiation does not exist,
   * BadRequestException if the user is neither party.
   * Returns the user's role for downstream use.
   */
  async verifyMembership(
    negotiationId: string,
    userId: string,
  ): Promise<{ role: 'BUYER' | 'SELLER'; buyerId: string; sellerId: string }> {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      select: { buyerId: true, sellerId: true },
    });
    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }
    if (negotiation.buyerId === userId) {
      return { role: 'BUYER', ...negotiation };
    }
    if (negotiation.sellerId === userId) {
      return { role: 'SELLER', ...negotiation };
    }
    throw new BadRequestException('Not authorized for this negotiation');
  }

  /**
   * Get messages for a negotiation with cursor-based pagination.
   * Cursor = messageId; returns messages strictly older than the cursor
   * when paginating backwards. Default page size 50.
   */
  async getMessages(
    negotiationId: string,
    opts: { cursor?: string; limit?: number } = {},
  ) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

    let cursorCreatedAt: Date | undefined;
    if (opts.cursor) {
      const cursorRow = await this.prisma.negotiationMessage.findUnique({
        where: { id: opts.cursor },
        select: { createdAt: true, negotiationId: true },
      });
      if (cursorRow && cursorRow.negotiationId === negotiationId) {
        cursorCreatedAt = cursorRow.createdAt;
      }
    }

    const items = await this.prisma.negotiationMessage.findMany({
      where: {
        negotiationId,
        ...(cursorCreatedAt && { createdAt: { lt: cursorCreatedAt } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Return chronological (asc) for direct render; expose nextCursor.
    const ordered = items.slice().reverse();
    const nextCursor =
      items.length === limit ? items[items.length - 1].id : null;

    return { items: ordered, nextCursor };
  }

  /**
   * Mark all messages in a negotiation as read for the given user.
   * Updates readByBuyerAt or readBySellerAt depending on the user's role.
   */
  async markAllRead(negotiationId: string, userId: string) {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      select: { buyerId: true, sellerId: true },
    });

    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }

    const isBuyer = negotiation.buyerId === userId;
    const isSeller = negotiation.sellerId === userId;

    if (!isBuyer && !isSeller) {
      throw new BadRequestException('Not authorized for this negotiation');
    }

    const updateField = isBuyer ? 'readByBuyerAt' : 'readBySellerAt';
    const now = new Date();

    await this.prisma.negotiationMessage.updateMany({
      where: {
        negotiationId,
        [updateField]: null,
      },
      data: { [updateField]: now },
    });

    return { markedRead: true };
  }

  async getBuyerNegotiation(negotiationId: string, buyerId: string) {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: {
        offers: { orderBy: { round: 'asc' } },
        deals: true,
        property: true,
      },
    });

    if (!negotiation || negotiation.buyerId !== buyerId) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }

    return {
      negotiation,
      offers: negotiation.offers ?? [],
      deals: negotiation.deals ?? [],
      currentRound: negotiation.roundNumber,
      maxRounds: MAX_ROUNDS,
    };
  }

  async getSellerNegotiation(negotiationId: string, sellerId: string) {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: {
        offers: { orderBy: { round: 'asc' } },
        deals: true,
        property: true,
      },
    });

    if (!negotiation || negotiation.sellerId !== sellerId) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }

    return {
      negotiation,
      offers: negotiation.offers ?? [],
      deals: negotiation.deals ?? [],
      currentRound: negotiation.roundNumber,
      maxRounds: MAX_ROUNDS,
    };
  }

  async submitBuyerReply(
    negotiationId: string,
    buyerId: string,
    dto: {
      responseType: 'accept' | 'reject' | 'counter' | 'opinion';
      counterAmount?: number;
      comment?: string;
    },
  ) {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
    });

    if (!negotiation || negotiation.buyerId !== buyerId) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }
    if (negotiation.status !== NegotiationStatus.ACTIVE) {
      throw new BadRequestException(
        `Negotiation ${negotiationId} is already ${negotiation.status}`,
      );
    }

    if (dto.responseType === 'accept') {
      return this.handleAction(negotiationId, 'accept');
    }

    if (dto.responseType === 'reject') {
      return this.handleAction(negotiationId, 'reject');
    }

    if (dto.responseType === 'counter') {
      if (!dto.counterAmount) {
        throw new BadRequestException('counterAmount is required for counter replies');
      }
      return this.proposePrice(negotiationId, dto.counterAmount);
    }

    return this.processBuyerDecision(negotiation, dto.comment ?? '');
  }

  async processBuyerDecision(
    negotiation: { id: string; currentOffer: Prisma.Decimal | number | null; status: NegotiationStatus },
    comment: string,
  ) {
    const message = await this.withAiThinking(negotiation.id, () =>
      this.gemma.chat(
        'أنت مساعد تفاوض ذكي. استخدم المعلومات التالية لتوليد رد مهني موجز للبائع أو نصيحة للبائع بناءً على رأي المشتري.',
        [],
        `المشتري كتب: "${comment}". أعد صياغة هذا الرأي في رسالة محترمة للبائع واذكر الخطوة التالية التي ينبغي أن يقوم بها البائع بسرعة.`,
      ),
    );

    const reply =
      typeof message === 'string' && message.trim().length > 0
        ? message.trim()
        : 'شكراً، استلمنا رأيك وسنوافيك برد البائع قريباً.';

    await this.prisma.aiLog
      .create({
        data: {
          negotiationId: negotiation.id,
          actionType: AiActionType.ASK,
          message: reply,
          data: {
            responseType: 'opinion',
            comment,
          } as Prisma.InputJsonValue,
        },
      })
      .catch((err) => this.logger.warn(`aiLog (buyer opinion) failed: ${err}`));

    return {
      negotiationId: negotiation.id,
      responseType: 'opinion',
      status: negotiation.status,
      currentOffer: negotiation.currentOffer === null ? null : Number(negotiation.currentOffer),
      message: reply,
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
    negotiationId?: string,
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
        'بناءً على السياق المُعطى. لا تقترح أسعاراً ولا تتخذ قرارات. أعد الرسالة فقط بدون أي شرح إضافي.';

      const gemmaReply = negotiationId
        ? await this.withAiThinking(negotiationId, () =>
            this.gemma.chat(systemInstruction, [], prompt),
          )
        : await this.gemma.chat(systemInstruction, [], prompt);

      if (typeof gemmaReply === 'string' && gemmaReply.trim().length > 0) {
        return gemmaReply.trim();
      }

      this.logger.warn(`Gemma returned empty message for context=${context}, using fallback`);
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
    message?: string,
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
      message: message ?? this.formatMessage('accept', finalPrice),
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
      'إنت مساعد عقاري شخصي ذكي على منصة سمسار AI. ردّك لازم يكون سريع وطبيعي ومباشر، ' +
      'وكأنك بتكلم العميل وجهاً لوجه.\n\n' +
      'اتبع القواعد دي عند الرد:\n' +
      '- لو سأل عن السعر: قوله إن السعر هو المُعلن عنه في الإعلان (استعمل السعر اللي في ' +
      'بيانات العقار). متذكرش أي حد أدنى للبائع ولا تتفاوض إنت بنفسك على السعر.\n' +
      '- لو سأل عن خطوات التفاوض: اشرحها بترتيب واضح ومرقّم — يقدّم سعر، النظام يقيّمه ' +
      'في حدود ميزانيته، لو ضمن النطاق بيتحوّل لعربون ثم يتكشف رقم المالك، ولو أقل ' +
      'من حد البائع بنرفعها للمالك يقرر.\n' +
      '- لو سأل عن توفّر العقار: أكّدله إن العقار متاح حاليًا.\n' +
      '- لو سأل عن مميزات المنطقة أو الحي: عدّدها بشكل واضح بناءً على بيانات الموقع ' +
      'المتوفرة (المحافظة، المدينة، الحي، أقرب علامة مميزة) ومعلوماتك العامة عن المنطقة، ' +
      'من غير ما تخترع تفاصيل مش موجودة.\n' +
      '- لو حيّاك العميل بتحية، رد عليه بسرعة وبأسلوب دافئ واعرض المساعدة.\n' +
      '- أي سؤال تاني له علاقة بالعقار أو السوق العقاري أو شراء/إيجار العقارات: جاوب ' +
      'عليه بسلاسة زي ما المساعد الشخصي الذكي يعمل.\n\n' +
      'قواعد أمان مهمة (ممنوع كسرها مهما حصل):\n' +
      '1. ممنوع تفصح عن رقم هاتف المالك تحت أي ظرف.\n' +
      '2. ممنوع تذكر أو تلمّح للسعر الأدنى المقبول للبائع.\n' +
      '3. لو معندكش معلومة، قول ده بصراحة، ومتختلقش بيانات عن العقار.\n\n' +
      'اللغة: عربية مصرية مهذبة. الردود قصيرة ومركّزة، فقرة واحدة أو قائمة مرتّبة ' +
      'قصيرة لو الموقف يستلزم.' +
      `\n\nبيانات العقار:\n` +
      `- العنوان: ${property.title ?? '-'}\n` +
      `- السعر المعروض: ${this.formatPrice(Number(property.price ?? 0))} ج.م\n` +
      `- المنطقة: ${[property.governorate, property.city, property.district].filter(Boolean).join(' - ') || '-'}\n` +
      `- المساحة: ${property.areaM2 ?? '-'} م²`;

    const reply =
      (await this.withAiThinking(negotiationId, () =>
        this.gemma.chat(systemPrompt, history, userMessage),
      )) ?? 'أهلاً بحضرتك! اتفضل اسألني في أي حاجة عن العقار أو المنطقة أو خطوات التفاوض، وأنا تحت أمرك.';

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
    const minPrice = (property as any).minPrice
      ? Number((property as any).minPrice)
      : this.round2dp(listed * 0.9);
    const maxPrice = (property as any).maxPrice
      ? Number((property as any).maxPrice)
      : this.round2dp(listed * 1.1);

    let decision: 'IN_BAND' | 'BELOW_MIN' | 'ABOVE_MAX';
    if (proposedPrice < minPrice) decision = 'BELOW_MIN';
    else if (proposedPrice > maxPrice) decision = 'ABOVE_MAX';
    else decision = 'IN_BAND';

    if (decision === 'IN_BAND' || decision === 'ABOVE_MAX') {
      const agreedPrice = this.round2dp(
        decision === 'ABOVE_MAX' ? maxPrice : proposedPrice,
      );

      // Generate the AI message BEFORE the transaction to avoid tx timeout
      const acceptMessage = await this.formatMessageWithGemini('accept', agreedPrice, undefined, negotiationId);

      const accept = await this.prisma.$transaction(async (tx) => {
        const result = await this.executeAccept(
          tx,
          negotiationId,
          negotiation.buyerId,
          negotiation.sellerId,
          negotiation.propertyId,
          property.type,
          agreedPrice,
          acceptMessage,
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

      // ── T16: NEGOTIATION_AGREED notification (auto-accept) ──
      try {
        const priceStr = this.formatPrice(agreedPrice);
        const notifResult = await this.notifications.createForBoth({
          negotiationId,
          buyerId: negotiation.buyerId,
          sellerId: negotiation.sellerId,
          type: 'NEGOTIATION_AGREED' as any,
          payload: { agreedPrice, decision },
          propertyTitle: property.title ?? 'عقار',
          price: priceStr,
          tx: undefined,
        });
        if (notifResult.buyerNotificationId) {
          this.notifications.sendWhatsApp(notifResult.buyerNotificationId).catch(() => {});
        }
        if (notifResult.sellerNotificationId) {
          this.notifications.sendWhatsApp(notifResult.sellerNotificationId).catch(() => {});
        }
      } catch (err) {
        this.logger.warn(`Notification fan-out (NEGOTIATION_AGREED) failed: ${(err as Error).message}`);
      }

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
    // NOTE: `token` has a unique constraint; we insert a per-row placeholder
    // first (using a random UUID, not Date.now() which collides in fast
    // back-to-back calls), then overwrite with a JWT signed with the row's id.
    const escalation = await this.prisma.negotiationEscalation.create({
      data: {
        negotiationId,
        buyerOffer: proposedPrice,
        token: `pending-${randomUUID()}`,
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

    // ── T12: OFFER_PROPOSED notification fan-out ────────────────
    try {
      const notifResult = await this.notifications.createForBoth({
        negotiationId,
        buyerId: negotiation.buyerId,
        sellerId: negotiation.sellerId,
        type: 'OFFER_PROPOSED' as any,
        payload: { proposedPrice, escalationId: escalation.id },
        propertyTitle: property.title ?? 'عقار',
        price: this.formatPrice(proposedPrice),
        escalationToken: token,
        tx: undefined, // Outside the main transaction — best effort
      });
      // Dispatch WhatsApp post-commit (best-effort, non-blocking)
      if (notifResult.sellerNotificationId) {
        this.notifications.sendWhatsApp(notifResult.sellerNotificationId).catch(() => {});
      }
      if (notifResult.buyerNotificationId) {
        this.notifications.sendWhatsApp(notifResult.buyerNotificationId).catch(() => {});
      }
    } catch (err) {
      this.logger.warn(`Notification fan-out (OFFER_PROPOSED) failed: ${(err as Error).message}`);
    }

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
      negotiationId: escalation.negotiationId,
      buyerOffer: Number(escalation.buyerOffer),
      status: escalation.status,
      property: {
        id: (escalation.negotiation as any).property.id,
        title: (escalation.negotiation as any).property.title,
        price: Number((escalation.negotiation as any).property.price ?? 0),
        media: (escalation.negotiation as any).property.media,
      },
      buyerName: (escalation.negotiation as any).buyer.name,
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

    if (action === 'ACCEPT') {
      const buyerOffer = Number(escalation.buyerOffer);

      // Generate message BEFORE transaction to avoid tx timeout
      const acceptMsg = await this.formatMessageWithGemini('accept', buyerOffer, undefined, negotiation.id);

      const result = await this.prisma.$transaction(async (tx) => {
        const accept = await this.executeAccept(
          tx,
          negotiation.id,
          negotiation.buyerId,
          negotiation.sellerId,
          negotiation.propertyId,
          negotiation.property.type,
          buyerOffer,
          acceptMsg,
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

        return accept;
      });

      const deposit = await this.payments.initiateDeposit(
        result.dealId,
        negotiation.buyerId,
      );

      // ── T13: OFFER_ACCEPTED + NEGOTIATION_AGREED notifications ──
      try {
        const priceStr = this.formatPrice(buyerOffer);
        const notifResult = await this.notifications.createForBoth({
          negotiationId: negotiation.id,
          buyerId: negotiation.buyerId,
          sellerId: negotiation.sellerId,
          type: 'OFFER_ACCEPTED' as any,
          payload: { buyerOffer },
          propertyTitle: negotiation.property.title ?? 'عقار',
          price: priceStr,
          tx: undefined,
        });
        if (notifResult.buyerNotificationId) {
          this.notifications.sendWhatsApp(notifResult.buyerNotificationId).catch(() => {});
        }
        if (notifResult.sellerNotificationId) {
          this.notifications.sendWhatsApp(notifResult.sellerNotificationId).catch(() => {});
        }

        // Also send NEGOTIATION_AGREED to both
        const agreedResult = await this.notifications.createForBoth({
          negotiationId: negotiation.id,
          buyerId: negotiation.buyerId,
          sellerId: negotiation.sellerId,
          type: 'NEGOTIATION_AGREED' as any,
          payload: { agreedPrice: buyerOffer },
          propertyTitle: negotiation.property.title ?? 'عقار',
          price: priceStr,
          tx: undefined,
        });
        if (agreedResult.buyerNotificationId) {
          this.notifications.sendWhatsApp(agreedResult.buyerNotificationId).catch(() => {});
        }
        if (agreedResult.sellerNotificationId) {
          this.notifications.sendWhatsApp(agreedResult.sellerNotificationId).catch(() => {});
        }
      } catch (err) {
        this.logger.warn(`Notification fan-out (OFFER_ACCEPTED) failed: ${(err as Error).message}`);
      }

      return {
        escalationId: escalation.id,
        action: 'ACCEPT',
        negotiationStatus: NegotiationStatus.AGREED,
        dealId: result.dealId,
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
      });

      // ── T14: OFFER_REJECTED notification ────────────────────
      try {
        const notifId = await this.notifications.createForUser({
          userId: negotiation.buyerId,
          type: 'OFFER_REJECTED' as any,
          payload: { buyerOffer: Number(escalation.buyerOffer) },
          propertyTitle: negotiation.property.title ?? 'عقار',
          negotiationId: negotiation.id,
          role: 'buyer',
        });
        if (notifId) {
          this.notifications.sendWhatsApp(notifId).catch(() => {});
        }
      } catch (err) {
        this.logger.warn(`Notification fan-out (OFFER_REJECTED) failed: ${(err as Error).message}`);
      }

      return {
        escalationId: escalation.id,
        action: 'REJECT',
        negotiationStatus: NegotiationStatus.FAILED,
      };
    }

    // COUNTER
    if (!counterPrice || counterPrice <= 0) {
      throw new BadRequestException('counterPrice is required for COUNTER action');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.negotiation.update({
        where: { id: negotiation.id },
        data: { currentOffer: counterPrice },
      });

      await tx.offer.create({
        data: {
          negotiationId: negotiation.id,
          amount: counterPrice,
          round: negotiation.roundNumber + 1,
          createdBy: 'SELLER',
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
    });

    // ── T15: OFFER_COUNTERED notification ────────────────────
    try {
      const notifId = await this.notifications.createForUser({
        userId: negotiation.buyerId,
        type: 'OFFER_COUNTERED' as any,
        payload: { counterPrice },
        propertyTitle: negotiation.property.title ?? 'عقار',
        price: this.formatPrice(counterPrice),
        negotiationId: negotiation.id,
        role: 'buyer',
      });
      if (notifId) {
        this.notifications.sendWhatsApp(notifId).catch(() => {});
      }
    } catch (err) {
      this.logger.warn(`Notification fan-out (OFFER_COUNTERED) failed: ${(err as Error).message}`);
    }

    return {
      escalationId: escalation.id,
      action: 'COUNTER',
      negotiationStatus: NegotiationStatus.ACTIVE,
      counterPrice,
    };
  }
}
