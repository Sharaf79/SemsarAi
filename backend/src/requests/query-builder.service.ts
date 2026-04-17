import { Injectable } from '@nestjs/common';
import { Prisma, PropertyRequest } from '@prisma/client';
import {
  AREA_TOLERANCE,
  CANDIDATE_CAP,
  GovernorateCityDistrict,
  PRICE_TOLERANCE,
} from './types/request.types';

interface BuildOpts {
  /** Limit override (default = CANDIDATE_CAP). */
  take?: number;
}

/**
 * QueryBuilderService — turns a PropertyRequest + resolved location names
 * into a Prisma `findMany` query against `properties`. Runs Phase 1 hard
 * filters only.
 */
@Injectable()
export class QueryBuilderService {
  buildCandidateQuery(
    request: PropertyRequest,
    locations: GovernorateCityDistrict,
    opts: BuildOpts = {},
  ): Prisma.PropertyFindManyArgs {
    const where: Prisma.PropertyWhereInput = {
      propertyStatus: 'ACTIVE',
      type: request.intent,
      userId: { not: request.userId },
    };

    if (request.propertyKind) {
      where.propertyKind = request.propertyKind;
    }

    // Price tolerance (±15%)
    if (request.minPrice || request.maxPrice) {
      const priceCond: Prisma.DecimalFilter = {};
      if (request.minPrice) {
        const min = this.toNum(request.minPrice) * (1 - PRICE_TOLERANCE);
        priceCond.gte = new Prisma.Decimal(min);
      }
      if (request.maxPrice) {
        const max = this.toNum(request.maxPrice) * (1 + PRICE_TOLERANCE);
        priceCond.lte = new Prisma.Decimal(max);
      }
      where.price = priceCond;
    }

    // Bedrooms ±1
    if (request.minBedrooms != null || request.maxBedrooms != null) {
      const min = (request.minBedrooms ?? 0) - 1;
      const max = (request.maxBedrooms ?? 99) + 1;
      where.bedrooms = { gte: Math.max(0, min), lte: max };
    }

    // Area ±15%
    if (request.minAreaM2 || request.maxAreaM2) {
      const areaCond: Prisma.DecimalFilter = {};
      if (request.minAreaM2) {
        areaCond.gte = new Prisma.Decimal(this.toNum(request.minAreaM2) * (1 - AREA_TOLERANCE));
      }
      if (request.maxAreaM2) {
        areaCond.lte = new Prisma.Decimal(this.toNum(request.maxAreaM2) * (1 + AREA_TOLERANCE));
      }
      where.areaM2 = areaCond;
    }

    if (request.isFurnished != null) {
      where.isFurnished = request.isFurnished;
    }

    // Location OR clause: any matching name OR within bounding box
    const orClauses: Prisma.PropertyWhereInput[] = [];
    if (locations.governorates.length) {
      orClauses.push({ governorate: { in: locations.governorates } });
    }
    if (locations.cities.length) {
      orClauses.push({ city: { in: locations.cities } });
    }
    if (locations.districts.length) {
      orClauses.push({ district: { in: locations.districts } });
    }
    if (request.centerLatitude && request.centerLongitude && request.searchRadiusKm) {
      const bbox = this.buildBbox(
        this.toNum(request.centerLatitude),
        this.toNum(request.centerLongitude),
        this.toNum(request.searchRadiusKm),
      );
      orClauses.push({
        latitude: { gte: new Prisma.Decimal(bbox.minLat), lte: new Prisma.Decimal(bbox.maxLat) },
        longitude: { gte: new Prisma.Decimal(bbox.minLng), lte: new Prisma.Decimal(bbox.maxLng) },
      });
    }
    if (orClauses.length > 0) {
      where.OR = orClauses;
    }

    return {
      where,
      take: opts.take ?? CANDIDATE_CAP,
    };
  }

  /** Flat-earth bounding box approximation (1° lat ≈ 111km). */
  buildBbox(lat: number, lng: number, radiusKm: number) {
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLng: lng - lngDelta,
      maxLng: lng + lngDelta,
    };
  }

  private toNum(v: Prisma.Decimal | number | string | null): number {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v);
    return parseFloat(v.toString());
  }
}
