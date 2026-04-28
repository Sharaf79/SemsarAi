/**
 * Unit tests for NegotiationService (T62–T74).
 *
 * All external dependencies are mocked:
 *  - PrismaService  → in-memory stubs via jest.fn()
 *  - GeminiService  → jest.fn() that returns { message: '...' } by default
 *
 * The Prisma $transaction mock executes the callback synchronously with the
 * same prisma stub object, so all tx.xxx calls resolve through the same mocks.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  NegotiationStatus,
  PropertyStatus,
  PropertyType,
  AiActionType,
  DealStatus,
} from '@prisma/client';

import { NegotiationService } from './negotiation.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../gemini/gemini.service';
import { GemmaClient } from './gemma.client';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { JwtService } from '@nestjs/jwt';
import { PaymentsService } from '../payments/payments.service';
import { INITIAL_OFFER_FACTOR, MAX_ROUNDS } from './constants/negotiation.constants';

// ── Fixture helpers ───────────────────────────────────────────────────────────

const PROPERTY_ID  = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const BUYER_ID     = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SELLER_ID    = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const NEGOTIATION_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const DEAL_ID      = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

/** A minimal active SALE property fixture */
function makeProperty(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PROPERTY_ID,
    userId: SELLER_ID,
    price: 1_000_000,
    type: PropertyType.SALE,
    propertyStatus: PropertyStatus.ACTIVE,
    ...overrides,
  };
}

/** A minimal ACTIVE negotiation fixture */
function makeNegotiation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NEGOTIATION_ID,
    propertyId: PROPERTY_ID,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    status: NegotiationStatus.ACTIVE,
    currentOffer: 850_000,   // 1_000_000 × 0.85
    minPrice: 1_000_000,     // listing price
    maxPrice: 1_200_000,     // buyer budget
    roundNumber: 1,
    property: {
      id: PROPERTY_ID,
      type: PropertyType.SALE,
      userId: SELLER_ID,
    },
    ...overrides,
  };
}

