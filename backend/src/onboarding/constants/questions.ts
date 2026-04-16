/**
 * Onboarding questions, step ordering, and Arabic text constants.
 * T11 + T16: Question definitions and step flow.
 */
import { OnboardingStep } from '@prisma/client';

// ─── Step Ordering ──────────────────────────────────────────────

export const STEP_ORDER: OnboardingStep[] = [
  OnboardingStep.GOVERNORATE,
  OnboardingStep.CITY,
  OnboardingStep.DISTRICT,
  OnboardingStep.PROPERTY_TYPE,
  OnboardingStep.DETAILS,
  OnboardingStep.PRICE,
  OnboardingStep.MEDIA,
  OnboardingStep.REVIEW,
  OnboardingStep.COMPLETED,
];

/**
 * Compute the next step in the onboarding flow.
 * Special rule: if next step is DETAILS and property_type is COMMERCIAL/SHOP/LAND_BUILDING/OFFICE,
 * skip DETAILS and go directly to PRICE.
 */
export function getNextStep(
  current: OnboardingStep,
  data?: Record<string, unknown>,
): OnboardingStep {
  const idx = STEP_ORDER.indexOf(current);
  if (idx === -1 || idx + 1 >= STEP_ORDER.length) {
    return OnboardingStep.COMPLETED;
  }

  let next = STEP_ORDER[idx + 1];

  // Dynamic skip: COMMERCIAL/LAND_BUILDING don't have standard apartment details
  const skipDetailsTypes = ['SHOP', 'OFFICE', 'COMMERCIAL', 'LAND_BUILDING'];
  if (next === OnboardingStep.DETAILS && skipDetailsTypes.includes(data?.property_type as string)) {
    const detailsIdx = STEP_ORDER.indexOf(OnboardingStep.DETAILS);
    next = STEP_ORDER[detailsIdx + 1];
  }

  return next;
}

// ─── Field Definitions ──────────────────────────────────────────

export interface FieldDef {
  name: string;
  label: string; // Arabic label
  required: boolean;
}

// ─── Question Definition ────────────────────────────────────────

export interface QuestionDef {
  question: string; // Arabic text (may contain {governorate_name} / {city_name} templates)
  inputType: 'multi-choice' | 'form' | 'number' | 'file' | 'display' | 'map' | 'textarea' | 'optional-textarea';
  options?: string[]; // for static multi-choice (property_type, listing_type)
  optionsSource?: 'governorates' | 'cities' | 'districts'; // dynamic options from DB
  fields?: FieldDef[]; // for form-type
}

// ─── Arabic → Enum Mapping ──────────────────────────────────────

