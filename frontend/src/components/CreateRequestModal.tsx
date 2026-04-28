import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  createRequest,
  type CreateRequestPayload,
  type RequestIntent,
} from '../api/requests';
import {
  getGovernorates,
  getCities,
  getDistricts,
} from '../api/locations';
import type { LocationItem } from '../types';

/* ── Selected location chip ──────────────────────────────── */
interface SelectedLocation {
  id: number;
  label: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateRequestModal({ isOpen, onClose, onCreated }: Props) {
  // ── Form state ──────────────────────────────────────────────
  const [intent, setIntent] = useState<RequestIntent>('SALE');
  const [propertyKind, setPropertyKind] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minBedrooms, setMinBedrooms] = useState('');
  const [maxBedrooms, setMaxBedrooms] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [urgency, setUrgency] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [notes, setNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // ── Location picker state ───────────────────────────────────
  const [govId, setGovId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<SelectedLocation[]>([]);

  // ── Validation ──────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Location queries ────────────────────────────────────────
  const govQuery = useQuery({
    queryKey: ['locations', 'governorates'],
    queryFn: getGovernorates,
  });
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

  // ── Create mutation ─────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: createRequest,
    onSuccess: () => {
      onCreated();
      onClose();
      resetForm();
    },
    onError: () => {
      setErrors({ submit: 'حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى.' });
    },
  });

  if (!isOpen) return null;

  // ── Helpers ─────────────────────────────────────────────────
  const resetForm = () => {
    setIntent('SALE');
    setPropertyKind('');
    setMinPrice('');
    setMaxPrice('');
    setMinBedrooms('');
    setMaxBedrooms('');
    setMinArea('');
    setMaxArea('');
    setUrgency('MEDIUM');
    setNotes('');
    setExpiresAt('');
    setGovId(null);
    setCityId(null);
    setDistrictId(null);
    setSelectedLocations([]);
    setErrors({});
  };

  const addLocation = () => {
    let loc: SelectedLocation | null = null;

    if (districtId && districtQuery.data?.districts) {
      const d = districtQuery.data.districts.find((x: LocationItem) => x.id === districtId);
      const c = cityQuery.data?.cities?.find((x: LocationItem) => x.id === cityId);
      const g = govQuery.data?.governorates?.find((x: LocationItem) => x.id === govId);
      if (d) {
        const parts = [g?.nameAr, c?.nameAr, d.nameAr].filter(Boolean);
        loc = { id: d.id, label: parts.join(' — ') };
      }
    } else if (cityId && cityQuery.data?.cities) {
      const c = cityQuery.data.cities.find((x: LocationItem) => x.id === cityId);
      const g = govQuery.data?.governorates?.find((x: LocationItem) => x.id === govId);
      if (c) {
        const parts = [g?.nameAr, c.nameAr].filter(Boolean);
        loc = { id: c.id, label: parts.join(' — ') };
      }
    } else if (govId && govQuery.data?.governorates) {
      const g = govQuery.data.governorates.find((x: LocationItem) => x.id === govId);
      if (g) loc = { id: g.id, label: g.nameAr };
    }

    if (loc && !selectedLocations.some((s) => s.id === loc!.id)) {
      setSelectedLocations((prev) => [...prev, loc!]);
    }
  };

