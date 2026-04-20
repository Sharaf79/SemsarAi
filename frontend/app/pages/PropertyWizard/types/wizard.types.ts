/**
 * TypeScript interfaces for the Add Property Form Wizard
 * Mirrors the backend PropertyDraft and validation schema
 */

export type OnboardingStep =
  | 'GOVERNORATE'
  | 'CITY'
  | 'DISTRICT'
  | 'PROPERTY_TYPE'
  | 'DETAILS'
  | 'PRICE'
  | 'MEDIA'
  | 'REVIEW'
  | 'COMPLETED';

export type PropertyTypeEnum = 'APARTMENT' | 'VILLA' | 'SHOP' | 'OFFICE' | 'SUMMER_RESORT' | 'COMMERCIAL' | 'LAND_BUILDING';
export type ListingTypeEnum = 'SALE' | 'RENT';
export type MediaTypeEnum = 'IMAGE' | 'VIDEO';

// ─── Property Draft ────────────────────────────────────────

export interface PropertyDetails {
  area_m2: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  apartmentType?: string | null;
  rentRateType?: string | null; // يومي / شهري / سنوي
  ownershipType?: string | null; // أول سكن / إعادة بيع
  readiness?: string | null; // جاهز / قيد الإنشاء
  deliveryDate?: string | null;
  finishingType?: string | null; // بدون تشطيب / نصف تشطيب / تشطيب كامل / سوبر لوكس / ألترا سوبر لوكس
  floorLevel?: string | null; // أرضي / 1-10 / 10+
  isFurnished?: boolean | null;
  adTitle?: string | null;
  adDescription?: string | null;
  amenities?: { parsed?: string } | null;
  lat?: number | null;
  lng?: number | null;
  paymentMethod?: string | null;
  paymentType?: string | null;
  deliveryTerms?: string | null;
  isNegotiable?: boolean;
  location?: string | null; // For seasonal/resort properties
  rentalRate?: number | null;
  rentalFees?: number | null;
  downPayment?: number | null;
  insurance?: number | null;
}

export interface PropertyDraftData {
  property_type?: PropertyTypeEnum;
  listing_type?: ListingTypeEnum;
  governorate_id?: number;
  governorate_name?: string;
  city_id?: number;
  city_name?: string;
  district_id?: number;
  district_name?: string;
  price?: number | null;
  details?: PropertyDetails | null;
  media_skipped?: boolean;
  [key: string]: any; // For temporary fields during substeps
}

export interface PropertyDraft {
  id: string;
  userId: string;
  propertyId?: string | null;
  currentStep: OnboardingStep;
  data: PropertyDraftData;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Property Media ────────────────────────────────────────

export interface PropertyMediaItem {
  id: string;
  draftId?: string;
  propertyId?: string;
  url: string;
  type: MediaTypeEnum;
  createdAt: Date;
}

// ─── Location Data ────────────────────────────────────────

export interface LocationOption {
  id: number;
  label: string; // Arabic name (nameAr)
  nameEn?: string;
}

export interface LocationData {
  governorates: LocationOption[];
  cities: Record<number, LocationOption[]>; // governorate_id → cities[]
  districts: Record<number, LocationOption[]>; // city_id → districts[]
}

// ─── Form State ────────────────────────────────────────

export interface FormValidationError {
  field: string;
  message: string;
}

export interface WizardFormState {
  step: number; // 1-5
  substep?: string; // For steps with multiple substeps (e.g., "location", "details")
  isLoading: boolean;
  isSaving: boolean;
  errors: FormValidationError[];
  draft: PropertyDraft | null;
  locationData: LocationData;
  media: PropertyMediaItem[];
  hasUnsavedChanges: boolean;
}

// ─── API Response Types ────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface QuestionData {
  step: OnboardingStep;
  question: string;
  inputType: string;
  options?: Array<{ id: number; label: string } | string>;
  fields?: Array<{ name: string; label: string; required: boolean }>;
}

export interface ReviewData {
  draft: PropertyDraft;
  data: PropertyDraftData;
  isComplete: boolean;
  missingFields: string[];
}

