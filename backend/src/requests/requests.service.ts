import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma, PropertyRequest, RequestStatus, RequestUrgency, MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingEngineService } from './matching-engine.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

const NOT_FOUND_AR = 'لم يُعثر على الطلب المحدد.';
const FORBIDDEN_AR = 'غير مسموح بالوصول إلى هذا الطلب.';
const RATE_LIMITED_AR = 'يرجى المحاولة بعد قليل.';
const RECOMPUTE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

interface ListQuery {
  status?: RequestStatus;
  urgency?: RequestUrgency;
  page?: number;
  limit?: number;
}

interface MatchQuery {
  minScore?: number;
  sort?: 'score' | 'date';
  page?: number;
  limit?: number;
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: MatchingEngineService,
  ) {}

  // ─── Create ─────────────────────────────────────────────────

  async create(userId: string, dto: CreateRequestDto) {
    const data: Prisma.PropertyRequestCreateInput = {
      user: { connect: { id: userId } },
      intent: dto.intent,
      propertyKind: dto.propertyKind,
      apartmentType: dto.apartmentType,
      minPrice: dto.minPrice ? new Prisma.Decimal(dto.minPrice) : null,
      maxPrice: dto.maxPrice ? new Prisma.Decimal(dto.maxPrice) : null,
      paymentPreference: dto.paymentPreference,
      rentRateType: dto.rentRateType,
      minBedrooms: dto.minBedrooms,
      maxBedrooms: dto.maxBedrooms,
      minBathrooms: dto.minBathrooms,
      maxBathrooms: dto.maxBathrooms,
      minAreaM2: dto.minAreaM2 ? new Prisma.Decimal(dto.minAreaM2) : null,
      maxAreaM2: dto.maxAreaM2 ? new Prisma.Decimal(dto.maxAreaM2) : null,
      centerLatitude: dto.centerLatitude ? new Prisma.Decimal(dto.centerLatitude) : null,
      centerLongitude: dto.centerLongitude ? new Prisma.Decimal(dto.centerLongitude) : null,
      searchRadiusKm: dto.searchRadiusKm ? new Prisma.Decimal(dto.searchRadiusKm) : null,
      isFurnished: dto.isFurnished,
      finishingType: dto.finishingType,
      floorLevel: dto.floorLevel,
      readiness: dto.readiness,
      ownershipType: dto.ownershipType,
      preferredAmenities: dto.preferredAmenities
        ? (dto.preferredAmenities as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      urgency: dto.urgency ?? RequestUrgency.MEDIUM,
      notes: dto.notes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    };

    const request = await this.prisma.propertyRequest.create({ data });

    // Attach locations (if any)
    if (dto.locationIds && dto.locationIds.length > 0) {
      await this.prisma.propertyRequestLocation.createMany({
        data: dto.locationIds.map((locationId) => ({
          requestId: request.id,
          locationId,
        })),
        skipDuplicates: true,
      });
    }

    // Sync first-batch matching for instant UX
    const matched = await this.engine.matchRequest(request.id, { firstBatchOnly: true });
    this.logger.log(`create(user=${userId}): request=${request.id} firstBatch=${matched}`);

    const matches = await this.prisma.propertyMatch.findMany({
      where: { requestId: request.id },
      orderBy: { score: 'desc' },
      take: 50,
      include: { property: true },
    });

    return { request, matches, matchedCount: matched };
  }

  // ─── Read ───────────────────────────────────────────────────

  async findAll(userId: string, query: ListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.PropertyRequestWhereInput = { userId };
    if (query.status) where.status = query.status;
    if (query.urgency) where.urgency = query.urgency;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.propertyRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { locations: { include: { location: true } } },
      }),
      this.prisma.propertyRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const request = await this.prisma.propertyRequest.findUnique({
      where: { id },
      include: { locations: { include: { location: true } } },
    });
    if (!request) throw new NotFoundException(NOT_FOUND_AR);
    if (request.userId !== userId) throw new ForbiddenException(FORBIDDEN_AR);
    return request;
  }

  // ─── Update ─────────────────────────────────────────────────

  async update(userId: string, id: string, dto: UpdateRequestDto) {
    await this.assertOwnership(userId, id);

    const data: Prisma.PropertyRequestUpdateInput = {
      intent: dto.intent,
      propertyKind: dto.propertyKind,
      apartmentType: dto.apartmentType,
      minPrice: dto.minPrice !== undefined ? (dto.minPrice ? new Prisma.Decimal(dto.minPrice) : null) : undefined,
      maxPrice: dto.maxPrice !== undefined ? (dto.maxPrice ? new Prisma.Decimal(dto.maxPrice) : null) : undefined,
      paymentPreference: dto.paymentPreference,
      rentRateType: dto.rentRateType,
      minBedrooms: dto.minBedrooms,
      maxBedrooms: dto.maxBedrooms,
      minBathrooms: dto.minBathrooms,
      maxBathrooms: dto.maxBathrooms,
      minAreaM2: dto.minAreaM2 !== undefined ? (dto.minAreaM2 ? new Prisma.Decimal(dto.minAreaM2) : null) : undefined,
      maxAreaM2: dto.maxAreaM2 !== undefined ? (dto.maxAreaM2 ? new Prisma.Decimal(dto.maxAreaM2) : null) : undefined,
      centerLatitude: dto.centerLatitude !== undefined ? (dto.centerLatitude ? new Prisma.Decimal(dto.centerLatitude) : null) : undefined,
      centerLongitude: dto.centerLongitude !== undefined ? (dto.centerLongitude ? new Prisma.Decimal(dto.centerLongitude) : null) : undefined,
      searchRadiusKm: dto.searchRadiusKm !== undefined ? (dto.searchRadiusKm ? new Prisma.Decimal(dto.searchRadiusKm) : null) : undefined,
      isFurnished: dto.isFurnished,
      finishingType: dto.finishingType,
      floorLevel: dto.floorLevel,
      readiness: dto.readiness,
      ownershipType: dto.ownershipType,
      preferredAmenities:
        dto.preferredAmenities !== undefined
          ? (dto.preferredAmenities as unknown as Prisma.InputJsonValue)
          : undefined,
      urgency: dto.urgency,
      notes: dto.notes,
      expiresAt: dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : undefined,
    };

    const request = await this.prisma.propertyRequest.update({ where: { id }, data });

    // Replace locations if provided
    if (dto.locationIds !== undefined) {
      await this.prisma.propertyRequestLocation.deleteMany({ where: { requestId: id } });
      if (dto.locationIds.length > 0) {
        await this.prisma.propertyRequestLocation.createMany({
          data: dto.locationIds.map((locationId) => ({ requestId: id, locationId })),
          skipDuplicates: true,
        });
      }
    }

    // Re-match first batch sync
    await this.engine.matchRequest(id, { firstBatchOnly: true });

    return request;
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id);
    return this.prisma.propertyRequest.update({
      where: { id },
      data: { status: RequestStatus.CLOSED },
    });
  }

  async pause(userId: string, id: string) {
    await this.assertOwnership(userId, id);
    return this.prisma.propertyRequest.update({
      where: { id },
      data: { status: RequestStatus.PAUSED },
    });
  }

  async resume(userId: string, id: string) {
    await this.assertOwnership(userId, id);
    return this.prisma.propertyRequest.update({
      where: { id },
      data: { status: RequestStatus.ACTIVE },
    });
  }

  // ─── Matches ────────────────────────────────────────────────

  async getMatches(userId: string, requestId: string, query: MatchQuery) {
    await this.assertOwnership(userId, requestId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where: Prisma.PropertyMatchWhereInput = {
      requestId,
      status: { notIn: [MatchStatus.DISMISSED, MatchStatus.CLOSED] },
      property: { propertyStatus: 'ACTIVE' },
    };
    if (query.minScore != null) where.score = { gte: query.minScore };

    const orderBy: Prisma.PropertyMatchOrderByWithRelationInput =
      query.sort === 'date' ? { lastComputedAt: 'desc' } : { score: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.propertyMatch.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { property: true },
      }),
      this.prisma.propertyMatch.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateMatch(userId: string, matchId: string, dto: UpdateMatchDto) {
    const match = await this.prisma.propertyMatch.findUnique({
      where: { id: matchId },
      include: { request: true },
    });
    if (!match) throw new NotFoundException(NOT_FOUND_AR);
    if (match.request.userId !== userId) throw new ForbiddenException(FORBIDDEN_AR);

    return this.prisma.propertyMatch.update({
      where: { id: matchId },
      data: { status: dto.status },
    });
  }

  async recompute(userId: string, requestId: string) {
    const request = await this.prisma.propertyRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(NOT_FOUND_AR);
    if (request.userId !== userId) throw new ForbiddenException(FORBIDDEN_AR);

    if (
      request.lastRecomputedAt &&
      Date.now() - request.lastRecomputedAt.getTime() < RECOMPUTE_COOLDOWN_MS
    ) {
      throw new HttpException(RATE_LIMITED_AR, HttpStatus.TOO_MANY_REQUESTS);
    }

    const count = await this.engine.matchRequest(requestId);
    await this.prisma.propertyRequest.update({
      where: { id: requestId },
      data: { lastRecomputedAt: new Date() },
    });

    return { matchedCount: count };
  }

  // ─── Seller reverse view ───────────────────────────────────

  async interestedRequestsForProperty(userId: string, propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException(NOT_FOUND_AR);
    if (property.userId !== userId) throw new ForbiddenException(FORBIDDEN_AR);

    const matches = await this.prisma.propertyMatch.findMany({
      where: {
        propertyId,
        status: { notIn: [MatchStatus.DISMISSED, MatchStatus.CLOSED] },
      },
      orderBy: { score: 'desc' },
      take: 50,
      include: { request: true },
    });

    // Anonymize + PII scrub notes before returning to seller
    return matches.map((m) => ({
      matchId: m.id,
      score: m.score,
      reasons: m.reasons,
      request: this.anonymizeRequest(m.request),
    }));
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async assertOwnership(userId: string, requestId: string): Promise<PropertyRequest> {
    const request = await this.prisma.propertyRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(NOT_FOUND_AR);
    if (request.userId !== userId) throw new ForbiddenException(FORBIDDEN_AR);
    return request;
  }

  private anonymizeRequest(r: PropertyRequest) {
    return {
      id: r.id,
      intent: r.intent,
      propertyKind: r.propertyKind,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      minBedrooms: r.minBedrooms,
      maxBedrooms: r.maxBedrooms,
      urgency: r.urgency,
      notes: this.scrubPii(r.notes),
      createdAt: r.createdAt,
    };
  }

  private scrubPii(text: string | null): string | null {
    if (!text) return text;
    return text
      .replace(/(\+?\d[\d\s\-()]{7,}\d)/g, '***')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***');
  }
}
