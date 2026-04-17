import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Property, PropertyRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryBuilderService } from './query-builder.service';
import { ScorerService } from './scorer.service';
import {
  FIRST_BATCH_SIZE,
  GovernorateCityDistrict,
  MIN_MATCH_SCORE,
} from './types/request.types';

/**
 * MatchingEngineService — runs Phase 1 (candidate query) + Phase 2 (scoring)
 * and persists rows with score ≥ 40 into `property_matches`. No BullMQ in
 * Phase A; everything runs inline.
 */
@Injectable()
export class MatchingEngineService {
  private readonly logger = new Logger(MatchingEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBuilder: QueryBuilderService,
    private readonly scorer: ScorerService,
  ) {}

  /** Match a single request against the catalog. Returns persisted count. */
  async matchRequest(requestId: string, opts: { firstBatchOnly?: boolean } = {}): Promise<number> {
    const request = await this.prisma.propertyRequest.findUnique({
      where: { id: requestId },
      include: {
        locations: {
          include: { location: { include: { parent: { include: { parent: true } } } } },
        },
      },
    });
    if (!request) return 0;

    const locationNames = this.resolveLocationNames(request.locations);

    const query = this.queryBuilder.buildCandidateQuery(request, locationNames, {
      take: opts.firstBatchOnly ? FIRST_BATCH_SIZE : undefined,
    });
    const candidates = (await this.prisma.property.findMany(query)) as Property[];

    const rows = candidates
      .map((p) => ({
        property: p,
        scored: this.scorer.score(p, { ...request, locationNames }),
      }))
      .filter((r) => r.scored.score >= MIN_MATCH_SCORE);

    if (rows.length === 0) {
      await this.prisma.propertyRequest.update({
        where: { id: requestId },
        data: { lastMatchedAt: new Date() },
      });
      return 0;
    }

    // Upsert each row (createMany lacks upsert on MySQL composite unique).
    await this.prisma.$transaction(
      rows.map(({ property, scored }) =>
        this.prisma.propertyMatch.upsert({
          where: {
            requestId_propertyId: { requestId, propertyId: property.id },
          },
          create: {
            requestId,
            propertyId: property.id,
            score: scored.score,
            priceScore: scored.priceScore,
            locationScore: scored.locationScore,
            featureScore: scored.featureScore,
            distanceKm: scored.distanceKm != null ? new Prisma.Decimal(scored.distanceKm) : null,
            reasons: scored.reasons as unknown as Prisma.InputJsonValue,
          },
          update: {
            score: scored.score,
            priceScore: scored.priceScore,
            locationScore: scored.locationScore,
            featureScore: scored.featureScore,
            distanceKm: scored.distanceKm != null ? new Prisma.Decimal(scored.distanceKm) : null,
            reasons: scored.reasons as unknown as Prisma.InputJsonValue,
            lastComputedAt: new Date(),
          },
        }),
      ),
    );

    await this.prisma.propertyRequest.update({
      where: { id: requestId },
      data: { lastMatchedAt: new Date() },
    });

    this.logger.log(`matchRequest(${requestId}): persisted ${rows.length}/${candidates.length}`);
    return rows.length;
  }

  /**
   * Reverse match — find all ACTIVE requests a newly-activated property
   * could satisfy, and upsert each match row.
   */
  async matchProperty(propertyId: string): Promise<number> {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || property.propertyStatus !== 'ACTIVE') return 0;

    const requests = await this.prisma.propertyRequest.findMany({
      where: {
        status: 'ACTIVE',
        intent: property.type,
        userId: { not: property.userId },
        OR: [{ propertyKind: null }, { propertyKind: property.propertyKind }],
      },
      include: {
        locations: {
          include: { location: { include: { parent: { include: { parent: true } } } } },
        },
      },
      take: 1000,
    });

    let persisted = 0;
    for (const req of requests) {
      const locationNames = this.resolveLocationNames(req.locations);
      const scored = this.scorer.score(property, { ...req, locationNames });
      if (scored.score < MIN_MATCH_SCORE) continue;

      await this.prisma.propertyMatch.upsert({
        where: { requestId_propertyId: { requestId: req.id, propertyId } },
        create: {
          requestId: req.id,
          propertyId,
          score: scored.score,
          priceScore: scored.priceScore,
          locationScore: scored.locationScore,
          featureScore: scored.featureScore,
          distanceKm: scored.distanceKm != null ? new Prisma.Decimal(scored.distanceKm) : null,
          reasons: scored.reasons as unknown as Prisma.InputJsonValue,
        },
        update: {
          score: scored.score,
          priceScore: scored.priceScore,
          locationScore: scored.locationScore,
          featureScore: scored.featureScore,
          distanceKm: scored.distanceKm != null ? new Prisma.Decimal(scored.distanceKm) : null,
          reasons: scored.reasons as unknown as Prisma.InputJsonValue,
          lastComputedAt: new Date(),
          status: 'NEW',
        },
      });
      persisted++;
    }

    this.logger.log(`matchProperty(${propertyId}): persisted ${persisted}/${requests.length}`);
    return persisted;
  }

  /** Soft-close all matches for a property (sold/rented/deactivated). */
  async closeMatchesForProperty(propertyId: string): Promise<number> {
    const result = await this.prisma.propertyMatch.updateMany({
      where: { propertyId },
      data: { status: 'CLOSED' },
    });
    this.logger.log(`closeMatchesForProperty(${propertyId}): closed ${result.count}`);
    return result.count;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private resolveLocationNames(
    rows: Array<{
      location: {
        nameAr: string;
        type: 'GOVERNORATE' | 'CITY' | 'DISTRICT';
        parent?: { nameAr: string; type: 'GOVERNORATE' | 'CITY' | 'DISTRICT'; parent?: { nameAr: string; type: 'GOVERNORATE' | 'CITY' | 'DISTRICT' } | null } | null;
      };
    }>,
  ): GovernorateCityDistrict {
    const governorates = new Set<string>();
    const cities = new Set<string>();
    const districts = new Set<string>();

    for (const { location } of rows) {
      const push = (
        nameAr: string,
        type: 'GOVERNORATE' | 'CITY' | 'DISTRICT',
      ) => {
        if (type === 'GOVERNORATE') governorates.add(nameAr);
        else if (type === 'CITY') cities.add(nameAr);
        else if (type === 'DISTRICT') districts.add(nameAr);
      };
      push(location.nameAr, location.type);
      if (location.parent) push(location.parent.nameAr, location.parent.type);
      if (location.parent?.parent) push(location.parent.parent.nameAr, location.parent.parent.type);
    }

    return {
      governorates: [...governorates],
      cities: [...cities],
      districts: [...districts],
    };
  }
}
