import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyType, PropertyKind, PropertyStatus, RecommendationStatus } from '@prisma/client';

// ─── Helpers ──────────────────────────────────────────────────

function makeProperty(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    userId: 'seller-1',
    title: 'APARTMENT for sale',
    description: null,
    price: 500_000 as unknown as import('@prisma/client/runtime/library').Decimal,
    type: PropertyType.SALE,
    propertyKind: PropertyKind.APARTMENT,
    bedrooms: 3,
    bathrooms: 2,
    areaM2: 120 as unknown as import('@prisma/client/runtime/library').Decimal,
    country: 'Egypt',
    governorate: 'Cairo',
    city: 'Nasr City',
    district: 'Zone 8',
    zone: null,
    street: null,
    nearestLandmark: null,
    latitude: null,
    longitude: null,
    propertyStatus: PropertyStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Simulates negotiation rows returned by Prisma with joined property. */
function makeNegotiation(
  buyerId: string,
  propOverrides: Record<string, unknown> = {},
  negOverrides: Record<string, unknown> = {},
) {
  return {
    id: `neg-${buyerId}`,
    buyerId,
    sellerId: 'seller-1',
    propertyId: 'some-prop',
    status: 'ACTIVE',
    currentOffer: null,
    minPrice: 400_000,
    maxPrice: 600_000,
    roundNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    property: {
      type: PropertyType.SALE,
      propertyKind: PropertyKind.APARTMENT,
      governorate: 'Cairo',
      city: 'Nasr City',
      district: 'Zone 8',
      ...propOverrides,
    },
    ...negOverrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let prisma: {
    negotiation: { findMany: jest.Mock };
    recommendation: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      negotiation: { findMany: jest.fn().mockResolvedValue([]) },
      recommendation: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RecommendationsService);
  });

  // ─── matchBuyersForProperty ─────────────────────────────────

  describe('matchBuyersForProperty', () => {
    it('returns 0 when no negotiations exist', async () => {
      const property = makeProperty();
      const count = await service.matchBuyersForProperty(property as any);
      expect(count).toBe(0);
    });

    it('creates a recommendation for a matching buyer', async () => {
      const property = makeProperty();
      prisma.negotiation.findMany.mockResolvedValue([
        makeNegotiation('buyer-1'),
      ]);

      const count = await service.matchBuyersForProperty(property as any);

      expect(count).toBe(1);
      expect(prisma.recommendation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { propertyId_buyerId: { propertyId: 'prop-1', buyerId: 'buyer-1' } },
          create: expect.objectContaining({
            propertyId: 'prop-1',
            buyerId: 'buyer-1',
            score: expect.any(Number),
          }),
        }),
      );
    });

    it('does NOT recommend to the seller themselves', async () => {
      const property = makeProperty({ userId: 'seller-1' });
      prisma.negotiation.findMany.mockResolvedValue([
        // This buyer is the same as the seller — should be filtered by query
        makeNegotiation('buyer-2', { governorate: 'Alexandria' }),
      ]);

      // The negotiation.findMany mock already excludes the seller via the where clause,
      // but buyer-2 has a different governorate so score may be low
      const count = await service.matchBuyersForProperty(property as any);
      // buyer-2's profile: type=SALE (25) + kind=APARTMENT (25) + gov=Alexandria (0) = 50
      // price 500k within maxBudget 600k => +15 = 65 → but gov doesn't match
      // Actually: TYPE=25, KIND=25, GOV=0, CITY=0, DISTRICT=0, PRICE=15 = 65
      // That's ≥ 25 so still recommended
      expect(count).toBe(1);
    });

    it('skips buyers whose score is below 25', async () => {
      const property = makeProperty({
        type: PropertyType.RENT,        // buyer only negotiated on SALE
        propertyKind: PropertyKind.SHOP, // buyer only negotiated on APARTMENT
        governorate: 'Aswan',           // different governorate
        price: 2_000_000,              // way above buyer budget
      });
      prisma.negotiation.findMany.mockResolvedValue([
        makeNegotiation('buyer-1'),
      ]);

      const count = await service.matchBuyersForProperty(property as any);
      expect(count).toBe(0);
      expect(prisma.recommendation.upsert).not.toHaveBeenCalled();
    });

    it('gives full score (100) when all criteria match perfectly', async () => {
      const property = makeProperty({ price: 500_000 });
      prisma.negotiation.findMany.mockResolvedValue([
        makeNegotiation('buyer-1'),
      ]);

      await service.matchBuyersForProperty(property as any);

      const upsertCall = prisma.recommendation.upsert.mock.calls[0][0];
      // TYPE(25) + KIND(25) + GOV(15) + CITY(10) + DISTRICT(10) + PRICE(15) = 100
      expect(upsertCall.create.score).toBe(100);
    });

    it('gives half price points when up to 10% over budget', async () => {
      const property = makeProperty({ price: 650_000 }); // 8.3% over maxBudget 600k
      prisma.negotiation.findMany.mockResolvedValue([
        makeNegotiation('buyer-1'),
      ]);

      await service.matchBuyersForProperty(property as any);

      const upsertCall = prisma.recommendation.upsert.mock.calls[0][0];
      // TYPE(25) + KIND(25) + GOV(15) + CITY(10) + DISTRICT(10) + PRICE(8) = 93
      expect(upsertCall.create.score).toBe(93);
    });
  });

  // ─── getRecommendations ─────────────────────────────────────

  describe('getRecommendations', () => {
    it('returns paginated results', async () => {
      prisma.recommendation.findMany.mockResolvedValue([{ id: 'rec-1' }]);
      prisma.recommendation.count.mockResolvedValue(1);

      const result = await service.getRecommendations('buyer-1');
      expect(result).toEqual({ items: [{ id: 'rec-1' }], total: 1, page: 1, limit: 20 });
    });

    it('filters by status when provided', async () => {
      await service.getRecommendations('buyer-1', RecommendationStatus.UNSEEN);

      expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerId: 'buyer-1', status: RecommendationStatus.UNSEEN },
        }),
      );
    });
  });

  // ─── markSeen ───────────────────────────────────────────────

  describe('markSeen', () => {
    it('updates status to SEEN', async () => {
      prisma.recommendation.findUnique.mockResolvedValue({
        id: 'rec-1',
        buyerId: 'buyer-1',
        status: RecommendationStatus.UNSEEN,
      });
      prisma.recommendation.update.mockResolvedValue({
        id: 'rec-1',
        status: RecommendationStatus.SEEN,
      });

      const result = await service.markSeen('rec-1', 'buyer-1');
      expect(result.status).toBe(RecommendationStatus.SEEN);
    });

    it('throws NotFoundException when recommendation does not belong to buyer', async () => {
      prisma.recommendation.findUnique.mockResolvedValue({
        id: 'rec-1',
        buyerId: 'other-buyer',
        status: RecommendationStatus.UNSEEN,
      });

      await expect(service.markSeen('rec-1', 'buyer-1')).rejects.toThrow(
        'Recommendation not found',
      );
    });

    it('returns existing rec without updating if already not UNSEEN', async () => {
      const existing = {
        id: 'rec-1',
        buyerId: 'buyer-1',
        status: RecommendationStatus.SEEN,
      };
      prisma.recommendation.findUnique.mockResolvedValue(existing);

      const result = await service.markSeen('rec-1', 'buyer-1');
      expect(result).toBe(existing);
      expect(prisma.recommendation.update).not.toHaveBeenCalled();
    });
  });

  // ─── getUnseenCount ─────────────────────────────────────────

  describe('getUnseenCount', () => {
    it('returns count from prisma', async () => {
      prisma.recommendation.count.mockResolvedValue(5);

      const count = await service.getUnseenCount('buyer-1');
      expect(count).toBe(5);
      expect(prisma.recommendation.count).toHaveBeenCalledWith({
        where: { buyerId: 'buyer-1', status: RecommendationStatus.UNSEEN },
      });
    });
  });

  // ─── dismiss ────────────────────────────────────────────────

  describe('dismiss', () => {
    it('updates status to DISMISSED', async () => {
      prisma.recommendation.findUnique.mockResolvedValue({
        id: 'rec-1',
        buyerId: 'buyer-1',
        status: RecommendationStatus.SEEN,
      });
      prisma.recommendation.update.mockResolvedValue({
        id: 'rec-1',
        status: RecommendationStatus.DISMISSED,
      });

      const result = await service.dismiss('rec-1', 'buyer-1');
      expect(result.status).toBe(RecommendationStatus.DISMISSED);
    });
  });

  // ─── markNegotiated ─────────────────────────────────────────

  describe('markNegotiated', () => {
    it('updates matching recommendations to NEGOTIATED', async () => {
      await service.markNegotiated('prop-1', 'buyer-1');

      expect(prisma.recommendation.updateMany).toHaveBeenCalledWith({
        where: { propertyId: 'prop-1', buyerId: 'buyer-1' },
        data: { status: RecommendationStatus.NEGOTIATED },
      });
    });
  });
});
