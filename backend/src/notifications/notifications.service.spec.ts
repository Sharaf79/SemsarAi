/**
 * Unit tests for NotificationsService (T25).
 *
 * All external dependencies mocked — PrismaService + WhatsAppService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { NotificationType, NotificationChannel } from '@prisma/client';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const BUYER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SELLER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const NEGOTIATION_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const NOTIFICATION_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';

let notifCounter = 0;
function makeNotif(overrides: Record<string, unknown> = {}) {
  notifCounter += 1;
  return {
    id: `${NOTIFICATION_ID}-${notifCounter}`,
    userId: BUYER_ID,
    type: 'OFFER_PROPOSED' as NotificationType,
    title: 'عرض جديد',
    body: 'المشتري قدّم عرض',
    payload: {},
    link: '/negotiation/123',
    isRead: false,
    channel: NotificationChannel.BOTH,
    whatsappSent: false,
    whatsappError: null,
    createdAt: new Date(),
    readAt: null,
    ...overrides,
  };
}

function makePrisma() {
  const notifs: Record<string, any> = {};

  const prisma: Record<string, any> = {
    notification: {
      create: jest.fn(({ data }: any) => {
        const id = `${NOTIFICATION_ID}-${++notifCounter}`;
        notifs[id] = { id, ...data };
        return notifs[id];
      }),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(({ where, data }: any) => {
        if (notifs[where.id]) {
          Object.assign(notifs[where.id], data);
          return notifs[where.id];
        }
        return { id: where.id, ...data };
      }),
      updateMany: jest.fn(() => ({ count: 2 })),
      count: jest.fn(),
    },
    // $transaction passthrough
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  return prisma;
}

function makeWhatsApp() {
  return {
    sendTextMessage: jest.fn().mockResolvedValue(undefined),
    sendNotificationMessage: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof makePrisma>;
  let whatsapp: ReturnType<typeof makeWhatsApp>;

  beforeEach(async () => {
    notifCounter = 0;
    prisma = makePrisma();
    whatsapp = makeWhatsApp();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppService, useValue: whatsapp },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createForBoth ────────────────────────────────────────────────────────

  describe('createForBoth()', () => {
    it('should create 2 notification rows with correct userId and type', async () => {
      const result = await service.createForBoth({
        negotiationId: NEGOTIATION_ID,
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        type: 'OFFER_PROPOSED' as NotificationType,
        payload: { price: 1000000 },
        propertyTitle: 'شقة في المعادي',
        price: '1,000,000',
      });

      expect(prisma.notification.create).toHaveBeenCalledTimes(2);

      // Verify buyer notification
      const buyerCall = prisma.notification.create.mock.calls[0][0];
      expect(buyerCall.data.userId).toBe(BUYER_ID);
      expect(buyerCall.data.type).toBe('OFFER_PROPOSED');
      expect(buyerCall.data.link).toContain('/negotiation/');

      // Verify seller notification
      const sellerCall = prisma.notification.create.mock.calls[1][0];
      expect(sellerCall.data.userId).toBe(SELLER_ID);
      expect(sellerCall.data.type).toBe('OFFER_PROPOSED');

      expect(result.buyerNotificationId).toBeTruthy();
      expect(result.sellerNotificationId).toBeTruthy();
    });

    it('should return nulls on create failure', async () => {
      prisma.notification.create.mockRejectedValueOnce(new Error('DB down'));

      const result = await service.createForBoth({
        negotiationId: NEGOTIATION_ID,
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        type: 'OFFER_PROPOSED' as NotificationType,
        payload: {},
      });

      expect(result.buyerNotificationId).toBeNull();
      expect(result.sellerNotificationId).toBeNull();
    });

    it('should use seller-action link when escalation token provided', async () => {
      await service.createForBoth({
        negotiationId: NEGOTIATION_ID,
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        type: 'OFFER_PROPOSED' as NotificationType,
        payload: {},
        escalationToken: 'esc-token-123',
      });

      const sellerCall = prisma.notification.create.mock.calls[1][0];
      expect(sellerCall.data.link).toContain('/seller-action/esc-token-123');
    });
  });

  // ── listForUser ──────────────────────────────────────────────────────────

  describe('listForUser()', () => {
    it('should filter unreadOnly correctly', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.listForUser(BUYER_ID, { unreadOnly: true, limit: 10 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: BUYER_ID, isRead: false }),
        }),
      );
    });

    it('should default limit to 50', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.listForUser(BUYER_ID);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });

  // ── markRead / markAllRead ───────────────────────────────────────────────

  describe('markRead()', () => {
    it('should flip isRead and set readAt', async () => {
      prisma.notification.findFirst.mockResolvedValue(
        makeNotif({ id: NOTIFICATION_ID, isRead: false }),
      );

      const ok = await service.markRead(BUYER_ID, NOTIFICATION_ID);

      expect(ok).toBe(true);
      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTIFICATION_ID },
          data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
        }),
      );
    });

    it('should return false when notification not found', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      const ok = await service.markRead(BUYER_ID, NOTIFICATION_ID);

      expect(ok).toBe(false);
    });
  });

  describe('markAllRead()', () => {
    it('should bulk update unread', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.markAllRead(BUYER_ID);

      expect(count).toBe(3);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: BUYER_ID, isRead: false },
          data: expect.objectContaining({ isRead: true }),
        }),
      );
    });
  });

  // ── unreadCount ──────────────────────────────────────────────────────────

  describe('unreadCount()', () => {
    it('should return the correct number', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const count = await service.unreadCount(BUYER_ID);

      expect(count).toBe(5);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: BUYER_ID, isRead: false },
      });
    });
  });

  // ── sendWhatsApp ─────────────────────────────────────────────────────────

  describe('sendWhatsApp()', () => {
    it('should skip when user whatsappOptOut is true', async () => {
      prisma.notification.findUnique.mockResolvedValue(
        makeNotif({
          id: NOTIFICATION_ID,
          userId: BUYER_ID,
          user: { id: BUYER_ID, phone: '01000000000', whatsappOptOut: true },
        }),
      );

      await service.sendWhatsApp(NOTIFICATION_ID);

      expect(whatsapp.sendTextMessage).not.toHaveBeenCalled();
    });

    it('should record whatsappError on failure', async () => {
      prisma.notification.findUnique.mockResolvedValue(
        makeNotif({
          id: NOTIFICATION_ID,
          userId: BUYER_ID,
          type: 'OFFER_PROPOSED' as NotificationType,
          payload: { price: '1,000,000', title: 'شقة' },
          link: '/negotiation/123',
          user: { id: BUYER_ID, phone: '01000000000', whatsappOptOut: false },
        }),
      );

      whatsapp.sendTextMessage.mockRejectedValueOnce(new Error('Provider 5xx'));

      await service.sendWhatsApp(NOTIFICATION_ID);

      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTIFICATION_ID },
          data: expect.objectContaining({
            whatsappSent: false,
            whatsappError: 'Provider 5xx',
          }),
        }),
      );
    });

    it('should set whatsappSent=true on success', async () => {
      prisma.notification.findUnique.mockResolvedValue(
        makeNotif({
          id: NOTIFICATION_ID,
          userId: BUYER_ID,
          type: 'OFFER_PROPOSED' as NotificationType,
          payload: { price: '1,000,000', title: 'شقة' },
          link: '/negotiation/123',
          user: { id: BUYER_ID, phone: '01000000000', whatsappOptOut: false },
        }),
      );

      await service.sendWhatsApp(NOTIFICATION_ID);

      expect(whatsapp.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(prisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTIFICATION_ID },
          data: { whatsappSent: true },
        }),
      );
    });
  });
});
