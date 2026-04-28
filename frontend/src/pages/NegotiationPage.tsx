import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { simulateNegotiation } from '../api/negotiations';
import type { SimulationResult, SimulatorStep } from '../api/negotiations';
import { fetchPropertyById } from '../api/properties';
import type { Property } from '../types/index';

type Phase = 'input' | 'simulating' | 'result' | 'error';

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('ar-EG') + ' ج.م';
}

function timeNow(): string {
  return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

const outcomeStyle: Record<
  SimulatorStep['outcome'],
  { label: string; color: string; emoji: string }
> = {
  INITIAL: { label: 'عرض مبدئي', color: '#0ea5e9', emoji: '👋' },
  COUNTER: { label: 'عرض مقابل', color: '#f59e0b', emoji: '🔄' },
  AGREED: { label: 'تم الاتفاق', color: '#10b981', emoji: '✅' },
  ESCALATE_TO_OWNER: { label: 'إحالة للمالك', color: '#ef4444', emoji: '📢' },
};

export const NegotiationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const stateProperty = (location.state as { property?: Property } | null)?.property ?? null;

  const [property, setProperty] = useState<Property | null>(stateProperty);
  const [propertyLoading, setPropertyLoading] = useState(!stateProperty && !!id);

  const [offer, setOffer] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [revealedSteps, setRevealedSteps] = useState<number>(0);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Hydrate property if not passed via state
  useEffect(() => {
    if (!stateProperty && id) {
      fetchPropertyById(id)
        .then(setProperty)
        .catch(() => setErrorMsg('تعذّر تحميل بيانات العقار'))
        .finally(() => setPropertyLoading(false));
    }
  }, [id, stateProperty]);

  // Auto-scroll on new step reveal
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [revealedSteps, phase]);

  // Stagger reveal of simulation steps for chat-like feel
  useEffect(() => {
    if (phase !== 'result' || !result) return;
    setRevealedSteps(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setRevealedSteps(i);
      if (i < result.steps.length) {
        setTimeout(tick, 900);
      }
    };
    setTimeout(tick, 400);
  }, [phase, result]);

  const listingPrice = property ? parseFloat(property.price) : 0;
  const sellerMaxPrice = listingPrice;
  const sellerMinPrice = Math.round(listingPrice * 0.85);

  const handleStart = async () => {
    const buyerOffer = parseFloat(offer.replace(/,/g, ''));
    if (!buyerOffer || buyerOffer <= 0) {
      setErrorMsg('من فضلك أدخل عرضك');
      return;
    }
    if (!listingPrice) {
      setErrorMsg('سعر العقار غير متاح');
      return;
    }
    setErrorMsg('');
    setPhase('simulating');
    try {
      const res = await simulateNegotiation(sellerMaxPrice, sellerMinPrice, buyerOffer);
      setResult(res.data);
      setPhase('result');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg ?? 'حدث خطأ في الاتصال بالخادم');
      setPhase('error');
    }
  };

  const handleRestart = () => {
    setResult(null);
    setRevealedSteps(0);
    setOffer('');
    setErrorMsg('');
    setPhase('input');
  };

  // ─── Render ──────────────────────────────────────────────────

  if (propertyLoading) {
    return (
      <div className="loading-center">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="neg-page">
      <header className="header">
        <Link to="/" className="header__logo">
          <div className="header__logo-icon">🏠</div>
          <span>سمسار AI</span>
        </Link>
        <div className="header__spacer" />
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '0 16px' }}>
          {result && (
            <span>
              الجولة <strong>{Math.min(revealedSteps, result.steps.length)}</strong>
              {' / '}
              <strong>{result.steps.length}</strong>
            </span>
          )}
        </div>
      </header>

      {/* Property summary */}
      {property && (
        <div
          style={{
            padding: '12px 16px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>{property.adTitle || property.title}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              السعر المطلوب: {fmt(listingPrice)}
            </div>
          </div>
          {phase === 'result' && result && (
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              نطاق المالك: {fmt(result.sellerMinPrice)} ← {fmt(result.sellerMaxPrice)}
            </div>
          )}
        </div>
      )}

      {/* ── Phase: input ── */}
      {phase === 'input' && (
        <div style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
          <div className="modal__icon" style={{ textAlign: 'center', fontSize: 48, marginBottom: 8 }}>
            🤝
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: 4 }}>ابدأ التفاوض</h2>
          <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: 20 }}>
            أدخل عرضك وسيتفاوض الذكاء الاصطناعي نيابةً عن المالك خطوة بخطوة
          </p>

          {errorMsg && <div className="alert alert-error" style={{ marginBottom: 12 }}>{errorMsg}</div>}

          <div className="form-group">
            <label className="form-label">عرضك (ج.م) *</label>
            <input
              className="form-input"
              type="number"
              inputMode="numeric"
              placeholder={`مثال: ${sellerMinPrice.toLocaleString('ar-EG')}`}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              style={{ fontSize: 18, fontWeight: 700, direction: 'ltr', textAlign: 'right' }}
              autoFocus
            />
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleStart}
            disabled={!offer}
            style={{ marginTop: 8 }}
          >
            🚀 ابدأ التفاوض
          </button>

          <Link to="/" className="btn btn-ghost btn-full" style={{ marginTop: 8 }}>
            إلغاء
          </Link>
        </div>
      )}

      {/* ── Phase: simulating ── */}
      {phase === 'simulating' && (
        <div className="loading-center" style={{ flexDirection: 'column', gap: 12 }}>
          <div className="spinner spinner-lg" />
          <div style={{ color: '#6b7280' }}>الذكاء الاصطناعي يتفاوض الآن…</div>
        </div>
      )}

      {/* ── Phase: result ── */}
      {phase === 'result' && result && (
        <>
          <div className="neg-chat-container">
            <div className="neg-message neg-message--ai">
              <div className="neg-avatar">🤖</div>
              <div className="neg-bubble neg-bubble--ai">
                🤝 بدأت جلسة تفاوض جديدة!{'\n'}
                نطاق المالك: {fmt(result.sellerMinPrice)} - {fmt(result.sellerMaxPrice)}{'\n'}
                جدول التنازل: {result.schedule.map((n) => n.toLocaleString('ar-EG')).join(' ← ')}
                <div className="neg-bubble__time">{timeNow()}</div>
              </div>
            </div>

            {result.steps.slice(0, revealedSteps).map((step) => {
              const o = outcomeStyle[step.outcome];
              return (
                <React.Fragment key={step.round}>
                  {/* Buyer offer bubble */}
                  <div className="neg-message neg-message--user">
                    <div className="neg-bubble neg-bubble--user">
                      💬 عرضي: {fmt(step.buyerOffer)}{'\n'}
                      الجولة {step.round}
                      <div className="neg-bubble__time">{timeNow()}</div>
                    </div>
                    <div className="neg-avatar" style={{ background: '#374151' }}>👤</div>
                  </div>

                  {/* Seller AI response */}
                  <div className="neg-message neg-message--ai">
                    <div className="neg-avatar">🏠</div>
                    <div
                      className="neg-bubble neg-bubble--ai"
                      style={{ borderRight: `3px solid ${o.color}` }}
                    >
                      <div style={{ fontSize: 12, color: o.color, fontWeight: 700, marginBottom: 4 }}>
                        {o.emoji} {o.label} • عرض البائع: {fmt(step.sellerOffer)}
                      </div>
                      {step.message.split('\n').map((line, i, arr) => (
                        <span key={i}>
                          {line}
                          {i < arr.length - 1 && <br />}
                        </span>
                      ))}
                      <div className="neg-bubble__time">{timeNow()}</div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {revealedSteps >= result.steps.length && (
              <>
                {result.finalOutcome === 'AGREED' && (
                  <div className="neg-status-chip" style={{ background: 'var(--primary)' }}>
                    ✅ تم الاتفاق على {fmt(result.steps[result.steps.length - 1].sellerOffer)}
                  </div>
                )}
                {result.finalOutcome === 'ESCALATE_TO_OWNER' && (
                  <>
                    <div className="neg-status-chip" style={{ background: '#ef4444' }}>
                      📢 وصلنا للحد الأدنى — تم إرسال عرضك للمالك
                    </div>
                    {result.ownerNotice && (
                      <div className="neg-message neg-message--ai">
                        <div className="neg-avatar">📨</div>
                        <div
                          className="neg-bubble neg-bubble--ai"
                          style={{ borderRight: '3px solid #ef4444', background: '#fef2f2' }}
                        >
                          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginBottom: 4 }}>
                            رسالة للمالك
                          </div>
                          {result.ownerNotice}
                          <div className="neg-bubble__time">{timeNow()}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            <div ref={bottomRef} />
          </div>

          {revealedSteps >= result.steps.length && (
            <div className="neg-action-bar">
              <div className="neg-action-bar__buttons">
                <button className="btn btn-primary" onClick={handleRestart}>
                  🔄 جرب عرضاً آخر
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => navigate('/')}
                >
                  🏠 العودة للرئيسية
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Phase: error ── */}
      {phase === 'error' && (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{errorMsg}</p>
          <button className="btn btn-primary" onClick={handleRestart}>حاول مرة أخرى</button>
        </div>
      )}
    </div>
  );
};
