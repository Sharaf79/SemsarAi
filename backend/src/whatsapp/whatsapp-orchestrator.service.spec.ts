/**
 * WhatsAppOrchestratorService unit tests.
 *
 * Tests the refactored engine-based flow:
 *   1. User resolution by phone
 *   2. Active flow detection (onboarding draft > negotiation)
 *   3. Delegation to ConversationEngineService
 *   4. Reply via WhatsApp
 *   5. Error handling
 */
import { WhatsAppOrchestratorService } from './whatsapp-orchestrator.service';
import { WhatsAppService, DeliveryStatus } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationEngineService } from '../conversation-engine/conversation-engine.service';
import { ParsedMessage } from '../common/types';

// ── Mock factories ─────────────────────────────────────────

function makeWhatsAppService(): jest.Mocked<WhatsAppService> {
  return {
    sendTextMessage: jest.fn().mockResolvedValue(undefined),
    getMediaUrl: jest.fn().mockResolvedValue('https://media.url/photo.jpg'),
    verifyWebhookSignature: jest.fn(),
    parseIncomingMessage: jest.fn(),
    verifyToken: 'test-token',
  } as unknown as jest.Mocked<WhatsAppService>;
}

function makePrismaService() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    propertyDraft: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    negotiation: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    otpCode: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function makeEngineService() {
  return {
    processMessage: jest.fn().mockResolvedValue({ message: 'مرحبا!' }),
  } as unknown as jest.Mocked<ConversationEngineService>;
}

function makeOrchestrator() {
  const whatsapp = makeWhatsAppService();
  const prisma = makePrismaService();
  const engine = makeEngineService();

  const orchestrator = new WhatsAppOrchestratorService(
    whatsapp,
    prisma,
    engine,
  );

  return { orchestrator, whatsapp, prisma, engine };
}

function textMessage(body: string, from = '201234567890'): ParsedMessage {
  return { from, type: 'text', body, mediaId: null };
}

const MOCK_USER = {
  id: 'user-uuid-1',
  name: 'Test User',
  phone: '201234567890',
  email: null,
};

