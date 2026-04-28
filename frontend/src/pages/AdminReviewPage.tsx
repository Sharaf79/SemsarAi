import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getPendingProperties,
  getPropertyById,
  approveProperty,
  rejectProperty,
  AdminProperty,
} from '../api/admin';

type PageState = 'list' | 'detail';

/**
 * Admin Review Page — Review and approve/reject pending property listings
 * Route: /admin/review
 */
export const AdminReviewPage: React.FC = () => {
  const [pageState, setPageState] = useState<PageState>('list');
  const [pendingProperties, setPendingProperties] = useState<AdminProperty[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<AdminProperty | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadPendingProperties();
  }, []);

  const loadPendingProperties = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const properties = await getPendingProperties();
      setPendingProperties(properties);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setErrorMsg(msg ?? 'حدث خطأ في تحميل العقارات المعلقة.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewProperty = async (propertyId: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const property = await getPropertyById(propertyId);
      setSelectedProperty(property);
      setPageState('detail');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setErrorMsg(msg ?? 'حدث خطأ في تحميل تفاصيل العقار.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedProperty) return;
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await approveProperty(selectedProperty.id);
      setSuccessMsg('تمت الموافقة على العقار بنجاح!');
      // Refresh list after a short delay
      setTimeout(() => {
        loadPendingProperties();
        setPageState('list');
        setSelectedProperty(null);
      }, 1500);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setErrorMsg(msg ?? 'حدث خطأ في الموافقة على العقار.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedProperty) return;
    if (!confirm('هل أنت متأكد من رفض هذا العقار؟')) return;
    
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await rejectProperty(selectedProperty.id);
      setSuccessMsg('تم رفض العقار بنجاح!');
      // Refresh list after a short delay
      setTimeout(() => {
        loadPendingProperties();
        setPageState('list');
        setSelectedProperty(null);
      }, 1500);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setErrorMsg(msg ?? 'حدث خطأ في رفض العقار.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatMoney = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="neg-page">
      {/* Header */}
      <header className="header">
        <Link to="/" className="header__logo">
          <div className="header__logo-icon">🏠</div>
          <span>سمسار AI</span>
        </Link>
        <div className="header__spacer" />
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '0 16px' }}>
          🔒 لوحة مراجعة الإعلانات
        </div>
      </header>

      <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
        {/* List View */}
        {pageState === 'list' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 24, marginBottom: 8 }}>العقارات المعلقة للمراجعة</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                مراجعة واعتماد الإعلانات قبل نشرها
              </p>
            </div>

            {errorMsg && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="alert alert-success" style={{ marginBottom: 16 }}>
                {successMsg}
              </div>
            )}

            {loading && (
              <div className="loading-center">
                <div className="spinner spinner-lg" />
              </div>
            )}

            {!loading && pendingProperties.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                <h3 style={{ marginBottom: 8 }}>لا توجد عقارات معلقة</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  جميع العقارات تمت مراجعتها
                </p>
              </div>
            )}

            {!loading && pendingProperties.length > 0 && (
              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {pendingProperties.map((property) => (
                  <div
                    key={property.id}
                    style={{
                      background: 'var(--surface-primary, #ffffff)',
                      borderRadius: 12,
                      overflow: 'hidden',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onClick={() => handleViewProperty(property.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                    }}
                  >
                    {property.media.length > 0 && (
                      <img
                        src={property.media[0].url}
                        alt={property.title}
                        style={{
                          width: '100%',
                          height: 200,
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    <div style={{ padding: 16 }}>
                      <h3 style={{ fontSize: 16, marginBottom: 8, lineHeight: 1.4 }}>
                        {property.title}
                      </h3>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                        {formatMoney(property.price as number | null)}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {property.governorate} - {property.city} - {property.district}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {new Date(property.createdAt).toLocaleDateString('ar-EG')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Detail View */}
        {pageState === 'detail' && selectedProperty && (
          <>
            <button
              className="btn btn-ghost"
              onClick={() => setPageState('list')}
              style={{ marginBottom: 16 }}
            >
              ← العودة للقائمة
            </button>

            {errorMsg && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="alert alert-success" style={{ marginBottom: 16 }}>
                {successMsg}
              </div>
            )}

            <div style={{
              background: 'var(--surface-primary, #ffffff)',
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: 24 }}>
                {/* Title & Price */}
                <div style={{ marginBottom: 24 }}>
                  <h1 style={{ fontSize: 24, marginBottom: 8, lineHeight: 1.4 }}>
                    {selectedProperty.title}
                  </h1>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--primary)' }}>
                    {formatMoney(selectedProperty.price as number | null)}
                  </div>
                </div>

                {/* Location */}
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 8 }}>الموقع</h3>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {selectedProperty.governorate} - {selectedProperty.city} - {selectedProperty.district}
                  </div>
                </div>

                {/* Description */}
                {selectedProperty.description && (
                  <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 16, marginBottom: 8 }}>الوصف</h3>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {selectedProperty.description}
                    </div>
                  </div>
                )}

                {/* Property Details */}
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>تفاصيل العقار</h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12,
                  }}>
                    <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>النوع</div>
                      <div style={{ fontWeight: 600 }}>{selectedProperty.type}</div>
                    </div>
                    {selectedProperty.propertyKind && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>التصنيف</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.propertyKind}</div>
                      </div>
                    )}
                    {selectedProperty.bedrooms !== null && selectedProperty.bedrooms !== undefined && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>غرف النوم</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.bedrooms}</div>
                      </div>
                    )}
                    {selectedProperty.bathrooms !== null && selectedProperty.bathrooms !== undefined && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>الحمامات</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.bathrooms}</div>
                      </div>
                    )}
                    {selectedProperty.areaM2 !== null && selectedProperty.areaM2 !== undefined && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>المساحة</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.areaM2} م²</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* نوع الوحدة */}
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>نوع الوحدة والملكية</h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                  }}>
                    {selectedProperty.apartmentType && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>نوع الوحدة</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.apartmentType}</div>
                      </div>
                    )}
                    {selectedProperty.ownershipType && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>نوع الملكية</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.ownershipType}</div>
                      </div>
                    )}
                    {selectedProperty.readiness && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>حالة العقار</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.readiness}</div>
                      </div>
                    )}
                    {selectedProperty.finishingType && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>نوع التشطيب</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.finishingType}</div>
                      </div>
                    )}
                    {selectedProperty.floorLevel && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>الطابق</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.floorLevel}</div>
                      </div>
                    )}
                    {selectedProperty.isFurnished !== null && selectedProperty.isFurnished !== undefined && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>هل العقار مفروش؟</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.isFurnished ? 'نعم ✅' : 'لا ❌'}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* عنوان الإعلان ووصف العقار */}
                {(selectedProperty.adTitle || selectedProperty.adDescription) && (
                  <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 16, marginBottom: 12 }}>عنوان الإعلان ووصف العقار</h3>
                    {selectedProperty.adTitle && (
                      <div style={{
                        background: 'var(--surface-tertiary, #f3f4f6)',
                        padding: 16,
                        borderRadius: 8,
                        marginBottom: 12,
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>عنوان الإعلان</div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{selectedProperty.adTitle}</div>
                      </div>
                    )}
                    {selectedProperty.adDescription && (
                      <div style={{
                        background: 'var(--surface-tertiary, #f3f4f6)',
                        padding: 16,
                        borderRadius: 8,
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>وصف العقار</div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                          {selectedProperty.adDescription}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* الكماليات */}
                {selectedProperty.amenities && Object.keys(selectedProperty.amenities).length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 16, marginBottom: 12 }}>الكماليات</h3>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}>
                      {Object.entries(selectedProperty.amenities)
                        .filter(([, value]) => value === true)
                        .map(([key]) => (
                          <span
                            key={key}
                            style={{
                              background: 'var(--surface-tertiary, #f3f4f6)',
                              padding: '6px 14px',
                              borderRadius: 20,
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          >
                            {key}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* الصور والموقع */}
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>📍 الصور والموقع ({selectedProperty.media.length}/10)</h3>

                  {/* 10-slot photo grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 10,
                    marginBottom: 16,
                  }}>
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const media = selectedProperty.media[idx];
                      return (
                        <div key={media?.id ?? `photo-slot-${idx}`} style={{
                          position: 'relative',
                          aspectRatio: '1',
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: media ? '2px solid #10b981' : '2px dashed #d1d5db',
                          background: media ? '#f0fdf4' : 'var(--surface-tertiary, #f9fafb)',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          cursor: media ? 'pointer' : 'default',
                        }}
                          onMouseEnter={(e) => { if (media) { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; } }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          {media ? (
                            <>
                              <img
                                src={media.url}
                                alt={`صورة العقار ${idx + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              />
                              <div style={{
                                position: 'absolute', top: 6, right: 6,
                                background: 'rgba(16, 185, 129, 0.9)', color: '#fff',
                                fontSize: 11, fontWeight: 700,
                                minWidth: 22, height: 22, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                              }}>{idx + 1}</div>
                              <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                background: 'linear-gradient(transparent, rgba(0,0,0,0.4))',
                                padding: '4px 8px',
                              }}>
                                <span style={{ color: '#fff', fontSize: 11, fontWeight: 500 }}>
                                  صورة {idx + 1}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div style={{
                              width: '100%', height: '100%',
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center', gap: 2,
                            }}>
                              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</span>
                              <span style={{ fontSize: 24, color: '#d1d5db', lineHeight: 1 }}>+</span>
                              <span style={{ fontSize: 10, color: '#d1d5db' }}>فارغ</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* موقع العقار */}
                  <div style={{
                    background: 'var(--surface-tertiary, #f3f4f6)',
                    padding: 16,
                    borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>📍 موقع العقار</div>
                    <div style={{ lineHeight: 1.8 }}>
                      {selectedProperty.governorate && <div><strong>المحافظة:</strong> {selectedProperty.governorate}</div>}
                      {selectedProperty.city && <div><strong>المدينة:</strong> {selectedProperty.city}</div>}
                      {selectedProperty.district && <div><strong>الحي:</strong> {selectedProperty.district}</div>}
                      {selectedProperty.zone && <div><strong>المنطقة:</strong> {selectedProperty.zone}</div>}
                      {selectedProperty.street && <div><strong>الشارع:</strong> {selectedProperty.street}</div>}
                      {selectedProperty.nearestLandmark && <div><strong>أقرب معلم:</strong> {selectedProperty.nearestLandmark}</div>}
                      {selectedProperty.latitude && selectedProperty.longitude && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                          📌 إحداثيات: {String(selectedProperty.latitude)}, {String(selectedProperty.longitude)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Owner Info */}
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>معلومات المالك</h3>
                  <div style={{
                    background: 'var(--surface-tertiary, #f3f4f6)',
                    padding: 16,
                    borderRadius: 8,
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>الاسم: </span>
                      <span style={{ fontWeight: 600 }}>{selectedProperty.user.name}</span>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>الهاتف: </span>
                      <span style={{ fontWeight: 600 }}>{selectedProperty.user.phone}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: 12,
                  marginTop: 32,
                }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: 16 }}
                    onClick={handleApprove}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <span className="spinner" /> : '✅ اعتماد الإعلان'}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1, fontSize: 16 }}
                    onClick={handleReject}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <span className="spinner" /> : '❌ رفض الإعلان'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
