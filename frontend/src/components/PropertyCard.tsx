import React, { useState } from 'react';
import type { Property } from '../types/index';
import { useNavigate } from 'react-router-dom';

interface PropertyCardProps {
  property: Property;
  onContact: (property: Property) => void;
  onChat: (property: Property) => void;
  isFavorited?: boolean;
  onToggleFavorite?: (id: string) => void;
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} مليون`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)} ألف`;
  return num.toLocaleString('ar-EG');
}

function kindLabel(kind: string | null): string {
  const map: Record<string, string> = {
    APARTMENT: 'شقة',
    VILLA: 'فيلا',
    SHOP: 'محل',
    OFFICE: 'مكتب',
    SUMMER_RESORT: 'مصيف',
    COMMERCIAL: 'تجارى',
    LAND_BUILDING: 'مبانى / أراضى',
  };
  return kind ? (map[kind] ?? kind) : '';
}

const PLACEHOLDER_IMAGES: Record<string, string> = {
  APARTMENT: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&q=80',
  VILLA:     'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=600&q=80',
  SHOP:      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80',
  OFFICE:    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80',
  SUMMER_RESORT: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=600&q=80',
  COMMERCIAL: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&q=80',
  LAND_BUILDING: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&q=80',
  DEFAULT:   'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80',
};

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onContact, onChat, isFavorited, onToggleFavorite }) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const navigate = useNavigate();

  const isRent = property.type === 'RENT';
  const location = [property.governorate, property.city, property.district].filter(Boolean).join(' - ');

  const realImages = property.media?.filter(
    (m) => m.type === 'IMAGE' && !m.url.includes('mock.semsar-ai.local')
  ) || [];

  const imgSrc = realImages[activeImageIndex]?.url ??
    (PLACEHOLDER_IMAGES[property.propertyKind ?? ''] || PLACEHOLDER_IMAGES.DEFAULT);

  const title = property.adTitle || property.title;

  return (
    <div className="property-card" onClick={() => navigate(`/property/${property.id}`)}>
      {/* ── Image (top) ─────────────────────────────────── */}
      <div
        className="property-card__image-wrap"
        onClick={(e) => {
          if (realImages.length > 1) {
            e.stopPropagation();
            setActiveImageIndex((prev) => (prev + 1) % realImages.length);
          }
        }}
      >
        <img
          src={imgSrc}
          alt={title}
          className="property-card__image"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGES.DEFAULT;
          }}
        />

        {/* Top-right badges overlay */}
        <div className="property-card__badges">
          <span className={`badge ${isRent ? 'badge-rent' : 'badge-sale'}`}>
            {isRent ? 'إيجار' : 'بيع'}
          </span>
          {property.propertyKind && (
            <span className="badge badge-kind">{kindLabel(property.propertyKind)}</span>
          )}
        </div>

        {/* Top-left favorite */}
        {onToggleFavorite && (
          <button
            className="property-card__heart"
            title={isFavorited ? 'إزالة من المفضّلة' : 'أضف للمفضّلة'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(property.id);
            }}
          >
            {isFavorited ? '❤️' : '🤍'}
          </button>
        )}

        {realImages.length > 1 && (
          <div className="property-card__gallery-dots">
            {realImages.map((img, idx) => (
              <button
                key={img.id}
                title={`صورة رقم ${idx + 1}`}
                type="button"
                className={`gallery-dot ${idx === activeImageIndex ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImageIndex(idx);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Content (below) ─────────────────────────────── */}
      <div className="property-card__content">
        <div className="property-card__price">
          {formatPrice(property.price)}
          <small> ج.م{isRent ? ' / شهر' : ''}</small>
        </div>

        <h3 className="property-card__title">{title}</h3>

        <div className="property-card__specs">
          {property.areaM2 && (
            <span className="property-card__spec">
              <span className="spec-icon">📐</span>
              {parseFloat(property.areaM2).toFixed(0)} م²
            </span>
          )}
          {property.bedrooms != null && (
            <span className="property-card__spec">
              <span className="spec-icon">🛏</span>
              {property.bedrooms}
            </span>
          )}
          {property.bathrooms != null && (
            <span className="property-card__spec">
              <span className="spec-icon">🚿</span>
              {property.bathrooms}
            </span>
          )}
        </div>

        {location && (
          <div className="property-card__location">
            <span>📍</span>
            <span>{location}</span>
          </div>
        )}

        <div className="property-card__actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onContact(property);
            }}
          >
            📞 تواصل
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onChat(property);
            }}
          >
            🤖 تحدث مع AI
          </button>
        </div>
      </div>
    </div>
  );
};
