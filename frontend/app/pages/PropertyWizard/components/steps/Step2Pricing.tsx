/**
 * Step 2: Pricing
 * Price and rental rate type selection
 */

import React, { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import { PropertyDraft, RENT_RATE_OPTIONS, SALE_PRICE_OPTIONS, RENT_PRICE_OPTIONS, RENT_DAILY_PRICE_OPTIONS, RENT_ANNUAL_PRICE_OPTIONS } from '../../types/wizard.types';

interface Step2PricingProps {
  draft: PropertyDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  onNext: () => void;
  onBack: () => void;
  submitAnswer: (step: any, answer: any) => Promise<any>;
}

export const Step2Pricing: React.FC<Step2PricingProps> = ({
  draft,
  isSaving,
  onNext,
  submitAnswer,
}) => {
  const [rentRateType, setRentRateType] = useState('');
  const [priceInput, setPriceInput] = useState('');
  // Optional negotiation band (SALE only) — used by the AI negotiation engine
  // to decide IN_BAND / BELOW_MIN / ABOVE_MAX when buyers propose a price.
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [bandTouched, setBandTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isRental = draft?.data.listing_type === 'RENT';
  const isSale = draft?.data.listing_type === 'SALE';

  // Determine which price options to show
  let priceOptions = SALE_PRICE_OPTIONS;
  let priceQuestion = 'سعر البيع المتوقع؟ 💰';

  if (isRental) {
    if (rentRateType === 'يومي') {
      priceOptions = RENT_DAILY_PRICE_OPTIONS;
      priceQuestion = 'الإيجار اليومي المتوقع؟ 💰';
    } else if (rentRateType === 'سنوي') {
      priceOptions = RENT_ANNUAL_PRICE_OPTIONS;
      priceQuestion = 'الإيجار السنوي المتوقع؟ 💰';
    } else {
      priceOptions = RENT_PRICE_OPTIONS;
      priceQuestion = 'الإيجار الشهري المتوقع؟ 💰';
    }
  }

  // Load initial data from draft
  useEffect(() => {
    if (!draft) return;
    const data = draft.data;
    if (data.details?.rentRateType) {
      setRentRateType(data.details.rentRateType);
    }
    if (data.price) {
      setPriceInput(data.price.toString());
    }
    if (data.minPrice !== undefined && data.minPrice !== null) {
      setMinPriceInput(String(data.minPrice));
      setBandTouched(true);
    }
    if (data.maxPrice !== undefined && data.maxPrice !== null) {
      setMaxPriceInput(String(data.maxPrice));
      setBandTouched(true);
    }
  }, [draft]);

  // Auto-suggest band defaults (±10%) once the user enters a price.
  // Only fires for SALE listings and only if the user hasn't typed a custom band yet.
  useEffect(() => {
    if (!isSale || bandTouched) return;
    const cleaned = Number(priceInput.replace(/,/g, ''));
    if (!cleaned || isNaN(cleaned) || cleaned <= 0) {
      setMinPriceInput('');
      setMaxPriceInput('');
      return;
    }
    setMinPriceInput(String(Math.round(cleaned * 0.9)));
    setMaxPriceInput(String(Math.round(cleaned * 1.1)));
  }, [priceInput, isSale, bandTouched]);

  const handleContinue = async () => {
    const newErrors: Record<string, string> = {};

    // Validate rent rate type if rental
    if (isRental && !rentRateType) {
      newErrors.rentRateType = 'الرجاء اختيار معدل الإيجار';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Validate negotiation band (SALE only, both fields are optional)
    const parseBand = (v: string): number | null => {
      const trimmed = v.trim();
      if (!trimmed) return null;
      const n = Number(trimmed.replace(/,/g, ''));
      return isNaN(n) || n <= 0 ? NaN : n;
    };
    const minVal = isSale ? parseBand(minPriceInput) : null;
    const maxVal = isSale ? parseBand(maxPriceInput) : null;
    if (Number.isNaN(minVal as number)) newErrors.minPrice = 'الحد الأدنى يجب أن يكون رقماً موجباً';
    if (Number.isNaN(maxVal as number)) newErrors.maxPrice = 'الحد الأقصى يجب أن يكون رقماً موجباً';
    if (
      typeof minVal === 'number' &&
      typeof maxVal === 'number' &&
      !Number.isNaN(minVal) &&
      !Number.isNaN(maxVal) &&
      minVal > maxVal
    ) {
      newErrors.maxPrice = 'الحد الأقصى يجب أن يكون أكبر من الحد الأدنى';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    try {
      // First, if rental, submit the rent rate type as part of details
      if (isRental && rentRateType) {
        // We'll submit this with the price in the details
        // For now, just track it
      }

      // Submit price (with optional negotiation band for SALE listings)
      const priceStr = priceInput.trim();
      const payload: { price: string | number; minPrice?: number; maxPrice?: number } = {
        price: priceStr || 0,
      };
      if (isSale) {
        if (typeof minVal === 'number' && !Number.isNaN(minVal)) payload.minPrice = minVal;
        if (typeof maxVal === 'number' && !Number.isNaN(maxVal)) payload.maxPrice = maxVal;
      }

      // Backend `validatePrice` accepts either a raw value or {price, minPrice, maxPrice}
      await submitAnswer('PRICE', payload);

      onNext();
    } catch (err) {
      // Error already handled by usePropertyDraft
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">حدد السعر ومعدل الإيجار</h2>
        <p className="text-gray-600">
          {isSale
            ? 'اختر سعر البيع أو اتركه فارغاً ليتم تحديده لاحقاً'
            : 'حدد معدل الإيجار والسعر المتوقع'}
        </p>
      </div>

      {/* Rental Rate Type (if rental) */}
      {isRental && (
        <div className="space-y-4 border-b pb-8">
          <label className="block text-lg font-semibold text-gray-900">
            معدل الإيجار
            <span className="text-red-500 ml-1">*</span>
          </label>

          <div className="grid grid-cols-3 gap-3">
            {RENT_RATE_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => {
                  setRentRateType(option);
                  setPriceInput(''); // Reset price when rate changes
                  setErrors((prev) => ({ ...prev, rentRateType: '' }));
                }}
                className={`p-4 rounded-lg border-2 font-bold transition ${
                  rentRateType === option
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {errors.rentRateType && (
            <p className="text-red-600 text-sm">{errors.rentRateType}</p>
          )}
        </div>
      )}

      {/* Price Input */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="text-green-600" size={24} />
          <label className="block text-lg font-semibold text-gray-900">
            {priceQuestion}
          </label>
          <span className="text-gray-500 text-sm">(اختياري)</span>
        </div>

        {/* Preset Options */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">خيارات سريعة:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {priceOptions.map((option) => (
              <button
                key={option}
                onClick={() => {
                  setPriceInput(option);
                  setErrors((prev) => ({ ...prev, price: '' }));
                }}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition text-center ${
                  priceInput === option
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Input */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">أو أدخل سعراً مخصصاً:</p>
          <div className="relative">
            <input
              type="text"
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                setErrors((prev) => ({ ...prev, price: '' }));
              }}
              placeholder="مثلاً: 500000"
              className={`w-full px-4 py-3 rounded-lg border-2 font-medium text-right ${
                errors.price
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-200 bg-white focus:border-blue-600 focus:outline-none'
              }`}
            />
            {priceInput && (
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-600 font-medium">
                جنيه
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            يمكنك ترك هذا فارغاً وتحديد السعر لاحقاً
          </p>
        </div>

        {errors.price && <p className="text-red-600 text-sm">{errors.price}</p>}
      </div>

      {/* Negotiation Band — SALE only */}
      {isSale && (
        <div className="space-y-4 border-t pt-8">
          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-1">
              نطاق التفاوض
              <span className="text-gray-500 text-sm mr-2">(اختياري)</span>
            </label>
            <p className="text-sm text-gray-600">
              لو حضرتك مستعد للتفاوض، حدد أقل سعر تقبله وأقصى سعر تتوقعه. لو سابتها فاضية، النظام
              هيستخدم نطاق ±10٪ من السعر المعلن.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                أقل سعر تقبله
              </label>
              <input
                type="text"
                value={minPriceInput}
                onChange={(e) => {
                  setMinPriceInput(e.target.value);
                  setBandTouched(true);
                  setErrors((prev) => ({ ...prev, minPrice: '' }));
                }}
                placeholder="مثلاً: 450000"
                className={`w-full px-4 py-3 rounded-lg border-2 font-medium text-right ${
                  errors.minPrice
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-white focus:border-blue-600 focus:outline-none'
                }`}
              />
              {errors.minPrice && (
                <p className="text-red-600 text-xs mt-1">{errors.minPrice}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                أقصى سعر تتوقعه
              </label>
              <input
                type="text"
                value={maxPriceInput}
                onChange={(e) => {
                  setMaxPriceInput(e.target.value);
                  setBandTouched(true);
                  setErrors((prev) => ({ ...prev, maxPrice: '' }));
                }}
                placeholder="مثلاً: 550000"
                className={`w-full px-4 py-3 rounded-lg border-2 font-medium text-right ${
                  errors.maxPrice
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-white focus:border-blue-600 focus:outline-none'
                }`}
              />
              {errors.maxPrice && (
                <p className="text-red-600 text-xs mt-1">{errors.maxPrice}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 إذا كان العقار مفتوح للتفاوض، يمكنك تحديد معلومات التفاوض بعد ذلك.
        </p>
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

export default Step2Pricing;
