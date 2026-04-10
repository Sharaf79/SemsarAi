/**
 * E2E: Buy flow via WhatsApp → ConversationEngine pipeline.
 *
 * Verifies the orchestrator correctly:
 *   1. Resolves a user by phone number
 *   2. Detects an active negotiation as the buyer flow
 *   3. Delegates to ConversationEngineService
 *   4. Sends the engine reply back via WhatsApp
 */
import { WhatsAppOrchestratorService } from '../src/whatsapp/whatsapp-orchestrator.service';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConversationEngineService } from '../src/conversation-engine/conversation-engine.service';
import { ParsedMessage } from '../src/common/types';

// ── Mocks ──────────────────────────────────────────────────

const PHONE = '201234567890';
const USER = { id: 'user-1', name: 'Buyer', phone: PHONE };

function makeWhatsAppService(): jest.Mocked<WhatsAppService> {
  return {
    sendTextMessage: jest.fn().mockResolvedValue(undefined),
    getMediaUrl: jest.fn().mockResolvedValue(null),
    verifyWebhookSignature: jest.fn(),
    parseIncomingMessage: jest.fn(),
    verifyToken: 'test-token',
  } as unknown as jest.Mocked<WhatsAppService>;
}

function makePrismaService() {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(USER) },
    propertyDraft: { findFirst: jest.fn().mockResolvedValue(null) },
    negotiation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'neg-1' }),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function makeEngine(): jest.Mocked<ConversationEngineService> {
  return {
    processMessage: jest.fn(),
  } as unknown as jest.Mocked<ConversationEngineService>;
}

function msg(body: string): ParsedMessage {
  return { from: PHONE, type: 'text', body, mediaId: null };
}

// ── Tests ───────────────────────────────────────────────────

describe('E2E: Buy flow via WhatsApp (engine-based)', () => {
  let orchestrator: WhatsAppOrchestratorService;
  let whatsapp: jest.Mocked<WhatsAppService>;
  let prisma: jest.Mocked<PrismaService>;
  let engine: jest.Mocked<ConversationEngineService>;

  beforeEach(() => {
    whatsapp = makeWhatsAppService();
    prisma = makePrismaService();
    engine = makeEngine();
    orchestrator = new WhatsAppOrchestratorService(whatsapp, prisma, engine);
  });

  it('routes buyer message to negotiation flow via engine', async () => {
    engine.processMessage.mockResolvedValue({
      message: 'العرض الحالي 850,000 جنيه. تقبل؟',
    });

    await orchestrator.processMessage(msg('أقبل'));

    expect(engine.processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        channel: 'whatsapp',
        activeFlow: 'negotiation',
        entityId: 'neg-1',
      }),
      'أقبل',
    );

    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
      PHONE,
      'العرض الحالي 850,000 جنيه. تقبل؟',
    );
  });

  it('handles multi-turn negotiation via engine', async () => {
    engine.processMessage
      .mockResolvedValueOnce({ message: 'العرض: 850,000 جنيه. تقبل أو ارفض أو فاوض?' })
      .mockResolvedValueOnce({ message: 'العرض الجديد: 900,000 جنيه. تقبل؟' })
      .mockResolvedValueOnce({ message: 'تم الاتفاق! السعر النهائي: 900,000 جنيه.' });

    await orchestrator.processMessage(msg('عايز أفاوض'));
    await orchestrator.processMessage(msg('فاوض'));
    await orchestrator.processMessage(msg('أقبل'));

    expect(engine.processMessage).toHaveBeenCalledTimes(3);

    const lastReply = (whatsapp.sendTextMessage as jest.Mock).mock.calls[2];
    expect(lastReply[1]).toContain('تم الاتفاق');
  });

  it('sends error message when no active flow exists', async () => {
    (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue(null);

    await orchestrator.processMessage(msg('مرحبا'));

    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('مفيش عملية نشطة'),
    );
    expect(engine.processMessage).not.toHaveBeenCalled();
  });
});
