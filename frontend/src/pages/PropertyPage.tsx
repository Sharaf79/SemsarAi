import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPropertyById } from '../api/properties';
import './PropertyPage.css';

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return num.toLocaleString('ar-EG');
}

export const PropertyPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const { data: property, isLoading, isError } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetchPropertyById(id!),
    enabled: !!id,
  });

  const realImages = property?.media?.filter(m => m.type === 'IMAGE' && !m.url.includes('mock.semsar-ai.local')) || [];
  const totalImages = realImages.length;

  const goToPrev = useCallback(() => {
    setActiveImageIndex(i => (i > 0 ? i - 1 : totalImages - 1));
  }, [totalImages]);

  const goToNext = useCallback(() => {
    setActiveImageIndex(i => (i < totalImages - 1 ? i + 1 : 0));
  }, [totalImages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (totalImages <= 1) return;
      if (e.key === 'ArrowRight') goToPrev(); // RTL: right = previous
      if (e.key === 'ArrowLeft') goToNext();  // RTL: left = next
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, totalImages]);

  if (isLoading) {
    return <div className="property-page-loading">جاري التحميل...</div>;
  }

  if (isError || !property) {
    return <div className="property-page-error">عذراً، لم نتمكن من العثور على هذا العقار.</div>;
  }

  const isRent = property.type === 'RENT';
  const location = [property.street, property.district, property.city, property.governorate]
    .filter(Boolean)
    .join(' - ');

  const defaultImage = 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80';
  const mainImage = realImages[activeImageIndex]?.url ?? defaultImage;

  const renderSpecsItem = (label: string, value: any, icon: string) => {
    if (value == null || value === '') return null;
    return (
      <div className="pp-spec-item">
        <span className="pp-spec-icon">{icon}</span>
        <div className="pp-spec-info">
          <span className="pp-spec-label">{label}</span>
          <span className="pp-spec-val">{value}</span>
        </div>
      </div>
    );
  };

  const renderDetailRow = (label: string, value: any) => {
    if (value == null || value === '') return null;
    if (typeof value === 'boolean') {
      value = value ? 'نعم' : 'لا';
    }
    return (
      <div className="pp-detail-row">
        <span className="pp-detail-label">{label}</span>
        <span className="pp-detail-val">{value}</span>
      </div>
    );
  };

  let amenitiesText = '';
  const amenities = property.amenities as any;
  if (amenities && typeof amenities === 'object') {
    amenitiesText = amenities.parsed || Object.keys(amenities).join('، ');
  }

  return (
    <div className="property-page-container">
      {/* ── Top bar with badges & back ── */}
      <div className="pp-top-bar">
        <button className="pp-back-btn" onClick={() => navigate('/')} aria-label="العودة للإعلانات">→ العودة للإعلانات</button>
        <span className={`pp-badge ${isRent ? 'pp-badge-rent' : 'pp-badge-sale'}`}>
          {isRent ? 'إيجار' : 'بيع'}
        </span>
      </div>

      <div className="pp-content-layout">
        {/* ── Main Column (Right) ── */}
        <div className="pp-main-col">
          {/* ── Image Gallery (before location) ── */}
          <section className="pp-gallery" aria-label="معرض الصور">
            <div className="pp-main-image-wrap">
              <img src={mainImage} className="pp-main-image" alt={property.adTitle || property.title} />

              {totalImages > 1 && (
                <>
                  <button className="pp-gallery-nav pp-gallery-nav--prev" onClick={goToPrev} aria-label="الصورة السابقة">‹</button>
                  <button className="pp-gallery-nav pp-gallery-nav--next" onClick={goToNext} aria-label="الصورة التالية">›</button>
                  <span className="pp-image-counter">{activeImageIndex + 1} / {totalImages}</span>
                </>
              )}
            </div>

            {totalImages > 1 && (
              <div className="pp-thumbnails" role="tablist" aria-label="صور مصغرة">
                {realImages.map((img, idx) => (
                  <button
                    key={img.id}
                    role="tab"
                    aria-selected={idx === activeImageIndex}
                    className={`pp-thumb ${idx === activeImageIndex ? 'active' : ''}`}
                    onClick={() => setActiveImageIndex(idx)}
                  >
                    <img src={img.url} alt={`صورة ${idx + 1} من ${totalImages}`} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="pp-header-info">
            <h1 className="pp-price">
              {property.price && parseFloat(property.price) > 0
                ? <>{formatPrice(property.price)} <span className="pp-price-currency">ج.م</span></>
                : <span className="pp-price-unknown">السعر غير محدد</span>
              }
            </h1>
            {property.isNegotiable != null && (
              <span className={`pp-negotiable-badge ${property.isNegotiable ? 'pp-negotiable-yes' : 'pp-negotiable-no'}`}>
                {property.isNegotiable ? '✅ قابل للتفاوض' : '🚫 غير قابل للتفاوض'}
              </span>
            )}
            <h2 className="pp-title">{property.adTitle || property.title}</h2>
            {location && (
              <div className="pp-location">
                📍 {location}
              </div>
            )}
          </div>

          {property.adDescription && (
            <section className="pp-section">
              <h3 className="pp-section-title">وصف العقار</h3>
              <div className="pp-description">
                {property.adDescription}
              </div>
            </section>
          )}

          <section className="pp-section">
            <h3 className="pp-section-title">المواصفات البارزة</h3>
            <div className="pp-specs-grid">
              {renderSpecsItem('النوع', property.apartmentType ?? property.propertyKind, '🏢')}
              {renderSpecsItem('المساحة', property.areaM2 ? `${parseFloat(property.areaM2).toFixed(0)} م²` : null, '📐')}
              {renderSpecsItem('غرف النوم', property.bedrooms, '🛏️')}
              {renderSpecsItem('الحمامات', property.bathrooms, '🚿')}
              {renderSpecsItem('ملكية', property.ownershipType ?? 'أول سكن', '🔑')}
            </div>
          </section>

          <section className="pp-section">
            <h3 className="pp-section-title">التفاصيل</h3>
            <div className="pp-details-grid">
              {renderDetailRow('طريقة الدفع', property.paymentMethod)}
              {renderDetailRow('حالة العقار', property.readiness)}
              {renderDetailRow('موعد الاستلام', property.deliveryDate)}
              {renderDetailRow('نوع التشطيب', property.finishingType)}
              {renderDetailRow('الطابق', property.floorLevel)}
              {renderDetailRow('مفروش؟', property.isFurnished)}
              {renderDetailRow('قابل للتفاوض', property.isNegotiable)}
            </div>
          </section>

          {amenitiesText && (
            <section className="pp-section">
              <h3 className="pp-section-title">الكماليات</h3>
              <div className="pp-amenities-content">
                ✨ {amenitiesText}
              </div>
            </section>
          )}

          {property.description && !property.adDescription && (
            <section className="pp-section">
              <h3 className="pp-section-title">الوصف</h3>
              <div className="pp-description">
                {property.description.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Sidebar (Left) ── */}
        <aside className="pp-sidebar">
          <div className="pp-contact-card">
            <h4>تم النشر بواسطة: <strong>المالك</strong></h4>
            <div className="pp-safety-tips">
              <strong>سلامتك تهمنا</strong>
              <ul>
                <li>قابل البائع في مكان عام</li>
                <li>تأكد من صحة المستندات</li>
                <li>لا تقم بتحويل أموال مسبقًا</li>
              </ul>
            </div>

            <button className="pp-call-btn" aria-label="إظهار رقم المالك">
              📞 أظهر الرقم
            </button>
            <button className="pp-chat-btn" aria-label="التحدث مع سمسار AI">
              🤖 تحدث مع سمسار AI
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
