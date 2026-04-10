import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGovernorates } from '../api/locations';
import type { PropertyFilters } from '../types/index';

interface FiltersSidebarProps {
  filters: PropertyFilters;
  onChange: (f: PropertyFilters) => void;
}

const PROPERTY_TYPES = [
  { value: '', label: 'الكل' },
  { value: 'SALE', label: 'للبيع' },
  { value: 'RENT', label: 'للإيجار' },
];

const PROPERTY_KINDS = [
  { value: '', label: 'الكل' },
  { value: 'APARTMENT', label: 'شقة' },
  { value: 'VILLA', label: 'فيلا' },
  { value: 'SHOP', label: 'محل' },
  { value: 'OFFICE', label: 'مكتب' },
  { value: 'SUMMER_RESORT', label: 'عقارات مصايف' },
  { value: 'COMMERCIAL', label: 'عقار تجارى' },
  { value: 'LAND_BUILDING', label: 'مبانى و أراضى' },
];

const BEDROOM_OPTIONS = [
  { value: '', label: 'الكل' },
  { value: '1', label: '١ غرفة' },
  { value: '2', label: '٢ غرفة' },
  { value: '3', label: '٣ غرف' },
  { value: '4', label: '٤ غرف' },
  { value: '5', label: '٥+' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'السعر: الأقل أولاً' },
  { value: 'price_desc', label: 'السعر: الأعلى أولاً' },
];

export const FiltersSidebar: React.FC<FiltersSidebarProps> = ({ filters, onChange }) => {
  const set = (key: keyof PropertyFilters, value: string | number | undefined) => {
    onChange({ ...filters, [key]: value || undefined });
  };

  const reset = () => onChange({});

  // Load governorates from the locations API (1-hour cache)
  const { data: govData } = useQuery({
    queryKey: ['governorates'],
    queryFn: getGovernorates,
    staleTime: 60 * 60 * 1000,
  });
  const governorates = govData?.governorates ?? [];

  return (
    <aside className="sidebar">
      <div className="sidebar__title">🔧 تصفية النتائج</div>

      <div className="sidebar__section">
        {/* Sort */}
        <div className="form-group">
          <label className="form-label">الترتيب</label>
          <select
            className="form-select"
            value={filters.sort ?? 'newest'}
            onChange={(e) => set('sort', e.target.value as PropertyFilters['sort'])}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div className="form-group">
          <label className="form-label">نوع العملية</label>
          <select
            className="form-select"
            value={filters.propertyType ?? ''}
            onChange={(e) => set('propertyType', e.target.value as PropertyFilters['propertyType'])}
          >
            {PROPERTY_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Kind */}
        <div className="form-group">
          <label className="form-label">نوع العقار</label>
          <select
            className="form-select"
            value={filters.propertyKind ?? ''}
            onChange={(e) => set('propertyKind', e.target.value as PropertyFilters['propertyKind'])}
          >
            {PROPERTY_KINDS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Governorate */}
        <div className="form-group">
          <label className="form-label">المحافظة</label>
          <select
            className="form-select"
            value={filters.governorate ?? ''}
            onChange={(e) => {
              set('governorate', e.target.value);
              // Clear city when governorate changes
              onChange({ ...filters, governorate: e.target.value || undefined, city: undefined });
            }}
          >
            <option value="">الكل</option>
            {governorates.map((g) => (
              <option key={g.id} value={g.nameAr}>{g.nameAr}</option>
            ))}
          </select>
        </div>

        {/* City */}
        <div className="form-group">
          <label className="form-label">المدينة</label>
          <input
            className="form-input"
            placeholder="مثال: القاهرة"
            value={filters.city ?? ''}
            onChange={(e) => set('city', e.target.value)}
          />
        </div>

        {/* District */}
        <div className="form-group">
          <label className="form-label">الحي</label>
          <input
            className="form-input"
            placeholder="مثال: المعادي"
            value={filters.district ?? ''}
            onChange={(e) => set('district', e.target.value)}
          />
        </div>

        {/* Price range */}
        <div className="form-group">
          <label className="form-label">نطاق السعر (ج.م)</label>
          <div className="form-input-row">
            <input
              className="form-input"
              type="number"
              placeholder="من"
              value={filters.minPrice ?? ''}
              onChange={(e) => set('minPrice', e.target.value ? Number(e.target.value) : undefined)}
            />
            <input
              className="form-input"
              type="number"
              placeholder="إلى"
              value={filters.maxPrice ?? ''}
              onChange={(e) => set('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </div>

        {/* Bedrooms */}
        <div className="form-group">
          <label className="form-label">عدد الغرف</label>
          <select
            className="form-select"
            value={filters.bedrooms?.toString() ?? ''}
            onChange={(e) => set('bedrooms', e.target.value ? Number(e.target.value) : undefined)}
          >
            {BEDROOM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button className="btn btn-ghost btn-full sidebar__reset" onClick={reset}>
          إعادة ضبط الفلاتر
        </button>
      </div>
    </aside>
  );
};
