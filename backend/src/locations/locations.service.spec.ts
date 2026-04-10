import { Test, TestingModule } from '@nestjs/testing';
import { LocationsService, LocationItem } from './locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { LocationType } from '@prisma/client';

describe('LocationsService', () => {
  let service: LocationsService;
  let prisma: {
    location: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      location: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
  });

  // ─── getGovernorates ──────────────────────────────────────

  describe('getGovernorates', () => {
    it('should return sorted active governorates', async () => {
      const rows = [
        { id: 1, nameAr: 'القاهرة', nameEn: 'Cairo', type: 'GOVERNORATE', sortOrder: 1 },
        { id: 2, nameAr: 'الجيزة', nameEn: 'Giza', type: 'GOVERNORATE', sortOrder: 2 },
      ];
      prisma.location.findMany.mockResolvedValue(rows);

      const result = await service.getGovernorates();

      expect(result).toEqual([
        { id: 1, nameAr: 'القاهرة', nameEn: 'Cairo' },
        { id: 2, nameAr: 'الجيزة', nameEn: 'Giza' },
      ]);
      expect(prisma.location.findMany).toHaveBeenCalledWith({
        where: { type: LocationType.GOVERNORATE, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('should return cached data on second call', async () => {
      const rows = [
        { id: 1, nameAr: 'القاهرة', nameEn: 'Cairo', type: 'GOVERNORATE', sortOrder: 1 },
      ];
      prisma.location.findMany.mockResolvedValue(rows);

      const first = await service.getGovernorates();
      const second = await service.getGovernorates();

      expect(first).toEqual(second);
      // DB should only be called once due to caching
      expect(prisma.location.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getCities ────────────────────────────────────────────

  describe('getCities', () => {
    it('should return cities for a valid governorate', async () => {
      prisma.location.findFirst.mockResolvedValue({
        id: 1, nameAr: 'القاهرة', type: 'GOVERNORATE',
      });
      const cityRows = [
        { id: 8, nameAr: 'مدينة نصر', nameEn: 'Nasr City' },
        { id: 9, nameAr: 'المعادي', nameEn: 'Maadi' },
      ];
      prisma.location.findMany.mockResolvedValue(cityRows);

      const result = await service.getCities(1);

      expect(result).toEqual([
        { id: 8, nameAr: 'مدينة نصر', nameEn: 'Nasr City' },
        { id: 9, nameAr: 'المعادي', nameEn: 'Maadi' },
      ]);
    });

    it('should throw 404 for non-existent governorate', async () => {
      prisma.location.findFirst.mockResolvedValue(null);

      await expect(service.getCities(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getDistricts ─────────────────────────────────────────

  describe('getDistricts', () => {
    it('should return districts for a valid city', async () => {
      prisma.location.findFirst.mockResolvedValue({
        id: 8, nameAr: 'مدينة نصر', type: 'CITY',
      });
      const districtRows = [
        { id: 55, nameAr: 'الحي الأول', nameEn: '1st District' },
        { id: 56, nameAr: 'الحي السابع', nameEn: '7th District' },
      ];
      prisma.location.findMany.mockResolvedValue(districtRows);

      const result = await service.getDistricts(8);

      expect(result).toEqual([
        { id: 55, nameAr: 'الحي الأول', nameEn: '1st District' },
        { id: 56, nameAr: 'الحي السابع', nameEn: '7th District' },
      ]);
    });

    it('should throw 404 for non-existent city', async () => {
      prisma.location.findFirst.mockResolvedValue(null);

      await expect(service.getDistricts(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── validateLocationId ───────────────────────────────────

  describe('validateLocationId', () => {
    it('should return location when valid', async () => {
      prisma.location.findFirst.mockResolvedValue({
        id: 1, nameAr: 'القاهرة', type: 'GOVERNORATE', isActive: true,
      });

      const result = await service.validateLocationId(1, LocationType.GOVERNORATE);

      expect(result).toEqual({ id: 1, nameAr: 'القاهرة' });
    });

    it('should validate parent constraint', async () => {
      prisma.location.findFirst.mockResolvedValue({
        id: 8, nameAr: 'مدينة نصر', type: 'CITY', parentId: 1,
      });

      const result = await service.validateLocationId(8, LocationType.CITY, 1);

      expect(result).toEqual({ id: 8, nameAr: 'مدينة نصر' });
      expect(prisma.location.findFirst).toHaveBeenCalledWith({
        where: {
          id: 8,
          type: LocationType.CITY,
          isActive: true,
          parentId: 1,
        },
      });
    });

    it('should throw 404 for non-existent location', async () => {
      prisma.location.findFirst.mockResolvedValue(null);

      await expect(
        service.validateLocationId(999, LocationType.GOVERNORATE),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
