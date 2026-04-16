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
              {/* Media Gallery */}
              {selectedProperty.media.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 8,
                  padding: 16,
                  background: 'var(--surface-tertiary, #f3f4f6)',
                }}>
                  {selectedProperty.media.map((media) => (
                    <img
                      key={media.id}
                      src={media.url}
                      alt={selectedProperty.title}
                      style={{
                        width: '100%',
                        height: 200,
                        objectFit: 'cover',
                        borderRadius: 8,
                      }}
                    />
                  ))}
                </div>
              )}

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
                    {selectedProperty.bedrooms !== null && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>غرف النوم</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.bedrooms}</div>
                      </div>
                    )}
                    {selectedProperty.bathrooms !== null && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>الحمامات</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.bathrooms}</div>
                      </div>
                    )}
                    {selectedProperty.areaM2 !== null && (
                      <div style={{ background: 'var(--surface-tertiary, #f3f4f6)', padding: 12, borderRadius: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>المساحة</div>
                        <div style={{ fontWeight: 600 }}>{selectedProperty.areaM2} م²</div>
                      </div>
                    )}
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