// ─── Step-Specific Types ────────────────────────────────────

export interface Step1State {
  property_type?: PropertyTypeEnum;
  listing_type?: ListingTypeEnum;
  governorate_id?: number;
  governorate_name?: string;
  city_id?: number;
  city_name?: string;
  district_id?: number;
  district_name?: string;
}

export interface Step2State {
  rentRateType?: string; // يومي / شهري / سنوي
  price?: number | null;
}

export interface Step3State {
  details?: PropertyDetails;
}

export interface Step4State {
  media: PropertyMediaItem[];
  lat?: number | null;
  lng?: number | null;
}

export interface Step5State {
  // Review is read-only
}

// ─── Constants Mappings ────────────────────────────────────

export const PROPERTY_TYPE_MAP: Record<string, { kind: PropertyTypeEnum; listingType: ListingTypeEnum }> = {
  'شقق للبيع': { kind: 'APARTMENT', listingType: 'SALE' },
  'شقق للإيجار': { kind: 'APARTMENT', listingType: 'RENT' },
  'فلل للبيع': { kind: 'VILLA', listingType: 'SALE' },
  'فلل للإيجار': { kind: 'VILLA', listingType: 'RENT' },
  'عقارات مصايف للبيع': { kind: 'SUMMER_RESORT', listingType: 'SALE' },
  'عقارات مصايف للإيجار': { kind: 'SUMMER_RESORT', listingType: 'RENT' },
  'عقار تجارى للبيع': { kind: 'COMMERCIAL', listingType: 'SALE' },
  'عقار تجارى للإيجار': { kind: 'COMMERCIAL', listingType: 'RENT' },
  'مبانى و أراضى': { kind: 'LAND_BUILDING', listingType: 'SALE' },
};

export const SKIP_DETAILS_PROPERTY_TYPES: PropertyTypeEnum[] = ['SHOP', 'OFFICE', 'COMMERCIAL', 'LAND_BUILDING'];

export const AREA_OPTIONS = ['60 م²', '80 م²', '100 م²', '120 م²', '150 م²', '200 م²', '250 م²', '300+ م²'];
export const BEDROOM_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
export const BATHROOM_OPTIONS = ['1', '2', '3', '4+'];
export const APARTMENT_TYPES = ['شقة', 'دوبلكس', 'بنتهاوس', 'ستوديو'];
export const RENT_APARTMENT_TYPES = ['شقة', 'دوبلكس', 'بنتهاوس', 'غرفة', 'ستوديو', 'شقة فندقية', 'سطح'];
export const RENT_RATE_OPTIONS = ['يومي', 'شهري', 'سنوي'];
export const OWNERSHIP_OPTIONS = ['أول سكن', 'إعادة بيع'];
export const READINESS_OPTIONS = ['جاهز', 'قيد الإنشاء'];
export const FINISHING_OPTIONS = ['بدون تشطيب', 'نصف تشطيب', 'تشطيب كامل', 'سوبر لوكس', 'ألترا سوبر لوكس'];
export const FLOOR_OPTIONS = ['أرضي', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'];
export const YES_NO_OPTIONS = ['نعم', 'لا'];

export const SALE_PRICE_OPTIONS = [
  '500 ألف', '750 ألف', '1 مليون', '1.5 مليون',
  '2 مليون', '3 مليون', '5 مليون', '10 مليون',
];

export const RENT_PRICE_OPTIONS = [
  '2,000 جنيه', '3,000 جنيه', '5,000 جنيه', '7,000 جنيه',
  '10,000 جنيه', '15,000 جنيه', '20,000 جنيه', '30,000 جنيه',
];

export const RENT_DAILY_PRICE_OPTIONS = [
  '50 جنيه', '75 جنيه', '100 جنيه', '150 جنيه',
  '200 جنيه', '300 جنيه', '500 جنيه', '1,000 جنيه',
];

export const RENT_ANNUAL_PRICE_OPTIONS = [
  '20,000 جنيه', '30,000 جنيه', '50,000 جنيه', '75,000 جنيه',
  '100,000 جنيه', '150,000 جنيه', '200,000 جنيه', '300,000 جنيه',
];
