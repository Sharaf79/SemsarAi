# Phase 2: Buyer Requests Frontend Implementation

This file contains all the code required to implement the Buyer Requests Frontend (spec 006 Phase B).

---

## 1. MODIFY: `frontend/src/components/Header.tsx`

### Add import at the top (if not present):
```tsx
import { Link } from 'react-router-dom';
```

### Add the "طلباتي" button after the green "اضافة عقار" button (around lines 20-35):

```tsx
<button
  className="btn btn-primary btn-sm"
  onClick={() => openChat('أضيف عقار 🏠')}
  style={{ marginLeft: '12px', background: '#25D366' }}
>
  اضافة عقار 🏠
</button>

{isAuthenticated && (
  <Link
    to="/my-requests"
    className="btn btn-primary btn-sm"
    style={{ marginLeft: '8px', background: '#4F46E5' }}
  >
    🔍 طلباتي
  </Link>
)}
```

---

## 2. MODIFY: `frontend/src/components/UserMenu.tsx`

### Add menu item between "إعلاناتي" block and "المفضّلة" block:

```tsx
<Link to="/my-requests" className="user-menu__item" onClick={onClose}>
  <span className="user-menu__item-icon">🔍</span>
  <span>طلباتي</span>
</Link>
```

---

## 3. MODIFY: `frontend/src/App.tsx`

### Add import (named export — matches convention of other pages):
```tsx
import { MyRequestsPage } from './pages/MyRequestsPage';
```

### Add route inside `<Routes>`:
```tsx
<Route path="/my-requests" element={<MyRequestsPage />} />
```

---

## 4. CREATE: `frontend/src/api/requests.ts`

```typescript
import { apiClient } from './client';

export type RequestIntent   = 'SALE' | 'RENT';
export type RequestStatus   = 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'EXPIRED';
export type RequestUrgency  = 'LOW' | 'MEDIUM' | 'HIGH';
export type MatchStatus     = 'NEW' | 'VIEWED' | 'INTERESTED' | 'DISMISSED' | 'CLOSED';

export interface PropertyRequest {
  id: string;
  intent: RequestIntent;
  propertyKind: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  minAreaM2: string | null;
  maxAreaM2: string | null;
  urgency: RequestUrgency;
  status: RequestStatus;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyMatch {
  id: string;
  score: number;
  status: MatchStatus;
  reasons: { matched: string[]; missed: string[] };
  property: {
    id: string;
    title: string;
    price: string;
    governorate: string | null;
    city: string | null;
    district: string | null;
    bedrooms: number | null;
    areaM2: string | null;
    propertyKind: string | null;
    media: { url: string }[];
  };
  matchedAt: string;
}

export interface CreateRequestPayload {
  intent: RequestIntent;
  propertyKind?: string;
  minPrice?: string;
  maxPrice?: string;
  minBedrooms?: number;
  maxBedrooms?: number;
  minAreaM2?: string;
  maxAreaM2?: string;
  urgency?: RequestUrgency;
  notes?: string;
  locationIds?: number[];
  expiresAt?: string;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

// NOTE: backend returns { items, total, page, limit } — NOT { data, meta }.
export async function listRequests(params?: {
  status?: RequestStatus;
  page?: number;
  limit?: number;
}) {
  const { data } = await apiClient.get<{
    items: PropertyRequest[];
    total: number;
    page: number;
    limit: number;
  }>('/requests', { params });
  return data;
}

export async function createRequest(payload: CreateRequestPayload) {
  const { data } = await apiClient.post<{
    request: PropertyRequest;
    matches: PropertyMatch[];
    matchedCount: number;
  }>('/requests', payload);
  return data;
}

export async function getRequest(id: string) {
  const { data } = await apiClient.get<PropertyRequest>(`/requests/${id}`);
  return data;
}

export async function pauseRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/pause`);
  return data;
}

export async function resumeRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/resume`);
  return data;
}

export async function deleteRequest(id: string) {
  const { data } = await apiClient.delete(`/requests/${id}`);
  return data;
}

export async function getMatches(requestId: string, params?: { minScore?: number; sort?: 'score' | 'date'; page?: number; limit?: number }) {
  const { data } = await apiClient.get<{
    items: PropertyMatch[];
    total: number;
    page: number;
    limit: number;
  }>(`/requests/${requestId}/matches`, { params });
  return data;
}

export async function updateMatch(matchId: string, status: MatchStatus) {
  const { data } = await apiClient.patch(`/matches/${matchId}`, { status });
  return data;
}

export async function recomputeRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/recompute`);
  return data;
}
```

---

## 5. CREATE: `frontend/src/pages/MyRequestsPage.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext';
import { Header } from '../components/Header';
import { CreateRequestModal } from '../components/CreateRequestModal';
import {
  listRequests,
  getMatches,
  pauseRequest,
  resumeRequest,
  deleteRequest,
  updateMatch,
  recomputeRequest,
  type PropertyMatch,
  type MatchStatus,
} from '../api/requests';

