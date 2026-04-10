import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Property,
  Negotiation,
  RecommendationStatus,
  PropertyType,
  PropertyKind,
} from '@prisma/client';

/** Weights for the matching score (total = 100). */
const WEIGHTS = {
  TYPE: 25, // SALE / RENT match
  KIND: 25, // APARTMENT / VILLA / SHOP / OFFICE
  GOVERNORATE: 15,
  CITY: 10,
  DISTRICT: 10,
  PRICE: 15,
};

interface BuyerProfile {
  userId: string;
  /** Property types the buyer has negotiated on */
  types: Set<PropertyType>;
  /** Property kinds the buyer has negotiated on */
  kinds: Set<PropertyKind>;
  /** Governorates the buyer has shown interest in */
  governorates: Set<string>;
  /** Cities the buyer has shown interest in */
  cities: Set<string>;
  /** Districts the buyer has shown interest in */
  districts: Set<string>;
  /** The maximum price the buyer has ever set as maxPrice across negotiations */
  maxBudget: number;
  /** The minimum minPrice across negotiations (the cheapest range they'd accept) */
  minBudget: number;
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ─────────────────────────────────────────────

  /**
   * When a new property is listed, find all potential buyers
   * and create Recommendation rows.  Runs asynchronously —
   * should not block the seller flow.
   */
  async matchBuyersForProperty(property: Property): Promise<number> {
    const profiles = await this.buildBuyerProfiles(property.userId);

    if (profiles.length === 0) {
      this.logger.debug('No buyer profiles found — skipping matching.');
      return 0;
    }

    const scored = profiles
      .map((bp) => ({
        buyerId: bp.userId,
        score: this.computeScore(property, bp),
      }))
      .filter((s) => s.score >= 25); // only recommend if at least 25 / 100

    if (scored.length === 0) {
      this.logger.debug(`No buyers matched property ${property.id}`);
      return 0;
    }

    // Upsert recommendations (unique constraint on propertyId+buyerId)
    let created = 0;
    for (const { buyerId, score } of scored) {
      try {
        await this.prisma.recommendation.upsert({
          where: {
            propertyId_buyerId: {
              propertyId: property.id,
              buyerId,
            },
          },
          create: {
            propertyId: property.id,
            buyerId,
            score,
          },
          update: { score },
        });
        created++;
      } catch (err) {
        this.logger.warn(
          `Failed to upsert recommendation for buyer ${buyerId}: ${err}`,
        );
      }
    }

    this.logger.log(
      `Created ${created} recommendations for property ${property.id}`,
    );
    return created;
  }

