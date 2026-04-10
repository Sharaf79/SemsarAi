import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationType } from '@prisma/client';

/**
 * Cache entry: data + expiry timestamp.
 */
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

/**
 * DTO returned for each location item.
 */
export interface LocationItem {
  id: number;
  nameAr: string;
  nameEn: string | null;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly cache = new Map<string, CacheEntry<LocationItem[]>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * L09: Get all active governorates, sorted by sort_order.
   */
  async getGovernorates(): Promise<LocationItem[]> {
    const cacheKey = 'governorates';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.location.findMany({
      where: { type: LocationType.GOVERNORATE, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const items = rows.map(this.toLocationItem);
    this.setCache(cacheKey, items);
    return items;
  }

  /**
   * L10: Get all active cities under a governorate.
   * Validates that the governorate exists.
   */
  async getCities(governorateId: number): Promise<LocationItem[]> {
    const cacheKey = `cities:${governorateId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Verify governorate exists
    const governorate = await this.prisma.location.findFirst({
      where: { id: governorateId, type: LocationType.GOVERNORATE },
    });
    if (!governorate) {
      throw new NotFoundException(
        `Governorate with id ${governorateId} not found`,
      );
    }

    const rows = await this.prisma.location.findMany({
      where: {
        type: LocationType.CITY,
        parentId: governorateId,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const items = rows.map(this.toLocationItem);
    this.setCache(cacheKey, items);
    return items;
  }

  /**
   * L11: Get all active districts under a city.
   * Validates that the city exists.
   */
  async getDistricts(cityId: number): Promise<LocationItem[]> {
    const cacheKey = `districts:${cityId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Verify city exists
    const city = await this.prisma.location.findFirst({
      where: { id: cityId, type: LocationType.CITY },
    });
    if (!city) {
      throw new NotFoundException(`City with id ${cityId} not found`);
    }

    const rows = await this.prisma.location.findMany({
      where: {
        type: LocationType.DISTRICT,
        parentId: cityId,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const items = rows.map(this.toLocationItem);
    this.setCache(cacheKey, items);
    return items;
  }

  /**
   * Validate a location ID exists with expected type, parent, and is active.
   * Used by onboarding validators.
   */
  async validateLocationId(
    id: number,
    expectedType: LocationType,
    expectedParentId?: number,
  ): Promise<{ id: number; nameAr: string }> {
    const location = await this.prisma.location.findFirst({
      where: {
        id,
        type: expectedType,
        isActive: true,
        ...(expectedParentId !== undefined
          ? { parentId: expectedParentId }
          : {}),
      },
    });

    if (!location) {
      const parentMsg =
        expectedParentId !== undefined
          ? ` under parent ${expectedParentId}`
          : '';
      throw new NotFoundException(
        `Location id ${id} not found as ${expectedType}${parentMsg}`,
      );
    }

    return { id: location.id, nameAr: location.nameAr };
  }

  // ─── Cache Helpers ──────────────────────────────────────────

  private getFromCache(key: string): LocationItem[] | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) {
      return entry.data;
    }
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache(key: string, data: LocationItem[]): void {
    this.cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
  }

  private toLocationItem(row: {
    id: number;
    nameAr: string;
    nameEn: string | null;
  }): LocationItem {
    return { id: row.id, nameAr: row.nameAr, nameEn: row.nameEn };
  }
}
