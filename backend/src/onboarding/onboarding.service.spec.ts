import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { OnboardingStep } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  STEP_ORDER,
  getNextStep,
  ONBOARDING_QUESTIONS,
} from './constants/questions';

describe('OnboardingService — Location Flow', () => {
  let service: OnboardingService;
  let prisma: Record<string, any>;
  let locationsService: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      propertyDraft: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      property: { create: jest.fn() },
      propertyMedia: { create: jest.fn(), updateMany: jest.fn() },
      // Default: a COMPLETED listing credit exists so finalSubmit's payment guard passes.
      // Tests that need to assert the no-credit path can override.
      listingCredit: {
        findFirst: jest.fn().mockResolvedValue({ id: 'credit-1' }),
        create: jest.fn().mockResolvedValue({ id: 'credit-new' }),
        update: jest.fn().mockResolvedValue({ id: 'credit-1' }),
      },
      // Used by validators that count rows (e.g. district lookups)
      location: { count: jest.fn().mockResolvedValue(1) },
      user: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    locationsService = {
      getGovernorates: jest.fn(),
      getCities: jest.fn(),
      getDistricts: jest.fn(),
      validateLocationId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: LocationsService, useValue: locationsService },
        {
          provide: RecommendationsService,
          useValue: { matchBuyersForProperty: jest.fn().mockResolvedValue(0) },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  // ─── L27: Step Flow Tests ───────────────────────────────────

  describe('STEP_ORDER', () => {
    it('should contain GOVERNORATE, CITY, DISTRICT instead of LOCATION', () => {
      expect(STEP_ORDER).toContain(OnboardingStep.GOVERNORATE);
      expect(STEP_ORDER).toContain(OnboardingStep.CITY);
      expect(STEP_ORDER).toContain(OnboardingStep.DISTRICT);
      // LOCATION should not exist in the enum at all now
      expect(STEP_ORDER).not.toContain('LOCATION');
    });

    it('should have correct order: GOVERNORATE → CITY → DISTRICT → PROPERTY_TYPE → DETAILS', () => {
      const govIdx = STEP_ORDER.indexOf(OnboardingStep.GOVERNORATE);
      const cityIdx = STEP_ORDER.indexOf(OnboardingStep.CITY);
      const distIdx = STEP_ORDER.indexOf(OnboardingStep.DISTRICT);
      const ptIdx = STEP_ORDER.indexOf(OnboardingStep.PROPERTY_TYPE);
      const detIdx = STEP_ORDER.indexOf(OnboardingStep.DETAILS);

      expect(govIdx).toBe(0);
      expect(cityIdx).toBe(govIdx + 1);
      expect(distIdx).toBe(cityIdx + 1);
      expect(ptIdx).toBe(distIdx + 1);
      expect(detIdx).toBe(ptIdx + 1);
    });

    it('should not include LISTING_TYPE in the active sequence', () => {
      // LISTING_TYPE was retired from STEP_ORDER — it's now derived from
      // property kind selection during DETAILS / collected ad-hoc instead.
      expect(STEP_ORDER).not.toContain(OnboardingStep.LISTING_TYPE);
    });
  });

  describe('getNextStep', () => {
    it('should advance GOVERNORATE → CITY', () => {
      expect(getNextStep(OnboardingStep.GOVERNORATE)).toBe(
        OnboardingStep.CITY,
      );
    });

    it('should advance CITY → DISTRICT', () => {
      expect(getNextStep(OnboardingStep.CITY)).toBe(
        OnboardingStep.DISTRICT,
      );
    });

    it('should advance DISTRICT → PROPERTY_TYPE', () => {
      expect(getNextStep(OnboardingStep.DISTRICT)).toBe(
        OnboardingStep.PROPERTY_TYPE,
      );
    });

    it('should advance PROPERTY_TYPE → DETAILS for APARTMENT', () => {
      expect(
        getNextStep(OnboardingStep.PROPERTY_TYPE, { property_type: 'APARTMENT' }),
      ).toBe(OnboardingStep.DETAILS);
    });

    it('should skip DETAILS → PRICE for SHOP (from PROPERTY_TYPE)', () => {
      expect(
        getNextStep(OnboardingStep.PROPERTY_TYPE, { property_type: 'SHOP' }),
      ).toBe(OnboardingStep.PRICE);
    });

    it('should skip DETAILS → PRICE for OFFICE / COMMERCIAL / LAND_BUILDING too', () => {
      for (const kind of ['OFFICE', 'COMMERCIAL', 'LAND_BUILDING']) {
        expect(
          getNextStep(OnboardingStep.PROPERTY_TYPE, { property_type: kind }),
        ).toBe(OnboardingStep.PRICE);
      }
    });
  });

  describe('ONBOARDING_QUESTIONS — location steps', () => {
    it('should define GOVERNORATE with optionsSource "governorates"', () => {
      const q = ONBOARDING_QUESTIONS[OnboardingStep.GOVERNORATE];
      expect(q.question).toContain('محافظة');
      expect(q.inputType).toBe('multi-choice');
      expect(q.optionsSource).toBe('governorates');
    });

    it('should define CITY with template {governorate_name}', () => {
      const q = ONBOARDING_QUESTIONS[OnboardingStep.CITY];
      expect(q.question).toContain('{governorate_name}');
      expect(q.optionsSource).toBe('cities');
    });

    it('should define DISTRICT with template {city_name}', () => {
      const q = ONBOARDING_QUESTIONS[OnboardingStep.DISTRICT];
      expect(q.question).toContain('{city_name}');
      expect(q.optionsSource).toBe('districts');
    });
  });

  // ─── L26: Location Validator Tests ──────────────────────────

  describe('submitAnswer — GOVERNORATE', () => {
    const baseDraft = {
      id: 'draft-1',
      userId: 'user-1',
      currentStep: OnboardingStep.GOVERNORATE,
      data: { property_type: 'APARTMENT', listing_type: 'SALE' },
      isCompleted: false,
    };

    beforeEach(() => {
      prisma.propertyDraft.findFirst.mockResolvedValue(baseDraft);
      prisma.propertyDraft.update.mockImplementation(({ data }: any) => ({
        ...baseDraft,
        ...data,
      }));
    });

    it('should accept valid governorate { id } — label fetched from DB', async () => {
      locationsService.validateLocationId.mockResolvedValue({
        id: 1,
        nameAr: 'القاهرة',
      });

      const result = await service.submitAnswer(
        'user-1',
        OnboardingStep.GOVERNORATE,
        { id: 1, label: 'ignored-client-label' },
      );

      expect(locationsService.validateLocationId).toHaveBeenCalledWith(
        1,
        'GOVERNORATE',
      );
      expect(prisma.propertyDraft.update).toHaveBeenCalled();
      const updateCall = prisma.propertyDraft.update.mock.calls[0][0];
      expect(updateCall.data.data).toMatchObject({
        governorate_id: 1,
        governorate_name: 'القاهرة', // DB name, not client label
      });
      expect(updateCall.data.currentStep).toBe(OnboardingStep.CITY);
    });

    it('should reject non-object answer', async () => {
      await expect(
        service.submitAnswer('user-1', OnboardingStep.GOVERNORATE, 'القاهرة'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject missing id', async () => {
      await expect(
        service.submitAnswer('user-1', OnboardingStep.GOVERNORATE, { label: 'القاهرة' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when location not found in DB', async () => {
      locationsService.validateLocationId.mockRejectedValue(
        new NotFoundException('Location id 999 not found'),
      );

      await expect(
        service.submitAnswer('user-1', OnboardingStep.GOVERNORATE, { id: 999 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitAnswer — CITY', () => {
    const baseDraft = {
      id: 'draft-1',
      userId: 'user-1',
      currentStep: OnboardingStep.CITY,
      data: {
        property_type: 'APARTMENT',
        listing_type: 'SALE',
        governorate_id: 1,
        governorate_name: 'القاهرة',
      },
      isCompleted: false,
    };

    beforeEach(() => {
      prisma.propertyDraft.findFirst.mockResolvedValue(baseDraft);
      prisma.propertyDraft.update.mockImplementation(({ data }: any) => ({
        ...baseDraft,
        ...data,
      }));
    });

    it('should accept valid city with correct parent — label from DB', async () => {
      locationsService.validateLocationId.mockResolvedValue({
        id: 8,
        nameAr: 'مدينة نصر',
      });

      const result = await service.submitAnswer(
        'user-1',
        OnboardingStep.CITY,
        { id: 8, label: 'ignored' },
      );

      expect(locationsService.validateLocationId).toHaveBeenCalledWith(
        8,
        'CITY',
        1, // governorate_id from draft data
      );
      const updateCall = prisma.propertyDraft.update.mock.calls[0][0];
      expect(updateCall.data.data).toMatchObject({
        city_id: 8,
        city_name: 'مدينة نصر', // DB name
      });
      expect(updateCall.data.currentStep).toBe(OnboardingStep.DISTRICT);
    });

    it('should reject if governorate not yet selected', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        ...baseDraft,
        data: { property_type: 'APARTMENT', listing_type: 'SALE' }, // no governorate_id
      });

      await expect(
        service.submitAnswer('user-1', OnboardingStep.CITY, { id: 8, label: 'مدينة نصر' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitAnswer — DISTRICT', () => {
    const baseDraft = {
      id: 'draft-1',
      userId: 'user-1',
      currentStep: OnboardingStep.DISTRICT,
      data: {
        property_type: 'APARTMENT',
        listing_type: 'SALE',
        governorate_id: 1,
        governorate_name: 'القاهرة',
        city_id: 8,
        city_name: 'مدينة نصر',
      },
      isCompleted: false,
    };

    beforeEach(() => {
      prisma.propertyDraft.findFirst.mockResolvedValue(baseDraft);
      prisma.propertyDraft.update.mockImplementation(({ data }: any) => ({
        ...baseDraft,
        ...data,
      }));
      locationsService.validateLocationId.mockResolvedValue({
        id: 55,
        nameAr: 'الحي الأول',
      });
    });

    it('should accept valid district with correct parent — label from DB', async () => {
      await service.submitAnswer(
        'user-1',
        OnboardingStep.DISTRICT,
        { id: 55, label: 'ignored' },
      );

      expect(locationsService.validateLocationId).toHaveBeenCalledWith(
        55,
        'DISTRICT',
        8, // city_id from draft data
      );
      const updateCall = prisma.propertyDraft.update.mock.calls[0][0];
      expect(updateCall.data.data).toMatchObject({
        district_id: 55,
        district_name: 'الحي الأول', // DB name
      });
      // DISTRICT now advances to PROPERTY_TYPE (which then routes to DETAILS or PRICE
      // based on the kind selected). Property kind is collected AFTER location.
      expect(updateCall.data.currentStep).toBe(OnboardingStep.PROPERTY_TYPE);
    });

    it('should still advance to PROPERTY_TYPE even for pre-seeded SHOP property', async () => {
      // The skip-DETAILS rule fires at PROPERTY_TYPE→next (not at DISTRICT→next),
      // so SHOP still has to traverse PROPERTY_TYPE first.
      prisma.propertyDraft.findFirst.mockResolvedValue({
        ...baseDraft,
        data: { ...baseDraft.data, property_type: 'SHOP' },
      });
      locationsService.validateLocationId.mockResolvedValue({
        id: 55,
        nameAr: 'الحي الأول',
      });

      await service.submitAnswer(
        'user-1',
        OnboardingStep.DISTRICT,
        { id: 55, label: 'الحي الأول' },
      );

      const updateCall = prisma.propertyDraft.update.mock.calls[0][0];
      expect(updateCall.data.currentStep).toBe(OnboardingStep.PROPERTY_TYPE);
    });

    it('should reject if city not yet selected', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        ...baseDraft,
        data: { property_type: 'APARTMENT', governorate_id: 1 }, // no city_id
      });

      await expect(
        service.submitAnswer('user-1', OnboardingStep.DISTRICT, { id: 55, label: 'الحي الأول' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getCurrentQuestion — dynamic options ───────────────────

  describe('getCurrentQuestion — location steps', () => {
    it('should load governorates dynamically', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        userId: 'user-1',
        currentStep: OnboardingStep.GOVERNORATE,
        data: {},
        isCompleted: false,
      });
      locationsService.getGovernorates.mockResolvedValue([
        { id: 1, nameAr: 'القاهرة', nameEn: 'Cairo' },
        { id: 2, nameAr: 'الجيزة', nameEn: 'Giza' },
      ]);

      const result = await service.getCurrentQuestion('user-1');

      expect(result.step).toBe(OnboardingStep.GOVERNORATE);
      expect(result.options).toEqual([
        { id: 1, label: 'القاهرة' },
        { id: 2, label: 'الجيزة' },
      ]);
      expect(locationsService.getGovernorates).toHaveBeenCalled();
    });

    it('should load cities dynamically and substitute template', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        userId: 'user-1',
        currentStep: OnboardingStep.CITY,
        data: { governorate_id: 1, governorate_name: 'القاهرة' },
        isCompleted: false,
      });
      locationsService.getCities.mockResolvedValue([
        { id: 8, nameAr: 'مدينة نصر', nameEn: 'Nasr City' },
      ]);

      const result = await service.getCurrentQuestion('user-1');

      expect(result.step).toBe(OnboardingStep.CITY);
      expect(result.question).toContain('القاهرة');
      expect(result.question).not.toContain('{governorate_name}');
      expect(result.options).toEqual([{ id: 8, label: 'مدينة نصر' }]);
      expect(locationsService.getCities).toHaveBeenCalledWith(1);
    });

    it('should load districts dynamically and substitute template', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        userId: 'user-1',
        currentStep: OnboardingStep.DISTRICT,
        data: { city_id: 8, city_name: 'مدينة نصر' },
        isCompleted: false,
      });
      locationsService.getDistricts.mockResolvedValue([
        { id: 55, nameAr: 'الحي الأول', nameEn: '1st District' },
      ]);

      const result = await service.getCurrentQuestion('user-1');

      expect(result.step).toBe(OnboardingStep.DISTRICT);
      expect(result.question).toContain('مدينة نصر');
      expect(result.question).not.toContain('{city_name}');
      expect(result.options).toEqual([{ id: 55, label: 'الحي الأول' }]);
      expect(locationsService.getDistricts).toHaveBeenCalledWith(8);
    });
  });

  // ─── getReview — flat location fields ──────────────────────

  describe('getReview — location fields', () => {
    it('should mark complete when all flat location fields present', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        userId: 'user-1',
        currentStep: OnboardingStep.REVIEW,
        data: {
          property_type: 'APARTMENT',
          listing_type: 'SALE',
          governorate_id: 1,
          governorate_name: 'القاهرة',
          city_id: 8,
          city_name: 'مدينة نصر',
          district_id: 55,
          district_name: 'الحي الأول',
          details: { area_m2: 120, bedrooms: 3, bathrooms: 2 },
          price: 2500000,
        },
        isCompleted: false,
      });

      const result = await service.getReview('user-1');

      expect(result.isComplete).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it('should report missing governorate fields', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        userId: 'user-1',
        currentStep: OnboardingStep.REVIEW,
        data: {
          property_type: 'APARTMENT',
          listing_type: 'SALE',
          price: 2500000,
          details: { area_m2: 120 },
        },
        isCompleted: false,
      });

      const result = await service.getReview('user-1');

      expect(result.isComplete).toBe(false);
      expect(result.missingFields).toContain('governorate_id');
      expect(result.missingFields).toContain('governorate_name');
      expect(result.missingFields).toContain('city_id');
      expect(result.missingFields).toContain('city_name');
      expect(result.missingFields).toContain('district_id');
      expect(result.missingFields).toContain('district_name');
    });
  });

  // ─── finalSubmit — flat location mapping ───────────────────

  describe('finalSubmit — location field mapping', () => {
    it('should map governorate_name/city_name/district_name to Property', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        userId: 'user-1',
        currentStep: OnboardingStep.REVIEW,
        data: {
          property_type: 'APARTMENT',
          listing_type: 'SALE',
          governorate_id: 1,
          governorate_name: 'القاهرة',
          city_id: 8,
          city_name: 'مدينة نصر',
          district_id: 55,
          district_name: 'الحي الأول',
          details: { area_m2: 120, bedrooms: 3, bathrooms: 2 },
          price: 2500000,
        },
        isCompleted: false,
      });
      prisma.property.create.mockResolvedValue({ id: 'prop-1' });
      prisma.propertyMedia.updateMany.mockResolvedValue({ count: 0 });
      prisma.propertyDraft.update.mockResolvedValue({});

      const result = await service.finalSubmit('user-1');

      expect(prisma.property.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            governorate: 'القاهرة',
            city: 'مدينة نصر',
            district: 'الحي الأول',
            zone: null,
            nearestLandmark: null,
          }),
        }),
      );
    });

    it('should reject if governorate_name is missing', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        userId: 'user-1',
        currentStep: OnboardingStep.REVIEW,
        data: {
          property_type: 'APARTMENT',
          listing_type: 'SALE',
          price: 2500000,
          details: { area_m2: 120 },
        },
        isCompleted: false,
      });

      await expect(service.finalSubmit('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── editField — data clearing ──────────────────────────────

  describe('editField — dependent data clearing', () => {
    const reviewDraft = {
      id: 'draft-1',
      userId: 'user-1',
      currentStep: OnboardingStep.REVIEW,
      data: {
        property_type: 'APARTMENT',
        listing_type: 'SALE',
        governorate_id: 1,
        governorate_name: 'القاهرة',
        city_id: 8,
        city_name: 'مدينة نصر',
        district_id: 55,
        district_name: 'الحي الأول',
        details: { area_m2: 120, bedrooms: 3, bathrooms: 2 },
        price: 2500000,
        media_skipped: true,
      },
      isCompleted: false,
    };

    beforeEach(() => {
      prisma.propertyDraft.findFirst.mockResolvedValue(reviewDraft);
      prisma.propertyDraft.update.mockImplementation(({ data }: any) => ({
        ...reviewDraft,
        ...data,
      }));
    });

    it('should clear everything from GOVERNORATE forward when editing GOVERNORATE', async () => {
      const result = await service.editField('user-1', OnboardingStep.GOVERNORATE);

      const updateCall = prisma.propertyDraft.update.mock.calls[0][0];
      const savedData = updateCall.data.data as Record<string, unknown>;

      // GOVERNORATE is at index 0 in the current STEP_ORDER, so clearing
      // "from this step forward" wipes location + property_type + details + price + media.
      // (PROPERTY_TYPE moved to after DISTRICT in the production flow, so it gets cleared too.)
      expect(savedData.governorate_id).toBeUndefined();
      expect(savedData.governorate_name).toBeUndefined();
      expect(savedData.city_id).toBeUndefined();
      expect(savedData.city_name).toBeUndefined();
      expect(savedData.district_id).toBeUndefined();
      expect(savedData.district_name).toBeUndefined();
      expect(savedData.property_type).toBeUndefined();
      expect(savedData.details).toBeUndefined();
      expect(savedData.price).toBeUndefined();
      expect(savedData.media_skipped).toBeUndefined();

      // listing_type is tracked under the PROPERTY_TYPE step's clear-list and
      // PROPERTY_TYPE sits after GOVERNORATE in STEP_ORDER, so it gets cleared too.
      expect(savedData.listing_type).toBeUndefined();

      // Should have rewound to GOVERNORATE
      expect(updateCall.data.currentStep).toBe(OnboardingStep.GOVERNORATE);
    });

    it('should clear district, details, price, media when editing CITY', async () => {
      const result = await service.editField('user-1', OnboardingStep.CITY);

      const updateCall = prisma.propertyDraft.update.mock.calls[0][0];
      const savedData = updateCall.data.data as Record<string, unknown>;

      // Should preserve governorate data
      expect(savedData.governorate_id).toBe(1);
      expect(savedData.governorate_name).toBe('القاهرة');

      // Should have cleared: city and everything after
      expect(savedData.city_id).toBeUndefined();
      expect(savedData.city_name).toBeUndefined();
      expect(savedData.district_id).toBeUndefined();
      expect(savedData.district_name).toBeUndefined();
      expect(savedData.details).toBeUndefined();
      expect(savedData.price).toBeUndefined();
    });

    it('should clear only price and media when editing DETAILS', async () => {
      const result = await service.editField('user-1', OnboardingStep.DETAILS);

      const updateCall = prisma.propertyDraft.update.mock.calls[0][0];
      const savedData = updateCall.data.data as Record<string, unknown>;

      // Should preserve everything up to and including district
      expect(savedData.district_id).toBe(55);
      expect(savedData.district_name).toBe('الحي الأول');

      // Should have cleared: details, price, media
      expect(savedData.details).toBeUndefined();
      expect(savedData.price).toBeUndefined();
      expect(savedData.media_skipped).toBeUndefined();
    });

    it('should reject if not at REVIEW step', async () => {
      prisma.propertyDraft.findFirst.mockResolvedValue({
        ...reviewDraft,
        currentStep: OnboardingStep.PRICE,
      });

      await expect(
        service.editField('user-1', OnboardingStep.GOVERNORATE),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── validatePrice (negotiation band shape) ─────────────────
  describe('validatePrice — negotiation band', () => {
    // The validator is private; access via cast for focused unit coverage.
    const call = (answer: unknown) =>
      (service as unknown as {
        validatePrice: (a: unknown, d: Record<string, unknown>) => Record<string, unknown>;
      }).validatePrice(answer, {});

    it('accepts the legacy raw-number shape and returns nullable band', () => {
      expect(call(500000)).toEqual({ price: 500000, minPrice: null, maxPrice: null });
    });

    it('accepts comma-formatted strings', () => {
      expect(call('1,250,000')).toEqual({ price: 1250000, minPrice: null, maxPrice: null });
    });

    it('treats 0 as null price', () => {
      expect(call(0).price).toBeNull();
    });

    it('accepts the {price, minPrice, maxPrice} object shape', () => {
      expect(call({ price: 1000000, minPrice: 900000, maxPrice: 1100000 })).toEqual({
        price: 1000000,
        minPrice: 900000,
        maxPrice: 1100000,
      });
    });

    it('rejects when minPrice > maxPrice', () => {
      expect(() => call({ price: 1000000, minPrice: 1200000, maxPrice: 1100000 })).toThrow(
        BadRequestException,
      );
    });

    it('rejects when price < minPrice', () => {
      expect(() => call({ price: 800000, minPrice: 900000, maxPrice: 1100000 })).toThrow(
        BadRequestException,
      );
    });

    it('rejects when price > maxPrice', () => {
      expect(() => call({ price: 1500000, minPrice: 900000, maxPrice: 1100000 })).toThrow(
        BadRequestException,
      );
    });

    it('rejects negative numbers anywhere in the band', () => {
      expect(() => call({ price: 1000000, minPrice: -1, maxPrice: 1100000 })).toThrow(
        BadRequestException,
      );
    });
  });
});
