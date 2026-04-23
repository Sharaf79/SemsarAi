/**
 * Step 5: Review & Submit
 * Summary of collected data with edit option
 */

import React, { useState, useEffect } from 'react';
import { Edit2, Check, AlertCircle } from 'lucide-react';
import { PropertyDraft, ReviewData, OnboardingStep } from '../../types/wizard.types';

interface Step5ReviewProps {
  draft: PropertyDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  onNext: () => void;
  onBack: () => void;
  getReview: () => Promise<ReviewData | null>;
  editField: (step: OnboardingStep) => Promise<any>;
  submitProperty: () => Promise<any>;
}

export const Step5Review: React.FC<Step5ReviewProps> = ({
  draft,
  isLoading,
  isSaving,
  getReview,
  editField,
  submitProperty,
  onBack,
}) => {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Load review data
  useEffect(() => {
    const loadReview = async () => {
      const data = await getReview();
      setReviewData(data);
    };
    loadReview();
  }, [getReview]);

  const handleEdit = async (step: OnboardingStep) => {
    await editField(step);
    // Would navigate back to that step
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await submitProperty();
      setSubmitSuccess(true);
    } catch (error: any) {
      if (error.code === 'PAYMENT_REQUIRED') {
        setSubmitError(error.message || 'يجب دفع 100 جنيه لنشر هذا العقار');
        // Would show payment modal here
      } else {
        setSubmitError('فشل في نشر العقار. الرجاء حاول مجدداً.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center space-y-6">
        <div className="bg-green-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto">
          <Check className="text-green-600" size={40} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            🎉 تم إضافة عقارك بنجاح!
          </h2>
          <p className="text-gray-600 mb-4">
            يمكنك الآن متابعة العقار في قسم العقارات الخاصة بك
          </p>
        </div>
        <button
          onClick={() => (window.location.href = '/properties')}
          className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700"
        >
          اذهب إلى العقارات
        </button>
      </div>
    );
  }

  if (isLoading || !reviewData) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">جاري تحميل البيانات...</p>
      </div>
    );
  }

  const data = reviewData.data;
  const details = data.details;

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-red-800 font-medium">خطأ</p>
              <p className="text-red-700 text-sm mt-1">{submitError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Warning for missing fields */}
      {!reviewData.isComplete && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 font-medium">
            ⚠️ بعض الحقول المطلوبة غير مكتملة
          </p>
          <ul className="text-yellow-700 text-sm mt-2 list-disc list-inside">
            {reviewData.missingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Property Type Card */}
        <div className="bg-white rounded-lg shadow-sm p-6 border-r-4 border-blue-600">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-600 text-sm">نوع العقار</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.property_type === 'APARTMENT'
                  ? 'شقة'
                  : data.property_type === 'VILLA'
                    ? 'فيلا'
                    : 'عقار'}
              </p>
            </div>
            <button
              onClick={() => handleEdit('PROPERTY_TYPE')}
              className="text-blue-600 hover:bg-blue-50 p-2 rounded"
            >
              <Edit2 size={18} />
            </button>
          </div>
          <p className="text-gray-600">
            للـ {data.listing_type === 'SALE' ? 'بيع' : 'إيجار'}
          </p>
        </div>

        {/* Location Card */}
        <div className="bg-white rounded-lg shadow-sm p-6 border-r-4 border-green-600">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-600 text-sm">الموقع</p>
              <p className="text-lg font-bold text-gray-900">
                {data.city_name}, {data.governorate_name}
              </p>
            </div>
            <button
              onClick={() => handleEdit('GOVERNORATE')}
              className="text-blue-600 hover:bg-blue-50 p-2 rounded"
            >
              <Edit2 size={18} />
            </button>
          </div>
          {data.district_name && (
            <p className="text-gray-600">في {data.district_name}</p>
          )}
        </div>

        {/* Price Card */}
        <div className="bg-white rounded-lg shadow-sm p-6 border-r-4 border-yellow-600">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-600 text-sm">السعر</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.price
                  ? new Intl.NumberFormat('ar-EG').format(data.price)
                  : 'لم يتم تحديده'}
              </p>
            </div>
            <button
              onClick={() => handleEdit('PRICE')}
              className="text-blue-600 hover:bg-blue-50 p-2 rounded"
            >
              <Edit2 size={18} />
            </button>
          </div>
          {data.details?.rentRateType && (
            <p className="text-gray-600">/ {data.details.rentRateType}</p>
          )}
        </div>

        {/* Area Card */}
        {details?.area_m2 && (
          <div className="bg-white rounded-lg shadow-sm p-6 border-r-4 border-purple-600">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-gray-600 text-sm">المساحة</p>
                <p className="text-2xl font-bold text-gray-900">
                  {details.area_m2} م²
                </p>
              </div>
              <button
                onClick={() => handleEdit('DETAILS')}
                className="text-blue-600 hover:bg-blue-50 p-2 rounded"
              >
                <Edit2 size={18} />
              </button>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              {details.bedrooms && <p>🛏️ {details.bedrooms} غرفة</p>}
              {details.bathrooms && <p>🚿 {details.bathrooms} حمام</p>}
            </div>
          </div>
        )}
      </div>

      {/* Detailed Information */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">التفاصيل الكاملة</h3>

        {details && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {details.apartmentType && (
              <div>
                <p className="text-gray-600">نوع الوحدة</p>
                <p className="font-medium text-gray-900">{details.apartmentType}</p>
              </div>
            )}
            {details.ownershipType && (
              <div>
                <p className="text-gray-600">نوع الملكية</p>
                <p className="font-medium text-gray-900">{details.ownershipType}</p>
              </div>
            )}
            {details.rentRateType && (
              <div>
                <p className="text-gray-600">معدل الإيجار</p>
                <p className="font-medium text-gray-900">{details.rentRateType}</p>
              </div>
            )}
            {details.readiness && (
              <div>
                <p className="text-gray-600">حالة العقار</p>
                <p className="font-medium text-gray-900">{details.readiness}</p>
              </div>
            )}
            {details.finishingType && (
              <div>
                <p className="text-gray-600">التشطيب</p>
                <p className="font-medium text-gray-900">{details.finishingType}</p>
              </div>
            )}
            {details.floorLevel && (
              <div>
                <p className="text-gray-600">الطابق</p>
                <p className="font-medium text-gray-900">{details.floorLevel}</p>
              </div>
            )}
          </div>
        )}

        {details?.adTitle && (
          <div className="pt-4 border-t">
            <p className="text-gray-600 text-sm">عنوان الإعلان</p>
            <p className="font-medium text-gray-900">{details.adTitle}</p>
          </div>
        )}

        {details?.adDescription && (
          <div>
            <p className="text-gray-600 text-sm">الوصف</p>
            <p className="text-gray-900 whitespace-pre-wrap">{details.adDescription}</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-8">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 px-6 py-3 bg-gray-200 text-gray-900 font-bold rounded-lg hover:bg-gray-300 disabled:opacity-50 transition"
        >
          العودة للتعديل
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !reviewData.isComplete}
          className="flex-1 px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isSubmitting ? '⏳ جاري النشر...' : '✅ تأكيد ونشر'}
        </button>
      </div>
    </div>
  );
};

export default Step5Review;