describe('WhatsAppOrchestratorService', () => {
  // ────────────────────────────────────────────────────────────
  // 1. User resolution
  // ────────────────────────────────────────────────────────────
  describe('user resolution', () => {
    it('sends error message when user not found', async () => {
      const { orchestrator, prisma, whatsapp } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await orchestrator.processMessage(textMessage('مرحبا'));

      expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
        '201234567890',
        expect.stringContaining('لم نتمكن من التعرف'),
      );
    });

    it('looks up user by phone number', async () => {
      const { orchestrator, prisma, whatsapp } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      // No active flow → falls through to "no active flow" message
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue(null);

      await orchestrator.processMessage(textMessage('مرحبا'));

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '201234567890' },
      });
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Active flow detection
  // ────────────────────────────────────────────────────────────
  describe('flow detection', () => {
    it('sends "no active flow" when neither draft nor negotiation exists', async () => {
      const { orchestrator, prisma, whatsapp } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue(null);

      await orchestrator.processMessage(textMessage('مرحبا'));

      expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
        '201234567890',
        expect.stringContaining('مفيش عملية نشطة'),
      );
    });

    it('prioritises onboarding draft over active negotiation', async () => {
      const { orchestrator, prisma, engine } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue({
        id: 'draft-1',
      });
      // Should NOT even query negotiation since draft was found
      (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue({
        id: 'neg-1',
      });

      await orchestrator.processMessage(textMessage('شقة'));

      expect(engine.processMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          activeFlow: 'onboarding',
          entityId: 'draft-1',
          channel: 'whatsapp',
        }),
        'شقة',
      );
    });

    it('falls back to active negotiation when no draft exists', async () => {
      const { orchestrator, prisma, engine } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.negotiation.findFirst as jest.Mock).mockResolvedValue({
        id: 'neg-1',
      });

      await orchestrator.processMessage(textMessage('أقبل'));

      expect(engine.processMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          activeFlow: 'negotiation',
          entityId: 'neg-1',
          channel: 'whatsapp',
        }),
        'أقبل',
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. Engine delegation + reply
  // ────────────────────────────────────────────────────────────
  describe('engine delegation', () => {
    it('sends engine response back via WhatsApp', async () => {
      const { orchestrator, prisma, engine, whatsapp } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue({
        id: 'draft-1',
      });
      engine.processMessage.mockResolvedValue({
        message: 'إيه نوع العقار؟',
      });

      await orchestrator.processMessage(textMessage('عايز أبيع'));

      expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
        '201234567890',
        'إيه نوع العقار؟',
      );
    });

    it('passes trimmed input to engine', async () => {
      const { orchestrator, prisma, engine } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue({
        id: 'draft-1',
      });

      await orchestrator.processMessage(textMessage('  شقة  '));

      expect(engine.processMessage).toHaveBeenCalledWith(
        expect.anything(),
        'شقة',
      );
    });

    it('passes empty string when body is null', async () => {
      const { orchestrator, prisma, engine } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue({
        id: 'draft-1',
      });

      await orchestrator.processMessage({
        from: '201234567890',
        type: 'image',
        body: null,
        mediaId: 'media-1',
      });

      expect(engine.processMessage).toHaveBeenCalledWith(
        expect.anything(),
        '',
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. Error handling
  // ────────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('sends Arabic error message when engine throws', async () => {
      const { orchestrator, prisma, engine, whatsapp } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_USER);
      (prisma.propertyDraft.findFirst as jest.Mock).mockResolvedValue({
        id: 'draft-1',
      });
      engine.processMessage.mockRejectedValue(new Error('Gemini timeout'));

      await orchestrator.processMessage(textMessage('مرحبا'));

      expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(
        '201234567890',
        expect.stringContaining('حدث خطأ غير متوقع'),
      );
    });

    it('does not throw even if WhatsApp send fails', async () => {
      const { orchestrator, prisma, whatsapp } = makeOrchestrator();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      whatsapp.sendTextMessage.mockRejectedValue(new Error('API 401'));

      // Should not throw — errors are swallowed at this level
      await expect(
        orchestrator.processMessage(textMessage('مرحبا')),
      ).rejects.toThrow('API 401');
    });
  });

  // ────────────────────────────────────────────────────────────
  // 5. Delivery status handling
  // ────────────────────────────────────────────────────────────
  describe('handleDeliveryStatuses', () => {
    const mockStatus: DeliveryStatus = {
      id: 'wamid.abc123',
      status: 'delivered',
      timestamp: '1720000000',
      recipientId: '201234567890',
    };

    it('updates OTP record when matching messageId found', async () => {
      const { orchestrator, prisma } = makeOrchestrator();
      const otpRecord = { id: 'otp-1', whatsappMessageId: 'wamid.abc123' };
      (prisma.otpCode.findFirst as jest.Mock).mockResolvedValue(otpRecord);

      await orchestrator.handleDeliveryStatuses([mockStatus]);

      expect(prisma.otpCode.findFirst).toHaveBeenCalledWith({
        where: { whatsappMessageId: 'wamid.abc123' },
      });
      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: {
          deliveryStatus: 'delivered',
          deliveryUpdatedAt: expect.any(Date),
        },
      });
    });

    it('skips unknown messageIds without error', async () => {
      const { orchestrator, prisma } = makeOrchestrator();
      (prisma.otpCode.findFirst as jest.Mock).mockResolvedValue(null);

      // Should not throw
      await orchestrator.handleDeliveryStatuses([mockStatus]);

      expect(prisma.otpCode.findFirst).toHaveBeenCalled();
      expect(prisma.otpCode.update).not.toHaveBeenCalled();
    });

    it('processes multiple statuses', async () => {
      const { orchestrator, prisma } = makeOrchestrator();
      (prisma.otpCode.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'otp-1', whatsappMessageId: 'wamid.1' })
        .mockResolvedValueOnce(null); // second status not found

      await orchestrator.handleDeliveryStatuses([
        { id: 'wamid.1', status: 'read', timestamp: '100', recipientId: '20111' },
        { id: 'wamid.2', status: 'sent', timestamp: '200', recipientId: '20222' },
      ]);

      expect(prisma.otpCode.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.otpCode.update).toHaveBeenCalledTimes(1);
    });

    it('handles empty statuses array', async () => {
      const { orchestrator, prisma } = makeOrchestrator();

      await orchestrator.handleDeliveryStatuses([]);

      expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    });

    it('continues processing after an error on one status', async () => {
      const { orchestrator, prisma } = makeOrchestrator();
      (prisma.otpCode.findFirst as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'otp-2', whatsappMessageId: 'wamid.2' });

      await orchestrator.handleDeliveryStatuses([
        { id: 'wamid.1', status: 'sent', timestamp: '100', recipientId: '20111' },
        { id: 'wamid.2', status: 'delivered', timestamp: '200', recipientId: '20222' },
      ]);

      // Despite first one erroring, second one should still be processed
      expect(prisma.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-2' },
        data: {
          deliveryStatus: 'delivered',
          deliveryUpdatedAt: expect.any(Date),
        },
      });
    });
  });
});
