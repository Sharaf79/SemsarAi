/**
 * Constants mirrored from backend/src/onboarding/constants/questions.ts
 * Keep in sync if backend changes.
 */

export const PROPERTY_TYPE_MAP: Record<string, { kind: string; listingType: 'SALE' | 'RENT' }> = {
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

export const SKIP_DETAILS_TYPES = ['SHOP', 'OFFICE', 'COMMERCIAL', 'LAND_BUILDING'];

export const APARTMENT_TYPES = ['شقة', 'دوبلكس', 'بنتهاوس', 'ستوديو'];
export const RENT_APARTMENT_TYPES = ['شقة', 'دوبلكس', 'بنتهاوس', 'غرفة', 'ستوديو', 'شقة فندقية', 'سطح'];
export const RENT_RATE_OPTIONS = ['يومي', 'شهري', 'سنوي'];
export const OWNERSHIP_OPTIONS = ['أول سكن', 'إعادة بيع'];
export const READINESS_OPTIONS = ['جاهز', 'قيد الإنشاء'];
export const FINISHING_OPTIONS = ['بدون تشطيب', 'نصف تشطيب', 'تشطيب كامل', 'سوبر لوكس', 'ألترا سوبر لوكس'];
export const FLOOR_OPTIONS = ['أرضي', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10+'];

export const SALE_PRICE_PRESETS = [
  { label: '500 ألف', value: 500_000 },
  { label: '750 ألف', value: 750_000 },
  { label: '1 مليون', value: 1_000_000 },
  { label: '1.5 مليون', value: 1_500_000 },
  { label: '2 مليون', value: 2_000_000 },
  { label: '3 مليون', value: 3_000_000 },
  { label: '5 مليون', value: 5_000_000 },
  { label: '10 مليون', value: 10_000_000 },
];

export const RENT_MONTHLY_PRESETS = [
  { label: '2,000', value: 2_000 },
  { label: '3,000', value: 3_000 },
  { label: '5,000', value: 5_000 },
  { label: '7,000', value: 7_000 },
  { label: '10,000', value: 10_000 },
  { label: '15,000', value: 15_000 },
  { label: '20,000', value: 20_000 },
  { label: '30,000', value: 30_000 },
];

export const RENT_DAILY_PRESETS = [
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: '500', value: 500 },
  { label: '1,000', value: 1_000 },
];

export const RENT_ANNUAL_PRESETS = [
  { label: '20,000', value: 20_000 },
  { label: '50,000', value: 50_000 },
  { label: '100,000', value: 100_000 },
  { label: '200,000', value: 200_000 },
];

export const STEPS = [
  { num: 1, title: 'الأساسيات', description: 'نوع العقار والموقع' },
  { num: 2, title: 'السعر', description: 'السعر ومعدل الإيجار' },
  { num: 3, title: 'التفاصيل', description: 'المساحة والمرافق' },
  { num: 4, title: 'الصور', description: 'إضافة صور وتحديد الموقع' },
  { num: 5, title: 'المراجعة', description: 'تأكيد البيانات' },
];
