import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../store/AuthContext';
import { Header } from '../components/Header';
import CreateRequestModal from '../components/CreateRequestModal';
import {
  listRequests,
  getMatches,
  pauseRequest,
  resumeRequest,
  deleteRequest,
  updateMatch,
  recomputeRequest,
  type MatchStatus,
  type PropertyRequest,
} from '../api/requests';

/* ── Skeleton Loader ──────────────────────────────────────── */
function RequestSkeleton() {
  return (
    <div className="request-card request-card--skeleton">
      <div className="request-card__header">
        <div className="skeleton skeleton--text" style={{ width: '40%' }} />
        <div className="skeleton skeleton--badge" />
        <div className="skeleton skeleton--badge" />
      </div>
      <div className="skeleton skeleton--text" style={{ width: '55%' }} />
      <div className="skeleton skeleton--text" style={{ width: '30%' }} />
      <div className="request-card__actions">
        <div className="skeleton skeleton--btn" />
        <div className="skeleton skeleton--btn" />
        <div className="skeleton skeleton--btn" />
      </div>
    </div>
  );
}

function MatchSkeleton() {
  return (
    <div className="match-card match-card--skeleton">
      <div className="skeleton skeleton--img" />
      <div className="match-card__body">
        <div className="skeleton skeleton--text" style={{ width: '70%' }} />
        <div className="skeleton skeleton--text" style={{ width: '50%' }} />
        <div className="skeleton skeleton--text" style={{ width: '35%' }} />
      </div>
    </div>
  );
}

/* ── Empty State ──────────────────────────────────────────── */
function EmptyRequestsState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state empty-state--requests">
      <div className="empty-state__illustration">
        <div className="empty-state__icon-wrapper">
          <span className="empty-state__emoji">🔍</span>
        </div>
        <div className="empty-state__dots">
          <span /><span /><span />
        </div>
      </div>
      <h2 className="empty-state__title">لا توجد طلبات بحث بعد</h2>
      <p className="empty-state__sub">
        وصّف العقار اللي بتدور عليه وهندورلك على أفضل الاختيارات
      </p>
      <button className="btn btn-primary btn-lg" onClick={onCreate}>
        🔍 اطلب عقارك الأول
      </button>
    </div>
  );
}

export function MyRequestsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [recomputeCooldown, setRecomputeCooldown] = useState(0);

  // Redirect if not authenticated
  if (!isAuthenticated) {
    navigate('/');
    return null;
  }

  // Query for requests
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['requests'],
    queryFn: () => listRequests(),
    enabled: isAuthenticated,
  });
  const requests = data?.data ?? [];

  // Query for matches when a request is active
  const { data: matchData, isLoading: matchesLoading } = useQuery({
    queryKey: ['matches', activeRequestId],
    queryFn: () => getMatches(activeRequestId!),
    enabled: !!activeRequestId,
  });
  const matches = matchData?.data ?? [];

  // Auto-trigger recompute the first time a panel is opened with no stored matches
  useEffect(() => {
    if (activeRequestId && !matchesLoading && matches.length === 0 && recomputeCooldown === 0) {
      recomputeMutation.mutate(activeRequestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRequestId, matchesLoading]);

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
    onSuccess: () => refetch(),
  });

  const recomputeMutation = useMutation({
    mutationFn: recomputeRequest,
    onSuccess: () => {
      refetch();
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
    if (confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
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
      MATCHED: { label: 'تم التطابق', className: 'badge--blue' },
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
      { value: 'CONTACTED', label: 'تم التواصل' },
      { value: 'DISMISSED', label: 'غير مهتم' },
      { value: 'CONVERTED', label: 'تم الاتفاق' },
      { value: 'CLOSED', label: 'مغلق' },
    ];
    return options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ));
  };

  type RequestLocationRow = NonNullable<PropertyRequest['locations']>[number];
  const formatRequestLocation = (locationRow: RequestLocationRow) => {
    const parts: string[] = [];
    if (locationRow.location.parent?.parent?.nameAr) {
      parts.push(locationRow.location.parent.parent.nameAr);
    }
    if (locationRow.location.parent?.nameAr) {
      parts.push(locationRow.location.parent.nameAr);
    }
    parts.push(locationRow.location.nameAr);
    return parts.filter(Boolean).join(' — ');
  };

  return (
    <>
      <Header onLoginClick={() => navigate('/login')} />
      <div className="my-requests-page">
        {/* ── Page Header ────────────────────────────────── */}
        <div className="my-requests-page__header">
          <h1 className="my-requests-page__title">طلبات البحث</h1>
          <button
            className="btn btn-secondary btn-sm header__btn-request"
            onClick={() => navigate('/search-chat')}
          >
            💬 Search Using Chat
          </button>
          <button
            className="btn btn-primary btn-sm header__btn-request"
            onClick={() => setShowCreateModal(true)}
          >
            ➕ طلب جديد
          </button>
        </div>

        {isLoading ? (
          <div className="my-requests-page__skeletons">
            <RequestSkeleton />
            <RequestSkeleton />
            <RequestSkeleton />
          </div>
        ) : requests.length === 0 ? (
          <EmptyRequestsState onCreate={() => setShowCreateModal(true)} />
        ) : (
          <>
            {requests.map((request) => (
              <div key={request.id} className={`request-card${activeRequestId === request.id ? ' request-card--active' : ''}`}>
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

                {(request.minAreaM2 || request.maxAreaM2) && (
                  <div className="request-card__detail">
                    مساحة: {request.minAreaM2 ?? 'غير محدد'} - {request.maxAreaM2 ?? 'غير محدد'} م²
                  </div>
                )}

                {request.locations && request.locations.length > 0 && (
                  <div className="request-card__detail">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span>📍</span>
                      <span style={{ fontWeight: 500 }}>المناطق</span>
                    </div>
                    <div style={{ paddingRight: '22px', fontSize: '13px', color: '#555', lineHeight: '1.6' }}>
                      {request.locations.map((loc) => (
                        <div key={loc.id}>{formatRequestLocation(loc)}</div>
                      ))}
                    </div>
                  </div>
                )}

                {request.expiresAt && (
                  <div className="request-card__detail">
                    ينتهي في: {new Date(request.expiresAt).toLocaleDateString('ar-EG')}
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
                      <div>
                        <h3>التطابقات المطابقة ({matches.length})</h3>
                        {request.locations && request.locations.length > 0 && (
                          <div className="matches-panel__location-hint">
                            📍 {request.locations.map(formatRequestLocation).join(' · ')}
                          </div>
                        )}
                      </div>
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

                    {matchesLoading ? (
                      <div className="my-requests-page__skeletons">
                        <MatchSkeleton />
                        <MatchSkeleton />
                      </div>
                    ) : matches.length === 0 ? (
                      <div className="empty-state">لا توجد تطابقات بعد</div>
                    ) : (
                      matches.filter((match) => !!match.property).map((match) => (
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
                              {match.reasons?.matched && match.reasons.matched.map((reason: string, idx: number) => (
                                <span key={`m-${idx}`} className="pill pill--matched">
                                  ✓ {reason}
                                </span>
                              ))}
                              {match.reasons?.missed && match.reasons.missed.map((reason: string, idx: number) => (
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

                              <Link
                                to={`/property/${match.property.id}`}
                                className="btn btn-primary btn-sm"
                              >
                                فتح العقار ←
                              </Link>
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
}
