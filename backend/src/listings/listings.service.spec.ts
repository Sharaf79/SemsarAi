/**
 * ListingsService unit tests — ported from Python tests/unit/test_supabase_service.py
 * Tests: getById, getLatestByWhatsappId, create, update, publishUnit.
 */
import { ListingsService } from './listings.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrismaMock() {
  return {
    listing: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unit: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;
}

function makeDbListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1',
    whatsappId: '201234567890',
    intent: 'SELL',
    unitType: 'APARTMENT',
    specs: { area: '150', rooms: '3' },
    location: 'Maadi',
    price: 2500000,
    mediaUrls: ['https://example.com/photo1.jpg'],
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ListingsService', () => {
  let service: ListingsService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ListingsService(prisma);
  });

  describe('getById', () => {
    it('returns listing when found', async () => {
      const dbRow = makeDbListing();
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(dbRow);

      const result = await service.getById('listing-1');
      expect(result).toEqual(dbRow);
      expect(prisma.listing.findUnique).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
      });
    });

    it('returns null when not found', async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getById('unknown');
      expect(result).toBeNull();
    });
  });

  describe('getLatestByWhatsappId', () => {
    it('returns latest listing ordered by createdAt desc', async () => {
      const dbRow = makeDbListing();
      (prisma.listing.findFirst as jest.Mock).mockResolvedValue(dbRow);

      const result = await service.getLatestByWhatsappId('201234567890');
      expect(result).toEqual(dbRow);
      expect(prisma.listing.findFirst).toHaveBeenCalledWith({
        where: { whatsappId: '201234567890' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns null when no listings exist', async () => {
      (prisma.listing.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getLatestByWhatsappId('unknown');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates listing with all fields', async () => {
      const created = makeDbListing({ id: 'new-listing-id' });
      (prisma.listing.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create({
        whatsappId: '201234567890',
        intent: 'SELL',
        unitType: 'APARTMENT',
        specs: { area: '150' },
        location: 'Maadi',
        price: 2500000,
        mediaUrls: ['https://photo.jpg'],
        status: 'DRAFT',
      });

      expect(result.id).toBe('new-listing-id');
      const call = (prisma.listing.create as jest.Mock).mock.calls[0][0];
      expect(call.data.whatsappId).toBe('201234567890');
      expect(call.data.intent).toBe('SELL');
      expect(call.data.unitType).toBe('APARTMENT');
      expect(call.data.location).toBe('Maadi');
      expect(call.data.price).toBe(2500000);
    });

    it('defaults status to DRAFT when not provided', async () => {
      (prisma.listing.create as jest.Mock).mockResolvedValue(
        makeDbListing(),
      );

      await service.create({ whatsappId: '201234567890' });
      const call = (prisma.listing.create as jest.Mock).mock.calls[0][0];
      expect(call.data.status).toBe('DRAFT');
    });

    it('defaults mediaUrls to empty array', async () => {
      (prisma.listing.create as jest.Mock).mockResolvedValue(
        makeDbListing(),
      );

      await service.create({ whatsappId: '201234567890' });
      const call = (prisma.listing.create as jest.Mock).mock.calls[0][0];
      expect(call.data.mediaUrls).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates listing by id', async () => {
      const updated = makeDbListing({ price: 3000000 });
      (prisma.listing.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('listing-1', {
        price: 3000000,
        specs: { area: '200' },
      });

      expect(result.price).toBe(3000000);
      expect(prisma.listing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'listing-1' },
        }),
      );
    });

    it('passes all update fields to Prisma', async () => {
      (prisma.listing.update as jest.Mock).mockResolvedValue(
        makeDbListing(),
      );

      await service.update('listing-1', {
        intent: 'RENT',
        unitType: 'VILLA',
        specs: { area: '300' },
        location: 'Zamalek',
        price: 50000,
        mediaUrls: ['url1', 'url2'],
        status: 'CONFIRMED',
      });

      const call = (prisma.listing.update as jest.Mock).mock.calls[0][0];
      expect(call.data.intent).toBe('RENT');
      expect(call.data.unitType).toBe('VILLA');
      expect(call.data.location).toBe('Zamalek');
      expect(call.data.price).toBe(50000);
      expect(call.data.mediaUrls).toEqual(['url1', 'url2']);
      expect(call.data.status).toBe('CONFIRMED');
    });
  });

  describe('publishUnit', () => {
    it('creates a unit record from listing data', async () => {
      (prisma.unit.create as jest.Mock).mockResolvedValue({ id: 'unit-1' });

      await service.publishUnit({
        id: 'listing-1',
        whatsappId: '201234567890',
        intent: 'SELL',
        unitType: 'APARTMENT',
        specs: { area: '150', rooms: '3' },
        location: 'Maadi',
        price: 2500000,
        mediaUrls: ['https://photo.jpg'],
      });

      expect(prisma.unit.create).toHaveBeenCalledTimes(1);
      const call = (prisma.unit.create as jest.Mock).mock.calls[0][0];
      expect(call.data.listingId).toBe('listing-1');
      expect(call.data.whatsappId).toBe('201234567890');
      expect(call.data.intent).toBe('SELL');
      expect(call.data.unitType).toBe('APARTMENT');
      expect(call.data.isActive).toBe(true);
      expect(call.data.location).toBe('Maadi');
      expect(call.data.price).toBe(2500000);
      expect(call.data.mediaUrls).toEqual(['https://photo.jpg']);
    });

    it('handles null specs gracefully', async () => {
      (prisma.unit.create as jest.Mock).mockResolvedValue({ id: 'unit-2' });

      await service.publishUnit({
        id: 'listing-2',
        whatsappId: '201234567890',
        intent: 'RENT',
        unitType: 'VILLA',
        specs: null,
        location: null,
        price: null,
        mediaUrls: [],
      });

      const call = (prisma.unit.create as jest.Mock).mock.calls[0][0];
      expect(call.data.location).toBeNull();
      expect(call.data.price).toBeNull();
      expect(call.data.mediaUrls).toEqual([]);
    });
  });
});
