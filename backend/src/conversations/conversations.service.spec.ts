/**
 * ConversationsService unit tests — ported from Python tests/unit/test_supabase_service.py
 * Tests: getByWhatsappId, upsert, deleteExpired — all Prisma methods mocked.
 */
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { FlowState, Intent } from '@prisma/client';

function makePrismaMock() {
  return {
    conversation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as unknown as PrismaService;
}

function makeDbConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    whatsappId: '201234567890',
    flowState: 'AWAITING_INTENT',
    currentField: null,
    intent: null,
    listingId: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ConversationsService(prisma);
  });

  describe('getByWhatsappId', () => {
    it('returns conversation when found', async () => {
      const dbRow = makeDbConversation();
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(dbRow);

      const result = await service.getByWhatsappId('201234567890');
      expect(result).toEqual(dbRow);
      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { whatsappId: '201234567890' },
      });
    });

    it('returns null when not found', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getByWhatsappId('unknown');
      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('creates or updates conversation with 7-day expiry', async () => {
      const dbRow = makeDbConversation({ flowState: 'AWAITING_UNIT_TYPE' });
      (prisma.conversation.upsert as jest.Mock).mockResolvedValue(dbRow);

      const data = {
        whatsappId: '201234567890',
        flowState: FlowState.AWAITING_UNIT_TYPE,
        currentField: null,
        intent: null,
        listingId: null,
      };

      const result = await service.upsert(data);
      expect(result).toEqual(dbRow);

      const call = (prisma.conversation.upsert as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ whatsappId: '201234567890' });
      expect(call.update.flowState).toBe('AWAITING_UNIT_TYPE');
      expect(call.create.flowState).toBe('AWAITING_UNIT_TYPE');
      // Verify expiry is approximately 7 days from now
      const expiry = call.update.expiresAt as Date;
      const diff = expiry.getTime() - Date.now();
      expect(diff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000);
    });

    it('passes intent and listingId through to Prisma', async () => {
      (prisma.conversation.upsert as jest.Mock).mockResolvedValue(
        makeDbConversation(),
      );

      await service.upsert({
        whatsappId: '201234567890',
        flowState: FlowState.AWAITING_SPECS,
        currentField: 'area',
        intent: Intent.SELL,
        listingId: 'listing-1',
      });

      const call = (prisma.conversation.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update.intent).toBe('SELL');
      expect(call.update.listingId).toBe('listing-1');
      // currentField is passed through as-is
      expect(call.update.currentField).toBe('area');
      expect(call.create.intent).toBe('SELL');
      expect(call.create.listingId).toBe('listing-1');
      expect(call.create.currentField).toBe('area');
    });
  });

  describe('deleteExpired', () => {
    it('deletes expired non-CONFIRMED conversations and returns count', async () => {
      (prisma.conversation.deleteMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      const result = await service.deleteExpired();
      expect(result).toBe(3);

      const call = (prisma.conversation.deleteMany as jest.Mock).mock
        .calls[0][0];
      expect(call.where.expiresAt).toBeDefined();
      expect(call.where.flowState).toEqual({ not: 'CONFIRMED' });
    });

    it('returns 0 when no expired conversations', async () => {
      (prisma.conversation.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      const result = await service.deleteExpired();
      expect(result).toBe(0);
    });
  });
});