export const COMBINED_PROPERTY_MAP: Record<string, { kind: string; listingType: string }> = {
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

export const ONBOARDING_QUESTIONS: Record<OnboardingStep, QuestionDef> = {
  [OnboardingStep.PROPERTY_TYPE]: {
    question: 'حضرتك نوع العقار ما؟',
    inputType: 'multi-choice',
    options: Object.keys(COMBINED_PROPERTY_MAP),
  },
  [OnboardingStep.LISTING_TYPE]: {
    question: 'عايز تبيع ولا تأجر؟',
    inputType: 'multi-choice',
    options: ['بيع', 'إيجار'],
  },
  [OnboardingStep.GOVERNORATE]: {
    question: 'العقار في أي محافظة؟',
    inputType: 'multi-choice',
    optionsSource: 'governorates',
  },
  [OnboardingStep.CITY]: {
    question: 'في أي مدينة في {governorate_name}؟',
    inputType: 'multi-choice',
    optionsSource: 'cities',
  },
  [OnboardingStep.DISTRICT]: {
    question: 'في أي حي/منطقة في {city_name}؟',
    inputType: 'multi-choice',
    optionsSource: 'districts',
  },
  [OnboardingStep.DETAILS]: {
    question: 'تفاصيل العقار',
    inputType: 'form',
    fields: [
      { name: 'area_m2', label: 'المساحة (م²)', required: true },
      { name: 'bedrooms', label: 'عدد الغرف', required: false },
      { name: 'bathrooms', label: 'عدد الحمامات', required: false },
    ],
  },
  [OnboardingStep.PRICE]: {
    question: 'السعر المتوقع كام؟',
    inputType: 'number',
  },
  [OnboardingStep.MEDIA]: {
    question: 'تحب تضيف صور أو فيديوهات؟',
    inputType: 'file',
  },
  [OnboardingStep.REVIEW]: {
    question: 'راجع البيانات وأكد',
    inputType: 'display',
  },
  [OnboardingStep.COMPLETED]: {
    question: '',
    inputType: 'display',
  },
};

// ─── Details Sub-step Options (MCQ) ─────────────────────────

export const AREA_OPTIONS = ['60 م²', '80 م²', '100 م²', '120 م²', '150 م²', '200 م²', '250 م²', '300+ م²'];

export const AREA_MAP: Record<string, number> = {
  '60 م²': 60,
  '80 م²': 80,
  '100 م²': 100,
  '120 م²': 120,
  '150 م²': 150,
  '200 م²': 200,
  '250 م²': 250,
  '300+ م²': 300,
};

export const BEDROOM_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export const BEDROOM_MAP: Record<string, number> = {
  '1': 1, '2': 2, '3': 3, '4': 4, '5+': 5,
};

export const BATHROOM_OPTIONS = ['1', '2', '3', '4+'];

export const BATHROOM_MAP: Record<string, number> = {
  '1': 1, '2': 2, '3': 3, '4+': 4,
};

// ─── Extended Apartment Sub-step Options ────────────────────
export const APARTMENT_TYPES = ['شقة', 'دوبلكس', 'بنتهاوس', 'ستوديو'];

export const RENT_APARTMENT_TYPES = ['شقة', 'دوبلكس', 'بنتهاوس', 'غرفة', 'ستوديو', 'شقة فندقية', 'سطح'];

export const RENT_RATE_OPTIONS = ['يومي', 'شهري', 'سنوي'];
export const OWNERSHIP_OPTIONS = ['أول سكن', 'إعادة بيع'];
export const READINESS_OPTIONS = ['جاهز', 'قيد الإنشاء'];
export const FINISHING_OPTIONS = ['بدون تشطيب', 'نصف تشطيب', 'تشطيب كامل', 'سوبر لوكس', 'ألترا سوبر لوكس'];
export const FLOOR_OPTIONS = ['أرضي', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'];
export const YES_NO_OPTIONS = ['نعم', 'لا'];

// ─── Price Options (MCQ) ────────────────────────────────────

export const SALE_PRICE_OPTIONS = [
  '500 ألف', '750 ألف', '1 مليون', '1.5 مليون',
  '2 مليون', '3 مليون', '5 مليون', '10 مليون',
];

export const SALE_PRICE_MAP: Record<string, number> = {
  '500 ألف': 500000,
  '750 ألف': 750000,
  '1 مليون': 1000000,
  '1.5 مليون': 1500000,
  '2 مليون': 2000000,
  '3 مليون': 3000000,
  '5 مليون': 5000000,
  '10 مليون': 10000000,
};

export const RENT_PRICE_OPTIONS = [
  '2,000 جنيه', '3,000 جنيه', '5,000 جنيه', '7,000 جنيه',
  '10,000 جنيه', '15,000 جنيه', '20,000 جنيه', '30,000 جنيه',
];

export const RENT_PRICE_MAP: Record<string, number> = {
  '2,000 جنيه': 2000,
  '3,000 جنيه': 3000,
  '5,000 جنيه': 5000,
  '7,000 جنيه': 7000,
  '10,000 جنيه': 10000,
  '15,000 جنيه': 15000,
  '20,000 جنيه': 20000,
  '30,000 جنيه': 30000,
};

export const RENT_DAILY_PRICE_OPTIONS = [
  '200 جنيه', '300 جنيه', '500 جنيه', '750 جنيه',
  '1,000 جنيه', '1,500 جنيه', '2,000 جنيه', '3,000 جنيه',
];

export const RENT_DAILY_PRICE_MAP: Record<string, number> = {
  '200 جنيه': 200, '300 جنيه': 300, '500 جنيه': 500, '750 جنيه': 750,
  '1,000 جنيه': 1000, '1,500 جنيه': 1500, '2,000 جنيه': 2000, '3,000 جنيه': 3000,
};

export const RENT_ANNUAL_PRICE_OPTIONS = [
  '20,000 جنيه', '30,000 جنيه', '50,000 جنيه', '75,000 جنيه',
  '100,000 جنيه', '150,000 جنيه', '200,000 جنيه', '300,000 جنيه',
];

export const RENT_ANNUAL_PRICE_MAP: Record<string, number> = {
  '20,000 جنيه': 20000, '30,000 جنيه': 30000, '50,000 جنيه': 50000,
  '75,000 جنيه': 75000, '100,000 جنيه': 100000, '150,000 جنيه': 150000,
  '200,000 جنيه': 200000, '300,000 جنيه': 300000,
};

// ─── Media & Review Options (MCQ) ───────────────────────────

export const MEDIA_OPTIONS = ['تخطي ⏭️'];

export const REVIEW_OPTIONS = ['✅ تأكيد ونشر'];
