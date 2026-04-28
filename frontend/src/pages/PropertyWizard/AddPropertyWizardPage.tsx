import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../store/AuthContext';
import { Header } from '../../components/Header';
import {
  startOrResumeDraft,
  submitAnswer,
  getReview,
  finalSubmit,
  uploadFile,
  attachMedia,
  type PropertyDraft,
} from '../../api/onboarding';
import { completeListingCredit } from '../../api/listingCredits';
import { getGovernorates, getCities, getDistricts } from '../../api/locations';
import {
  PROPERTY_TYPE_MAP,
  SKIP_DETAILS_TYPES,
  APARTMENT_TYPES,
  RENT_APARTMENT_TYPES,
  RENT_RATE_OPTIONS,
  OWNERSHIP_OPTIONS,
  READINESS_OPTIONS,
  FINISHING_OPTIONS,
  FLOOR_OPTIONS,
} from './constants';
import './wizard.css';

const KIND_LABEL: Record<string, string> = {
  APARTMENT: 'شقة',
  VILLA: 'فيلا',
  SHOP: 'محل',
  OFFICE: 'مكتب',
  SUMMER_RESORT: 'مصيف',
  COMMERCIAL: 'تجاري',
  LAND_BUILDING: 'مبانى/أراضى',
};

// ───────────────────────────────────────────────────────────
// Inline Payment Modal (unchanged behavior)
// ───────────────────────────────────────────────────────────