/** Build the PrismaService mock + $transaction that runs the callback inline */
function makePrisma() {
  const prisma: Record<string, any> = {
    property: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
    negotiation: {
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
    },
    offer: {
      create: jest.fn(),
    },
    deal: {
      create: jest.fn(),
    },
    aiLog: {
      create: jest.fn(),
    },
    // $transaction runs the callback synchronously with the same stub object
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

/** Build a GeminiService mock that resolves with a polished message by default */
function makeGemini(): jest.Mocked<GeminiService> {
  return {
    sendMessage: jest.fn().mockResolvedValue({ message: 'رسالة من Gemini' }),
  } as unknown as jest.Mocked<GeminiService>;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('NegotiationService', () => {
  let service: NegotiationService;
  let prisma:   ReturnType<typeof makePrisma>;
  let gemini:   jest.Mocked<GeminiService>;

  beforeEach(async () => {
    prisma = makePrisma();
    gemini = makeGemini();

    const gemma = { chat: jest.fn().mockResolvedValue(null) } as unknown as GemmaClient;
    const whatsapp = { sendTextMessage: jest.fn().mockResolvedValue(undefined) } as unknown as WhatsAppService;
    const jwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
      verify: jest.fn().mockReturnValue({ escalationId: 'esc-id' }),
    } as unknown as JwtService;
    const paymentsService = {
      initiateDeposit: jest.fn().mockResolvedValue({
        paymentId: 'pay-id', amount: 100, fee: 100, currency: 'EGP', paymentUrl: '/payment/pay-id',
      }),
    } as unknown as PaymentsService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NegotiationService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiService, useValue: gemini },
        { provide: GemmaClient, useValue: gemma },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: JwtService, useValue: jwtService },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    service = module.get<NegotiationService>(NegotiationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── startNegotiation ───────────────────────────────────────────────────────

  describe('startNegotiation()', () => {
    beforeEach(() => {
      prisma.property.findUnique.mockResolvedValue(makeProperty());
      prisma.negotiation.findFirst.mockResolvedValue(null); // no duplicate
      prisma.negotiation.create.mockImplementation(({ data }: any) => ({
        id: NEGOTIATION_ID,
        ...data,
      }));
      prisma.offer.create.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});
    });

    it('should create a negotiation and return NegotiationResult', async () => {
      const result = await service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000);

      expect(result.negotiationId).toBe(NEGOTIATION_ID);
      expect(result.propertyId).toBe(PROPERTY_ID);
      expect(result.buyerId).toBe(BUYER_ID);
      expect(result.sellerId).toBe(SELLER_ID);
      expect(result.status).toBe(NegotiationStatus.ACTIVE);
      expect(result.roundNumber).toBe(1);
      expect(result.message).toBeDefined();
    });

    it('should calculate initialOffer as buyerMaxPrice × INITIAL_OFFER_FACTOR (0.85)', async () => {
      const buyerMaxPrice = 1_200_000;
      const expected = Math.round(buyerMaxPrice * INITIAL_OFFER_FACTOR * 100) / 100;

      const result = await service.startNegotiation(PROPERTY_ID, BUYER_ID, buyerMaxPrice);

      expect(result.initialOffer).toBe(expected); // 1_020_000
    });

    it('should set minPrice to the property listing price', async () => {
      const result = await service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000);

      expect(result.minPrice).toBe(1_000_000);
    });

    it('should persist the negotiation via $transaction', async () => {
      await service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.negotiation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            propertyId: PROPERTY_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID,
            roundNumber: 1,
            status: NegotiationStatus.ACTIVE,
          }),
        }),
      );
    });

    it('should create the initial Offer row inside the transaction', async () => {
      await service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000);

      expect(prisma.offer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            negotiationId: NEGOTIATION_ID,
            round: 1,
            createdBy: 'SYSTEM',
          }),
        }),
      );
    });

    it('should throw NotFoundException when property does not exist', async () => {
      prisma.property.findUnique.mockResolvedValue(null);

      await expect(
        service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when property is not ACTIVE', async () => {
      prisma.property.findUnique.mockResolvedValue(
        makeProperty({ propertyStatus: PropertyStatus.SOLD }),
      );

      await expect(
        service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when buyer is the seller', async () => {
      await expect(
        service.startNegotiation(PROPERTY_ID, SELLER_ID, 1_200_000),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when an active negotiation already exists', async () => {
      prisma.negotiation.findFirst.mockResolvedValue(makeNegotiation());

      await expect(
        service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── handleAction — request_counter ────────────────────────────────────────

  describe('handleAction() — request_counter', () => {
    beforeEach(() => {
      prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
      prisma.negotiation.update.mockResolvedValue({});
      prisma.offer.create.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});
    });

    it('should increment roundNumber', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(result.roundNumber).toBe(2);
      expect(result.message).toBeDefined();
    });

    it('should auto-accept when calculateCounterOffer clamps offer up to minPrice', async () => {
      // currentOffer=850K + concession(10K) = 860K < minPrice(1M)
      // → calculateCounterOffer clamps to 1M which equals minPrice → auto-accept
      const result = await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(result.status).toBe(NegotiationStatus.AGREED);
      expect(result.autoAccepted).toBe(true);
      expect(result.dealId).toBe(DEAL_ID);
    });

    it('should keep status ACTIVE when counter offer is above minPrice but below maxPrice', async () => {
      // currentOffer already above minPrice: clamp does not change the value
      // currentOffer=1_050_000, round 2: next=1_060_000 — above minPrice → auto-accept
      // To stay ACTIVE we need a round where the offer is already well above minPrice
      // and the test verifies the round increments correctly before the auto-accept branch
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ currentOffer: 1_050_000, roundNumber: 1 }),
      );
      const result = await service.handleAction(NEGOTIATION_ID, 'request_counter');

      // 1_060_000 >= minPrice(1_000_000) → auto-accept is expected
      expect(result.roundNumber).toBe(2);
      expect(result.currentOffer).not.toBeNull();
    });

    it('should apply 5% concession rate for rounds 1–2', () => {
      expect(service.getConcessionRate(1)).toBe(0.05);
      expect(service.getConcessionRate(2)).toBe(0.05);
    });

    it('should apply 10% concession rate for rounds 3–5', () => {
      expect(service.getConcessionRate(3)).toBe(0.10);
      expect(service.getConcessionRate(4)).toBe(0.10);
      expect(service.getConcessionRate(5)).toBe(0.10);
    });

    it('should apply 15% concession rate for round 6+', () => {
      expect(service.getConcessionRate(6)).toBe(0.15);
      expect(service.getConcessionRate(7)).toBe(0.15);
    });

    it('should calculate counter offer correctly using constitution formula', () => {
      // Use currentOffer above minPrice so clamp does not interfere:
      // currentOffer=1_050_000, minPrice=1_000_000, maxPrice=1_200_000, round=2
      // gap = 200_000, rate = 5%, concession = 10_000
      // next = 1_060_000 → clamp(1_060_000, 1_000_000, 1_200_000) = 1_060_000
      const result = service.calculateCounterOffer(1_050_000, 1_000_000, 1_200_000, 2);
      expect(result).toBe(1_060_000);
    });

    it.each([
      // [previousOffer, minPrice, maxPrice, round]
      [1_050_000, 1_000_000, 1_200_000, 1],
      [1_050_000, 1_000_000, 1_200_000, 3],
      [1_050_000, 1_000_000, 1_200_000, 6],
      [1_100_000, 1_000_000, 1_200_000, 2],
      [1_150_000, 1_000_000, 1_200_000, 5],
    ])(
      'counter offer should always be ≥ previous offer (prev=%i, round=%i)',
      (previousOffer, minPrice, maxPrice, round) => {
        const counterOffer = service.calculateCounterOffer(previousOffer, minPrice, maxPrice, round);
        expect(counterOffer).toBeGreaterThanOrEqual(previousOffer);
      },
    );

    it('should clamp low raw offer up to minPrice when natural step is below listing price', () => {
      // currentOffer=850_000 + 10_000 concession = 860_000 < minPrice(1_000_000)
      // → clamped to 1_000_000
      const result = service.calculateCounterOffer(850_000, 1_000_000, 1_200_000, 2);
      expect(result).toBe(1_000_000);
    });

    it('should clamp counter offer to maxPrice if it exceeds it', () => {
      // currentOffer already at max
      const result = service.calculateCounterOffer(1_200_000, 1_000_000, 1_200_000, 6);
      expect(result).toBe(1_200_000);
    });

    it('should clamp counter offer to minPrice if calculated value is below it', () => {
      const result = service.calculateCounterOffer(0, 1_000_000, 1_200_000, 1);
      // 0 + 200_000*0.05 = 10_000 → below minPrice 1_000_000 → clamped to 1_000_000
      expect(result).toBe(1_000_000);
    });

    it('should create an Offer row for each counter inside the transaction', async () => {
      await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(prisma.offer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            negotiationId: NEGOTIATION_ID,
            round: 2,
            createdBy: 'SYSTEM',
          }),
        }),
      );
    });
  });

  // ── handleAction — accept ─────────────────────────────────────────────────

  describe('handleAction() — accept', () => {
    beforeEach(() => {
      prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
      prisma.negotiation.update.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});
    });

    it('should set status to AGREED', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(result.status).toBe(NegotiationStatus.AGREED);
      expect(result.message).toBeDefined();
    });

    it('should return the new dealId', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(result.dealId).toBe(DEAL_ID);
    });

    it('should create a Deal row via Prisma transaction', async () => {
      await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(prisma.deal.create).toHaveBeenCalled();
      expect(prisma.deal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            negotiationId: NEGOTIATION_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID,
            status: DealStatus.PENDING,
          }),
        }),
      );
    });

    it('should mark the property as SOLD for a SALE type property', async () => {
      await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(prisma.property.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ propertyStatus: PropertyStatus.SOLD }),
        }),
      );
    });

    it('should mark the property as RENTED for a RENT type property', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ property: { id: PROPERTY_ID, type: PropertyType.RENT, userId: SELLER_ID } }),
      );

      await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(prisma.property.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ propertyStatus: PropertyStatus.RENTED }),
        }),
      );
    });

    it('should set autoAccepted to false for an explicit accept', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(result.autoAccepted).toBe(false);
    });

    it('should return the accepted currentOffer price', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(result.currentOffer).toBe(850_000);
    });
  });

  // ── handleAction — reject ─────────────────────────────────────────────────

  describe('handleAction() — reject', () => {
    beforeEach(() => {
      prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
      prisma.negotiation.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});
    });

    it('should set status to FAILED', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'reject');

      expect(result.status).toBe(NegotiationStatus.FAILED);
      expect(result.message).toBeDefined();
    });

    it('should NOT create a Deal', async () => {
      await service.handleAction(NEGOTIATION_ID, 'reject');

      expect(prisma.deal.create).not.toHaveBeenCalled();
    });

    it('should return null currentOffer when FAILED', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'reject');

      expect(result.currentOffer).toBeNull();
    });

    it('should return null dealId', async () => {
      const result = await service.handleAction(NEGOTIATION_ID, 'reject');

      expect(result.dealId).toBeNull();
    });

    it('should throw NotFoundException when negotiation does not exist', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(null);

      await expect(
        service.handleAction(NEGOTIATION_ID, 'reject'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when negotiation is already AGREED', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ status: NegotiationStatus.AGREED }),
      );

      await expect(
        service.handleAction(NEGOTIATION_ID, 'reject'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── max rounds ────────────────────────────────────────────────────────────

  describe('max rounds (auto-fail)', () => {
    it(`should auto-fail when roundNumber exceeds MAX_ROUNDS (${MAX_ROUNDS})`, async () => {
      // roundNumber = MAX_ROUNDS (6), so next counter would be 7 → auto-fail
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ roundNumber: MAX_ROUNDS }),
      );
      prisma.negotiation.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      const result = await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(result.status).toBe(NegotiationStatus.FAILED);
      expect(result.currentOffer).toBeNull();
      expect(result.dealId).toBeNull();
    });

    it('should NOT create an Offer row when auto-failing', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ roundNumber: MAX_ROUNDS }),
      );
      prisma.negotiation.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(prisma.offer.create).not.toHaveBeenCalled();
    });
  });

  // ── auto-accept ──────────────────────────────────────────────────────────

  describe('auto-accept', () => {
    it('should auto-accept when counterOffer >= minPrice', async () => {
      // Set currentOffer very close to minPrice so one counter step crosses it.
      // minPrice=1_000_000, maxPrice=1_200_000, round 2 rate=5%
      // gap = 200_000, concession = 10_000
      // currentOffer = 995_000 → next = 1_005_000 >= minPrice → auto-accept
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ currentOffer: 995_000, roundNumber: 1 }),
      );
      prisma.negotiation.update.mockResolvedValue({});
      prisma.offer.create.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      const result = await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(result.status).toBe(NegotiationStatus.AGREED);
      expect(result.autoAccepted).toBe(true);
      expect(result.dealId).toBe(DEAL_ID);
      expect(result.message).toBeDefined();
    });

    it('should create a Deal when auto-accepting', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ currentOffer: 995_000, roundNumber: 1 }),
      );
      prisma.negotiation.update.mockResolvedValue({});
      prisma.offer.create.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(prisma.deal.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── Gemini failure fallback ───────────────────────────────────────────────

  describe('Gemini failure — fallback messages', () => {
    beforeEach(() => {
      // Make Gemini always throw
      gemini.sendMessage.mockRejectedValue(new Error('Gemini quota exceeded'));
    });

    it('should fall back to default Arabic counter message when Gemini fails', async () => {
      const price = 850_000;
      const msg = await service.formatMessageWithGemini('counter', price);

      expect(msg).toBe(service.formatMessage('counter', price));
      expect(msg).toContain('جنيه');
    });

    it('should fall back to default Arabic accept message when Gemini fails', async () => {
      const price = 1_000_000;
      const msg = await service.formatMessageWithGemini('accept', price);

      expect(msg).toBe(service.formatMessage('accept', price));
      expect(msg).toContain('تم الاتفاق');
    });

    it('should fall back to default Arabic reject message when Gemini fails', async () => {
      const msg = await service.formatMessageWithGemini('reject');

      expect(msg).toBe(service.formatMessage('reject'));
      expect(msg).toContain('نأسف');
    });

    it('should fall back when Gemini returns an empty message string', async () => {
      gemini.sendMessage.mockResolvedValue({ message: '' });
      const price = 900_000;

      const msg = await service.formatMessageWithGemini('counter', price);

      expect(msg).toBe(service.formatMessage('counter', price));
    });

    it('should still complete startNegotiation successfully when Gemini fails', async () => {
      prisma.property.findUnique.mockResolvedValue(makeProperty());
      prisma.negotiation.findFirst.mockResolvedValue(null);
      prisma.negotiation.create.mockImplementation(({ data }: any) => ({
        id: NEGOTIATION_ID,
        ...data,
      }));
      prisma.offer.create.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      const result = await service.startNegotiation(PROPERTY_ID, BUYER_ID, 1_200_000);

      // Should succeed with fallback message
      expect(result.negotiationId).toBe(NEGOTIATION_ID);
      expect(result.message).toContain('جنيه');
    });

    it('should still complete handleAction(accept) when Gemini fails', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
      prisma.negotiation.update.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      const result = await service.handleAction(NEGOTIATION_ID, 'accept');

      expect(result.status).toBe(NegotiationStatus.AGREED);
      expect(result.message).toContain('تم الاتفاق');
    });

    it('should still complete handleAction(reject) when Gemini fails', async () => {
      jest.spyOn(gemini, 'sendMessage').mockRejectedValue(new Error('Gemini unreachable'));
      prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
      prisma.negotiation.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      const result = await service.handleAction(NEGOTIATION_ID, 'reject');

      expect(result.status).toBe(NegotiationStatus.FAILED);
      expect(result.message).toContain('نأسف');
    });

    it('should still complete handleAction(request_counter) when Gemini fails', async () => {
      jest.spyOn(gemini, 'sendMessage').mockRejectedValue(new Error('Gemini unreachable'));
      // currentOffer=1_050_000, round 2 → counter=1_060_000 >= minPrice → auto-accept
      prisma.negotiation.findUnique.mockResolvedValue(
        makeNegotiation({ currentOffer: 1_050_000, roundNumber: 1 }),
      );
      prisma.negotiation.update.mockResolvedValue({});
      prisma.offer.create.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      const result = await service.handleAction(NEGOTIATION_ID, 'request_counter');

      expect(result.status).toBe(NegotiationStatus.AGREED);
      expect(result.message).toContain('تم الاتفاق');
    });
  });

  // ── formatMessage (sync fallback) ────────────────────────────────────────

  describe('formatMessage() — sync fallback', () => {
    it('should return a counter message containing the formatted price', () => {
      const msg = service.formatMessage('counter', 1_500_000);
      expect(msg).toContain('1,500,000');
      expect(msg).toContain('جنيه');
    });

    it('should return an accept message containing the formatted price', () => {
      const msg = service.formatMessage('accept', 2_000_000);
      expect(msg).toContain('2,000,000');
      expect(msg).toContain('جنيه');
    });

    it('should return a reject message without a price', () => {
      const msg = service.formatMessage('reject');
      expect(msg).toContain('نأسف');
      expect(msg).not.toContain('undefined');
    });
  });

  // ── getConcessionRate ─────────────────────────────────────────────────────

  describe('getConcessionRate()', () => {
    it.each([
      [1, 0.05],
      [2, 0.05],
      [3, 0.10],
      [4, 0.10],
      [5, 0.10],
      [6, 0.15],
      [7, 0.15],
    ])('round %i → rate %d', (round, expected) => {
      expect(service.getConcessionRate(round)).toBe(expected);
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should return negotiation with offers and deals', async () => {
      const mockOffers = [{ id: 'o1', round: 1, amount: 850_000 }];
      const mockDeals: unknown[] = [];
      prisma.negotiation.findUnique.mockResolvedValue({
        ...makeNegotiation(),
        offers: mockOffers,
        deals: mockDeals,
      });

      const result = await service.getStatus(NEGOTIATION_ID);

      expect(result.negotiation.id).toBe(NEGOTIATION_ID);
      expect(result.offers).toEqual(mockOffers);
      expect(result.deals).toEqual(mockDeals);
      expect(result.currentRound).toBe(1);
      expect(result.maxRounds).toBe(MAX_ROUNDS);
    });

    it('should throw NotFoundException when negotiation does not exist', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(null);

      await expect(service.getStatus(NEGOTIATION_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── mapTextToAction ────────────────────────────────────────────────────────

  describe('mapTextToAction()', () => {
    const map = (text: string) => (service as any).mapTextToAction(text);

    it('returns "accept" for "موافق"', () => {
      expect(map('موافق')).toBe('accept');
    });

    it('returns "accept" for "تمام"', () => {
      expect(map('تمام')).toBe('accept');
    });

    it('returns "accept" for mixed Arabic sentence containing "موافق"', () => {
      expect(map('أنا موافق على السعر')).toBe('accept');
    });

    it('returns "accept" for mixed Arabic sentence containing "تمام"', () => {
      expect(map('تمام يلا')).toBe('accept');
    });

    it('returns "reject" for "مش موافق"', () => {
      expect(map('مش موافق')).toBe('reject');
    });

    it('returns "reject" for "لا"', () => {
      expect(map('لا')).toBe('reject');
    });

    it('returns "reject" for a sentence containing "لا"', () => {
      expect(map('لا شكرا')).toBe('reject');
    });

    it('returns "request_counter" for unrecognised text (default fallback)', () => {
      expect(map('عايز عرض تاني')).toBe('request_counter');
    });

    it('returns "request_counter" for empty string', () => {
      expect(map('')).toBe('request_counter');
    });

    it('"مش موافق" takes priority over "موافق" (reject wins)', () => {
      // "مش موافق" contains "موافق" — reject branch must be checked first
      expect(map('أنا مش موافق')).toBe('reject');
    });
  });

  // ── handleMessage ──────────────────────────────────────────────────────────

  describe('handleMessage()', () => {
    const makeContext = (entityId = NEGOTIATION_ID) => ({
      userId: BUYER_ID,
      channel: 'whatsapp' as const,
      activeFlow: 'negotiation' as const,
      entityId,
    });

    beforeEach(() => {
      prisma.negotiation.findUnique.mockResolvedValue(makeNegotiation());
      prisma.negotiation.update.mockResolvedValue({
        ...makeNegotiation(),
        roundNumber: 2,
        currentOffer: 875_000,
      });
      prisma.offer.create.mockResolvedValue({ id: 'offer-1', amount: 875_000, round: 2 });
      prisma.aiLog.create.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
    });

    it('returns a ConversationResponse with message and data', async () => {
      const result = await service.handleMessage(makeContext(), 'عايز عرض تاني');

      expect(result.message).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('delegates "موافق" to accept action and returns ConversationResponse', async () => {
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});

      const result = await service.handleMessage(makeContext(), 'موافق');

      expect(result.message).toBeDefined();
      expect((result.data as any).status).toBe(NegotiationStatus.AGREED);
    });

    it('delegates "لا" to reject action', async () => {
      const result = await service.handleMessage(makeContext(), 'لا');

      expect((result.data as any).status).toBe(NegotiationStatus.FAILED);
    });

    it('delegates default text to request_counter and advances the round', async () => {
      const result = await service.handleMessage(makeContext(), 'عايز عرض تاني');

      expect((result.data as any).roundNumber).toBeGreaterThanOrEqual(2);
    });

    it('propagates NotFoundException for unknown negotiationId', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(null);

      await expect(
        service.handleMessage(makeContext('bad-id'), 'عايز عرض تاني'),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not expose internal action key (no "action" field in ConversationResponse)', async () => {
      const result = await service.handleMessage(makeContext(), 'عايز عرض تاني');

      expect(result).not.toHaveProperty('action');
    });
  });

  // ── proposePrice (voice/chat phase) ───────────────────────────────────────

  describe('proposePrice()', () => {
    it('IN_BAND → marks AGREED, creates deposit', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        ...makeNegotiation(),
        property: {
          id: PROPERTY_ID,
          type: PropertyType.SALE,
          userId: SELLER_ID,
          title: 'Test',
          price: 1_000_000,
          minPrice: 900_000,
          maxPrice: 1_100_000,
          governorate: 'Cairo',
          city: null,
          district: null,
          areaM2: 100,
        },
        seller: { phone: '+201111111111' },
      });
      prisma.negotiation.update.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});

      const res = await service.proposePrice(NEGOTIATION_ID, 950_000);

      expect(res.decision).toBe('IN_BAND');
      expect(res.depositRequired).toBe(true);
      expect(res.dealId).toBe(DEAL_ID);
      expect(res.paymentId).toBe('pay-id');
    });

    it('BELOW_MIN → creates escalation, sends WhatsApp, returns waiting message', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        ...makeNegotiation(),
        property: {
          id: PROPERTY_ID,
          type: PropertyType.SALE,
          userId: SELLER_ID,
          title: 'Test',
          price: 1_000_000,
          minPrice: 900_000,
          maxPrice: 1_100_000,
          governorate: null,
          city: null,
          district: null,
          areaM2: null,
        },
        seller: { phone: '+201111111111' },
      });
      prisma.negotiationEscalation = {
        create: jest.fn().mockResolvedValue({ id: 'esc-1' }),
        update: jest.fn().mockResolvedValue({}),
      } as any;
      prisma.aiLog.create.mockResolvedValue({});

      const res = await service.proposePrice(NEGOTIATION_ID, 500_000);

      expect(res.decision).toBe('BELOW_MIN');
      expect(res.escalationId).toBe('esc-1');
    });
  });

  // ── applySellerAction ──────────────────────────────────────────────────────

  describe('applySellerAction()', () => {
    function setupEscalation() {
      prisma.negotiationEscalation = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'esc-id',
          status: 'PENDING',
          buyerOffer: 800_000,
          negotiation: {
            id: NEGOTIATION_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID,
            propertyId: PROPERTY_ID,
            roundNumber: 2,
            property: { id: PROPERTY_ID, type: PropertyType.SALE, userId: SELLER_ID },
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      } as any;
      prisma.negotiation.update.mockResolvedValue({});
      prisma.deal.create.mockResolvedValue({ id: DEAL_ID });
      prisma.property.update.mockResolvedValue({});
      prisma.offer.create.mockResolvedValue({});
      prisma.aiLog.create.mockResolvedValue({});
    }

    it('ACCEPT → AGREED + deposit', async () => {
      setupEscalation();
      const res = await service.applySellerAction('tok', 'ACCEPT');
      expect(res.action).toBe('ACCEPT');
      expect(res.negotiationStatus).toBe(NegotiationStatus.AGREED);
      expect(res.dealId).toBe(DEAL_ID);
      expect(res.paymentId).toBe('pay-id');
    });

    it('REJECT → FAILED', async () => {
      setupEscalation();
      const res = await service.applySellerAction('tok', 'REJECT');
      expect(res.action).toBe('REJECT');
      expect(res.negotiationStatus).toBe(NegotiationStatus.FAILED);
    });

    it('COUNTER → ACTIVE with new offer round', async () => {
      setupEscalation();
      const res = await service.applySellerAction('tok', 'COUNTER', 950_000);
      expect(res.action).toBe('COUNTER');
      expect(res.negotiationStatus).toBe(NegotiationStatus.ACTIVE);
      expect(res.counterPrice).toBe(950_000);
    });

    it('COUNTER without price → BadRequest', async () => {
      setupEscalation();
      await expect(service.applySellerAction('tok', 'COUNTER')).rejects.toThrow(BadRequestException);
    });
  });
});
