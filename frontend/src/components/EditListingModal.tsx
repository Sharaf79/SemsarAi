import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateProperty } from '../api/properties';
import { getGovernorates, getCities, getDistricts } from '../api/locations';
import type { Property, PropertyKind } from '../types';

interface Props {
  property: Property;
  onClose: () => void;
}

interface FormState {
  adTitle: string;
  price: string;
  adDescription: string;
  bedrooms: string;
  bathrooms: string;
  areaM2: string;
  governorate: string;
  city: string;
  district: string;
  isNegotiable: boolean;
  propertyKind: string;
}

const PROPERTY_KIND_OPTIONS: { value: PropertyKind; label: string }[] = [
  { value: 'APARTMENT',     label: 'شقة' },
  { value: 'VILLA',         label: 'فيلا / منزل' },
  { value: 'SHOP',          label: 'محل تجاري' },
  { value: 'OFFICE',        label: 'مكتب' },
  { value: 'SUMMER_RESORT', label: 'شاليه / منتجع' },
  { value: 'COMMERCIAL',    label: 'عقار تجاري' },
  { value: 'LAND_BUILDING', label: 'أرض / مبنى' },
];

const BEDS_OPTIONS  = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const BATHS_OPTIONS = ['1', '2', '3', '4', '5', '6'];

function toForm(p: Property): FormState {
  return {
    adTitle:       p.adTitle ?? '',
    price:         p.price ?? '',
    adDescription: p.adDescription ?? '',
    bedrooms:      p.bedrooms != null ? String(p.bedrooms) : '',
    bathrooms:     p.bathrooms != null ? String(p.bathrooms) : '',
    areaM2:        p.areaM2 != null ? String(p.areaM2) : '',
    governorate:   p.governorate ?? '',
    city:          p.city ?? '',
    district:      p.district ?? '',
    isNegotiable:  p.isNegotiable ?? false,
    propertyKind:  p.propertyKind ?? '',
  };
}