export const MyRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [recomputeCooldown, setRecomputeCooldown] = useState(0);

  // Redirect if not authenticated — must be in effect, not during render
  useEffect(() => {
    if (!isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  // Query for requests — backend returns { items, total, page, limit }
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['requests'],
    queryFn: () => listRequests(),
    enabled: isAuthenticated,
  });
  const requests = data?.items ?? [];

  // Query for matches when a request is active
  const { data: matchData } = useQuery({
    queryKey: ['matches', activeRequestId],
    queryFn: () => getMatches(activeRequestId!),
    enabled: !!activeRequestId,
  });
  const matches = matchData?.items ?? [];

  // Mutations
  const pauseMutation = useMutation({
    mutationFn: pauseRequest,
    onSuccess: () => refetch(),
  });

  const resumeMutation = useMutation({
    mutationFn: resumeRequest,
    onSuccess: () => refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRequest,
    onSuccess: () => {
      if (activeRequestId) setActiveRequestId(null);
      refetch();
    },
  });

  const updateMatchMutation = useMutation({
    mutationFn: ({ matchId, status }: { matchId: string; status: MatchStatus }) =>
      updateMatch(matchId, status),
    onSuccess: () => {
      if (activeRequestId) {
        queryClient.invalidateQueries({ queryKey: ['matches', activeRequestId] });
      }
    },
  });

  const recomputeMutation = useMutation({
    mutationFn: recomputeRequest,
    onSuccess: (_data, requestId) => {
      queryClient.invalidateQueries({ queryKey: ['matches', requestId] });
      setRecomputeCooldown(30);
      const timer = setInterval(() => {
        setRecomputeCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
  });

  const handlePause = (id: string) => {
    pauseMutation.mutate(id);
  };

  const handleResume = (id: string) => {
    resumeMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
      deleteMutation.mutate(id);
    }
  };

  const handleMatchStatusChange = (matchId: string, status: MatchStatus) => {
    updateMatchMutation.mutate({ matchId, status });
  };

  const handleRecompute = (requestId: string) => {
    if (recomputeCooldown === 0) {
      recomputeMutation.mutate(requestId);
    }
  };

  const renderStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      ACTIVE: { label: 'نشط', className: 'badge--green' },
      PAUSED: { label: 'موقوف', className: 'badge--yellow' },
      CLOSED: { label: 'مغلق', className: 'badge--gray' },
      EXPIRED: { label: 'منتهي', className: 'badge--gray' },
    };
    const config = statusMap[status] || { label: status, className: 'badge--gray' };
    return <span className={`badge ${config.className}`}>{config.label}</span>;
  };

  const renderUrgencyBadge = (urgency: string) => {
    const urgencyMap: Record<string, { label: string; className: string }> = {
      HIGH: { label: 'عاجل', className: 'badge--red' },
      MEDIUM: { label: 'متوسط', className: 'badge--yellow' },
      LOW: { label: 'عادي', className: 'badge--gray' },
    };
    const config = urgencyMap[urgency] || { label: urgency, className: 'badge--gray' };
    return <span className={`badge ${config.className}`}>{config.label}</span>;
  };

  const renderScoreBadge = (score: number) => {
    let className = 'score-badge--red';
    if (score >= 75) className = 'score-badge--green';
    else if (score >= 55) className = 'score-badge--yellow';
    return <span className={`score-badge ${className}`}>{score}</span>;
  };

  const formatPrice = (price: string | null) => {
    if (!price) return 'غير محدد';
    return Number(price).toLocaleString('ar-EG');
  };

  const renderMatchStatusOptions = () => {
    const options: { value: MatchStatus; label: string }[] = [
      { value: 'NEW', label: 'جديد' },
      { value: 'VIEWED', label: 'تم العرض' },
      { value: 'INTERESTED', label: 'مهتم' },
      { value: 'DISMISSED', label: 'غير مهتم' },
      { value: 'CLOSED', label: 'مغلق' },
    ];
    return options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ));
  };

  return (
    <>
      <Header onLoginClick={() => {}} />
      <div className="my-requests-page">
        <h1 className="my-requests-page__title">طلباتي</h1>

        {isLoading ? (
          <div className="spinner">جاري التحميل...</div>
        ) : requests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🔍</div>
            <div className="empty-state__title">لا توجد طلبات بحث بعد</div>
            <div className="empty-state__sub">
              أضف طلبك الأول وسنجد لك أفضل العقارات المطابقة
            </div>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setShowCreateModal(true)}
            >
              ➕ أضف طلب بحث
            </button>
          </div>
        ) : (
          <>
            {requests.map((request) => (
              <div key={request.id} className="request-card">
                <div className="request-card__header">
                  <span className="request-card__title">
                    {request.intent === 'SALE' ? 'شراء' : 'إيجار'}
                    {request.propertyKind && ` - ${request.propertyKind}`}
                  </span>
                  {renderStatusBadge(request.status)}
                  {renderUrgencyBadge(request.urgency)}
                </div>

                {(request.minPrice || request.maxPrice) && (
                  <div className="request-card__detail">
                    الميزانية: {formatPrice(request.minPrice)} - {formatPrice(request.maxPrice)} جنيه
                  </div>
                )}

                {(request.minBedrooms !== null || request.maxBedrooms !== null) && (
                  <div className="request-card__detail">
                    عدد الغرف: {request.minBedrooms ?? '0'} - {request.maxBedrooms ?? 'غير محدد'}
                  </div>
                )}

                {request.notes && (
                  <div className="request-card__notes">{request.notes}</div>
                )}

                <div className="request-card__actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      setActiveRequestId(activeRequestId === request.id ? null : request.id)
                    }
                  >
                    {activeRequestId === request.id ? 'إخفاء التطابقات 🔍' : 'عرض التطابقات 🔍'}
                  </button>

                  {request.status === 'ACTIVE' ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handlePause(request.id)}
                      disabled={pauseMutation.isPending}
                    >
                      إيقاف مؤقت ⏸
                    </button>
                  ) : request.status === 'PAUSED' ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleResume(request.id)}
                      disabled={resumeMutation.isPending}
                    >
                      استئناف ▶
                    </button>
                  ) : null}

                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(request.id)}
                    disabled={deleteMutation.isPending}
                  >
                    حذف 🗑
                  </button>
                </div>

                {activeRequestId === request.id && (
                  <div className="matches-panel">
                    <div className="matches-panel__header">
                      <h3>التطابقات المطابقة ({matches.length})</h3>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRecompute(request.id)}
                        disabled={recomputeCooldown > 0 || recomputeMutation.isPending}
                      >
                        {recomputeCooldown > 0
                          ? `انتظر ${recomputeCooldown}ث 🔄`
                          : 'إعادة حساب 🔄'}
                      </button>
                    </div>

                    {matches.length === 0 ? (
                      <div className="empty-state">لا توجد تطابقات بعد</div>
                    ) : (
                      matches.map((match) => (
                        <div key={match.id} className="match-card">
                          {match.property.media && match.property.media.length > 0 ? (
                            <img
                              src={match.property.media[0].url}
                              alt={match.property.title}
                              className="match-card__img"
                            />
                          ) : (
                            <div className="match-card__img">🏠</div>
                          )}

                          <div className="match-card__body">
                            <div className="match-card__header">
                              <h4 className="match-card__title">{match.property.title}</h4>
                              {renderScoreBadge(match.score)}
                            </div>

                            <div className="match-card__location">
                              {match.property.governorate &&
                                `${match.property.governorate} / `}
                              {match.property.city && `${match.property.city} / `}
                              {match.property.district && match.property.district}
                            </div>

                            <div className="match-card__price">
                              {formatPrice(match.property.price)} جنيه
                            </div>

                            <div className="match-card__details">
                              {match.property.bedrooms !== null && (
                                <span>{match.property.bedrooms} غرف</span>
                              )}
                              {match.property.areaM2 && (
                                <span> / {formatPrice(match.property.areaM2)} م²</span>
                              )}
                            </div>

                            <div className="match-card__reasons">
                              {(match.reasons?.matched ?? []).map((reason, idx) => (
                                <span key={`m-${idx}`} className="pill pill--matched">
                                  ✓ {reason}
                                </span>
                              ))}
                              {(match.reasons?.missed ?? []).map((reason, idx) => (
                                <span key={`ms-${idx}`} className="pill pill--missed">
                                  ✗ {reason}
                                </span>
                              ))}
                            </div>

                            <div className="match-card__actions">
                              <select
                                className="match-card__status"
                                value={match.status}
                                onChange={(e) =>
                                  handleMatchStatusChange(match.id, e.target.value as MatchStatus)
                                }
                                disabled={updateMatchMutation.isPending}
                              >
                                {renderMatchStatusOptions()}
                              </select>

                              <a
                                href={`/property/${match.property.id}`}
                                className="btn btn-primary btn-sm"
                              >
                                فتح العقار →
                              </a>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        <button
          className="fab"
          onClick={() => setShowCreateModal(true)}
          title="طلب بحث جديد"
        >
          ➕
        </button>
      </div>

      {showCreateModal && (
        <CreateRequestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            refetch();
          }}
        />
      )}
    </>
  );
};
```

### ⚠️ Also: backend `getMatches` must include property media

In `backend/src/requests/requests.service.ts:242`, change:
```ts
include: { property: true },
```
to:
```ts
include: { property: { include: { media: { orderBy: { position: 'asc' }, take: 1 } } } },
```
Otherwise `match.property.media` is undefined and the frontend will crash. (Verify the Property→Media relation name in `schema.prisma`.)

---

## 6. CREATE: `frontend/src/components/CreateRequestModal.tsx`

```typescript
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRequest, type CreateRequestPayload, type RequestIntent } from '../api/requests';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateRequestModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<RequestIntent>('SALE');
  const [propertyKind, setPropertyKind] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minBedrooms, setMinBedrooms] = useState('');
  const [maxBedrooms, setMaxBedrooms] = useState('');
  const [urgency, setUrgency] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: createRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      onCreated();
      onClose();
      // Reset form
      setIntent('SALE');
      setPropertyKind('');
      setMinPrice('');
      setMaxPrice('');
      setMinBedrooms('');
      setMaxBedrooms('');
      setUrgency('MEDIUM');
      setNotes('');
    },
    onError: (error: any) => {
      console.error('Error creating request:', error);
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: CreateRequestPayload = {
      intent,
      urgency,
    };

    if (propertyKind) payload.propertyKind = propertyKind;
    if (minPrice) payload.minPrice = minPrice;
    if (maxPrice) payload.maxPrice = maxPrice;
    if (minBedrooms) payload.minBedrooms = Number(minBedrooms);
    if (maxBedrooms) payload.maxBedrooms = Number(maxBedrooms);
    if (notes) payload.notes = notes;

    mutation.mutate(payload);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">إضافة طلب بحث جديد</h2>
          <button className="modal__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal__body">
          {mutation.isError && (
            <div className="alert alert--error">
              حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى.
            </div>
          )}

          <div className="form-group">
            <label className="form-label">نوع الطلب *</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="intent"
                  value="SALE"
                  checked={intent === 'SALE'}
                  onChange={(e) => setIntent(e.target.value as RequestIntent)}
                />
                شراء
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="intent"
                  value="RENT"
                  checked={intent === 'RENT'}
                  onChange={(e) => setIntent(e.target.value as RequestIntent)}
                />
                إيجار
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="propertyKind">
              نوع العقار
            </label>
            <select
              id="propertyKind"
              className="form-input"
              value={propertyKind}
              onChange={(e) => setPropertyKind(e.target.value)}
            >
              <option value="">جميع الأنواع</option>
              <option value="APARTMENT">شقة</option>
              <option value="VILLA">فيلا</option>
              <option value="SHOP">محل</option>
              <option value="OFFICE">مكتب</option>
              <option value="SUMMER_RESORT">قرية / ساحل</option>
              <option value="COMMERCIAL">تجاري</option>
              <option value="LAND_BUILDING">أرض / مبنى</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="minPrice">
              أقل سعر (جنيه)
            </label>
            <input
              type="number"
              id="minPrice"
              className="form-input"
              placeholder="مثال: 500000"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              min="0"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="maxPrice">
              أعلى سعر (جنيه)
            </label>
            <input
              type="number"
              id="maxPrice"
              className="form-input"
              placeholder="مثال: 2000000"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              min="0"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="minBedrooms">
                أقل عدد غرف
              </label>
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
              </label>
              <input
                type="number"
                id="maxBedrooms"
                className="form-input"
                placeholder="غير محدد"
                value={maxBedrooms}
                onChange={(e) => setMaxBedrooms(e.target.value)}
                min="0"
                max="10"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="urgency">
              مستوى الأهمية
            </label>
            <select
              id="urgency"
              className="form-input"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
            >
              <option value="LOW">عادي</option>
              <option value="MEDIUM">متوسط</option>
              <option value="HIGH">عاجل</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="notes">
              ملاحظات إضافية
            </label>
            <textarea
              id="notes"
              className="form-input"
              rows={4}
              placeholder="أي تفاصيل إضافية تود ذكرها..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
            <div className="form-hint">{notes.length} / 1000</div>
          </div>

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
              className="btn btn-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'جاري الإضافة...' : 'إضافة الطلب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

---

## 7. MODIFY: `frontend/src/index.css`

### Append these CSS classes at the end of the file:

```css
/* ── My Requests Page ─────────────────────────── */
.my-requests-page {
  max-width: 960px;
  margin: 24px auto;
  padding: 0 16px;
}

.my-requests-page__title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 20px;
}

.request-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.request-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.request-card__title {
  font-size: 1rem;
  font-weight: 600;
  flex: 1;
}

.request-card__detail {
  font-size: 0.875rem;
  color: #6b7280;
}

.request-card__notes {
  font-size: 0.875rem;
  color: #4b5563;
  background: #f9fafb;
  padding: 8px 12px;
  border-radius: 6px;
}

.request-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge--green {
  background: #d1fae5;
  color: #065f46;
}

.badge--yellow {
  background: #fef3c7;
  color: #92400e;
}

.badge--red {
  background: #fee2e2;
  color: #991b1b;
}

.badge--gray {
  background: #f3f4f6;
  color: #6b7280;
}

.matches-panel {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  margin-top: 12px;
}

.matches-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.matches-panel__header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.match-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.match-card__img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  font-size: 2rem;
}

.match-card__body {
  flex: 1;
}

.match-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.match-card__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.match-card__location {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 4px;
}

.match-card__price {
  font-size: 1rem;
  font-weight: 700;
  color: #059669;
  margin-bottom: 6px;
}

.match-card__details {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 8px;
}

.match-card__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.match-card__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.match-card__status {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  font-size: 0.875rem;
  background: #fff;
}

.score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
}

.score-badge--green {
  background: #059669;
}

.score-badge--yellow {
  background: #d97706;
}

.score-badge--red {
  background: #dc2626;
}

.pill {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.7rem;
  margin: 2px;
}

.pill--matched {
  background: #d1fae5;
  color: #065f46;
}

.pill--missed {
  background: #f3f4f6;
  color: #6b7280;
}

/* ── FAB (Floating Action Button) ─────────────────────────── */
.fab {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 1000;
  background: #4F46E5;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 56px;
  height: 56px;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s, box-shadow 0.2s;
}

.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.fab:active {
  transform: scale(0.95);
}

/* ── Modal ─────────────────────────── */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.modal {
  background: #fff;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.modal__title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.modal__close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.modal__close:hover {
  background: #f3f4f6;
}

.modal__body {
  padding: 20px;
}

.modal__footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

/* ── Form ─────────────────────────── */
.form-group {
  margin-bottom: 16px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
}

.form-input:focus {
  outline: none;
  border-color: #4F46E5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.form-input::placeholder {
  color: #9ca3af;
}

.form-hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 4px;
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.radio-label input[type="radio"] {
  cursor: pointer;
}

/* ── Alert ─────────────────────────── */
.alert {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.875rem;
}

.alert--error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.alert--success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

/* ── Spinner ─────────────────────────── */
.spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: #6b7280;
}

/* ── Empty State ─────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-state__icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

.empty-state__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
}

.empty-state__sub {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 24px;
}
```

---

## Summary of Changes

| Action | File | Description |
|--------|------|-------------|
| EDIT | `frontend/src/components/Header.tsx` | Add "طلباتي" button after "اضافة عقار" |
| EDIT | `frontend/src/components/UserMenu.tsx` | Add "طلباتي" menu item |
| EDIT | `frontend/src/App.tsx` | Add import and route for MyRequestsPage |
| CREATE | `frontend/src/api/requests.ts` | API functions and TypeScript interfaces |
| CREATE | `frontend/src/pages/MyRequestsPage.tsx` | Full My Requests page implementation |
| CREATE | `frontend/src/components/CreateRequestModal.tsx` | Create request modal component |
| EDIT | `frontend/src/index.css` | Add all required CSS styles |

---

## Notes

- All user-facing text is in polite Egyptian Arabic register (فصحى مهذّبة), per `CLAUDE.md`
- Uses existing `apiClient` from `frontend/src/api/client.ts`
- Uses existing `useAuth` from `frontend/src/store/AuthContext.tsx`
- Follows the pattern from `FavoritesPage.tsx` for structure
- All API endpoints are handled automatically with Bearer token authentication
- Recompute button has 30-second client-side cooldown (1-hour server-side)
- **Deferred:** `locationIds` UI (cascading governorate → city → district picker). Backend supports it; ship without for MVP and add a reusable `LocationPicker` component in a follow-up task (shared with the add-property flow).
