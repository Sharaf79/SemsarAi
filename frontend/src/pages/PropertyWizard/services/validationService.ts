/**
 * Form Validation Service
 * Mirrors backend validation logic from onboarding.service.ts
 */

import {
  PropertyDraftData,
  PropertyDetails,
  OnboardingStep,
  FormValidationError,
  PROPERTY_TYPE_MAP,
  SKIP_DETAILS_PROPERTY_TYPES,
  APARTMENT_TYPES,
  RENT_APARTMENT_TYPES,
  RENT_RATE_OPTIONS,
  OWNERSHIP_OPTIONS,
  READINESS_OPTIONS,
  FINISHING_OPTIONS,
  FLOOR_OPTIONS,
  YES_NO_OPTIONS,
} from '../types/wizard.types';

export class ValidationService {
  /**
   * Validate property type selection
   */
  static validatePropertyType(value: string): FormValidationError[] {
    const errors: FormValidationError[] = [];

    if (!value || !PROPERTY_TYPE_MAP[value]) {
      errors.push({
        field: 'property_type',
        message: 'الرجاء اختيار نوع العقار',
      });
    }

    return errors;
  }

  /**
   * Validate governorate selection
   */
  static validateGovernorate(value: unknown): FormValidationError[] {
    const errors: FormValidationError[] = [];

    if (!value || (typeof value === 'object' && (value as any).id === undefined)) {
      errors.push({
        field: 'governorate',
        message: 'الرجاء اختيار محافظة',
      });
    }

    return errors;
  }

  /**
   * Validate city selection
   */
  static validateCity(value: unknown, governorateSelected: boolean): FormValidationError[] {
    const errors: FormValidationError[] = [];

    if (!governorateSelected) {
      errors.push({
        field: 'city',
        message: 'الرجاء اختيار محافظة أولاً',
      });
      return errors;
    }

    if (!value || (typeof value === 'object' && (value as any).id === undefined)) {
      errors.push({
        field: 'city',
        message: 'الرجاء اختيار مدينة',
      });
    }

    return errors;
  }

  /**
   * Validate district selection
   */
  static validateDistrict(value: unknown, citySelected: boolean): FormValidationError[] {
    const errors: FormValidationError[] = [];

    if (!citySelected) {
      errors.push({
        field: 'district',
        message: 'الرجاء اختيار مدينة أولاً',
      });
      return errors;
    }

    // District is optional if the city has no districts
    // This is validated on the backend, so we just check if selected
    if (value && typeof value === 'object' && (value as any).id === undefined) {
      errors.push({
        field: 'district',
        message: 'الرجاء اختيار حي/منطقة صحيحة',
      });
    }

    return errors;
  }

  /**
   * Validate price
   */
  static validatePrice(value: unknown): FormValidationError[] {
    const errors: FormValidationError[] = [];

    if (value === null || value === undefined || value === '') {
      // Price is optional (can skip)
      return errors;
    }

    const num = Number(String(value).replace(/,/g, ''));

    if (isNaN(num)) {
      errors.push({
        field: 'price',
        message: 'الرجاء إدخال سعر صحيح',
      });
    } else if (num < 0) {
      errors.push({
        field: 'price',
        message: 'السعر يجب أن يكون موجب',
      });
    }

    return errors;
  }

  /**
   * Validate rent rate type (for rental properties)
   */
  static validateRentRateType(value: unknown, isRental: boolean): FormValidationError[] {
    const errors: FormValidationError[] = [];

    if (isRental && !value) {
      errors.push({
        field: 'rentRateType',
        message: 'الرجاء اختيار معدل الإيجار',
      });
    } else if (isRental && !RENT_RATE_OPTIONS.includes(String(value))) {
      errors.push({
        field: 'rentRateType',
        message: 'الرجاء اختيار معدل إيجار صحيح',
      });
    }

    return errors;
  }

