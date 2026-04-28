/**
 * Search Tools — Prisma-backed database query tools for search chat.
 *
 * Each tool is a named function that queries the Property table via Prisma.
 * The LLM decides which tools to call based on the user's natural language query.
 */
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// ─── Egyptian Slang → DB value mapping ──────────────────────────

export const SLANG_MAP = {
  propertyKind: {
    شقة: 'APARTMENT',
    فيلا: 'VILLA',
    محل: 'SHOP',
    مكتب: 'OFFICE',
    استراحة: 'SUMMER_RESORT',
    'مكان تجاري': 'COMMERCIAL',
    ارض: 'LAND_BUILDING',
    'أرض': 'LAND_BUILDING',
  } as Record<string, string>,

  propertyType: {
    بيع: 'SALE',
    شراء: 'SALE',
    إيجار: 'RENT',
    ايجار: 'RENT',
  } as Record<string, string>,

  paymentType: {
    كاش: 'CASH',
    تقسيط: 'INSTALLMENT',
  } as Record<string, string>,
};

// ─── Tool response schema (returned to LLM) ─────────────────────

export interface SearchResult {
  id: string;
  title: string;
  price: number | null;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  city: string | null;
  district: string | null;
  type: string;
  propertyKind: string | null;
  paymentMethod: string | null;
  finishingType: string | null;
}

// ─── Tools ──────────────────────────────────────────────────────

/**
 * Build a Prisma `where` clause from extracted search criteria.
 */
export function buildSearchWhere(
  criteria: {
    intent?: string;        // SALE | RENT
    propertyKind?: string;  // APARTMENT | VILLA | SHOP | ...
    city?: string;
    district?: string;
    minPrice?: number;
    maxPrice?: number;
    bedrooms?: number;
    paymentType?: string;   // CASH | INSTALLMENT
  },
): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = {
    propertyStatus: 'ACTIVE',
  };

  if (criteria.intent) {
    where.type = criteria.intent as 'SALE' | 'RENT';
  }

  if (criteria.propertyKind) {
    where.propertyKind = criteria.propertyKind as
      | 'APARTMENT'
      | 'VILLA'
      | 'SHOP'
      | 'OFFICE'
      | 'SUMMER_RESORT'
      | 'COMMERCIAL'
      | 'LAND_BUILDING';
  }

  if (criteria.city) {
    where.city = { contains: criteria.city };
  }

  if (criteria.district) {
    where.district = { contains: criteria.district };
  }

  if (criteria.minPrice || criteria.maxPrice) {
    const priceFilter: Prisma.DecimalNullableFilter = {};
    if (criteria.minPrice) priceFilter.gte = criteria.minPrice;
    if (criteria.maxPrice) priceFilter.lte = criteria.maxPrice;
    where.price = priceFilter;
  }

  if (criteria.bedrooms) {
    where.bedrooms = { gte: criteria.bedrooms };
  }

  if (criteria.paymentType) {
    where.paymentType = criteria.paymentType;
  }

  return where;
}

/**
 * Execute a property search and return formatted results.
 */
export async function searchProperties(
  prisma: PrismaService,
  criteria: Parameters<typeof buildSearchWhere>[0],
): Promise<SearchResult[]> {
  const where = buildSearchWhere(criteria);

  const properties = await prisma.property.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      price: true,
      areaM2: true,
      bedrooms: true,
      bathrooms: true,
      city: true,
      district: true,
      type: true,
      propertyKind: true,
      paymentMethod: true,
      finishingType: true,
    },
  });

  return properties.map((p) => ({
    id: p.id,
    title: p.title,
    price: p.price ? Number(p.price) : null,
    areaM2: p.areaM2 ? Number(p.areaM2) : null,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    city: p.city,
    district: p.district,
    type: p.type,
    propertyKind: p.propertyKind,
    paymentMethod: p.paymentMethod,
    finishingType: p.finishingType,
  }));
}

/**
 * Count total matching properties (for "N results found" messages).
 */
export async function countProperties(
  prisma: PrismaService,
  criteria: Parameters<typeof buildSearchWhere>[0],
): Promise<number> {
  return prisma.property.count({ where: buildSearchWhere(criteria) });
}

/**
 * Resolve slang terms to their DB enum values.
 */
export function resolveSlang(raw: Record<string, unknown>): Record<string, unknown> {
  const resolved = { ...raw };

  if (resolved['propertyKind'] && typeof resolved['propertyKind'] === 'string') {
    const mapped = SLANG_MAP.propertyKind[resolved['propertyKind']];
    if (mapped) resolved['propertyKind'] = mapped;
  }

  if (resolved['intent'] && typeof resolved['intent'] === 'string') {
    const mapped = SLANG_MAP.propertyType[resolved['intent']];
    if (mapped) resolved['intent'] = mapped;
  }

  if (resolved['paymentPreference'] && typeof resolved['paymentPreference'] === 'string') {
    const mapped = SLANG_MAP.paymentType[resolved['paymentPreference']];
    if (mapped) resolved['paymentType'] = mapped;
    delete resolved['paymentPreference'];
  }

  return resolved;
}
