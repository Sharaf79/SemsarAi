/**
 * Unit tests for SellerChatService (T27).
 *
 * All external deps mocked: PrismaService, GemmaClient, NegotiationService,
 * JwtService, NotificationsService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { SellerChatService } from './seller-chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { GemmaClient } from './gemma.client';
import { NegotiationService } from './negotiation.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from '../notifications/notifications.service';
import { NegotiationStatus, PropertyType, AiActionType } from '@prisma/client';
import { SELLER_CHAT_FALLBACK } from './prompts/seller-chat.prompt';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NEGOTIATION_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SELLER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const BUYER_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const PROPERTY_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const ESCALATION_ID = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

function makeNegotiation(overrides: Record<string, unknown> = {}) {
  return {
    id: NEGOTIATION_ID,
    propertyId: PROPERTY_ID,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    status: NegotiationStatus.ACTIVE,
    currentOffer: 850_000,
    roundNumber: 2,
    property: {
      id: PROPERTY_ID,
      title: 'شقة في المعادي',
      price: 1_000_000,
    },
    ...overrides,
  };
}

function makeEscalation(overrides: Record<string, unknown> = {}) {
  return {
    id: ESCALATION_ID,
    negotiationId: NEGOTIATION_ID,
    buyerOffer: 800_000,
    token: 'escalation-token-abc',
    status: 'PENDING',
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('SellerChatService', () => {
  let service: SellerChatService;
  let prisma: Record<string, any>;
  let gemma: { chat: jest.Mock };
  let negotiation: { applySellerAction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      negotiation: {
        findUnique: jest.fn(),
      },
      negotiationEscalation: {
        findFirst: jest.fn(),
      },
      aiLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    gemma = { chat: jest.fn().mockResolvedValue('أهلاً بيك!') };
    negotiation = { applySellerAction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: GemmaClient, useValue: gemma },
        { provide: NegotiationService, useValue: negotiation },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: NotificationsService, useValue: { sendWhatsApp: jest.fn() } },
      ],
    }).compile();

    service = module.get<SellerChatService>(SellerChatService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Ownership check ──────────────────────────────────────────────────────

  it('should reject when caller is not the seller', async () => {
    prisma.negotiation.findUnique.mockResolvedValue(
      makeNegotiation({ sellerId: SELLER_ID }),
    );

    await expect(
      service.chat(NEGOTIATION_ID, 'wrong-user-id', [], 'أوافق'),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Comment turn ─────────────────────────────────────────────────────────

  it('should NOT call applySellerAction for a comment turn', async () => {
    prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
    prisma.negotiationEscalation.findFirst.mockResolvedValue(makeEscalation());

    const result = await service.chat(
      NEGOTIATION_ID,
      SELLER_ID,
      [],
      'ايه رأيك في العرض ده؟',
    );

    expect(result.intent).toBe('comment');
    expect(result.action).toBeUndefined();
    expect(negotiation.applySellerAction).not.toHaveBeenCalled();
  });

  // ── Accept turn ──────────────────────────────────────────────────────────

  it('should call applySellerAction(ACCEPT) for accept intent', async () => {
    prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
    prisma.negotiationEscalation.findFirst.mockResolvedValue(makeEscalation());

    negotiation.applySellerAction.mockResolvedValue({
      escalationId: ESCALATION_ID,
      action: 'ACCEPT',
      negotiationStatus: NegotiationStatus.AGREED,
    });

    const result = await service.chat(
      NEGOTIATION_ID,
      SELLER_ID,
      [],
      'أوافق',
    );

    expect(result.intent).toBe('accept');
    expect(result.action).toBe('ACCEPT');
    expect(result.notificationsCreated).toBe(true);
    expect(negotiation.applySellerAction).toHaveBeenCalledWith(
      'escalation-token-abc',
      'ACCEPT',
      undefined,
    );
  });

  // ── Counter turn ─────────────────────────────────────────────────────────

  it('should call applySellerAction(COUNTER, price) for counter intent', async () => {
    prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
    prisma.negotiationEscalation.findFirst.mockResolvedValue(makeEscalation());

    negotiation.applySellerAction.mockResolvedValue({
      escalationId: ESCALATION_ID,
      action: 'COUNTER',
      negotiationStatus: NegotiationStatus.ACTIVE,
      counterPrice: 1_700_000,
    });

    const result = await service.chat(
      NEGOTIATION_ID,
      SELLER_ID,
      [],
      'عرضي 1700000',
    );

    expect(result.intent).toBe('counter');
    expect(result.action).toBe('COUNTER');
    expect(result.counterPrice).toBe(1_700_000);
    expect(negotiation.applySellerAction).toHaveBeenCalledWith(
      'escalation-token-abc',
      'COUNTER',
      1_700_000,
    );
  });

  // ── Already resolved escalation ──────────────────────────────────────────

  it('should return polite reply when escalation already RESOLVED', async () => {
    prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
    prisma.negotiationEscalation.findFirst.mockResolvedValue(makeEscalation());

    negotiation.applySellerAction.mockRejectedValue(
      new ConflictException('Already resolved'),
    );

    const result = await service.chat(
      NEGOTIATION_ID,
      SELLER_ID,
      [],
      'أوافق',
    );

    expect(result.reply).toContain('تم الرد عليه بالفعل');
    expect(negotiation.applySellerAction).toHaveBeenCalled();
  });

  // ── Gemma null fallback ──────────────────────────────────────────────────

  it('should use fallback string when Gemma returns null', async () => {
    gemma.chat.mockResolvedValue(null);
    prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
    prisma.negotiationEscalation.findFirst.mockResolvedValue(makeEscalation());

    const result = await service.chat(
      NEGOTIATION_ID,
      SELLER_ID,
      [],
      'محتاج أفكر',
    );

    expect(result.reply).toBe(SELLER_CHAT_FALLBACK);
  });

  // ── aiLog written ────────────────────────────────────────────────────────

  it('should write an aiLog row for each turn', async () => {
    prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
    prisma.negotiationEscalation.findFirst.mockResolvedValue(makeEscalation());

    await service.chat(
      NEGOTIATION_ID,
      SELLER_ID,
      [],
      'محتاج أفكر',
    );

    expect(prisma.aiLog.create).toHaveBeenCalledTimes(1);
    const logData = prisma.aiLog.create.mock.calls[0][0].data;
    expect(logData.actionType).toBe(AiActionType.ASK);
    expect(logData.data.intent).toBe('comment');
    expect(logData.data.role).toBe('seller');
    expect(logData.data.userMessage).toBe('محتاج أفكر');
  });

  // ── No pending escalation ────────────────────────────────────────────────

  it('should inform seller when no pending escalation exists for action intents', async () => {
    prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
    prisma.negotiationEscalation.findFirst.mockResolvedValue(null);

    const result = await service.chat(
      NEGOTIATION_ID,
      SELLER_ID,
      [],
      'أوافق',
    );

    expect(result.reply).toContain('مفيش عرض معلّق');
    expect(negotiation.applySellerAction).not.toHaveBeenCalled();
  });
});