  /**
   * Validate details object
   */
  static validateDetails(details: Partial<PropertyDetails> | undefined, propertyType: string): FormValidationError[] {
    const errors: FormValidationError[] = [];

    if (!details) {
      errors.push({
        field: 'details',
        message: 'الرجاء ملء تفاصيل العقار',
      });
      return errors;
    }

    // Area is required (except for SHOP, COMMERCIAL, OFFICE, LAND_BUILDING)
    if (!SKIP_DETAILS_PROPERTY_TYPES.includes(propertyType as any)) {
      if (!details.area_m2 || Number(details.area_m2) <= 0) {
        errors.push({
          field: 'area_m2',
          message: 'الرجاء إدخال مساحة صحيحة (أكثر من 0)',
        });
      }
    }

    // Bedrooms validation
    if (details.bedrooms !== undefined && details.bedrooms !== null) {
      const beds = Number(details.bedrooms);
      if (isNaN(beds) || beds < 0 || beds > 10) {
        errors.push({
          field: 'bedrooms',
          message: 'عدد الغرف يجب أن يكون بين 0 و 10',
        });
      }
    }

    // Bathrooms validation
    if (details.bathrooms !== undefined && details.bathrooms !== null) {
      const baths = Number(details.bathrooms);
      if (isNaN(baths) || baths < 0 || baths > 10) {
        errors.push({
          field: 'bathrooms',
          message: 'عدد الحمامات يجب أن يكون بين 0 و 10',
        });
      }
    }

    // Apartment type validation
    if (details.apartmentType) {
      const validTypes = [...APARTMENT_TYPES, ...RENT_APARTMENT_TYPES];
      if (!validTypes.includes(String(details.apartmentType))) {
        errors.push({
          field: 'apartmentType',
          message: 'نوع العقار غير صحيح',
        });
      }
    }

    // Ownership type validation (for sale)
    if (details.ownershipType && !OWNERSHIP_OPTIONS.includes(String(details.ownershipType))) {
      errors.push({
        field: 'ownershipType',
        message: 'نوع الملكية غير صحيح',
      });
    }

    // Rent rate type validation
    if (details.rentRateType && !RENT_RATE_OPTIONS.includes(String(details.rentRateType))) {
      errors.push({
        field: 'rentRateType',
        message: 'معدل الإيجار غير صحيح',
      });
    }

    // Readiness validation
    if (details.readiness && !READINESS_OPTIONS.includes(String(details.readiness))) {
      errors.push({
        field: 'readiness',
        message: 'حالة العقار غير صحيحة',
      });
    }

    // Finishing type validation
    if (details.finishingType && !FINISHING_OPTIONS.includes(String(details.finishingType))) {
      errors.push({
        field: 'finishingType',
        message: 'نوع التشطيب غير صحيح',
      });
    }

    // Floor level validation
    if (details.floorLevel && !FLOOR_OPTIONS.includes(String(details.floorLevel))) {
      errors.push({
        field: 'floorLevel',
        message: 'الطابق غير صحيح',
      });
    }

    // Ad title validation
    if (details.adTitle && String(details.adTitle).length > 200) {
      errors.push({
        field: 'adTitle',
        message: 'عنوان الإعلان يجب أن يكون أقل من 200 حرف',
      });
    }

    return errors;
  }

  /**
   * Check if property type requires details step
   */
  static shouldSkipDetailsStep(propertyType: string): boolean {
    return SKIP_DETAILS_PROPERTY_TYPES.includes(propertyType as any);
  }

  /**
   * Check if property is rental
   */
  static isRentalProperty(listingType: string): boolean {
    return listingType === 'RENT';
  }

  /**
   * Check if property is under construction
   */
  static isUnderConstruction(readiness: string): boolean {
    return readiness === 'قيد الإنشاء';
  }

  /**
   * Validate entire draft before submission
   */
  static validateDraftComplete(data: PropertyDraftData): FormValidationError[] {
    const errors: FormValidationError[] = [];

    const required = ['property_type', 'listing_type', 'governorate_id', 'city_id'];
    for (const field of required) {
      if (!data[field]) {
        errors.push({
          field,
          message: `${field} مطلوب`,
        });
      }
    }

    // Check details (not required for SHOP)
    if (data.property_type !== 'SHOP' && !data.details?.area_m2) {
      errors.push({
        field: 'details.area_m2',
        message: 'المساحة مطلوبة',
      });
    }

    return errors;
  }

  /**
   * Format price for display
   */
  static formatPrice(price: number | undefined | null): string {
    if (!price) return '—';
    return new Intl.NumberFormat('ar-EG').format(price);
  }

  /**
   * Parse price from string (remove commas, etc.)
   */
  static parsePrice(value: string): number {
    return Number(value.replace(/,/g, ''));
  }
}

export default ValidationService;
