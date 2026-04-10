/**
 * E2E: Sell flow via WhatsApp → ConversationEngine pipeline.
 *
 * Verifies the orchestrator correctly:
 *   1. Resolves a user by phone number
 *   2. Detects an active onboarding draft as the seller flow
 *   3. Delegates to ConversationEngineService
 *   4. Sends the engine reply back via WhatsApp
 *   5. Prioritises onboarding over negotiation
 */
import { WhatsAppOrchestratorService } from '../src/whatsapp/whatsapp-orchestrator.service';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConversationEngineService } from '../src/conversation-engine/conversation-engine.service';
import { ParsedMessage } from '../src/common/types';

// ── Mocks ──────────────────────────────────────────────────

const PHONE = '201234567890';
const USER = { id: 'user-1', name: 'Seller', phone: PHONE };

function makeWhatsAppService(): jest.Mocked<WhatsAppService> {
  return {
    sendTextMessage: jest.fn().mockResolvedValue(undefined),
    getMediaUrl: jest.fn().mockResolvedValue('https://cdn.example.com/photo.jpg'),
    verifyWebhookSignature: jest.fn(),
    parseIncomingMessage: jest.fn(),
    verifyToken: 'test-token',
  } as unknown as jest.Mocked<WhatsAppService>;
}

function makePrismaService() {
  return {
    user: { findUnique: jest.fn().mockResolvedValue(USER) },
    propertyDraft: {
      findFirst: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    },
    negotiation: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function makeEngine(): jest.Mocked<ConversationEngineService> {
  return {
    processMessage: jest.fn(),
  } as unknown as jest.Mocked<ConversationEngineService>;
}

function msg(body: string | null, mediaId: string | null = null): ParsedMessage {
  return {
    from: PHONE,
    type: mediaId ? 'image' : 'text',
    body,
    mediaId,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('E2E: Sell flow via WhatsApp (engine-based)', () => {
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

  it('routes seller message to onboarding flow via engine', async () => {
    engine.processMessage.mockResolvedValue({
      message: 'إيه نوع العقار اللي عايز تبيعه؟',
    });

    await orchestrator.processMessage(msg('عايز أبيع شقة'));

    expect(engine.processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        channel: 'whatsapp',
        activeFlow: 'onboarding',
        entityId: 'draft-1',
      }),
      'عايز أبيع شقة',
    );

    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
      PHONE,
      'إيه نوع العقار اللي عايز تبيعه؟',
    );
  });

  it('handles multi-step onboarding via engine', async () => {
    engine.processMessage
      .mockResolvedValueOnce({ message: 'إيه نوع العقار؟' })
      .mockResolvedValueOnce({ message: 'المساحة كام متر مربع؟' })
      .mockResolvedValueOnce({ message: 'كام أوضة؟' })
      .mockResolvedValueOnce({ message: 'ملخص البيانات: ...\n صح كده؟' });

    await orchestrator.processMessage(msg('شقة'));
    await orchestrator.processMessage(msg('150 متر'));
    await orchestrator.processMessage(msg('3 أوض'));
    await orchestrator.processMessage(msg('صح'));

    expect(engine.processMessage).toHaveBeenCalledTimes(4);

    const replies = (whatsapp.sendTextMessage as jest.Mock).mock.calls.map(
      ([, text]: [string, string]) => text,
    );
    expect(replies[0]).toContain('نوع العقار');
    expect(replies[3]).toContain('ملخص البيانات');
  });

  it('prioritises onboarding draft over active negotiation', async () => {
    // Both a draft AND a negotiation exist
    (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue({
      id: 'neg-1',
    });

    engine.processMessage.mockResolvedValue({ message: 'تمام' });

    await orchestrator.processMessage(msg('شقة'));

    expect(engine.processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        activeFlow: 'onboarding',
        entityId: 'draft-1',
      }),
      'شقة',
    );
  });

  it('sends error and retries message when engine throws', async () => {
    engine.processMessage.mockRejectedValue(new Error('AI timeout'));

    await orchestrator.processMessage(msg('مرحبا'));

    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('حدث خطأ غير متوقع'),
    );
  });

  it('sends "no account" message for unknown phone', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await orchestrator.processMessage(msg('مرحبا'));

    expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('لم نتمكن من التعرف'),
    );
    expect(engine.processMessage).not.toHaveBeenCalled();
  });
});
