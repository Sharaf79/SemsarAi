/**
 * WhatsApp orchestrator — routes incoming WhatsApp messages through
 * the shared ConversationEngineService.
 *
 * Flow:
 *   1. Extract phone + message text from parsed webhook payload
 *   2. Resolve platform user by phone number
 *   3. Detect active flow (onboarding draft or negotiation)
 *   4. Build ConversationContext → delegate to ConversationEngineService
 *   5. Send engine reply back via WhatsApp
 */
import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationEngineService } from '../conversation-engine/conversation-engine.service';
import { ConversationContext } from '../common';
import { ParsedMessage } from '../common/types';

@Injectable()
export class WhatsAppOrchestratorService {
  private readonly logger = new Logger(WhatsAppOrchestratorService.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly prisma: PrismaService,
    private readonly engine: ConversationEngineService,
  ) {}

  /**
   * Process an incoming WhatsApp message end-to-end.
   *
   * Called fire-and-forget from WhatsAppController after HMAC verification
   * and payload parsing. Errors are caught internally so the caller's
   * 200 response to Meta is never affected.
   */
  async processMessage(parsed: ParsedMessage): Promise<void> {
    const phone = parsed.from;
    const input = (parsed.body ?? '').trim();

    // ── 1. Resolve user ─────────────────────────────────────
    const user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      this.logger.warn(`No user found for phone ${phone}`);
      await this.whatsapp.sendTextMessage(
        phone,
        'عذراً، لم نتمكن من التعرف على حسابك. من فضلك سجّل الأول من التطبيق.',
      );
      return;
    }

    // ── 2. Detect active flow + entity ──────────────────────
    let activeFlow: ConversationContext['activeFlow'];
    let entityId: string;

    // Priority: incomplete onboarding draft first, then active negotiation
    const activeDraft = await this.prisma.propertyDraft.findFirst({
      where: { userId: user.id, isCompleted: false },
      select: { id: true },
    });

    if (activeDraft) {
      activeFlow = 'onboarding';
      entityId = activeDraft.id;
    } else {
      const activeNegotiation = await this.prisma.negotiation.findFirst({
        where: { buyerId: user.id, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (activeNegotiation) {
        activeFlow = 'negotiation';
        entityId = activeNegotiation.id;
      } else {
        await this.whatsapp.sendTextMessage(
          phone,
          'مفيش عملية نشطة حالياً. ابدأ تسجيل عقار أو تفاوض جديد من التطبيق.',
        );
        return;
      }
    }

    // ── 3. Build context ────────────────────────────────────
    const context: ConversationContext = {
      userId: user.id,
      channel: 'whatsapp',
      activeFlow,
      entityId,
    };

    // ── 4. Delegate to engine ───────────────────────────────
    try {
      const response = await this.engine.processMessage(context, input);

      // ── 5. Reply via WhatsApp ─────────────────────────────
      await this.whatsapp.sendTextMessage(phone, response.message);
    } catch (err) {
      this.logger.error(
        `Error processing message for user ${user.id}: ${err}`,
      );
      await this.whatsapp.sendTextMessage(
        phone,
        'حدث خطأ غير متوقع. من فضلك حاول مرة أخرى.',
      );
    }
  }
}
