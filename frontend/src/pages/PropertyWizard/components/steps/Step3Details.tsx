/**
 * Step 3: Details
 * Property specifications (area, bedrooms, amenities, etc.)
 */

import React, { useState, useEffect } from 'react';
import {
  PropertyDraft,
  PropertyDetails,
  APARTMENT_TYPES,
  RENT_APARTMENT_TYPES,
  OWNERSHIP_OPTIONS,
  READINESS_OPTIONS,
  FINISHING_OPTIONS,
  FLOOR_OPTIONS,
  YES_NO_OPTIONS,
} from '../../types/wizard.types';

interface Step3DetailsProps {
  draft: PropertyDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  onNext: () => void;
  onBack: () => void;
  submitAnswer: (step: any, answer: any) => Promise<any>;
}

export const Step3Details: React.FC<Step3DetailsProps> = ({
  draft,
  isSaving,
  onNext,
  submitAnswer,
}) => {
  const [details, setDetails] = useState<Partial<PropertyDetails>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isRental = draft?.data.listing_type === 'RENT';

  // Load initial data from draft
  useEffect(() => {
    if (!draft?.data.details) return;
    setDetails(draft.data.details);
  }, [draft]);

  const handleFieldChange = (field: keyof PropertyDetails, value: any) => {
    setDetails((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validateAndSubmit = async () => {
    const newErrors: Record<string, string> = {};

    // Area is required
    if (!details.area_m2 || Number(details.area_m2) <= 0) {
      newErrors.area_m2 = 'الرجاء إدخال مساحة صحيحة (أكثر من 0)';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await submitAnswer('DETAILS', details);
      onNext();
    } catch (err) {
      // Error handled by usePropertyDraft
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">تفاصيل العقار</h2>
        <p className="text-gray-600">
          أخبرنا بمزيد من التفاصيل عن العقار
        </p>
      </div>

      <div className="space-y-6">
        {/* Area (Required) */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">
            المساحة (م²)
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            type="number"
            value={details.area_m2 || ''}
            onChange={(e) => handleFieldChange('area_m2', Number(e.target.value))}
            placeholder="مثلاً: 120"
            className={`w-full px-4 py-3 rounded-lg border-2 font-medium text-right ${
              errors.area_m2
                ? 'border-red-300 bg-red-50'
                : 'border-gray-200 bg-white focus:border-blue-600'
            }`}
          />
          {errors.area_m2 && (
            <p className="text-red-600 text-sm">{errors.area_m2}</p>
          )}
        </div>

        {/* Bedrooms */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">عدد الغرف</label>
          <input
            type="number"
            value={details.bedrooms || ''}
            onChange={(e) => handleFieldChange('bedrooms', Number(e.target.value) || null)}
            placeholder="مثلاً: 3"
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
          />
        </div>

        {/* Bathrooms */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">عدد الحمامات</label>
          <input
            type="number"
            value={details.bathrooms || ''}
            onChange={(e) => handleFieldChange('bathrooms', Number(e.target.value) || null)}
            placeholder="مثلاً: 2"
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
          />
        </div>

        {/* Apartment Type */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">نوع العقار</label>
          <select
            value={details.apartmentType || ''}
            onChange={(e) => handleFieldChange('apartmentType', e.target.value || null)}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
          >
            <option value="">-- اختر نوع العقار --</option>
            {(isRental ? RENT_APARTMENT_TYPES : APARTMENT_TYPES).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Ownership Type (Sale only) */}
        {!isRental && (
          <div className="space-y-2">
            <label className="block font-semibold text-gray-900">نوع الملكية</label>
            <select
              value={details.ownershipType || ''}
              onChange={(e) => handleFieldChange('ownershipType', e.target.value || null)}
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
            >
              <option value="">-- اختر نوع الملكية --</option>
              {OWNERSHIP_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Readiness */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">حالة العقار</label>
          <select
            value={details.readiness || ''}
            onChange={(e) => handleFieldChange('readiness', e.target.value || null)}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
          >
            <option value="">-- اختر حالة العقار --</option>
            {READINESS_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Delivery Date (if under construction) */}
        {details.readiness === 'قيد الإنشاء' && (
          <div className="space-y-2">
            <label className="block font-semibold text-gray-900">تاريخ التسليم المتوقع</label>
            <input
              type="text"
              value={details.deliveryDate || ''}
              onChange={(e) => handleFieldChange('deliveryDate', e.target.value || null)}
              placeholder="مثلاً: يونيو 2025 أو 06/2025"
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
            />
          </div>
        )}

        {/* Finishing Type */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">نوع التشطيب</label>
          <select
            value={details.finishingType || ''}
            onChange={(e) => handleFieldChange('finishingType', e.target.value || null)}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
          >
            <option value="">-- اختر نوع التشطيب --</option>
            {FINISHING_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Floor Level */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">الطابق</label>
          <select
            value={details.floorLevel || ''}
            onChange={(e) => handleFieldChange('floorLevel', e.target.value || null)}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
          >
            <option value="">-- اختر الطابق --</option>
            {FLOOR_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        {/* Furnished */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">هل العقار مفروش؟</label>
          <div className="flex gap-4">
            {YES_NO_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() =>
                  handleFieldChange('isFurnished', option === 'نعم')
                }
                className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition ${
                  (option === 'نعم' && details.isFurnished) ||
                  (option === 'لا' && details.isFurnished === false)
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Ad Title */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">عنوان الإعلان</label>
          <input
            type="text"
            value={details.adTitle || ''}
            onChange={(e) => handleFieldChange('adTitle', e.target.value || null)}
            placeholder="مثلاً: شقة فاخرة بمصر الجديدة"
            maxLength={100}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right"
          />
          <p className="text-xs text-gray-500">
            {(details.adTitle?.length || 0)} / 100 حرف
          </p>
        </div>

        {/* Ad Description */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">وصف العقار</label>
          <textarea
            value={details.adDescription || ''}
            onChange={(e) => handleFieldChange('adDescription', e.target.value || null)}
            placeholder="صف العقار وميزاته بالتفصيل..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right resize-none"
          />
        </div>

        {/* Amenities */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">الكماليات (اختياري)</label>
          <textarea
            value={
              (typeof details.amenities === 'object' &&
                details.amenities?.parsed) ||
              ''
            }
            onChange={(e) =>
              handleFieldChange('amenities', {
                parsed: e.target.value,
              })
            }
            placeholder="مثلاً: جراج، أمن 24/7، حديقة، مسبح"
            rows={3}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 font-medium text-right resize-none"
          />
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={validateAndSubmit}
        disabled={isSaving}
        className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition mt-8"
      >
        {isSaving ? 'جاري الحفظ...' : 'متابعة'}
      </button>
    </div>
  );
};

export default Step3Details;
