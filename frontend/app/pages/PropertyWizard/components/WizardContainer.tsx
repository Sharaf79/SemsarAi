/**
 * WizardContainer Component
 * Main layout for the multi-step form wizard
 */

import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronLeft, Save } from 'lucide-react';
import { PropertyDraft, OnboardingStep } from '../types/wizard.types';
import usePropertyDraft from '../hooks/usePropertyDraft';
import ProgressIndicator from './ProgressIndicator';
import Step1BasicInfo from './steps/Step1BasicInfo';
import Step2Pricing from './steps/Step2Pricing';
import Step3Details from './steps/Step3Details';
import Step4Media from './steps/Step4Media';
import Step5Review from './steps/Step5Review';

interface WizardContainerProps {
  userId: string;
  onSuccess?: (property: any) => void;
  onError?: (error: string) => void;
}

const STEPS = [
  { num: 1, title: 'البيانات الأساسية', description: 'نوع العقار والموقع' },
  { num: 2, title: 'السعر', description: 'السعر ومعدل الإيجار' },
  { num: 3, title: 'التفاصيل', description: 'المساحة والمرافق' },
  { num: 4, title: 'الصور والخريطة', description: 'إضافة صور وتحديد الموقع' },
  { num: 5, title: 'المراجعة', description: 'تأكيد البيانات' },
];

export const WizardContainer: React.FC<WizardContainerProps> = ({
  userId,
  onSuccess,
  onError,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [savedMessage, setSavedMessage] = useState('');

  const {
    draft,
    isLoading,
    isSaving,
    error,
    submitAnswer,
    getReview,
    editField,
    submitProperty,
    restartDraft,
    setError,
  } = usePropertyDraft({
    userId,
    onSuccess,
    onError,
  });

  const handleNext = useCallback(async () => {
    if (currentStep < STEPS.length) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSaveDraft = useCallback(async () => {
    setSavedMessage('جاري الحفظ...');
    try {
      // Simulate save (data is already saved per step)
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSavedMessage('تم الحفظ بنجاح ✓');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      setSavedMessage('فشل الحفظ');
      setTimeout(() => setSavedMessage(''), 3000);
    }
  }, []);

  const handleRestart = useCallback(async () => {
    if (window.confirm('هل أنت متأكد من رغبتك في إعادة تعيين النموذج؟')) {
      await restartDraft();
      setCurrentStep(1);
    }
  }, [restartDraft]);

  const renderStep = () => {
    const props = {
      draft,
      isLoading,
      isSaving,
      onNext: handleNext,
      onBack: handleBack,
    };

    switch (currentStep) {
      case 1:
        return <Step1BasicInfo {...props} submitAnswer={submitAnswer} />;
      case 2:
        return <Step2Pricing {...props} submitAnswer={submitAnswer} />;
      case 3:
        return <Step3Details {...props} submitAnswer={submitAnswer} />;
      case 4:
        return <Step4Media {...props} submitAnswer={submitAnswer} />;
      case 5:
        return (
          <Step5Review
            {...props}
            getReview={getReview}
            editField={editField}
            submitProperty={submitProperty}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">إضافة عقار جديد</h1>
              <p className="text-gray-600 text-sm mt-1">
                {STEPS[currentStep - 1]?.description}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">
                الخطوة {currentStep} من {STEPS.length}
              </p>
            </div>
          </div>

          {/* Progress Indicator */}
          <ProgressIndicator currentStep={currentStep} totalSteps={STEPS.length} />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-medium">⚠️ {error}</p>
            <button
              onClick={() => setError(null)}
              className="text-sm text-red-600 hover:text-red-800 mt-2"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Success Message */}
        {savedMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 font-medium">{savedMessage}</p>
          </div>
        )}

        {/* Form Content */}
        {isLoading && !draft ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">جاري التحميل...</p>
            </div>
          </div>
        ) : (
          <>
            {renderStep()}

            {/* Navigation Buttons */}
            <div className="mt-12 flex justify-between items-center">
              <button
                onClick={handleBack}
                disabled={currentStep === 1 || isSaving}
                className="flex items-center gap-2 px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition"
              >
                <ChevronLeft size={20} />
                الخطوة السابقة
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg font-medium transition"
                >
                  <Save size={20} />
                  حفظ مسودة
                </button>

                {currentStep < STEPS.length && (
                  <button
                    onClick={handleNext}
                    disabled={isLoading || isSaving}
                    className="flex items-center gap-2 px-6 py-3 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition"
                  >
                    الخطوة التالية
                    <ChevronRight size={20} />
                  </button>
                )}
              </div>
            </div>

            {/* Restart Option */}
            <div className="mt-8 text-center">
              <button
                onClick={handleRestart}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                إعادة تعيين النموذج
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WizardContainer;
