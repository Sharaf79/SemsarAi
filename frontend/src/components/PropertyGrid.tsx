import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProperties } from '../api/properties';
import { PropertyCard } from './PropertyCard';
import { useFavorites } from '../store/FavoritesContext';
import { useAuth } from '../store/AuthContext';
import type { Property, PropertyFilters } from '../types/index';

interface PropertyGridProps {
  filters: PropertyFilters;
  onContact: (property: Property) => void;
  onChat: (property: Property) => void;
}

const SORT_LABELS: Record<string, string> = {
  newest: 'الأحدث',
  price_asc: 'السعر: الأقل أولاً',
  price_desc: 'السعر: الأعلى أولاً',
};

const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton skeleton-image" />
    <div className="skeleton-body">
      <div className="skeleton skeleton-line-lg" />
      <div className="skeleton skeleton-line-md" />
      <div className="skeleton skeleton-line-sm" />
    </div>
  </div>
);

export const PropertyGrid: React.FC<PropertyGridProps> = ({ filters, onContact, onChat }) => {
  const [page, setPage] = useState(1);
  const { isAuthenticated } = useAuth();
  const { isFavorite, toggle } = useFavorites();

  const mergedFilters: PropertyFilters = { ...filters, page, limit: 12 };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['properties', mergedFilters],
    queryFn: () => fetchProperties(mergedFilters),
    staleTime: 30_000,
  });

  const total = data?.meta.total ?? 0;
  const totalPages = Math.ceil(total / 12);

  return (
    <div>
      <div className="grid-header">
        <span className="grid-header__count">
          {isLoading ? 'جاري التحميل…' : `${total.toLocaleString('ar-EG')} عقار`}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {filters.sort ? SORT_LABELS[filters.sort] : SORT_LABELS['newest']}
        </span>
      </div>

      {isError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          حدث خطأ في تحميل العقارات. يرجى المحاولة مرة أخرى.
        </div>
      )}

      {isLoading ? (
        <div className="property-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🔍</div>
          <div className="empty-state__title">لا توجد عقارات</div>
          <div className="empty-state__sub">جرّب تغيير معايير البحث</div>
        </div>
      ) : (
        <div className="property-grid">
          {data?.data.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onContact={onContact}
              onChat={onChat}
              isFavorited={isFavorite(p.id)}
              onToggleFavorite={isAuthenticated ? toggle : undefined}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination__btn"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ›
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                className={`pagination__btn ${p === page ? 'pagination__btn--active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            );
          })}
          <button
            className="pagination__btn"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ‹
          </button>
        </div>
      )}
    </div>
  );
};
