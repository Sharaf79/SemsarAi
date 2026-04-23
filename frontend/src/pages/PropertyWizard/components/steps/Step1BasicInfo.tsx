/**
 * Step 1: Basic Information
 * Property type and location selection
 */

import React, { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { PropertyDraft, PROPERTY_TYPE_MAP } from '../../types/wizard.types';
import ValidationService from '../../services/validationService';

interface Step1BasicInfoProps {
  draft: PropertyDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  onNext: () => void;
  onBack: () => void;
  submitAnswer: (step: any, answer: any) => Promise<any>;
}

export const Step1BasicInfo: React.FC<Step1BasicInfoProps> = ({
  draft,
  isLoading,
  isSaving,
  onNext,
  submitAnswer,
}) => {
  const [propertyType, setPropertyType] = useState('');
  const [governorate, setGovernorate] = useState<{ id: number; label: string } | null>(null);
  const [city, setCity] = useState<{ id: number; label: string } | null>(null);
  const [district, setDistrict] = useState<{ id: number; label: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [governorateOptions, setGovernorateOptions] = useState<any[]>([]);
  const [cityOptions, setCityOptions] = useState<any[]>([]);
  const [districtOptions, setDistrictOptions] = useState<any[]>([]);

  // Load initial data from draft
  useEffect(() => {
    if (!draft) return;
    const data = draft.data;
    if (data.property_type && data.listing_type) {
      // Find the combined key
      const key = Object.keys(PROPERTY_TYPE_MAP).find(
        (k) =>
          PROPERTY_TYPE_MAP[k].kind === data.property_type &&
          PROPERTY_TYPE_MAP[k].listingType === data.listing_type,
      );
      if (key) setPropertyType(key);
    }
    if (data.governorate_id && data.governorate_name) {
      setGovernorate({ id: data.governorate_id, label: data.governorate_name });
    }
    if (data.city_id && data.city_name) {
      setCity({ id: data.city_id, label: data.city_name });
    }
    if (data.district_id && data.district_name) {
      setDistrict({ id: data.district_id, label: data.district_name });
    }
  }, [draft]);

  // Load governorates (this would come from API in real app)
  useEffect(() => {
    // Placeholder - in real app fetch from /locations/governorates
    setGovernorateOptions([
      { id: 1, label: 'القاهرة' },
      { id: 2, label: 'الإسكندرية' },
      { id: 3, label: 'الجيزة' },
      { id: 4, label: 'القليوبية' },
      { id: 5, label: 'الشرقية' },
      { id: 6, label: 'الدقهلية' },
      { id: 7, label: 'الغربية' },
      { id: 8, label: 'المنوفية' },
      { id: 9, label: 'البحيرة' },
      { id: 10, label: 'الإسماعيلية' },
    ]);
  }, []);

  // Load cities when governorate changes
  useEffect(() => {
    if (!governorate) {
      setCityOptions([]);
      setCity(null);
      setDistrictOptions([]);
      setDistrict(null);
      return;
    }

    // Placeholder - would fetch from API
    const cityMap: Record<number, any[]> = {
      1: [
        { id: 101, label: 'القاهرة' },
        { id: 102, label: 'مصر الجديدة' },
      ],
      2: [
        { id: 201, label: 'الإسكندرية' },
        { id: 202, label: 'برج العرب' },
      ],
    };

    setCityOptions(cityMap[governorate.id] || []);
    setCity(null);
    setDistrict(null);
    setDistrictOptions([]);
  }, [governorate]);

  // Load districts when city changes
  useEffect(() => {
    if (!city) {
      setDistrictOptions([]);
      setDistrict(null);
      return;
    }

    // Placeholder - would fetch from API
    const districtMap: Record<number, any[]> = {
      101: [
        { id: 1001, label: 'مدينة نصر' },
        { id: 1002, label: 'الشيخ زايد' },
      ],
      201: [
        { id: 2001, label: 'الدسوقي' },
        { id: 2002, label: 'الشاطبي' },
      ],
    };

    setDistrictOptions(districtMap[city.id] || []);
    setDistrict(null);
  }, [city]);

  const handleContinue = async () => {
    const newErrors: Record<string, string> = {};

    // Validate property type
    if (!propertyType) {
      newErrors.propertyType = 'الرجاء اختيار نوع العقار';
    }

    // Validate location
    if (!governorate) {
      newErrors.governorate = 'الرجاء اختيار محافظة';
    }
    if (!city) {
      newErrors.city = 'الرجاء اختيار مدينة';
    }
    if (districtOptions.length > 0 && !district) {
      newErrors.district = 'الرجاء اختيار حي/منطقة';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    // Submit all answers sequentially
    try {
      // 1. Property type
      const mapped = PROPERTY_TYPE_MAP[propertyType];
      await submitAnswer('PROPERTY_TYPE', propertyType);

      // 2. Governorate
      await submitAnswer('GOVERNORATE', governorate);

      // 3. City
      await submitAnswer('CITY', city);

      // 4. District
      if (district) {
        await submitAnswer('DISTRICT', district);
      }

      // Move to next step
      // Note: In real implementation, we'd navigate automatically based on draft.currentStep
    } catch (err) {
      // Error already handled by usePropertyDraft
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">اختر نوع العقار والموقع</h2>
        <p className="text-gray-600">
          ابدأ برحلتك بتحديد نوع العقار الذي تريد إضافته وموقعه الجغرافي
        </p>
      </div>

      {/* Property Type Selection */}
      <div className="space-y-4">
        <label className="block text-lg font-semibold text-gray-900">
          نوع العقار
          <span className="text-red-500 ml-1">*</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.keys(PROPERTY_TYPE_MAP).map((key) => (
            <button
              key={key}
              onClick={() => {
                setPropertyType(key);
                setErrors((prev) => ({ ...prev, propertyType: '' }));
              }}
              className={`p-4 rounded-lg border-2 font-medium transition text-right ${
                propertyType === key
                  ? 'border-blue-600 bg-blue-50 text-blue-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {errors.propertyType && (
          <p className="text-red-600 text-sm">{errors.propertyType}</p>
        )}
      </div>

      {/* Location Selection */}
      <div className="space-y-6 border-t pt-8">
        <div className="flex items-center gap-2 mb-6">
          <MapPin className="text-blue-600" size={24} />
          <h3 className="text-xl font-semibold text-gray-900">الموقع الجغرافي</h3>
        </div>

        {/* Governorate */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">
            المحافظة
            <span className="text-red-500 ml-1">*</span>
          </label>
          <select
            value={governorate?.id || ''}
            onChange={(e) => {
              const selected = governorateOptions.find(
                (g) => g.id === Number(e.target.value),
              );
              setGovernorate(selected || null);
              setErrors((prev) => ({ ...prev, governorate: '' }));
            }}
            className={`w-full px-4 py-3 rounded-lg border-2 font-medium text-right ${
              errors.governorate
                ? 'border-red-300 bg-red-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <option value="">-- اختر محافظة --</option>
            {governorateOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          {errors.governorate && (
            <p className="text-red-600 text-sm">{errors.governorate}</p>
          )}
        </div>

        {/* City */}
        <div className="space-y-2">
          <label className="block font-semibold text-gray-900">
            المدينة
            <span className="text-red-500 ml-1">*</span>
          </label>
          <select
            value={city?.id || ''}
            onChange={(e) => {
              const selected = cityOptions.find((c) => c.id === Number(e.target.value));
              setCity(selected || null);
              setErrors((prev) => ({ ...prev, city: '' }));
            }}
            disabled={!governorate}
            className={`w-full px-4 py-3 rounded-lg border-2 font-medium text-right ${
              !governorate
                ? 'bg-gray-100 cursor-not-allowed'
                : errors.city
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <option value="">-- اختر مدينة --</option>
            {cityOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {errors.city && <p className="text-red-600 text-sm">{errors.city}</p>}
        </div>

        {/* District */}
        {districtOptions.length > 0 && (
          <div className="space-y-2">
            <label className="block font-semibold text-gray-900">
              الحي / المنطقة
              <span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={district?.id || ''}
              onChange={(e) => {
                const selected = districtOptions.find(
                  (d) => d.id === Number(e.target.value),
                );
                setDistrict(selected || null);
                setErrors((prev) => ({ ...prev, district: '' }));
              }}
              disabled={!city}
              className={`w-full px-4 py-3 rounded-lg border-2 font-medium text-right ${
                !city
                  ? 'bg-gray-100 cursor-not-allowed'
                  : errors.district
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <option value="">-- اختر حي/منطقة --</option>
              {districtOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            {errors.district && (
              <p className="text-red-600 text-sm">{errors.district}</p>
            )}
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        onClick={handleContinue}
        disabled={isSaving}
        className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition mt-8"
      >
        {isSaving ? 'جاري الحفظ...' : 'متابعة'}
      </button>
    </div>
  );
};

export default Step1BasicInfo;
