/**
 * NotificationsController integration tests (T29).
 *
 * Lightweight — mocked service, verifies endpoint→service wiring.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const NOTIFICATION_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

function makeNotif(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION_ID,
    userId: USER_ID,
    type: 'OFFER_PROPOSED',
    title: 'عرض جديد',
    body: 'المشتري قدّم عرض',
    payload: {},
    link: '/negotiation/123',
    isRead: false,
    channel: 'BOTH',
    whatsappSent: false,
    whatsappError: null,
    createdAt: new Date(),
    readAt: null,
    ...overrides,
  };
}

// Mock the guard to always allow + inject user
const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

// ── Test suite ────────────────────────────────────────────────────────────────

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      listForUser: jest.fn().mockResolvedValue([makeNotif()]),
      findById: jest.fn().mockResolvedValue(makeNotif()),
      markRead: jest.fn().mockResolvedValue(true),
      markAllRead: jest.fn().mockResolvedValue(3),
      unreadCount: jest.fn().mockResolvedValue(5),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  afterEach(() => jest.clearAllMocks());

  // Helper to create a mock request with user
  const mockReq = () => ({ user: { sub: USER_ID, phone: '01000000000' } });

  it('GET /notifications → listForUser()', async () => {
    const result = await controller.list(mockReq() as any, { unreadOnly: 'true', limit: 10 } as any);

    expect(service.listForUser).toHaveBeenCalledWith(USER_ID, {
      unreadOnly: true,
      limit: 10,
    });
    expect(result).toHaveLength(1);
  });

  it('GET /notifications/:id → findById()', async () => {
    const result = await controller.getOne(mockReq() as any, NOTIFICATION_ID);

    expect(service.findById).toHaveBeenCalledWith(NOTIFICATION_ID, USER_ID);
    expect(result.id).toBe(NOTIFICATION_ID);
  });

  it('POST /notifications/:id/read → markRead()', async () => {
    const result = await controller.markRead(mockReq() as any, NOTIFICATION_ID);

    expect(service.markRead).toHaveBeenCalledWith(USER_ID, NOTIFICATION_ID);
    expect(result.success).toBe(true);
  });

  it('POST /notifications/read-all → markAllRead()', async () => {
    const result = await controller.markAllRead(mockReq() as any);

    expect(service.markAllRead).toHaveBeenCalledWith(USER_ID);
    expect(result.count).toBe(3);
    expect(result.success).toBe(true);
  });

  it('GET /notifications/unread-count → unreadCount()', async () => {
    const result = await controller.unreadCount(mockReq() as any);

    expect(service.unreadCount).toHaveBeenCalledWith(USER_ID);
    expect(result.count).toBe(5);
  });

  // ── BUG-02 regression: route ordering ────────────────────────────────────
  // Static routes (`unread-count`, `read-all`) must be declared BEFORE the
  // dynamic `:id` route, otherwise NestJS matches `/notifications/unread-count`
  // against `:id` (with ParseUUIDPipe) and rejects it as a 400 BadUUID.
  it('BUG-02: static routes declared before dynamic :id route', () => {
    const proto = NotificationsController.prototype;
    const methods = Object.getOwnPropertyNames(proto).filter(
      (m) => m !== 'constructor',
    );
    const idxUnreadCount = methods.indexOf('unreadCount');
    const idxMarkAllRead = methods.indexOf('markAllRead');
    const idxGetOne = methods.indexOf('getOne');
    const idxMarkRead = methods.indexOf('markRead');

    expect(idxUnreadCount).toBeGreaterThan(-1);
    expect(idxMarkAllRead).toBeGreaterThan(-1);
    expect(idxGetOne).toBeGreaterThan(-1);
    expect(idxMarkRead).toBeGreaterThan(-1);

    // Static handlers must come before the dynamic :id handlers
    expect(idxUnreadCount).toBeLessThan(idxGetOne);
    expect(idxUnreadCount).toBeLessThan(idxMarkRead);
    expect(idxMarkAllRead).toBeLessThan(idxGetOne);
    expect(idxMarkAllRead).toBeLessThan(idxMarkRead);
  });
});