const PaymentModal: React.FC<{
  creditId: string;
  userId: string;
  onSuccess: (propertyId: string) => void;
  onCancel: () => void;
}> = ({ creditId, userId, onSuccess, onCancel }) => {
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const handlePay = async () => {
    try {
      setPaying(true);
      setPayError('');
      await completeListingCredit(creditId);
      const prop = await finalSubmit(userId);
      onSuccess(prop.id);
    } catch (err: any) {
      setPayError(err?.response?.data?.message ?? err?.message ?? 'فشل الدفع');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, direction: 'rtl',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, padding: '32px 28px',
        maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>رسوم نشر الإعلان</h2>
        <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: 14 }}>
          يتم تحصيل رسوم رمزية لنشر إعلانك وضمان جودة المحتوى
        </p>
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
          padding: '16px 20px', marginBottom: 24,
        }}>
          <p style={{ margin: 0, fontSize: 14, color: '#166534' }}>رسوم النشر</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#15803d' }}>
            ١٠٠ جنيه
          </p>
        </div>
        {payError && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 14,
          }}>
            ⚠️ {payError}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="wiz-btn wiz-btn--success"
            onClick={handlePay}
            disabled={paying}
            style={{ width: '100%', fontSize: 16, padding: '12px 24px' }}
          >
            {paying ? 'جاري الدفع…' : '💳 ادفع ١٠٠ جنيه'}
          </button>
          <button className="wiz-btn wiz-btn--secondary" onClick={onCancel} disabled={paying} style={{ width: '100%' }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Main page — single-page form
// ───────────────────────────────────────────────────────────

export const AddPropertyWizardPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<PropertyDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── All form state lifted here ────────────────────────────
  const [propertyKey, setPropertyKey] = useState<string>('');
  const [govId, setGovId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);

  const [rentRateType, setRentRateType] = useState<string>('');
  const [price, setPrice] = useState<string>('');

  const [area, setArea] = useState<string>('');
  const [bedrooms, setBedrooms] = useState<string>('');
  const [bathrooms, setBathrooms] = useState<string>('');
  const [apartmentType, setApartmentType] = useState<string>('');
  const [ownership, setOwnership] = useState<string>('');
  const [readiness, setReadiness] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [finishing, setFinishing] = useState<string>('');
  const [floor, setFloor] = useState<string>('');
  const [furnished, setFurnished] = useState<boolean | null>(null);
  const [isNegotiable, setIsNegotiable] = useState<boolean | null>(null);
  const [aiNegotiationEnabled, setAiNegotiationEnabled] = useState<boolean | null>(null);
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [adTitle, setAdTitle] = useState<string>('');
  const [adDescription, setAdDescription] = useState<string>('');
  const [amenities, setAmenities] = useState<string>('');

  const [uploadedFiles, setUploadedFiles] = useState<{ url: string; name: string }[]>([]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string>('');

  const [paymentCreditId, setPaymentCreditId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; pendingReview: boolean } | null>(null);

  // ── Derived flags ─────────────────────────────────────────
  const meta = propertyKey ? PROPERTY_TYPE_MAP[propertyKey] : null;
  const isRental = meta?.listingType === 'RENT';
  const skipsDetails = SKIP_DETAILS_TYPES.includes(meta?.kind ?? '');

  // ── Location queries ──────────────────────────────────────
  const govQuery = useQuery({ queryKey: ['locations', 'governorates'], queryFn: getGovernorates });
  const cityQuery = useQuery({
    queryKey: ['locations', 'cities', govId],
    queryFn: () => getCities(govId!),
    enabled: !!govId,
  });
  const districtQuery = useQuery({
    queryKey: ['locations', 'districts', cityId],
    queryFn: () => getDistricts(cityId!),
    enabled: !!cityId,
  });
  const districts = districtQuery.data?.districts ?? [];
  const cityHasNoDistricts = !!cityId && !districtQuery.isLoading && districts.length === 0;

  // ── Init / resume draft and hydrate state ─────────────────
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }
    if (searchParams.get('reset') === 'true') {
      searchParams.delete('reset');
      setSearchParams(searchParams, { replace: true });
    }
    // Always start fresh on visit — discard any in-progress draft
    startOrResumeDraft(user.id, true)
      .then((d) => {
        setDraft(d);
        // Hydrate inputs from draft.data so resumed sessions don't start blank
        const data = d.data;
        if (data.property_type && data.listing_type) {
          const key = Object.keys(PROPERTY_TYPE_MAP).find(
            (k) => PROPERTY_TYPE_MAP[k].kind === data.property_type && PROPERTY_TYPE_MAP[k].listingType === data.listing_type,
          );
          if (key) setPropertyKey(key);
        }
        if (data.governorate_id) setGovId(data.governorate_id);
        if (data.city_id) setCityId(data.city_id);
        if (data.district_id) setDistrictId(data.district_id);
        if (data.price != null) setPrice(String(data.price));
        const det = data.details;
        if (det) {
          if (det.area_m2) setArea(String(det.area_m2));
          if (det.bedrooms != null) setBedrooms(String(det.bedrooms));
          if (det.bathrooms != null) setBathrooms(String(det.bathrooms));
          if (det.apartmentType) setApartmentType(det.apartmentType);
          if (det.rentRateType) setRentRateType(det.rentRateType);
          if (det.ownershipType) setOwnership(det.ownershipType);
          if (det.readiness) setReadiness(det.readiness);
          if (det.deliveryDate) setDeliveryDate(det.deliveryDate);
          if (det.finishingType) setFinishing(det.finishingType);
          if (det.floorLevel) setFloor(det.floorLevel);
          if (det.isFurnished != null) setFurnished(det.isFurnished);
          if (det.isNegotiable != null) setIsNegotiable(det.isNegotiable);
          if (det.aiNegotiationEnabled != null) setAiNegotiationEnabled(det.aiNegotiationEnabled);
          if (det.minPrice != null) setMinPrice(String(det.minPrice));
          if (det.maxPrice != null) setMaxPrice(String(det.maxPrice));
          if (det.adTitle) setAdTitle(det.adTitle);
          if (det.adDescription) setAdDescription(det.adDescription);
          if (det.amenities?.parsed) setAmenities(det.amenities.parsed);
          if (det.lat != null) setLat(det.lat);
          if (det.lng != null) setLng(det.lng);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.response?.data?.message ?? err?.message ?? 'تعذر بدء المسودة');
        setLoading(false);
      });
  }, [isAuthenticated, user, navigate]);

  // ── Media handlers ────────────────────────────────────────
  const handleFiles = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    if (!draft) return;
    const picked = Array.from(ev.target.files ?? []);
    if (!picked.length) return;
    setBusy(true);
    try {
      for (const f of picked) {
        const { url } = await uploadFile(f);
        const type = f.type.startsWith('video') ? 'VIDEO' : 'IMAGE';
        await attachMedia(draft.userId, url, type);
        setUploadedFiles((prev) => [...prev, { url, name: f.name }]);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'فشل رفع الملفات');
    } finally {
      setBusy(false);
    }
  };

  const getLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('المتصفح لا يدعم خدمات الموقع');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoError('');
      },
      () => setGeoError('تعذر قراءة موقعك. فعّل خدمات الموقع وحاول مرة أخرى.'),
    );
  };

  const presets = useMemo(() => {
    if (!isRental) return null;
    return rentRateType;
  }, [isRental, rentRateType]);
  void presets;

  // ── Validation ────────────────────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!propertyKey) e.propertyKey = 'اختر نوع العقار';
    if (!govId) e.gov = 'اختر محافظة';
    if (!cityId) e.city = 'اختر مدينة';
    if (!cityHasNoDistricts && districts.length > 0 && !districtId) e.district = 'اختر حي/منطقة';
    if (isRental && !rentRateType) e.rate = 'اختر معدل الإيجار';
    if (!skipsDetails && (!area || Number(area) <= 0)) e.area = 'أدخل مساحة صحيحة';
    if (aiNegotiationEnabled === true) {
      const minNum = minPrice.trim() ? Number(minPrice.replace(/,/g, '')) : NaN;
      const maxNum = maxPrice.trim() ? Number(maxPrice.replace(/,/g, '')) : NaN;
      if (!minPrice.trim() || isNaN(minNum) || minNum <= 0) e.minPrice = 'أدخل الحد الأدنى للسعر';
      if (!maxPrice.trim() || isNaN(maxNum) || maxNum <= 0) e.maxPrice = 'أدخل الحد الأقصى للسعر';
      if (!isNaN(minNum) && !isNaN(maxNum) && maxNum < minNum) e.maxPrice = 'الحد الأقصى يجب أن يكون أكبر من الحد الأدنى';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Final submit walks the state machine in order ─────────
  const handleSubmit = async () => {
    if (!draft || !user) return;
    if (!validate()) return;

    setBusy(true);
    setError('');
    try {
      let d = draft;

      const submitIfStep = async (step: PropertyDraft['currentStep'], answer: unknown) => {
        if (d.currentStep === step) {
          d = await submitAnswer(d.userId, step, answer);
        }
      };

      await submitIfStep('PROPERTY_TYPE', propertyKey);
      if (govId) await submitIfStep('GOVERNORATE', { id: govId });
      if (cityId) await submitIfStep('CITY', { id: cityId });
      if (districtId) await submitIfStep('DISTRICT', { id: districtId });

      if (!skipsDetails) {
        const detailsPayload = {
          area_m2: Number(area),
          bedrooms: bedrooms ? Number(bedrooms) : null,
          bathrooms: bathrooms ? Number(bathrooms) : null,
          apartmentType: apartmentType || null,
          rentRateType: isRental ? (rentRateType || null) : null,
          ownershipType: isRental ? null : (ownership || null),
          readiness: readiness || null,
          deliveryDate: deliveryDate || null,
          finishingType: finishing || null,
          floorLevel: floor || null,
          isFurnished: furnished,
          isNegotiable: isNegotiable,
          aiNegotiationEnabled: aiNegotiationEnabled,
          minPrice: aiNegotiationEnabled === true && minPrice.trim() ? Number(minPrice.replace(/,/g, '')) : null,
          maxPrice: aiNegotiationEnabled === true && maxPrice.trim() ? Number(maxPrice.replace(/,/g, '')) : null,
          hidePhone: aiNegotiationEnabled === true,
          adTitle: adTitle || null,
          adDescription: adDescription || null,
          amenities: amenities.trim() ? { parsed: amenities.trim() } : null,
          lat,
          lng,
        };
        await submitIfStep('DETAILS', detailsPayload);
      }

      const numericPrice = price.trim() ? Number(price.replace(/,/g, '')) : null;
      await submitIfStep('PRICE', numericPrice);

      await submitIfStep('MEDIA', { media_skipped: uploadedFiles.length === 0 });

      // Confirm review is complete then finalize
      const review = await getReview(d.userId);
      if (!review.isComplete) {
        setError(`بعض الحقول المطلوبة ناقصة: ${review.missingFields.join(', ')}`);
        setDraft(d);
        return;
      }

      const prop = await finalSubmit(d.userId);
      setSubmitted({ id: prop.id, pendingReview: false });
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      if (status === 403 && body?.creditId) {
        setPaymentCreditId(body.creditId);
        setShowPaymentModal(true);
      } else {
        setError(body?.message ?? err?.message ?? 'فشل النشر');
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentSuccess = (propertyId: string) => {
    setShowPaymentModal(false);
    setSubmitted({ id: propertyId, pendingReview: true });
  };

  const handleRestart = async () => {
    if (!user) return;
    if (!confirm('هل تريد إعادة تعيين النموذج والبدء من جديد؟')) return;
    try {
      setBusy(true);
      const fresh = await startOrResumeDraft(user.id, true);
      setDraft(fresh);
      // Reset all local state
      setPropertyKey(''); setGovId(null); setCityId(null); setDistrictId(null);
      setRentRateType(''); setPrice('');
      setArea(''); setBedrooms(''); setBathrooms(''); setApartmentType('');
      setOwnership(''); setReadiness(''); setDeliveryDate(''); setFinishing('');
      setFloor(''); setFurnished(null); setIsNegotiable(null); setAdTitle(''); setAdDescription(''); setAmenities('');
      setAiNegotiationEnabled(null); setMinPrice(''); setMaxPrice('');
      setUploadedFiles([]); setLat(null); setLng(null);
      setError(''); setErrors({});
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  // ── Loading / success states ──────────────────────────────
  if (loading) {
    return (
      <div className="wiz-page">
        <Header onLoginClick={() => {}} />
        <div className="wiz-loading"><div className="wiz-spinner" /><p>جاري التحميل…</p></div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="wiz-page">
        <Header onLoginClick={() => {}} />
        <div className="wiz-main"><div className="wiz-alert wiz-alert--error">{error || 'تعذر تحميل المسودة'}</div></div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="wiz-page">
        <Header onLoginClick={() => {}} />
        <div className="wiz-main">
          <div className="wiz-success">
            <div className="wiz-success__icon">{submitted.pendingReview ? '⏳' : '🎉'}</div>
            <h2 className="wiz-success__title">
              {submitted.pendingReview ? 'تم إرسال إعلانك!' : 'تم نشر عقارك بنجاح!'}
            </h2>
            <p className="wiz-success__message">
              {submitted.pendingReview ? 'سيتم نشر الاعلان بعد المراجعه' : 'يمكنك متابعة عقارك في قسم إعلاناتي'}
            </p>
            <button
              className="wiz-btn wiz-btn--success"
              onClick={() => navigate(submitted.pendingReview ? '/' : `/property/${submitted.id}`)}
            >
              {submitted.pendingReview ? 'العودة للصفحة الرئيسية' : 'عرض العقار'}
            </button>
            <button
              className="wiz-btn wiz-btn--secondary"
              onClick={() => { window.location.href = '/properties/add?reset=true'; }}
              style={{ marginTop: 8 }}
            >
              ➕ أضف إعلاناً آخر
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Single-page form ──────────────────────────────────────
  return (
    <div className="wiz-page">
      <Header onLoginClick={() => {}} />

      {showPaymentModal && paymentCreditId && (
        <PaymentModal
          creditId={paymentCreditId}
          userId={draft.userId}
          onSuccess={handlePaymentSuccess}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}

      <div className="wiz-header">
        <div className="wiz-header__inner">
          <div className="wiz-header__top">
            <div>
              <h1 className="wiz-header__title">إضافة عقار جديد</h1>
              <p className="wiz-header__subtitle">املأ كل البيانات في صفحة واحدة ثم اضغط نشر</p>
            </div>
          </div>
        </div>
      </div>

      <div className="wiz-main">
        {error && (
          <div className="wiz-alert wiz-alert--error">
            ⚠️ {error}
            <button
              onClick={() => setError('')}
              style={{ marginRight: 12, background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
            >
              إخفاء
            </button>
          </div>
        )}

        {/* ── Section 1: Basics ─────────────────────────── */}
        <div className="wiz-card">
          <h2 className="wiz-card__title">نوع العقار والموقع</h2>

          <div className="wiz-card__section">
            <label className="wiz-label">نوع العقار<span className="wiz-label__required">*</span></label>
            <select
              className={`wiz-select${errors.propertyKey ? ' wiz-select--error' : ''}`}
              value={propertyKey}
              onChange={(ev) => setPropertyKey(ev.target.value)}
            >
              <option value="">-- اختر نوع العقار --</option>
              {Object.keys(PROPERTY_TYPE_MAP).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
            {errors.propertyKey && <p className="wiz-error">{errors.propertyKey}</p>}
          </div>

          <div className="wiz-card__section">
            <label className="wiz-label">المحافظة<span className="wiz-label__required">*</span></label>
            <select
              className={`wiz-select${errors.gov ? ' wiz-select--error' : ''}`}
              value={govId ?? ''}
              onChange={(ev) => {
                setGovId(ev.target.value ? Number(ev.target.value) : null);
                setCityId(null); setDistrictId(null);
              }}
            >
              <option value="">-- اختر محافظة --</option>
              {govQuery.data?.governorates.map((g) => (
                <option key={g.id} value={g.id}>{g.nameAr}</option>
              ))}
            </select>
            {errors.gov && <p className="wiz-error">{errors.gov}</p>}
          </div>

          <div className="wiz-card__section">
            <label className="wiz-label">المدينة<span className="wiz-label__required">*</span></label>
            <select
              className={`wiz-select${errors.city ? ' wiz-select--error' : ''}`}
              value={cityId ?? ''}
              disabled={!govId}
              onChange={(ev) => {
                setCityId(ev.target.value ? Number(ev.target.value) : null);
                setDistrictId(null);
              }}
            >
              <option value="">-- اختر مدينة --</option>
              {cityQuery.data?.cities.map((c) => (
                <option key={c.id} value={c.id}>{c.nameAr}</option>
              ))}
            </select>
            {errors.city && <p className="wiz-error">{errors.city}</p>}
          </div>

          {!!cityId && !cityHasNoDistricts && (
            <div className="wiz-card__section">
              <label className="wiz-label">الحي / المنطقة<span className="wiz-label__required">*</span></label>
              <select
                className={`wiz-select${errors.district ? ' wiz-select--error' : ''}`}
                value={districtId ?? ''}
                onChange={(ev) => setDistrictId(ev.target.value ? Number(ev.target.value) : null)}
              >
                <option value="">-- اختر حي/منطقة --</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>{d.nameAr}</option>
                ))}
              </select>
              {errors.district && <p className="wiz-error">{errors.district}</p>}
            </div>
          )}

          {cityHasNoDistricts && (
            <div className="wiz-alert wiz-alert--info">لا توجد أحياء مسجلة لهذه المدينة.</div>
          )}
        </div>

        {/* ── Section 2: Pricing ───────────────────────── */}
        <div className="wiz-card">
          <h2 className="wiz-card__title">السعر</h2>

          {isRental && (
            <div className="wiz-card__section">
              <label className="wiz-label">معدل الإيجار<span className="wiz-label__required">*</span></label>
              <div className="wiz-grid-3">
                {RENT_RATE_OPTIONS.map((opt) => (
                  <button
                    key={opt} type="button"
                    onClick={() => setRentRateType(opt)}
                    className={`wiz-option${rentRateType === opt ? ' wiz-option--selected' : ''}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {errors.rate && <p className="wiz-error">{errors.rate}</p>}
            </div>
          )}

          <div className="wiz-card__section">
            <label className="wiz-label">
              السعر المتوقع <span style={{ color: '#9ca3af', fontWeight: 400 }}>(اختياري)</span>
            </label>
            <input
              type="text"
              value={price}
              onChange={(ev) => setPrice(ev.target.value)}
              placeholder="أدخل السعر (مثلاً: 500000)"
              className="wiz-input"
            />
          </div>
          <div className="wiz-card__section">
            <label className="wiz-label">قابل للتفاوض؟</label>
            <div className="wiz-options-row">
              <button type="button" onClick={() => setIsNegotiable(true)} className={`wiz-option${isNegotiable === true ? ' wiz-option--selected' : ''}`}>✅ نعم</button>
              <button type="button" onClick={() => setIsNegotiable(false)} className={`wiz-option${isNegotiable === false ? ' wiz-option--selected' : ''}`}>🚫 لا</button>
            </div>
          </div>

          <div className="wiz-alert wiz-alert--info">💡 يمكنك ترك السعر فارغاً وتحديده لاحقاً.</div>

          {/* ── AI Negotiation ─────────────────────────── */}
          <div className="wiz-card__section">
            <label className="wiz-label">هل تريد أن يتفاوض الذكاء الاصطناعي نيابةً عنك؟</label>
            <div className="wiz-options-row">
              <button
                type="button"
                onClick={() => setAiNegotiationEnabled(true)}
                className={`wiz-option${aiNegotiationEnabled === true ? ' wiz-option--selected' : ''}`}
              >
                🤖 نعم، تفاوض بالنيابة عني
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiNegotiationEnabled(false);
                  setMinPrice('');
                  setMaxPrice('');
                }}
                className={`wiz-option${aiNegotiationEnabled === false ? ' wiz-option--selected' : ''}`}
              >
                🚫 لا، سأتفاوض بنفسي
              </button>
            </div>
          </div>

          {aiNegotiationEnabled === true && (
            <>
              <div className="wiz-card__section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="wiz-label">
                    الحد الأدنى للسعر (جنيه)<span className="wiz-label__required">*</span>
                  </label>
                  <input
                    type="text"
                    value={minPrice}
                    onChange={(ev) => setMinPrice(ev.target.value)}
                    placeholder="مثلاً: 2000000"
                    className={`wiz-input${errors.minPrice ? ' wiz-input--error' : ''}`}
                  />
                  {errors.minPrice && <p className="wiz-error">{errors.minPrice}</p>}
                </div>
                <div>
                  <label className="wiz-label">
                    الحد الأقصى للسعر (جنيه)<span className="wiz-label__required">*</span>
                  </label>
                  <input
                    type="text"
                    value={maxPrice}
                    onChange={(ev) => setMaxPrice(ev.target.value)}
                    placeholder="مثلاً: 2500000"
                    className={`wiz-input${errors.maxPrice ? ' wiz-input--error' : ''}`}
                  />
                  {errors.maxPrice && <p className="wiz-error">{errors.maxPrice}</p>}
                </div>
              </div>

              <div className="wiz-alert wiz-alert--info">
                🔒 لحماية خصوصيتك، سيتم إخفاء رقم هاتفك أثناء التفاوض. سيتواصل المشتري معك عبر سمسار AI فقط.
              </div>
            </>
          )}

          {aiNegotiationEnabled === false && (
            <div className="wiz-alert wiz-alert--info">
              📞 سيتم عرض رقم هاتفك في الإعلان ليتواصل المشترون معك مباشرةً.
            </div>
          )}
        </div>

        {/* ── Section 3: Details ───────────────────────── */}
        {!skipsDetails && (
          <div className="wiz-card">
            <h2 className="wiz-card__title">تفاصيل العقار</h2>

            <div className="wiz-card__section">
              <label className="wiz-label">المساحة (م²)<span className="wiz-label__required">*</span></label>
              <input
                type="number" value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="مثلاً: 120"
                className={`wiz-input${errors.area ? ' wiz-input--error' : ''}`}
              />
              {errors.area && <p className="wiz-error">{errors.area}</p>}
            </div>

            <div className="wiz-card__section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="wiz-label">عدد الغرف</label>
                <input type="number" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder="مثلاً: 3" className="wiz-input" />
              </div>
              <div>
                <label className="wiz-label">عدد الحمامات</label>
                <input type="number" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} placeholder="مثلاً: 2" className="wiz-input" />
              </div>
            </div>

            <div className="wiz-card__section">
              <label className="wiz-label">نوع الوحدة</label>
              <select className="wiz-select" value={apartmentType} onChange={(e) => setApartmentType(e.target.value)}>
                <option value="">-- اختر --</option>
                {(isRental ? RENT_APARTMENT_TYPES : APARTMENT_TYPES).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {!isRental && (
              <div className="wiz-card__section">
                <label className="wiz-label">نوع الملكية</label>
                <select className="wiz-select" value={ownership} onChange={(e) => setOwnership(e.target.value)}>
                  <option value="">-- اختر --</option>
                  {OWNERSHIP_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            <div className="wiz-card__section">
              <label className="wiz-label">حالة العقار</label>
              <select className="wiz-select" value={readiness} onChange={(e) => setReadiness(e.target.value)}>
                <option value="">-- اختر --</option>
                {READINESS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {readiness === 'قيد الإنشاء' && (
              <div className="wiz-card__section">
                <label className="wiz-label">تاريخ التسليم المتوقع</label>
                <input type="text" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} placeholder="مثلاً: يونيو 2026" className="wiz-input" />
              </div>
            )}

            <div className="wiz-card__section">
              <label className="wiz-label">نوع التشطيب</label>
              <select className="wiz-select" value={finishing} onChange={(e) => setFinishing(e.target.value)}>
                <option value="">-- اختر --</option>
                {FINISHING_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="wiz-card__section">
              <label className="wiz-label">الطابق</label>
              <select className="wiz-select" value={floor} onChange={(e) => setFloor(e.target.value)}>
                <option value="">-- اختر --</option>
                {FLOOR_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="wiz-card__section">
              <label className="wiz-label">هل العقار مفروش؟</label>
              <div className="wiz-grid-2">
                <button type="button" onClick={() => setFurnished(true)} className={`wiz-option${furnished === true ? ' wiz-option--selected' : ''}`}>نعم</button>
                <button type="button" onClick={() => setFurnished(false)} className={`wiz-option${furnished === false ? ' wiz-option--selected' : ''}`}>لا</button>
              </div>
            </div>

            <div className="wiz-card__section">
              <label className="wiz-label">عنوان الإعلان</label>
              <input type="text" value={adTitle} maxLength={200} onChange={(e) => setAdTitle(e.target.value)} placeholder="مثلاً: شقة فاخرة بمصر الجديدة" className="wiz-input" />
            </div>

            <div className="wiz-card__section">
              <label className="wiz-label">وصف العقار</label>
              <textarea value={adDescription} onChange={(e) => setAdDescription(e.target.value)} placeholder="صف العقار وميزاته بالتفصيل…" rows={4} className="wiz-textarea" />
            </div>

            <div className="wiz-card__section">
              <label className="wiz-label">الكماليات (اختياري)</label>
              <textarea value={amenities} onChange={(e) => setAmenities(e.target.value)} placeholder="مثلاً: جراج، أمن 24/7، حديقة، مسبح" rows={2} className="wiz-textarea" />
            </div>
          </div>
        )}

        {/* ── Section 4: Media & geo ───────────────────── */}
        <div className="wiz-card">
          <h2 className="wiz-card__title">الصور والموقع</h2>

          {geoError && <div className="wiz-alert wiz-alert--warning">{geoError}</div>}

          <div className="wiz-card__section">
            <label className="wiz-label">📷 الصور والفيديوهات ({uploadedFiles.length}/10)</label>

            {/* 10-slot visual photo grid */}
            <div className="wiz-photo-grid">
              {Array.from({ length: 10 }).map((_, slotIdx) => {
                const file = uploadedFiles[slotIdx];
                return (
                  <div key={slotIdx} className={`wiz-photo-slot ${file ? 'wiz-photo-slot--filled' : ''}`}>
                    {file ? (
                      <>
                        <img src={file.url} alt={file.name} className="wiz-photo-slot__img" />
                        <div className="wiz-photo-slot__badge">{slotIdx + 1}</div>
                        <button
                          type="button"
                          className="wiz-photo-slot__remove"
                          title="حذف الصورة"
                          onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== slotIdx))}
                          disabled={busy}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <div className="wiz-photo-slot__empty">
                        <span className="wiz-photo-slot__number">{slotIdx + 1}</span>
                        <span className="wiz-photo-slot__plus">+</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Upload button — hidden input triggered by visible button */}
            <input
              id="wiz-file-input" type="file" multiple accept="image/*,video/*"
              onChange={handleFiles} style={{ display: 'none' }} disabled={busy || uploadedFiles.length >= 10}
            />
            <label
              htmlFor="wiz-file-input"
              className={`wiz-btn wiz-btn--full ${uploadedFiles.length >= 10 ? 'wiz-btn--disabled' : 'wiz-btn--outline'}`}
              style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: uploadedFiles.length >= 10 ? 'not-allowed' : 'pointer', opacity: uploadedFiles.length >= 10 ? 0.5 : 1 }}
            >
              ⬆️ {uploadedFiles.length >= 10 ? 'وصلت للحد الأقصى (10 صور)' : 'اضغط لاختيار الصور'}
            </label>
            <p className="wiz-dropzone__hint" style={{ marginTop: 6 }}>صور JPG/PNG أو فيديو MP4 — حد أقصى 20 MB للملف</p>
          </div>

          <div className="wiz-card__section">
            <label className="wiz-label">📍 موقع العقار</label>
            <button type="button" className="wiz-btn wiz-btn--danger wiz-btn--full" onClick={getLocation}>
              احصل على موقعي
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label className="wiz-label" style={{ fontSize: 13 }}>خط العرض</label>
                <input type="number" step="0.00001" value={lat ?? ''} onChange={(e) => setLat(e.target.value ? Number(e.target.value) : null)} placeholder="30.0444" className="wiz-input" />
              </div>
              <div>
                <label className="wiz-label" style={{ fontSize: 13 }}>خط الطول</label>
                <input type="number" step="0.00001" value={lng ?? ''} onChange={(e) => setLng(e.target.value ? Number(e.target.value) : null)} placeholder="31.2357" className="wiz-input" />
              </div>
            </div>

            {lat != null && lng != null && (
              <div style={{ marginTop: 12 }}>
                <div className="wiz-alert wiz-alert--success">
                  ✓ تم تحديد الموقع: ({lat.toFixed(5)}, {lng.toFixed(5)})
                </div>
                <iframe
                  title="map" width="100%" height="240"
                  style={{ border: 0, borderRadius: 10 }}
                  src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Live summary ─────────────────────────────── */}
        {propertyKey && (
          <div className="wiz-card">
            <h2 className="wiz-card__title">ملخص الإعلان</h2>
            <div className="wiz-review-grid">
              <div className="wiz-review-card">
                <p className="wiz-review-card__label">نوع العقار</p>
                <p className="wiz-review-card__value">{KIND_LABEL[meta?.kind ?? ''] ?? meta?.kind}</p>
                <p style={{ color: '#6b7280', margin: 0 }}>{meta?.listingType === 'SALE' ? 'للبيع' : 'للإيجار'}</p>
              </div>
              {price && (
                <div className="wiz-review-card wiz-review-card--yellow">
                  <p className="wiz-review-card__label">السعر</p>
                  <p className="wiz-review-card__value">{new Intl.NumberFormat('ar-EG').format(Number(price.replace(/,/g, '')))} جنيه</p>
                  {rentRateType && <p style={{ color: '#6b7280', margin: '4px 0 0' }}>/ {rentRateType}</p>}
                </div>
              )}
              {area && (
                <div className="wiz-review-card wiz-review-card--purple">
                  <p className="wiz-review-card__label">المساحة</p>
                  <p className="wiz-review-card__value">{area} م²</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Submit ───────────────────────────────────── */}
        <div className="wiz-nav">
          <button
            className="wiz-btn wiz-btn--success"
            onClick={handleSubmit}
            disabled={busy}
            style={{ marginRight: 'auto' }}
          >
            {busy ? '⏳ جاري النشر…' : '✅ نشر الإعلان'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={handleRestart}
            style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            إعادة تعيين النموذج
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddPropertyWizardPage;
