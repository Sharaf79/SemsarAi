import { PrismaService } from '../prisma/prisma.service';

/** Slang → structured filter mapping */
const SLANG_MAP: Record<string, { paymentMethod?: string; readiness?: string; type?: string }> = {
  كاش:        { paymentMethod: 'CASH' },
  نقداً:      { paymentMethod: 'CASH' },
  تقسيط:     { paymentMethod: 'INSTALLMENT' },
  خلوص:      { readiness: 'HANDOVER' },
  'تمليك حر': {},
  'إيجار قديم': { type: 'RENT' },
};

export function applySlangMapping(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;
  for (const [term, mapping] of Object.entries(SLANG_MAP)) {
    if (text.includes(term)) {
      Object.assign(result, mapping);
    }
  }
  return result;
}

export async function getLocationIds(
  prisma: PrismaService,
  names: string[],
): Promise<number[]> {
  const locations = await prisma.location.findMany({
    where: {
      OR: names.map((n) => ({ nameAr: { contains: n } })),
      isActive: true,
    },
    select: { id: true },
  });
  return locations.map((l) => l.id);
}

export interface PropertySearchFilters {
  intent?: 'SALE' | 'RENT';
  propertyKind?: string;
  locationNames?: string[];
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  paymentMethod?: string;
}

export async function findMatchingProperties(
  prisma: PrismaService,
  filters: PropertySearchFilters,
) {
  // Build location filter: any property whose governorate, city, or district
  // contains any of the user-mentioned location names.
  const locationOr =
    filters.locationNames && filters.locationNames.length > 0
      ? filters.locationNames.flatMap((name) => [
          { governorate: { contains: name } },
          { city: { contains: name } },
          { district: { contains: name } },
        ])
      : undefined;

  return prisma.property.findMany({
    where: {
      ...(filters.intent && { type: filters.intent }),
      ...(filters.propertyKind && { propertyKind: filters.propertyKind as never }),
      ...(filters.bedrooms != null && filters.bedrooms > 0 && { bedrooms: filters.bedrooms }),
      ...(filters.minPrice != null && filters.minPrice > 0 && {
        price: { gte: filters.minPrice },
      }),
      ...(filters.maxPrice != null && filters.maxPrice > 0 && {
        price: { lte: filters.maxPrice },
      }),
      ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
      ...(locationOr ? { OR: locationOr } : {}),
      propertyStatus: 'ACTIVE',
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      price: true,
      type: true,
      propertyKind: true,
      bedrooms: true,
      governorate: true,
      city: true,
      district: true,
    },
  });
}

export async function getRecommendations(
  prisma: PrismaService,
  userId: string,
  limit = 5,
) {
  return prisma.recommendation.findMany({
    where: { buyerId: userId, status: 'UNSEEN' },
    orderBy: { score: 'desc' },
    take: limit,
    include: {
      property: {
        select: {
          id: true,
          title: true,
          price: true,
          type: true,
          propertyKind: true,
          bedrooms: true,
          governorate: true,
          city: true,
        },
      },
    },
  });
}
