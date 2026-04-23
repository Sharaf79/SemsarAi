/**
 * ProgressIndicator Component
 * Visual progress bar and step indicators
 */

import React from 'react';
import { Check } from 'lucide-react';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentStep,
  totalSteps,
}) => {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step Indicators */}
      <div className="flex justify-between items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <div key={stepNum} className="flex-1 flex items-center">
              {/* Step Circle */}
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center transition-all ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                      : 'bg-gray-300 text-gray-700'
                }`}
              >
                {isCompleted ? <Check size={20} /> : stepNum}
              </div>

              {/* Connector Line */}
              {index < totalSteps - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-all ${
                    isCompleted || isCurrent ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Labels */}
      <div className="flex justify-between text-xs font-medium text-gray-600">
        <span>1. الأساسيات</span>
        <span>2. السعر</span>
        <span>3. التفاصيل</span>
        <span>4. الصور</span>
        <span>5. المراجعة</span>
      </div>
    </div>
  );
};

export default ProgressIndicator;
