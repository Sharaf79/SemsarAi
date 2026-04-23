/**
 * Step 4: Media & Location
 * Image/video upload and map location picker
 */

import React, { useState } from 'react';
import { Upload, MapPin, Trash2 } from 'lucide-react';
import { PropertyDraft, PropertyMediaItem } from '../../types/wizard.types';

interface Step4MediaProps {
  draft: PropertyDraft | null;
  isLoading: boolean;
  isSaving: boolean;
  onNext: () => void;
  onBack: () => void;
  submitAnswer: (step: any, answer: any) => Promise<any>;
}

export const Step4Media: React.FC<Step4MediaProps> = ({
  draft,
  isSaving,
  onNext,
  submitAnswer,
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [latitude, setLatitude] = useState<number | null>(draft?.data.details?.lat || null);
  const [longitude, setLongitude] = useState<number | null>(draft?.data.details?.lng || null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    setUploadError('');

    try {
      // Here you would upload files to the server
      // For now, just track them locally
      setUploadedFiles((prev) => [...prev, ...files]);
    } catch (error) {
      setUploadError('فشل تحميل الملفات. الرجاء حاول مجدداً.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
        },
        (error) => {
          setUploadError('لم نتمكن من الوصول إلى موقعك. الرجاء تفعيل خدمات الموقع.');
        },
      );
    } else {
      setUploadError('متصفحك لا يدعم خدمات الموقع');
    }
  };

  const handleContinue = async () => {
    try {
      // Submit media skip (actual file uploads would happen in parallel)
      await submitAnswer('MEDIA', { media_skipped: uploadedFiles.length === 0 });

      // If location was set, update details with coordinates
      if (latitude && longitude) {
        // This would be updated as part of details
      }

      onNext();
    } catch (err) {
      // Error handled by usePropertyDraft
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">أضف صور ووحدد الموقع</h2>
        <p className="text-gray-600">
          صور العقار والموقع يساعدان على جذب المشترين والمستأجرين
        </p>
      </div>

      {/* Error Alert */}
      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{uploadError}</p>
        </div>
      )}

      {/* File Upload Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="text-blue-600" size={24} />
          <h3 className="text-xl font-semibold text-gray-900">الصور والفيديوهات</h3>
        </div>

        {/* Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer">
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer block">
            <Upload className="mx-auto text-gray-400 mb-2" size={32} />
            <p className="text-gray-600 font-medium">
              {isUploading ? 'جاري التحميل...' : 'اسحب الملفات هنا أو اضغط للاختيار'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              صور JPG, PNG أو فيديوهات MP4 (حد أقصى 20 MB لكل ملف)
            </p>
          </label>
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-gray-900">
              {uploadedFiles.length} ملف تم تحميله:
            </p>
            <div className="space-y-2">
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-sm text-gray-600">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadedFiles.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            لم يتم تحميل أي ملفات حتى الآن
          </p>
        )}
      </div>

      {/* Location Section */}
      <div className="space-y-4 border-t pt-8">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="text-red-600" size={24} />
          <h3 className="text-xl font-semibold text-gray-900">موقع العقار على الخريطة</h3>
        </div>

        {/* Get Location Button */}
        <button
          onClick={getCurrentLocation}
          className="w-full px-4 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition"
        >
          📍 احصل على موقعي
        </button>

        {/* Manual Input */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">خط العرض</label>
            <input
              type="number"
              step="0.00001"
              value={latitude || ''}
              onChange={(e) => setLatitude(e.target.value ? Number(e.target.value) : null)}
              placeholder="مثلاً: 30.0444"
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 text-sm text-right"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">خط الطول</label>
            <input
              type="number"
              step="0.00001"
              value={longitude || ''}
              onChange={(e) => setLongitude(e.target.value ? Number(e.target.value) : null)}
              placeholder="مثلاً: 31.2357"
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 bg-white focus:border-blue-600 text-sm text-right"
            />
          </div>
        </div>

        {latitude && longitude && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 text-sm font-medium">
              ✓ تم تحديد الموقع: ({latitude.toFixed(5)}, {longitude.toFixed(5)})
            </p>
          </div>
        )}

        {/* Map Preview */}
        {latitude && longitude && (
          <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center overflow-hidden">
            <iframe
              width="100%"
              height="100%"
              style={{ border: 'none' }}
              src={`https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`}
            />
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 يمكنك إضافة الصور والموقع الآن أو تركها فارغة والإضافة لاحقاً
        </p>
      </div>

      {/* Action Button */}
      <button
        onClick={handleContinue}
        disabled={isSaving || isUploading}
        className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition mt-8"
      >
        {isSaving ? 'جاري الحفظ...' : 'متابعة للمراجعة'}
      </button>
    </div>
  );
};

export default Step4Media;
