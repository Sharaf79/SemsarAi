import { Prisma, Property, PropertyRequest, PropertyType, RequestStatus, RequestUrgency } from '@prisma/client';
import { ScorerService } from './scorer.service';

type Req = PropertyRequest & {
  locationNames?: { governorates: string[]; cities: string[]; districts: string[] };
};

function mkProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    userId: 'seller',
    title: 't',
    description: null,
    price: new Prisma.Decimal(1_000_000),
    type: PropertyType.SALE,
    propertyKind: 'APARTMENT',
    bedrooms: 3,
    bathrooms: 2,
    areaM2: new Prisma.Decimal(120),
    country: 'Egypt',
    governorate: 'القاهرة',
    city: 'المعادي',
    district: 'دجلة',
    zone: null,
    street: null,
    nearestLandmark: null,
    latitude: null,
    longitude: null,
    propertyStatus: 'ACTIVE',
    isPaid: false,
    apartmentType: null,
    ownershipType: null,
    amenities: ['مصعد', 'موقف'] as unknown as Prisma.JsonValue,
    floorLevel: null,
    isFurnished: true,
    readiness: null,
    deliveryDate: null,
    deliveryTerms: null,
    finishingType: 'سوبر لوكس',
    paymentMethod: null,
    paymentType: null,
    isNegotiable: false,
    rentRateType: null,
    location: null,
    rentalRate: null,
    rentalFees: null,
    downPayment: null,
    insurance: null,
    adTitle: null,
    adDescription: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mkRequest(overrides: Partial<Req> = {}): Req {
  return {
    id: 'r1',
    userId: 'buyer',
    intent: PropertyType.SALE,
    propertyKind: 'APARTMENT',
    apartmentType: null,
    minPrice: new Prisma.Decimal(800_000),
    maxPrice: new Prisma.Decimal(1_200_000),
    paymentPreference: null,
    rentRateType: null,
    minBedrooms: 3,
    maxBedrooms: 3,
    minBathrooms: null,
    maxBathrooms: null,
    minAreaM2: null,
    maxAreaM2: null,
    centerLatitude: null,
    centerLongitude: null,
    searchRadiusKm: null,
    isFurnished: null,
    finishingType: null,
    floorLevel: null,
    readiness: null,
    ownershipType: null,
    preferredAmenities: null,
    urgency: RequestUrgency.MEDIUM,
    status: RequestStatus.ACTIVE,
    notes: null,
    expiresAt: null,
    lastMatchedAt: null,
    lastRecomputedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    locationNames: { governorates: [], cities: [], districts: ['دجلة'] },
    ...overrides,
  };
}

describe('ScorerService', () => {
  const scorer = new ScorerService();

  describe('location', () => {
    it('gives 100 for district match', () => {
      const s = scorer.score(mkProperty(), mkRequest());
      expect(s.locationScore).toBe(100);
      expect(s.reasons.matched).toContain('same_district');
    });

    it('gives 75 for city-only match', () => {
      const s = scorer.score(
        mkProperty({ district: 'غيره' }),
        mkRequest({ locationNames: { governorates: [], cities: ['المعادي'], districts: [] } }),
      );
      expect(s.locationScore).toBe(75);
    });

    it('gives 50 for governorate-only match', () => {
      const s = scorer.score(
        mkProperty({ city: 'غيره', district: 'غيره' }),
        mkRequest({ locationNames: { governorates: ['القاهرة'], cities: [], districts: [] } }),
      );
      expect(s.locationScore).toBe(50);
    });

    it('gives 0 for no location match', () => {
      const s = scorer.score(
        mkProperty({ governorate: 'x', city: 'y', district: 'z' }),
        mkRequest({ locationNames: { governorates: [], cities: [], districts: [] } }),
      );
      expect(s.locationScore).toBe(0);
      expect(s.reasons.missed).toContain('location_mismatch');
    });

    it('applies radius fallback when coords present', () => {
      const s = scorer.score(
        mkProperty({
          governorate: 'x',
          city: 'y',
          district: 'z',
          latitude: new Prisma.Decimal(30.05),
          longitude: new Prisma.Decimal(31.23),
        }),
        mkRequest({
          locationNames: { governorates: [], cities: [], districts: [] },
          centerLatitude: new Prisma.Decimal(30.05),
          centerLongitude: new Prisma.Decimal(31.23),
          searchRadiusKm: new Prisma.Decimal(5),
        }),
      );
      expect(s.locationScore).toBeGreaterThan(90);
      expect(s.distanceKm).toBeLessThan(0.5);
    });
  });

  describe('price', () => {
    it('100 when inside range', () => {
      expect(scorer.score(mkProperty({ price: new Prisma.Decimal(900_000) }), mkRequest()).priceScore).toBe(100);
    });
    it('80 when within 10%', () => {
      // max 1.2M, price 1.3M → 8.3% over → 80
      const s = scorer.score(mkProperty({ price: new Prisma.Decimal(1_300_000) }), mkRequest());
      expect(s.priceScore).toBe(80);
    });
    it('0 when far outside', () => {
      const s = scorer.score(mkProperty({ price: new Prisma.Decimal(5_000_000) }), mkRequest());
      expect(s.priceScore).toBe(0);
    });
  });

  describe('features', () => {
    it('rewards bedroom match', () => {
      const s = scorer.score(mkProperty(), mkRequest());
      expect(s.reasons.matched).toContain('bedrooms_exact');
    });
    it('rewards amenities intersection', () => {
      const s = scorer.score(
        mkProperty(),
        mkRequest({ preferredAmenities: ['مصعد', 'حمام سباحة'] as unknown as Prisma.JsonValue }),
      );
      expect(s.featureScore).toBeGreaterThan(0);
      expect(s.reasons.matched.some((m) => m.endsWith('amenities_match'))).toBe(true);
    });
    it('penalizes finishing mismatch', () => {
      const s = scorer.score(mkProperty(), mkRequest({ finishingType: 'لوكس' }));
      expect(s.reasons.missed).toContain('finishing_mismatch');
    });
  });

  describe('composite', () => {
    it('combines with weights 0.4 / 0.3 / 0.3', () => {
      const s = scorer.score(mkProperty(), mkRequest());
      const expected = 0.4 * s.locationScore + 0.3 * s.priceScore + 0.3 * s.featureScore;
      expect(Math.abs(s.score - Math.round(expected * 100) / 100)).toBeLessThan(0.01);
    });
  });
});
