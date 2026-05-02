import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GemmaClient, type GemmaChatMessage } from './gemma.client';
import { NegotiationService } from './negotiation.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import { classifyIntent, type IntentResult } from './seller-chat.intent';
import {
  buildSellerChatPrompt,
  SELLER_CHAT_FALLBACK,
} from './prompts/seller-chat.prompt';
import { AiActionType, Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

@Injectable()
export class SellerChatService {
  private readonly logger = new Logger(SellerChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemma: GemmaClient,
    private readonly negotiation: NegotiationService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Seller-side Gemma chat for an escalation.
   *
   * Steps (spec §4.2):
   *  1. Load negotiation + property + latest PENDING escalation.
   *  2. Assert seller ownership.
   *  3. Build prompt, call Gemma, fallback to §4.4 string on null.
   *  4. Classify intent from the SELLER's raw message.
   *  5. If intent ∈ {accept, reject, counter} → relay to applySellerAction.
   *  6. Persist aiLog.
   *  7. Return structured reply.
   */
  async chat(
    negotiationId: string,
    sellerId: string,
    history: GemmaChatMessage[],
    userMessage: string,
  ): Promise<{
    reply: string;
    intent: string;
    action?: string;
    counterPrice?: number;
    notificationsCreated?: boolean;
  }> {
    // ── 1. Load negotiation + property ──────────────────────────
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: negotiationId },
      include: { property: true },
    });
    if (!negotiation) {
      throw new NotFoundException(`Negotiation ${negotiationId} not found`);
    }

    // ── 2. Ownership check ──────────────────────────────────────
    if (negotiation.sellerId !== sellerId) {
      throw new ForbiddenException('You are not the seller of this negotiation');
    }

    // ── Find latest PENDING escalation ──────────────────────────
    const escalation = await this.prisma.negotiationEscalation.findFirst({
      where: { negotiationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    // ── 3. Build prompt + call Gemma ────────────────────────────
    const property = negotiation.property;
    const buyerOffer = escalation
      ? Number(escalation.buyerOffer)
      : Number(negotiation.currentOffer ?? 0);

    const systemPrompt = buildSellerChatPrompt({
      title: property.title ?? 'عقار',
      listingPrice: Number(property.price ?? 0).toLocaleString('en-EG'),
      buyerOffer: buyerOffer.toLocaleString('en-EG'),
      round: negotiation.roundNumber,
    });

    let reply: string;
    try {
      const gemmaReply = await this.gemma.chat(systemPrompt, history, userMessage);
      reply = gemmaReply ?? SELLER_CHAT_FALLBACK;
    } catch {
      reply = SELLER_CHAT_FALLBACK;
    }

    // ── 4. Classify intent from SELLER's raw message ────────────
    const { intent, counterPrice } = classifyIntent(userMessage);

    // ── 5. Relay to applySellerAction if actionable ─────────────
    let action: string | undefined;
    let resolvedCounterPrice: number | undefined = counterPrice;
    let notificationsCreated = false;

    if (escalation && (intent === 'accept' || intent === 'reject' || intent === 'counter')) {
      const sellerAction =
        intent === 'accept' ? 'ACCEPT' :
        intent === 'reject' ? 'REJECT' :
        'COUNTER';

      try {
        const result = await this.negotiation.applySellerAction(
          escalation.token,
          sellerAction as 'ACCEPT' | 'REJECT' | 'COUNTER',
          resolvedCounterPrice,
        );
        action = sellerAction;
        if (result.counterPrice) {
          resolvedCounterPrice = result.counterPrice;
        }
        notificationsCreated = true;
      } catch (err) {
        if (err instanceof ConflictException) {
          // Already resolved — reply conversationally
          reply = 'العرض ده تم الرد عليه بالفعل. لو عندك عرض تاني، ممكن نتكلم عنه.';
        } else {
          this.logger.warn(`applySellerAction failed: ${(err as Error).message}`);
          reply = 'حصل مشكلة فنية مؤقتة. جرب تاني كمان شوية.';
        }
      }
    } else if (!escalation && (intent === 'accept' || intent === 'reject' || intent === 'counter')) {
      // No pending escalation — inform the seller
      reply = 'مفيش عرض معلّق حالياً. لو في أي استفسار تاني، أنا تحت أمرك.';
    }

    // ── 6. Persist aiLog ────────────────────────────────────────
    try {
      await this.prisma.aiLog.create({
        data: {
          negotiationId,
          actionType: AiActionType.ASK,
          message: reply,
          data: {
            userMessage,
            intent,
            role: 'seller',
            action,
            counterPrice: resolvedCounterPrice,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(`aiLog create failed: ${(err as Error).message}`);
    }

    // ── 7. Return structured reply ──────────────────────────────
    return {
      reply,
      intent,
      action,
      counterPrice: resolvedCounterPrice,
      notificationsCreated,
    };
  }
}