  const removeLocation = (id: number) => {
    setSelectedLocations((prev) => prev.filter((s) => s.id !== id));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
      e.maxPrice = 'أعلى سعر لازم يكون أكبر من أقل سعر';
    }
    if (minBedrooms && maxBedrooms && Number(minBedrooms) > Number(maxBedrooms)) {
      e.maxBedrooms = 'أعلى عدد غرف لازم يكون أكبر من أقل عدد';
    }
    if (minArea && maxArea && Number(minArea) > Number(maxArea)) {
      e.maxArea = 'أعلى مساحة لازم تكون أكبر من أقل مساحة';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateRequestPayload = { intent, urgency };

    if (propertyKind) payload.propertyKind = propertyKind;
    if (minPrice) payload.minPrice = minPrice;
    if (maxPrice) payload.maxPrice = maxPrice;
    if (minBedrooms) payload.minBedrooms = Number(minBedrooms);
    if (maxBedrooms) payload.maxBedrooms = Number(maxBedrooms);
    if (minArea) payload.minAreaM2 = minArea;
    if (maxArea) payload.maxAreaM2 = maxArea;
    if (notes) payload.notes = notes;
    if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
    if (selectedLocations.length > 0) {
      payload.locationIds = selectedLocations.map((s) => s.id);
    }

    mutation.mutate(payload);
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal--request"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title">🔍 طلب عقار جديد</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal__body">
          {/* ── Error banner ─────────────────────────────────── */}
          {(mutation.isError || errors.submit) && (
            <div className="alert alert--error">
              {errors.submit || 'حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى.'}
            </div>
          )}

          {/* ── Intent (Sale / Rent) ──────────────────────────── */}
          <div className="form-group">
            <label className="form-label">نوع الطلب *</label>
            <div className="radio-group">
              <label className={`radio-card${intent === 'SALE' ? ' radio-card--active' : ''}`}>
                <input
                  type="radio"
                  name="intent"
                  value="SALE"
                  checked={intent === 'SALE'}
                  onChange={() => setIntent('SALE')}
                />
                <span className="radio-card__emoji">🏡</span>
                <span>شراء</span>
              </label>
              <label className={`radio-card${intent === 'RENT' ? ' radio-card--active' : ''}`}>
                <input
                  type="radio"
                  name="intent"
                  value="RENT"
                  checked={intent === 'RENT'}
                  onChange={() => setIntent('RENT')}
                />
                <span className="radio-card__emoji">🔑</span>
                <span>إيجار</span>
              </label>
            </div>
          </div>

          {/* ── Property Kind ─────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="propertyKind">نوع العقار</label>
            <select
              id="propertyKind"
              className="form-input"
              value={propertyKind}
              onChange={(e) => {
                const v = e.target.value;
                setPropertyKind(v);
                if (['SHOP', 'OFFICE', 'COMMERCIAL', 'LAND_BUILDING'].includes(v)) {
                  setMinBedrooms('');
                  setMaxBedrooms('');
                }
              }}
            >
              <option value="">جميع الأنواع</option>
              <option value="APARTMENT">شقة</option>
              <option value="VILLA">فيلا</option>
              <option value="SHOP">محل</option>
              <option value="OFFICE">مكتب</option>
              <option value="SUMMER_RESORT">استراحة / مصيف</option>
              <option value="COMMERCIAL">تجاري</option>
              <option value="LAND_BUILDING">أرض مباني</option>
            </select>
          </div>

          {/* ── Location Picker ───────────────────────────────── */}
          <div className="form-group">
            <label className="form-label">المناطق المفضلة</label>
            <div className="location-picker">
              <div className="location-picker__row">
                <select
                  className="form-input"
                  value={govId ?? ''}
                  onChange={(e) => {
                    setGovId(e.target.value ? Number(e.target.value) : null);
                    setCityId(null);
                    setDistrictId(null);
                  }}
                >
                  <option value="">اختر المحافظة</option>
                  {govQuery.data?.governorates.map((g: LocationItem) => (
                    <option key={g.id} value={g.id}>{g.nameAr}</option>
                  ))}
                </select>

                <select
                  className="form-input"
                  value={cityId ?? ''}
                  onChange={(e) => {
                    setCityId(e.target.value ? Number(e.target.value) : null);
                    setDistrictId(null);
                  }}
                  disabled={!govId}
                >
                  <option value="">اختر المدينة</option>
                  {cityQuery.data?.cities.map((c: LocationItem) => (
                    <option key={c.id} value={c.id}>{c.nameAr}</option>
                  ))}
                </select>

                <select
                  className="form-input"
                  value={districtId ?? ''}
                  onChange={(e) => setDistrictId(e.target.value ? Number(e.target.value) : null)}
                  disabled={!cityId}
                >
                  <option value="">اختر الحي</option>
                  {districtQuery.data?.districts.map((d: LocationItem) => (
                    <option key={d.id} value={d.id}>{d.nameAr}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addLocation}
                  disabled={!govId && !cityId && !districtId}
                >
                  + أضف
                </button>
              </div>

              {selectedLocations.length > 0 && (
                <div className="location-chips">
                  {selectedLocations.map((loc) => (
                    <span key={loc.id} className="location-chip">
                      📍 {loc.label}
                      <button type="button" onClick={() => removeLocation(loc.id)}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Budget ────────────────────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="minPrice">أقل سعر (جنيه)</label>
              <input
                type="number"
                id="minPrice"
                className="form-input"
                placeholder="مثال: 500,000"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="maxPrice">
                أعلى سعر (جنيه)
                {errors.maxPrice && <span className="form-error"> — {errors.maxPrice}</span>}
              </label>
              <input
                type="number"
                id="maxPrice"
                className={`form-input${errors.maxPrice ? ' form-input--error' : ''}`}
                placeholder="مثال: 2,000,000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                min="0"
              />
            </div>
          </div>

          {/* ── Bedrooms (hidden for non-residential kinds) ────── */}
          {!['SHOP', 'OFFICE', 'COMMERCIAL', 'LAND_BUILDING'].includes(propertyKind) && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="minBedrooms">أقل عدد غرف</label>
              <input
                type="number"
                id="minBedrooms"
                className="form-input"
                placeholder="0"
                value={minBedrooms}
                onChange={(e) => setMinBedrooms(e.target.value)}
                min="0"
                max="10"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="maxBedrooms">
                أعلى عدد غرف
                {errors.maxBedrooms && <span className="form-error"> — {errors.maxBedrooms}</span>}
              </label>
              <input
                type="number"
                id="maxBedrooms"
                className={`form-input${errors.maxBedrooms ? ' form-input--error' : ''}`}
                placeholder="غير محدد"
                value={maxBedrooms}
                onChange={(e) => setMaxBedrooms(e.target.value)}
                min="0"
                max="10"
              />
            </div>
          </div>
          )}

          {/* ── Area ──────────────────────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="minArea">أقل مساحة (م²)</label>
              <input
                type="number"
                id="minArea"
                className="form-input"
                placeholder="مثال: 80"
                value={minArea}
                onChange={(e) => setMinArea(e.target.value)}
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="maxArea">
                أعلى مساحة (م²)
                {errors.maxArea && <span className="form-error"> — {errors.maxArea}</span>}
              </label>
              <input
                type="number"
                id="maxArea"
                className={`form-input${errors.maxArea ? ' form-input--error' : ''}`}
                placeholder="مثال: 200"
                value={maxArea}
                onChange={(e) => setMaxArea(e.target.value)}
                min="0"
              />
            </div>
          </div>

          {/* ── Urgency + Expiry ──────────────────────────────── */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="urgency">مستوى الأهمية</label>
              <select
                id="urgency"
                className="form-input"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
              >
                <option value="LOW">عادي</option>
                <option value="MEDIUM">متوسط</option>
                <option value="HIGH">عاجل 🔥</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="expiresAt">تاريخ الانتهاء</label>
              <input
                type="date"
                id="expiresAt"
                className="form-input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* ── Notes ─────────────────────────────────────────── */}
          <div className="form-group">
            <label className="form-label" htmlFor="notes">ملاحظات إضافية</label>
            <textarea
              id="notes"
              className="form-input"
              rows={3}
              placeholder="أي تفاصيل إضافية تود ذكرها..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
            <div className="form-hint">{notes.length} / 1000</div>
          </div>

          {/* ── Footer ────────────────────────────────────────── */}
          <div className="modal__footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary header__btn-request"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'جاري الإضافة...' : '🔍 إضافة الطلب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