export const EditListingModal: React.FC<Props> = ({ property, onClose }) => {
  const queryClient = useQueryClient();
  const [form, setForm]     = useState<FormState>(() => toForm(property));
  const [error, setError]   = useState<string | null>(null);
  const [govId, setGovId]   = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);

  // ─── Governorates ───────────────────────────────────────────
  const { data: govData } = useQuery({
    queryKey: ['governorates'],
    queryFn: getGovernorates,
    staleTime: 60 * 60 * 1000,
  });
  const governorates = govData?.governorates ?? [];

  // Resolve current governorate's ID once list is loaded
  useEffect(() => {
    if (governorates.length && form.governorate && govId === null) {
      const match = governorates.find((g) => g.nameAr === form.governorate);
      if (match) setGovId(match.id);
    }
  }, [governorates]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cities (depends on govId) ──────────────────────────────
  const { data: cityData } = useQuery({
    queryKey: ['cities', govId],
    queryFn: () => getCities(govId!),
    enabled: govId != null,
    staleTime: 60 * 60 * 1000,
  });
  const cities = cityData?.cities ?? [];

  // Resolve current city's ID once list is loaded
  useEffect(() => {
    if (cities.length && form.city && cityId === null) {
      const match = cities.find((c) => c.nameAr === form.city);
      if (match) setCityId(match.id);
    }
  }, [cities]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Districts (depends on cityId) ──────────────────────────
  const { data: districtData } = useQuery({
    queryKey: ['districts', cityId],
    queryFn: () => getDistricts(cityId!),
    enabled: cityId != null,
    staleTime: 60 * 60 * 1000,
  });
  const districts = districtData?.districts ?? [];

  // ─── Helpers ────────────────────────────────────────────────
  const setField = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleGovernorateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nameAr = e.target.value;
    const match = governorates.find((g) => g.nameAr === nameAr);
    setField('governorate', nameAr);
    setField('city', '');
    setField('district', '');
    setGovId(match?.id ?? null);
    setCityId(null);
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nameAr = e.target.value;
    const match = cities.find((c) => c.nameAr === nameAr);
    setField('city', nameAr);
    setField('district', '');
    setCityId(match?.id ?? null);
  };

  // ─── Save ────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () =>
      updateProperty(property.id, {
        adTitle:       form.adTitle || undefined,
        adDescription: form.adDescription || undefined,
        price:         form.price ? Number(form.price) : undefined,
        bedrooms:      form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms:     form.bathrooms ? Number(form.bathrooms) : undefined,
        areaM2:        form.areaM2 ? Number(form.areaM2) : undefined,
        governorate:   form.governorate || undefined,
        city:          form.city || undefined,
        district:      form.district || undefined,
        isNegotiable:  form.isNegotiable,
        propertyKind:  (form.propertyKind as PropertyKind) || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'حدث خطأ أثناء التعديل';
      setError(Array.isArray(msg) ? msg.join(' — ') : msg);
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal edit-listing-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>

        <div className="modal__icon">✏️</div>
        <h2 className="modal__title">تعديل الإعلان</h2>
        <p className="modal__sub">{property.adTitle || property.title}</p>

        <div className="edit-listing-modal__body">

          {/* Ad Title */}
          <div className="edit-listing-modal__field">
            <label className="edit-listing-modal__label">عنوان الإعلان</label>
            <input
              className="input"
              type="text"
              value={form.adTitle}
              onChange={(e) => setField('adTitle', e.target.value)}
              placeholder="أدخل عنوان الإعلان"
              maxLength={200}
            />
          </div>

          {/* Property Kind — enum master data */}
          <div className="edit-listing-modal__field">
            <label className="edit-listing-modal__label">نوع العقار</label>
            <select
              className="input"
              value={form.propertyKind}
              onChange={(e) => setField('propertyKind', e.target.value)}
            >
              <option value="">— اختر نوع العقار —</option>
              {PROPERTY_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Price */}
          <div className="edit-listing-modal__field">
            <label className="edit-listing-modal__label">
              السعر (ج.م)
              {property.type === 'RENT' && (
                <span className="edit-listing-modal__hint"> / شهر</span>
              )}
            </label>
            <input
              className="input"
              type="number"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              placeholder="السعر"
              min={0}
            />
          </div>

          {/* Bedrooms & Bathrooms — discrete list */}
          <div className="edit-listing-modal__row">
            <div className="edit-listing-modal__field">
              <label className="edit-listing-modal__label">غرف النوم</label>
              <select
                className="input"
                value={form.bedrooms}
                onChange={(e) => setField('bedrooms', e.target.value)}
              >
                <option value="">—</option>
                {BEDS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} {Number(n) === 1 ? 'غرفة' : 'غرف'}
                  </option>
                ))}
              </select>
            </div>
            <div className="edit-listing-modal__field">
              <label className="edit-listing-modal__label">الحمامات</label>
              <select
                className="input"
                value={form.bathrooms}
                onChange={(e) => setField('bathrooms', e.target.value)}
              >
                <option value="">—</option>
                {BATHS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} {Number(n) === 1 ? 'حمام' : 'حمامات'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Area */}
          <div className="edit-listing-modal__field">
            <label className="edit-listing-modal__label">المساحة (م²)</label>
            <input
              className="input"
              type="number"
              value={form.areaM2}
              onChange={(e) => setField('areaM2', e.target.value)}
              placeholder="المساحة بالمتر المربع"
              min={0}
            />
          </div>

          {/* Governorate — from Location table */}
          <div className="edit-listing-modal__field" data-field="location">
            <label className="edit-listing-modal__label">المحافظة</label>
            <select
              className="input"
              value={form.governorate}
              onChange={handleGovernorateChange}
            >
              <option value="">— اختر المحافظة —</option>
              {governorates.map((g) => (
                <option key={g.id} value={g.nameAr}>
                  {g.nameAr}
                </option>
              ))}
            </select>
          </div>

          {/* City — from Location table, depends on governorate */}
          <div className="edit-listing-modal__field" data-field="location">
            <label className="edit-listing-modal__label">المدينة</label>
            <select
              className="input"
              value={form.city}
              onChange={handleCityChange}
              disabled={!govId}
            >
              <option value="">
                {govId ? '— اختر المدينة —' : 'اختر المحافظة أولاً'}
              </option>
              {cities.map((c) => (
                <option key={c.id} value={c.nameAr}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </div>

          {/* District — from Location table, depends on city */}
          <div className="edit-listing-modal__field" data-field="location">
            <label className="edit-listing-modal__label">الحي / المنطقة</label>
            <select
              className="input"
              value={form.district}
              onChange={(e) => setField('district', e.target.value)}
              disabled={!cityId}
            >
              <option value="">
                {cityId ? '— اختر الحي —' : 'اختر المدينة أولاً'}
              </option>
              {districts.map((d) => (
                <option key={d.id} value={d.nameAr}>
                  {d.nameAr}
                </option>
              ))}
            </select>
          </div>

          {/* Ad Description */}
          <div className="edit-listing-modal__field">
            <label className="edit-listing-modal__label">وصف الإعلان</label>
            <textarea
              className="input edit-listing-modal__textarea"
              value={form.adDescription}
              onChange={(e) => setField('adDescription', e.target.value)}
              placeholder="أضف وصفاً تفصيلياً للعقار..."
              maxLength={2000}
              rows={4}
            />
          </div>

          {/* Negotiable */}
          <label className="edit-listing-modal__checkbox-row">
            <input
              type="checkbox"
              checked={form.isNegotiable}
              onChange={(e) => setField('isNegotiable', e.target.checked)}
            />
            <span>السعر قابل للتفاوض</span>
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="edit-listing-modal__actions">
            <button
              className="btn btn-ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              إلغاء
            </button>
            <button
              className="btn btn-primary"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <span className="spinner spinner-sm" />
              ) : (
                '💾 حفظ التعديلات'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
