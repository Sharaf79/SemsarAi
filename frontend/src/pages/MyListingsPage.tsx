import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext';
import { useChatContext } from '../store/ChatContext';
import {
  fetchMyProperties,
  updatePropertyStatus,
  deleteProperty,
} from '../api/properties';
import { Header } from '../components/Header';
import { EditListingModal } from '../components/EditListingModal';
import type { Property } from '../types';

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} مليون`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)} ألف`;
  return num.toLocaleString('ar-EG');
}

function statusLabel(status: string): { text: string; cls: string } {
  switch (status) {
    case 'ACTIVE':
      return { text: 'نشط', cls: 'listing-status-badge--active' };
    case 'INACTIVE':
      return { text: 'غير نشط', cls: 'listing-status-badge--inactive' };
    case 'SOLD':
      return { text: 'مباع', cls: 'listing-status-badge--sold' };
    case 'RENTED':
      return { text: 'مؤجر', cls: 'listing-status-badge--rented' };
    default:
      return { text: status, cls: '' };
  }
}

const PLACEHOLDER_IMAGES: Record<string, string> = {
  APARTMENT: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&q=80',
  VILLA: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400&q=80',
  DEFAULT: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=80',
};

export const MyListingsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { openChat } = useChatContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editProperty, setEditProperty] = useState<Property | null>(null);

  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-listings'],
    queryFn: fetchMyProperties,
    enabled: isAuthenticated,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updatePropertyStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-listings'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProperty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      setConfirmDeleteId(null);
    },
  });

  const properties = data?.data ?? [];

  return (
    <>
      <Header onLoginClick={() => {}} />
      <div className="my-listings-page">
        <div className="my-listings-page__header">
          <h1 className="my-listings-page__title">📋 إعلاناتي</h1>
          <span className="my-listings-page__count">
            {data ? `${data.meta.total} إعلان` : ''}
          </span>
        </div>

        {isLoading && (
          <div className="loading-center">
            <div className="spinner spinner-lg" />
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            حدث خطأ أثناء تحميل الإعلانات
          </div>
        )}

        {!isLoading && properties.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">📭</div>
            <div className="empty-state__title">لم تقم بإضافة إعلانات بعد</div>
            <div className="empty-state__sub">
              أضف إعلانك الأول وابدأ في عرض عقارك
            </div>
            <button
              className="btn btn-primary btn-lg"
              style={{ marginTop: '16px' }}
              onClick={() => openChat('أضيف عقار 🏠')}
            >
              ➕ أضف إعلانك الأول
            </button>
          </div>
        )}

        {properties.map((prop: Property) => {
          const badge = statusLabel(prop.propertyStatus);
          const isRent = prop.type === 'RENT';
          const location = [prop.governorate, prop.city, prop.district]
            .filter(Boolean)
            .join(' - ');
          const realImages =
            prop.media?.filter(
              (m) =>
                m.type === 'IMAGE' &&
                !m.url.includes('mock.semsar-ai.local'),
            ) || [];
          const imgSrc =
            realImages[0]?.url ??
            PLACEHOLDER_IMAGES[prop.propertyKind ?? ''] ??
            PLACEHOLDER_IMAGES.DEFAULT;

          return (
            <div key={prop.id} className="listing-card-wrap">
              <div
                className="property-card"
                onClick={() => navigate(`/property/${prop.id}`)}
                style={{ cursor: 'pointer', borderRadius: 0, border: 'none', boxShadow: 'none' }}
              >
                <div className="property-card__content">
                  <div className="property-card__badges">
                    <span
                      className={`badge ${isRent ? 'badge-rent' : 'badge-sale'}`}
                    >
                      {isRent ? 'إيجار' : 'بيع'}
                    </span>
                    <span className={`listing-status-badge ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  <h3 className="property-card__title">
                    {prop.adTitle || prop.title}
                  </h3>
                  <div className="property-card__price">
                    {formatPrice(prop.price)}{' '}
                    <small>ج.م{isRent ? ' / شهر' : ''}</small>
                  </div>
                  {location && (
                    <div className="property-card__location">
                      <span>📍</span>
                      <span>{location}</span>
                    </div>
                  )}
                </div>
                <div className="property-card__image-wrap">
                  <img
                    src={imgSrc}
                    alt={prop.title}
                    className="property-card__image"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        PLACEHOLDER_IMAGES.DEFAULT;
                    }}
                  />
                </div>
              </div>

              {/* Manage actions */}
              <div
                className="listing-manage-actions"
                onClick={(e) => e.stopPropagation()}
              >
                {prop.propertyStatus === 'ACTIVE' ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={toggleMutation.isPending}
                    onClick={() =>
                      toggleMutation.mutate({
                        id: prop.id,
                        status: 'INACTIVE',
                      })
                    }
                  >
                    ⏸️ إيقاف
                  </button>
                ) : prop.propertyStatus === 'INACTIVE' ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={toggleMutation.isPending}
                    onClick={() =>
                      toggleMutation.mutate({
                        id: prop.id,
                        status: 'ACTIVE',
                      })
                    }
                  >
                    ▶️ تفعيل
                  </button>
                ) : null}

                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditProperty(prop)}
                  >
                    ✏️ تعديل
                  </button>

              {confirmDeleteId === prop.id ? (
                  <>
                    <span
                      style={{
                        fontSize: '13px',
                        color: 'var(--danger)',
                        alignSelf: 'center',
                      }}
                    >
                      متأكد؟
                    </span>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(prop.id)}
                    >
                      نعم، احذف
                    </button>
                    <button
                      className="btn btn-muted btn-sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      إلغاء
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-muted btn-sm"
                    onClick={() => setConfirmDeleteId(prop.id)}
                  >
                    🗑️ حذف
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {properties.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => openChat('أضيف عقار 🏠')}
            >
              ➕ أضف إعلان جديد
            </button>
          </div>
        )}
      </div>
      {editProperty && (
        <EditListingModal
          property={editProperty}
          onClose={() => setEditProperty(null)}
        />
      )}
    </>
  );
};