  /**
   * Return paginated recommendations for a buyer, newest first.
   * Optionally filter by status.
   */
  async getRecommendations(
    buyerId: string,
    status?: RecommendationStatus,
    page = 1,
    limit = 20,
  ) {
    const where: Record<string, unknown> = { buyerId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.recommendation.findMany({
        where,
        include: {
          property: {
            include: { media: true },
          },
        },
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.recommendation.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** Mark a single recommendation as SEEN. */
  async markSeen(recommendationId: string, buyerId: string) {
    const rec = await this.prisma.recommendation.findUnique({
      where: { id: recommendationId },
    });
    if (!rec || rec.buyerId !== buyerId) {
      throw new NotFoundException('Recommendation not found');
    }
    if (rec.status !== RecommendationStatus.UNSEEN) return rec;

    return this.prisma.recommendation.update({
      where: { id: recommendationId },
      data: { status: RecommendationStatus.SEEN },
    });
  }

  /** Mark a recommendation as DISMISSED. */
  async dismiss(recommendationId: string, buyerId: string) {
    const rec = await this.prisma.recommendation.findUnique({
      where: { id: recommendationId },
    });
    if (!rec || rec.buyerId !== buyerId) {
      throw new NotFoundException('Recommendation not found');
    }

    return this.prisma.recommendation.update({
      where: { id: recommendationId },
      data: { status: RecommendationStatus.DISMISSED },
    });
  }

  /** Count unseen recommendations for a buyer. */
  async getUnseenCount(buyerId: string): Promise<number> {
    return this.prisma.recommendation.count({
      where: { buyerId, status: RecommendationStatus.UNSEEN },
    });
  }

  /**
   * Mark recommendation as NEGOTIATED when the buyer starts
   * a negotiation on the recommended property.
   */
  async markNegotiated(propertyId: string, buyerId: string) {
    await this.prisma.recommendation
      .updateMany({
        where: { propertyId, buyerId },
        data: { status: RecommendationStatus.NEGOTIATED },
      })
      .catch(() => {
        /* no recommendation row — that's fine */
      });
  }

  // ─── Matching Logic (Private) ───────────────────────────────

  /**
   * Build buyer profiles from negotiation history.
   * A "buyer" is any user who has been on the buyer side of ≥ 1 negotiation.
   * Excludes the seller (property owner) themselves.
   */
  private async buildBuyerProfiles(
    excludeSellerId: string,
  ): Promise<BuyerProfile[]> {
    const negotiations = await this.prisma.negotiation.findMany({
      where: {
        buyerId: { not: excludeSellerId },
      },
      include: {
        property: {
          select: {
            type: true,
            propertyKind: true,
            governorate: true,
            city: true,
            district: true,
          },
        },
      },
    });

    // Group by buyerId
    const map = new Map<string, BuyerProfile>();

    for (const neg of negotiations) {
      let profile = map.get(neg.buyerId);
      if (!profile) {
        profile = {
          userId: neg.buyerId,
          types: new Set(),
          kinds: new Set(),
          governorates: new Set(),
          cities: new Set(),
          districts: new Set(),
          maxBudget: 0,
          minBudget: Infinity,
        };
        map.set(neg.buyerId, profile);
      }

      // Accumulate preferences from the properties they negotiated on
      if (neg.property.type) profile.types.add(neg.property.type);
      if (neg.property.propertyKind) profile.kinds.add(neg.property.propertyKind);
      if (neg.property.governorate) profile.governorates.add(neg.property.governorate);
      if (neg.property.city) profile.cities.add(neg.property.city);
      if (neg.property.district) profile.districts.add(neg.property.district);

      // Budget range from negotiation min/max prices
      const maxP = neg.maxPrice ? Number(neg.maxPrice) : 0;
      const minP = neg.minPrice ? Number(neg.minPrice) : 0;
      if (maxP > profile.maxBudget) profile.maxBudget = maxP;
      if (minP > 0 && minP < profile.minBudget) profile.minBudget = minP;
    }

    // Clean up Infinity for buyers with no minPrice data
    for (const p of map.values()) {
      if (p.minBudget === Infinity) p.minBudget = 0;
    }

    return Array.from(map.values());
  }

  /**
   * Score a property against a buyer profile (0 – 100).
   */
  private computeScore(property: Property, buyer: BuyerProfile): number {
    let score = 0;

    // Type match (SALE / RENT)
    if (buyer.types.has(property.type)) {
      score += WEIGHTS.TYPE;
    }

    // Kind match (APARTMENT / VILLA / etc.)
    if (property.propertyKind && buyer.kinds.has(property.propertyKind)) {
      score += WEIGHTS.KIND;
    }

    // Location match (hierarchical)
    if (property.governorate && buyer.governorates.has(property.governorate)) {
      score += WEIGHTS.GOVERNORATE;
    }
    if (property.city && buyer.cities.has(property.city)) {
      score += WEIGHTS.CITY;
    }
    if (property.district && buyer.districts.has(property.district)) {
      score += WEIGHTS.DISTRICT;
    }

    // Price match — property price should be within buyer's budget
    const price = Number(property.price);
    if (buyer.maxBudget > 0 && price <= buyer.maxBudget) {
      // Within budget — full points
      score += WEIGHTS.PRICE;
    } else if (buyer.maxBudget > 0 && price <= buyer.maxBudget * 1.1) {
      // Up to 10% over budget — half points
      score += Math.round(WEIGHTS.PRICE / 2);
    }

    return score;
  }
}
