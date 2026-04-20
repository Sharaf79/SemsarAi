import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  type ReviewResponse,
} from '../../api/onboarding';
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
  SALE_PRICE_PRESETS,
  RENT_MONTHLY_PRESETS,
  RENT_DAILY_PRESETS,
  RENT_ANNUAL_PRESETS,
  STEPS,
} from './constants';
import './wizard.css';

// ───────────────────────────────────────────────────────────
// Progress indicator
// ───────────────────────────────────────────────────────────

const ProgressIndicator: React.FC<{ currentStep: number; totalSteps: number }> = ({
  currentStep,
  totalSteps,
}) => {
  const percent = (currentStep / totalSteps) * 100;
  return (
    <div className="wiz-progress">
      <div className="wiz-progress__bar">
        <div className="wiz-progress__fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="wiz-progress__steps">
        {Array.from({ length: totalSteps }).map((_, i) => {
          const stepNum = i + 1;
          const done = stepNum < currentStep;
          const current = stepNum === currentStep;
          return (
            <React.Fragment key={stepNum}>
              <div className="wiz-progress__step">
                <div
                  className={`wiz-progress__circle${done ? ' wiz-progress__circle--done' : ''}${
                    current ? ' wiz-progress__circle--current' : ''
                  }`}
                >
                  {done ? '✓' : stepNum}
                </div>
              </div>
              {i < totalSteps - 1 && (
                <div
                  className={`wiz-progress__connector${
                    done || current ? ' wiz-progress__connector--done' : ''
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="wiz-progress__labels">
        {STEPS.map((s) => (
          <span key={s.num}>{s.num}. {s.title}</span>
        ))}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Step 1 — Basics (property type + cascading location)
// ───────────────────────────────────────────────────────────

interface StepProps {
  draft: PropertyDraft;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onError: (msg: string) => void;
  onNext: () => void;
  updateDraft: (d: PropertyDraft) => void;
}

const Step1Basics: React.FC<StepProps> = ({ draft, busy, setBusy, onError, onNext, updateDraft }) => {
  const [propertyKey, setPropertyKey] = useState<string>(() => {
    const kind = draft.data.property_type;
    const listing = draft.data.listing_type;
    if (!kind || !listing) return '';
    return (
      Object.keys(PROPERTY_TYPE_MAP).find(
        (k) => PROPERTY_TYPE_MAP[k].kind === kind && PROPERTY_TYPE_MAP[k].listingType === listing,
      ) ?? ''
    );
  });
  const [govId, setGovId] = useState<number | null>(draft.data.governorate_id ?? null);
  const [cityId, setCityId] = useState<number | null>(draft.data.city_id ?? null);
  const [districtId, setDistrictId] = useState<number | null>(draft.data.district_id ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const handleNext = async () => {
    const e: Record<string, string> = {};
    if (!propertyKey) e.propertyKey = 'اختر نوع العقار';
    if (!govId) e.gov = 'اختر محافظة';
    if (!cityId) e.city = 'اختر مدينة';
    if (!cityHasNoDistricts && districts.length > 0 && !districtId) e.district = 'اختر حي/منطقة';

    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});

    try {
      setBusy(true);
      // Walk the state machine in order
      let d = draft;
      if (draft.currentStep === 'PROPERTY_TYPE') {
        d = await submitAnswer(draft.userId, 'PROPERTY_TYPE', propertyKey);
      }
      if (d.currentStep === 'GOVERNORATE' && govId) {
        d = await submitAnswer(draft.userId, 'GOVERNORATE', { id: govId });
      }
      if (d.currentStep === 'CITY' && cityId) {
        d = await submitAnswer(draft.userId, 'CITY', { id: cityId });
      }
      if (d.currentStep === 'DISTRICT' && districtId) {
        d = await submitAnswer(draft.userId, 'DISTRICT', { id: districtId });
      }
      updateDraft(d);
      onNext();
    } catch (err: any) {
      onError(err?.response?.data?.message ?? err?.message ?? 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wiz-card">
      <h2 className="wiz-card__title">اختر نوع العقار والموقع</h2>
      <p className="wiz-card__subtitle">ابدأ بتحديد نوع العقار الذي تريد إضافته وموقعه الجغرافي</p>

      <div className="wiz-card__section">
        <label className="wiz-label">
          نوع العقار<span className="wiz-label__required">*</span>
        </label>
        <div className="wiz-grid-2">
          {Object.keys(PROPERTY_TYPE_MAP).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setPropertyKey(key);
                setErrors((p) => ({ ...p, propertyKey: '' }));
              }}
              className={`wiz-option${propertyKey === key ? ' wiz-option--selected' : ''}`}
            >
              {key}
            </button>
          ))}
        </div>
        {errors.propertyKey && <p className="wiz-error">{errors.propertyKey}</p>}
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">
          المحافظة<span className="wiz-label__required">*</span>
        </label>
        <select
          className={`wiz-select${errors.gov ? ' wiz-select--error' : ''}`}
          value={govId ?? ''}
          onChange={(ev) => {
            setGovId(ev.target.value ? Number(ev.target.value) : null);
            setCityId(null);
            setDistrictId(null);
            setErrors((p) => ({ ...p, gov: '' }));
          }}
        >
          <option value="">-- اختر محافظة --</option>
          {govQuery.data?.governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nameAr}
            </option>
          ))}
        </select>
        {errors.gov && <p className="wiz-error">{errors.gov}</p>}
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">
          المدينة<span className="wiz-label__required">*</span>
        </label>
        <select
          className={`wiz-select${errors.city ? ' wiz-select--error' : ''}`}
          value={cityId ?? ''}
          disabled={!govId}
          onChange={(ev) => {
            setCityId(ev.target.value ? Number(ev.target.value) : null);
            setDistrictId(null);
            setErrors((p) => ({ ...p, city: '' }));
          }}
        >
          <option value="">-- اختر مدينة --</option>
          {cityQuery.data?.cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr}
            </option>
          ))}
        </select>
        {errors.city && <p className="wiz-error">{errors.city}</p>}
      </div>

      {!!cityId && !cityHasNoDistricts && (
        <div className="wiz-card__section">
          <label className="wiz-label">
            الحي / المنطقة<span className="wiz-label__required">*</span>
          </label>
          <select
            className={`wiz-select${errors.district ? ' wiz-select--error' : ''}`}
            value={districtId ?? ''}
            onChange={(ev) => {
              setDistrictId(ev.target.value ? Number(ev.target.value) : null);
              setErrors((p) => ({ ...p, district: '' }));
            }}
          >
            <option value="">-- اختر حي/منطقة --</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameAr}
              </option>
            ))}
          </select>
          {errors.district && <p className="wiz-error">{errors.district}</p>}
        </div>
      )}

      {cityHasNoDistricts && (
        <div className="wiz-alert wiz-alert--info">
          لا توجد أحياء مسجلة لهذه المدينة — سيتم تخطي هذه الخطوة.
        </div>
      )}

      <button type="button" className="wiz-btn wiz-btn--primary wiz-btn--full" disabled={busy} onClick={handleNext}>
        {busy ? 'جاري الحفظ…' : 'متابعة'}
      </button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Step 2 — Pricing
// ───────────────────────────────────────────────────────────

const Step2Pricing: React.FC<StepProps> = ({ draft, busy, setBusy, onError, onNext, updateDraft }) => {
  const isRental = draft.data.listing_type === 'RENT';
  const propertyType = draft.data.property_type;
  const skipsDetails = SKIP_DETAILS_TYPES.includes(propertyType ?? '');

  const [rentRateType, setRentRateType] = useState<string>(draft.data.details?.rentRateType ?? '');
  const [price, setPrice] = useState<string>(draft.data.price != null ? String(draft.data.price) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const presets = useMemo(() => {
    if (!isRental) return SALE_PRICE_PRESETS;
    if (rentRateType === 'يومي') return RENT_DAILY_PRESETS;
    if (rentRateType === 'سنوي') return RENT_ANNUAL_PRESETS;
    return RENT_MONTHLY_PRESETS;
  }, [isRental, rentRateType]);

  const handleNext = async () => {
    const e: Record<string, string> = {};
    if (isRental && !rentRateType) e.rate = 'اختر معدل الإيجار';

    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});

    try {
      setBusy(true);
      let d = draft;

      // If the user chose a rent rate, stash it via details so step 3 can merge it in.
      // But backend requires DETAILS to be submitted as a complete object (with area_m2).
      // Because the state machine goes GOVERNORATE → CITY → DISTRICT → PROPERTY_TYPE → DETAILS → PRICE,
      // and we're already past DISTRICT, we are sitting on either PROPERTY_TYPE, DETAILS, or PRICE.
      // We'll handle rate type by keeping it locally and only send it as part of DETAILS in step 3.
      // For SKIP_DETAILS types we still need to send PRICE here.

      // Some properties bypass DETAILS — make sure we submit PRICE in that case.
      if (d.currentStep === 'PRICE') {
        const numeric = price.trim() ? Number(price.replace(/,/g, '')) : 0;
        d = await submitAnswer(draft.userId, 'PRICE', numeric);
      }
      // For non-skip types with rent, preserve rentRateType for step 3 in local state (persisted via details in step 3).
      // We stash it via a lightweight closure on updateDraft:
      if (isRental && rentRateType) {
        d = {
          ...d,
          data: {
            ...d.data,
            details: { ...(d.data.details ?? { area_m2: 0 }), rentRateType },
          },
        };
      }
      // Also retain the entered price locally so step 5 review shows it for SALE before details step submits
      if (price.trim()) {
        d = { ...d, data: { ...d.data, price: Number(price.replace(/,/g, '')) } };
      }

      updateDraft(d);
      onNext();
    } catch (err: any) {
      onError(err?.response?.data?.message ?? err?.message ?? 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wiz-card">
      <h2 className="wiz-card__title">حدد السعر ومعدل الإيجار</h2>
      <p className="wiz-card__subtitle">
        {isRental ? 'اختر معدل الإيجار والسعر المتوقع' : 'اختر سعر البيع أو اتركه فارغاً ليتم تحديده لاحقاً'}
      </p>

      {isRental && (
        <div className="wiz-card__section">
          <label className="wiz-label">
            معدل الإيجار<span className="wiz-label__required">*</span>
          </label>
          <div className="wiz-grid-3">
            {RENT_RATE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setRentRateType(opt);
                  setPrice('');
                  setErrors((p) => ({ ...p, rate: '' }));
                }}
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

        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>خيارات سريعة:</p>
        <div className="wiz-grid-4">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPrice(String(p.value))}
              className={`wiz-option${price === String(p.value) ? ' wiz-option--selected' : ''}`}
              style={{ textAlign: 'center' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: '#6b7280', margin: '16px 0 8px' }}>أو أدخل سعراً مخصصاً:</p>
        <input
          type="text"
          inputMode="numeric"
          value={price}
          onChange={(ev) => setPrice(ev.target.value)}
          placeholder="مثلاً: 500000"
          className="wiz-input"
        />
      </div>

      <div className="wiz-alert wiz-alert--info">💡 يمكنك ترك السعر فارغاً وتحديده لاحقاً.</div>

      <button type="button" className="wiz-btn wiz-btn--primary wiz-btn--full" disabled={busy} onClick={handleNext}>
        {busy ? 'جاري الحفظ…' : skipsDetails ? 'متابعة للصور' : 'متابعة'}
      </button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Step 3 — Details
// ───────────────────────────────────────────────────────────

const Step3Details: React.FC<StepProps> = ({ draft, busy, setBusy, onError, onNext, updateDraft }) => {
  const isRental = draft.data.listing_type === 'RENT';
  const propertyType = draft.data.property_type;
  const skipsDetails = SKIP_DETAILS_TYPES.includes(propertyType ?? '');

  const existing = draft.data.details ?? null;
  const [area, setArea] = useState<string>(existing?.area_m2 ? String(existing.area_m2) : '');
  const [bedrooms, setBedrooms] = useState<string>(existing?.bedrooms != null ? String(existing.bedrooms) : '');
  const [bathrooms, setBathrooms] = useState<string>(
    existing?.bathrooms != null ? String(existing.bathrooms) : '',
  );
  const [apartmentType, setApartmentType] = useState<string>(existing?.apartmentType ?? '');
  const [ownership, setOwnership] = useState<string>(existing?.ownershipType ?? '');
  const [readiness, setReadiness] = useState<string>(existing?.readiness ?? '');
  const [deliveryDate, setDeliveryDate] = useState<string>(existing?.deliveryDate ?? '');
  const [finishing, setFinishing] = useState<string>(existing?.finishingType ?? '');
  const [floor, setFloor] = useState<string>(existing?.floorLevel ?? '');
  const [furnished, setFurnished] = useState<boolean | null>(existing?.isFurnished ?? null);
  const [adTitle, setAdTitle] = useState<string>(existing?.adTitle ?? '');
  const [adDescription, setAdDescription] = useState<string>(existing?.adDescription ?? '');
  const [amenities, setAmenities] = useState<string>(existing?.amenities?.parsed ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (skipsDetails) {
    // Auto-advance: no details needed for this property type
    return (
      <div className="wiz-card">
        <div className="wiz-alert wiz-alert--info">
          هذا النوع من العقارات لا يتطلب تفاصيل شقة. تخطي تلقائي…
        </div>
        <button className="wiz-btn wiz-btn--primary wiz-btn--full" onClick={onNext}>
          متابعة للصور
        </button>
      </div>
    );
  }

  const handleNext = async () => {
    const e: Record<string, string> = {};
    if (!area || Number(area) <= 0) e.area = 'أدخل مساحة صحيحة (أكثر من 0)';

    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});

    try {
      setBusy(true);
      let d = draft;

      // Submit DETAILS if we're on that step
      if (d.currentStep === 'DETAILS') {
        const rentRateType = d.data.details?.rentRateType ?? null;
        const payload = {
          area_m2: Number(area),
          bedrooms: bedrooms ? Number(bedrooms) : null,
          bathrooms: bathrooms ? Number(bathrooms) : null,
          apartmentType: apartmentType || null,
          rentRateType,
          ownershipType: isRental ? null : ownership || null,
          readiness: readiness || null,
          deliveryDate: deliveryDate || null,
          finishingType: finishing || null,
          floorLevel: floor || null,
          isFurnished: furnished,
          adTitle: adTitle || null,
          adDescription: adDescription || null,
          amenities: amenities.trim() ? { parsed: amenities.trim() } : null,
          lat: d.data.details?.lat ?? null,
          lng: d.data.details?.lng ?? null,
        };
        d = await submitAnswer(draft.userId, 'DETAILS', payload);
      }

      // If we're on PRICE step now, submit price too (user may have entered it in step 2)
      if (d.currentStep === 'PRICE') {
        const stashedPrice = d.data.price;
        d = await submitAnswer(draft.userId, 'PRICE', stashedPrice ?? 0);
      }

      updateDraft(d);
      onNext();
    } catch (err: any) {
      onError(err?.response?.data?.message ?? err?.message ?? 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wiz-card">
      <h2 className="wiz-card__title">تفاصيل العقار</h2>
      <p className="wiz-card__subtitle">أخبرنا بمزيد من التفاصيل عن العقار</p>

      <div className="wiz-card__section">
        <label className="wiz-label">
          المساحة (م²)<span className="wiz-label__required">*</span>
        </label>
        <input
          type="number"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="مثلاً: 120"
          className={`wiz-input${errors.area ? ' wiz-input--error' : ''}`}
        />
        {errors.area && <p className="wiz-error">{errors.area}</p>}
      </div>

      <div className="wiz-card__section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label className="wiz-label">عدد الغرف</label>
          <input
            type="number"
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            placeholder="مثلاً: 3"
            className="wiz-input"
          />
        </div>
        <div>
          <label className="wiz-label">عدد الحمامات</label>
          <input
            type="number"
            value={bathrooms}
            onChange={(e) => setBathrooms(e.target.value)}
            placeholder="مثلاً: 2"
            className="wiz-input"
          />
        </div>
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">نوع الوحدة</label>
        <select className="wiz-select" value={apartmentType} onChange={(e) => setApartmentType(e.target.value)}>
          <option value="">-- اختر --</option>
          {(isRental ? RENT_APARTMENT_TYPES : APARTMENT_TYPES).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {!isRental && (
        <div className="wiz-card__section">
          <label className="wiz-label">نوع الملكية</label>
          <select className="wiz-select" value={ownership} onChange={(e) => setOwnership(e.target.value)}>
            <option value="">-- اختر --</option>
            {OWNERSHIP_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="wiz-card__section">
        <label className="wiz-label">حالة العقار</label>
        <select className="wiz-select" value={readiness} onChange={(e) => setReadiness(e.target.value)}>
          <option value="">-- اختر --</option>
          {READINESS_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {readiness === 'قيد الإنشاء' && (
        <div className="wiz-card__section">
          <label className="wiz-label">تاريخ التسليم المتوقع</label>
          <input
            type="text"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            placeholder="مثلاً: يونيو 2026"
            className="wiz-input"
          />
        </div>
      )}

      <div className="wiz-card__section">
        <label className="wiz-label">نوع التشطيب</label>
        <select className="wiz-select" value={finishing} onChange={(e) => setFinishing(e.target.value)}>
          <option value="">-- اختر --</option>
          {FINISHING_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">الطابق</label>
        <select className="wiz-select" value={floor} onChange={(e) => setFloor(e.target.value)}>
          <option value="">-- اختر --</option>
          {FLOOR_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">هل العقار مفروش؟</label>
        <div className="wiz-grid-2">
          <button
            type="button"
            onClick={() => setFurnished(true)}
            className={`wiz-option${furnished === true ? ' wiz-option--selected' : ''}`}
          >
            نعم
          </button>
          <button
            type="button"
            onClick={() => setFurnished(false)}
            className={`wiz-option${furnished === false ? ' wiz-option--selected' : ''}`}
          >
            لا
          </button>
        </div>
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">عنوان الإعلان</label>
        <input
          type="text"
          value={adTitle}
          maxLength={200}
          onChange={(e) => setAdTitle(e.target.value)}
          placeholder="مثلاً: شقة فاخرة بمصر الجديدة"
          className="wiz-input"
        />
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">وصف العقار</label>
        <textarea
          value={adDescription}
          onChange={(e) => setAdDescription(e.target.value)}
          placeholder="صف العقار وميزاته بالتفصيل…"
          rows={4}
          className="wiz-textarea"
        />
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">الكماليات (اختياري)</label>
        <textarea
          value={amenities}
          onChange={(e) => setAmenities(e.target.value)}
          placeholder="مثلاً: جراج، أمن 24/7، حديقة، مسبح"
          rows={2}
          className="wiz-textarea"
        />
      </div>

      <button type="button" className="wiz-btn wiz-btn--primary wiz-btn--full" disabled={busy} onClick={handleNext}>
        {busy ? 'جاري الحفظ…' : 'متابعة'}
      </button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Step 4 — Media & Location
// ───────────────────────────────────────────────────────────

const Step4Media: React.FC<StepProps> = ({ draft, busy, setBusy, onError, onNext, updateDraft }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<{ url: string; name: string }[]>([]);
  const [lat, setLat] = useState<number | null>(draft.data.details?.lat ?? null);
  const [lng, setLng] = useState<number | null>(draft.data.details?.lng ?? null);
  const [geoError, setGeoError] = useState<string>('');

  const handleFiles = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(ev.target.files ?? []);
    if (!picked.length) return;
    setBusy(true);
    try {
      for (const f of picked) {
        const { url } = await uploadFile(f);
        const type = f.type.startsWith('video') ? 'VIDEO' : 'IMAGE';
        await attachMedia(draft.userId, url, type);
        setUploaded((prev) => [...prev, { url, name: f.name }]);
      }
      setFiles((prev) => [...prev, ...picked]);
    } catch (err: any) {
      onError(err?.response?.data?.message ?? err?.message ?? 'فشل رفع الملفات');
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

  const handleNext = async () => {
    try {
      setBusy(true);
      let d = draft;
      if (d.currentStep === 'MEDIA') {
        d = await submitAnswer(draft.userId, 'MEDIA', { media_skipped: uploaded.length === 0 });
      }
      // Persist lat/lng locally (there's no dedicated step for them server-side; details step is already submitted)
      if (lat != null && lng != null) {
        d = {
          ...d,
          data: { ...d.data, details: { ...(d.data.details ?? { area_m2: 0 }), lat, lng } },
        };
      }
      updateDraft(d);
      onNext();
    } catch (err: any) {
      onError(err?.response?.data?.message ?? err?.message ?? 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wiz-card">
      <h2 className="wiz-card__title">أضف صور وحدد الموقع</h2>
      <p className="wiz-card__subtitle">الصور والموقع يساعدان على جذب المشترين والمستأجرين</p>

      {geoError && <div className="wiz-alert wiz-alert--warning">{geoError}</div>}

      <div className="wiz-card__section">
        <label className="wiz-label">📷 الصور والفيديوهات</label>
        <label className="wiz-dropzone" htmlFor="wiz-file-input">
          <div className="wiz-dropzone__icon">⬆️</div>
          <p className="wiz-dropzone__text">اضغط لاختيار الملفات</p>
          <p className="wiz-dropzone__hint">صور JPG/PNG أو فيديو MP4 — حد أقصى 20 MB للملف</p>
          <input
            id="wiz-file-input"
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFiles}
            style={{ display: 'none' }}
            disabled={busy}
          />
        </label>

        {files.length > 0 && (
          <div className="wiz-media-list">
            {files.map((f, i) => (
              <div key={i} className="wiz-media-item">
                <span>{f.name}</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>✓ تم الرفع</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wiz-card__section">
        <label className="wiz-label">📍 موقع العقار</label>
        <button type="button" className="wiz-btn wiz-btn--danger wiz-btn--full" onClick={getLocation}>
          احصل على موقعي
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div>
            <label className="wiz-label" style={{ fontSize: 13 }}>خط العرض</label>
            <input
              type="number"
              step="0.00001"
              value={lat ?? ''}
              onChange={(e) => setLat(e.target.value ? Number(e.target.value) : null)}
              placeholder="30.0444"
              className="wiz-input"
            />
          </div>
          <div>
            <label className="wiz-label" style={{ fontSize: 13 }}>خط الطول</label>
            <input
              type="number"
              step="0.00001"
              value={lng ?? ''}
              onChange={(e) => setLng(e.target.value ? Number(e.target.value) : null)}
              placeholder="31.2357"
              className="wiz-input"
            />
          </div>
        </div>

        {lat != null && lng != null && (
          <div style={{ marginTop: 12 }}>
            <div className="wiz-alert wiz-alert--success">
              ✓ تم تحديد الموقع: ({lat.toFixed(5)}, {lng.toFixed(5)})
            </div>
            <iframe
              title="map"
              width="100%"
              height="240"
              style={{ border: 0, borderRadius: 10 }}
              src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
            />
          </div>
        )}
      </div>

      <button type="button" className="wiz-btn wiz-btn--primary wiz-btn--full" disabled={busy} onClick={handleNext}>
        {busy ? 'جاري الحفظ…' : 'متابعة للمراجعة'}
      </button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Step 5 — Review & Submit
// ───────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  APARTMENT: 'شقة',
  VILLA: 'فيلا',
  SHOP: 'محل',
  OFFICE: 'مكتب',
  SUMMER_RESORT: 'مصيف',
  COMMERCIAL: 'تجاري',
  LAND_BUILDING: 'مبانى/أراضى',
};

const Step5Review: React.FC<{
  draft: PropertyDraft;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onError: (msg: string) => void;
  onBack: () => void;
  updateDraft: (d: PropertyDraft) => void;
}> = ({ draft, busy, setBusy, onError, onBack }) => {
  const navigate = useNavigate();
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [paymentCreditId, setPaymentCreditId] = useState<string | null>(null);

  useEffect(() => {
    getReview(draft.userId)
      .then(setReview)
      .catch((err) => onError(err?.response?.data?.message ?? err?.message ?? 'فشل تحميل المراجعة'));
  }, [draft.userId, onError]);

  const handleSubmit = async () => {
    try {
      setBusy(true);
      const prop = await finalSubmit(draft.userId);
      setSubmitted(prop);
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      if (status === 403 && body?.creditId) {
        setPaymentCreditId(body.creditId);
        onError(body.message ?? 'يجب دفع 100 جنيه لنشر هذا العقار');
      } else {
        onError(body?.message ?? err?.message ?? 'فشل النشر');
      }
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="wiz-success">
        <div className="wiz-success__icon">🎉</div>
        <h2 className="wiz-success__title">تم نشر عقارك بنجاح!</h2>
        <p className="wiz-success__message">يمكنك متابعة عقارك في قسم إعلاناتي</p>
        <button className="wiz-btn wiz-btn--success" onClick={() => navigate(`/property/${submitted.id}`)}>
          عرض العقار
        </button>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="wiz-loading">
        <div className="wiz-spinner" />
        <p>جاري تحميل البيانات…</p>
      </div>
    );
  }

  const d = review.data;
  const det = d.details;

  return (
    <div>
      {paymentCreditId && (
        <div className="wiz-alert wiz-alert--warning">
          يجب دفع رسوم النشر أولاً.{' '}
          <button
            className="wiz-btn wiz-btn--primary"
            style={{ padding: '6px 14px', fontSize: 13, marginRight: 8 }}
            onClick={() => navigate(`/listing-payment/${paymentCreditId}`)}
          >
            اذهب لصفحة الدفع
          </button>
        </div>
      )}

      {!review.isComplete && (
        <div className="wiz-alert wiz-alert--warning">
          ⚠️ بعض الحقول المطلوبة ناقصة: {review.missingFields.join(', ')}
        </div>
      )}

      <div className="wiz-review-grid">
        <div className="wiz-review-card">
          <div className="wiz-review-card__head">
            <div>
              <p className="wiz-review-card__label">نوع العقار</p>
              <p className="wiz-review-card__value">{KIND_LABEL[d.property_type ?? ''] ?? d.property_type}</p>
            </div>
          </div>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {d.listing_type === 'SALE' ? 'للبيع' : 'للإيجار'}
          </p>
        </div>

        <div className="wiz-review-card wiz-review-card--green">
          <p className="wiz-review-card__label">الموقع</p>
          <p className="wiz-review-card__value">
            {d.governorate_name ?? '—'}
            {d.city_name ? ` — ${d.city_name}` : ''}
          </p>
          {d.district_name && <p style={{ color: '#6b7280', margin: '4px 0 0' }}>{d.district_name}</p>}
        </div>

        <div className="wiz-review-card wiz-review-card--yellow">
          <p className="wiz-review-card__label">السعر</p>
          <p className="wiz-review-card__value">
            {d.price ? new Intl.NumberFormat('ar-EG').format(d.price) + ' جنيه' : 'لم يحدد'}
          </p>
          {det?.rentRateType && <p style={{ color: '#6b7280', margin: '4px 0 0' }}>/ {det.rentRateType}</p>}
        </div>

        {det?.area_m2 && (
          <div className="wiz-review-card wiz-review-card--purple">
            <p className="wiz-review-card__label">المساحة</p>
            <p className="wiz-review-card__value">{det.area_m2} م²</p>
            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
              {det.bedrooms ? `🛏️ ${det.bedrooms} غرف ` : ''}
              {det.bathrooms ? `🚿 ${det.bathrooms} حمام` : ''}
            </div>
          </div>
        )}
      </div>

      {det && (
        <div className="wiz-review-details">
          <h3 style={{ margin: '0 0 16px' }}>التفاصيل الكاملة</h3>
          <div className="wiz-review-details__grid">
            {det.apartmentType && <DetailItem label="نوع الوحدة" value={det.apartmentType} />}
            {det.ownershipType && <DetailItem label="نوع الملكية" value={det.ownershipType} />}
            {det.rentRateType && <DetailItem label="معدل الإيجار" value={det.rentRateType} />}
            {det.readiness && <DetailItem label="الحالة" value={det.readiness} />}
            {det.deliveryDate && <DetailItem label="موعد التسليم" value={det.deliveryDate} />}
            {det.finishingType && <DetailItem label="التشطيب" value={det.finishingType} />}
            {det.floorLevel && <DetailItem label="الطابق" value={det.floorLevel} />}
            {det.isFurnished !== null && det.isFurnished !== undefined && (
              <DetailItem label="مفروش" value={det.isFurnished ? 'نعم' : 'لا'} />
            )}
          </div>
          {det.adTitle && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
              <p style={{ color: '#6b7280', margin: '0 0 4px', fontSize: 13 }}>عنوان الإعلان</p>
              <p style={{ margin: 0, fontWeight: 600 }}>{det.adTitle}</p>
            </div>
          )}
          {det.adDescription && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: '#6b7280', margin: '0 0 4px', fontSize: 13 }}>الوصف</p>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{det.adDescription}</p>
            </div>
          )}
        </div>
      )}

      <div className="wiz-nav">
        <button className="wiz-btn wiz-btn--secondary" onClick={onBack} disabled={busy}>
          العودة للتعديل
        </button>
        <button
          className="wiz-btn wiz-btn--success"
          onClick={handleSubmit}
          disabled={busy || !review.isComplete}
          style={{ marginRight: 'auto' }}
        >
          {busy ? '⏳ جاري النشر…' : '✅ تأكيد ونشر'}
        </button>
      </div>
    </div>
  );
};

const DetailItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="wiz-review-details__item">
    <p>{label}</p>
    <p>{value}</p>
  </div>
);

// ───────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────

export const AddPropertyWizardPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<PropertyDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }
    startOrResumeDraft(user.id, false)
      .then((d) => {
        setDraft(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.response?.data?.message ?? err?.message ?? 'تعذر بدء المسودة');
        setLoading(false);
      });
  }, [isAuthenticated, user, navigate]);

  const handleRestart = async () => {
    if (!user) return;
    if (!confirm('هل تريد إعادة تعيين النموذج والبدء من جديد؟')) return;
    try {
      setBusy(true);
      const fresh = await startOrResumeDraft(user.id, true);
      setDraft(fresh);
      setStep(1);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="wiz-page">
        <Header onLoginClick={() => {}} />
        <div className="wiz-loading">
          <div className="wiz-spinner" />
          <p>جاري التحميل…</p>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="wiz-page">
        <Header onLoginClick={() => {}} />
        <div className="wiz-main">
          <div className="wiz-alert wiz-alert--error">{error || 'تعذر تحميل المسودة'}</div>
        </div>
      </div>
    );
  }

  const commonProps = {
    draft,
    busy,
    setBusy,
    onError: (msg: string) => setError(msg),
    onNext: () => setStep((s) => Math.min(s + 1, STEPS.length)),
    updateDraft: (d: PropertyDraft) => setDraft(d),
  };

  return (
    <div className="wiz-page">
      <Header onLoginClick={() => {}} />

      <div className="wiz-header">
        <div className="wiz-header__inner">
          <div className="wiz-header__top">
            <div>
              <h1 className="wiz-header__title">إضافة عقار جديد</h1>
              <p className="wiz-header__subtitle">{STEPS[step - 1]?.description}</p>
            </div>
            <div className="wiz-header__step-counter">الخطوة {step} من {STEPS.length}</div>
          </div>
          <ProgressIndicator currentStep={step} totalSteps={STEPS.length} />
        </div>
      </div>

      <div className="wiz-main">
        {error && (
          <div className="wiz-alert wiz-alert--error">
            ⚠️ {error}
            <button
              onClick={() => setError('')}
              style={{
                marginRight: 12,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontFamily: 'inherit',
              }}
            >
              إخفاء
            </button>
          </div>
        )}

        {step === 1 && <Step1Basics {...commonProps} />}
        {step === 2 && <Step2Pricing {...commonProps} />}
        {step === 3 && <Step3Details {...commonProps} />}
        {step === 4 && <Step4Media {...commonProps} />}
        {step === 5 && <Step5Review {...commonProps} onBack={() => setStep(4)} />}

        {step < 5 && (
          <div className="wiz-nav">
            <button
              className="wiz-btn wiz-btn--secondary"
              disabled={step === 1 || busy}
              onClick={() => setStep((s) => Math.max(s - 1, 1))}
            >
              ← الخطوة السابقة
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={handleRestart}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6b7280',
              fontSize: 13,
              textDecoration: 'underline',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            إعادة تعيين النموذج
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddPropertyWizardPage;
