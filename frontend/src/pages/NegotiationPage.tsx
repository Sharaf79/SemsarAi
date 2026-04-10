import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getNegotiation, handleAction } from '../api/negotiations';
import { initiatePayment } from '../api/payments';
import { getOwnerContact } from '../api/properties';
import type {
  NegotiationResult,
  ActionResult,
  ChatMessage,
} from '../types/index';

type PageState = 'loading' | 'chat' | 'payment' | 'owner' | 'error';

function formatMoney(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString('ar-EG') + ' ج.م';
}

function now(): string {
  return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export const NegotiationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [negotiation, setNegotiation] = useState<NegotiationResult | null>(null);
  const [maxRounds, setMaxRounds] = useState<number>(6);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterValue, setCounterValue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Payment state
  const [dealId, setDealId] = useState<string | null>(null);
  const [agreedPrice, setAgreedPrice] = useState<number | null>(null);
  const [serviceFee, setServiceFee] = useState<number | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Owner contact state
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load negotiation on mount ──────────────────────────────────
  useEffect(() => {
    if (!id) { navigate('/'); return; }
    loadNegotiation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (role: 'ai' | 'user', text: string) => {
    setMessages((m) => [
      ...m,
      { id: Date.now().toString(), role, text, timestamp: new Date() },
    ]);
  };

  const loadNegotiation = async () => {
    try {
      const res = await getNegotiation(id!);
      const neg = res.data as unknown as NegotiationResult & {
        negotiation?: { status: string };
        offers?: { amount: number; createdBy: string; round: number }[];
        deals?: { id: string; agreedPrice: number }[];
      };

      // Handle the verbose getStatus response
      const actualNeg: NegotiationResult = {
        negotiationId: (neg as unknown as { negotiation?: { id: string } }).negotiation?.id ?? (neg as NegotiationResult).negotiationId,
        propertyId: (neg as unknown as { negotiation?: { propertyId: string } }).negotiation?.propertyId ?? (neg as NegotiationResult).propertyId,
        buyerId: (neg as unknown as { negotiation?: { buyerId: string } }).negotiation?.buyerId ?? (neg as NegotiationResult).buyerId,
        sellerId: (neg as unknown as { negotiation?: { sellerId: string } }).negotiation?.sellerId ?? (neg as NegotiationResult).sellerId,
        initialOffer: (neg as unknown as { negotiation?: { initialOffer: number } }).negotiation?.initialOffer ?? (neg as NegotiationResult).initialOffer,
        minPrice: (neg as unknown as { negotiation?: { minPrice: number } }).negotiation?.minPrice ?? (neg as NegotiationResult).minPrice,
        maxPrice: (neg as unknown as { negotiation?: { maxPrice: number } }).negotiation?.maxPrice ?? (neg as NegotiationResult).maxPrice,
        roundNumber: (neg as unknown as { currentRound: number }).currentRound ?? (neg as NegotiationResult).roundNumber,
        status: ((neg as unknown as { negotiation?: { status: string } }).negotiation?.status ?? (neg as NegotiationResult).status) as NegotiationResult['status'],
        message: (neg as NegotiationResult).message ?? '',
      };

      const apiMaxRounds = (neg as unknown as { maxRounds?: number }).maxRounds;
      if (apiMaxRounds) setMaxRounds(apiMaxRounds);

      setNegotiation(actualNeg);

      // Build chat history from offers
      const rawOffers = (neg as unknown as { offers?: { amount: number; createdBy: string; round: number }[] }).offers ?? [];
      const msgs: ChatMessage[] = [];

      // Opening AI message
      msgs.push({
        id: 'open',
        role: 'ai',
        text: `🤝 بدأت جلسة التفاوض!\n\nالسعر المطلوب: ${formatMoney(actualNeg.maxPrice)}\nعرضك الأول: ${formatMoney(actualNeg.initialOffer)}\n\nانتظر رد المالك أو اختر إجراء…`,
        timestamp: new Date(),
      });

      rawOffers.forEach((o, i) => {
        const isBuyer = o.createdBy === actualNeg.buyerId;
        msgs.push({
          id: `offer-${i}`,
          role: isBuyer ? 'user' : 'ai',
          text: `${isBuyer ? '💬 عرضك' : '🏠 عرض المالك'}: ${formatMoney(o.amount)}\nالجولة ${o.round}`,
          timestamp: new Date(),
        });
      });

      if (actualNeg.message) {
        msgs.push({
          id: 'status-msg',
          role: 'ai',
          text: actualNeg.message,
          timestamp: new Date(),
        });
      }

      setMessages(msgs);

      // Check if deal already exists
      const deals = (neg as unknown as { deals?: { id: string; finalPrice: string | number; status: string }[] }).deals ?? [];
      if (deals.length > 0 || actualNeg.status === 'AGREED') {
        const deal = deals[0];
        if (deal?.id) setDealId(deal.id);
        if (deal?.finalPrice) {
          const price = Number(deal.finalPrice);
          setAgreedPrice(price);
          setServiceFee(price * 0.0025);
        }
        // If deal is already CONFIRMED, skip to owner contact
        if (deal?.status === 'CONFIRMED') {
          setPageState('owner');
        } else {
          setPageState('payment');
        }
      } else if (actualNeg.status === 'FAILED') {
        setPageState('chat'); // Still show chat with FAILED state
      } else {
        setPageState('chat');
      }
    } catch (_e) {
      setPageState('error');
      setErrorMsg('تعذّر تحميل بيانات التفاوض.');
    }
  };

  // ── Handle negotiation action ──────────────────────────────────
  const onAction = async (action: 'accept' | 'reject' | 'request_counter') => {
    if (!id) return;
    setActionLoading(true);
    setErrorMsg('');
    setShowCounterInput(false);

    const userText =
      action === 'accept' ? '✅ وافقت على العرض'
      : action === 'reject' ? '❌ رفضت العرض'
      : `🔄 طلبت عرضاً مضاداً`;
    addMessage('user', userText);

    try {
      const res = await handleAction(id, action);
      const result = res.data as ActionResult;

      setNegotiation((prev) =>
        prev ? { ...prev, status: result.status, roundNumber: result.roundNumber } : prev
      );

      addMessage('ai', result.message);

      if (result.status === 'AGREED' && result.dealId) {
        setDealId(result.dealId);
        if (result.finalPrice) setAgreedPrice(result.finalPrice);
        if (result.fee) setServiceFee(result.fee);
        setTimeout(() => setPageState('payment'), 800);
      } else if (result.status === 'FAILED') {
        // Stay in chat, show failed state
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg ?? 'حدث خطأ في معالجة الإجراء.');
      addMessage('ai', `⚠️ ${msg ?? 'حدث خطأ. حاول مرة أخرى.'}`);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Payment ────────────────────────────────────────────────────
  const handleInitiatePayment = async () => {
    if (!dealId) return;
    setPaymentLoading(true);
    try {
      const info = await initiatePayment(dealId);
      // Set fee from backend response
      if (info.fee) setServiceFee(info.fee);
      if (info.amount) setAgreedPrice(info.amount);
      // Navigate to mock payment page
      navigate(info.paymentUrl);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg ?? 'حدث خطأ في تهيئة الدفع.');
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── Reveal owner contact ───────────────────────────────────────
  const handleRevealOwner = async () => {
    if (!negotiation?.propertyId) return;
    setOwnerLoading(true);
    try {
      const res = await getOwnerContact(negotiation.propertyId);
      setOwnerPhone(res.ownerPhone);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg ?? 'تعذّر الحصول على بيانات المالك.');
    } finally {
      setOwnerLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  const isActive = negotiation?.status === 'ACTIVE';

  return (
    <div className="neg-page">
      {/* Header bar */}
      <header className="header">
        <Link to="/" className="header__logo">
          <div className="header__logo-icon">🏠</div>
          <span>سمسار AI</span>
        </Link>
        <div className="header__spacer" />
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '0 16px' }}>
          {negotiation && (
            <span>
              التفاوض — الجولة{' '}
              <strong>{negotiation.roundNumber}</strong>
              {' / '}
              <strong>{maxRounds}</strong>
            </span>
          )}
        </div>
      </header>

      {/* ── Loading ── */}
      {pageState === 'loading' && (
        <div className="loading-center">
          <div className="spinner spinner-lg" />
        </div>
      )}

      {/* ── Error ── */}
      {pageState === 'error' && (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{errorMsg}</p>
          <Link to="/" className="btn btn-primary">العودة للرئيسية</Link>
        </div>
      )}

      {/* ── Chat ── */}
      {(pageState === 'chat') && (
        <>
          <div className="neg-chat-container">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`neg-message neg-message--${m.role === 'ai' ? 'ai' : 'user'}`}
              >
                {m.role === 'ai' && <div className="neg-avatar">🤖</div>}
                <div className={`neg-bubble neg-bubble--${m.role === 'ai' ? 'ai' : 'user'}`}>
                  {m.text.split('\n').map((line, i) => (
                    <span key={i}>{line}{i < m.text.split('\n').length - 1 && <br />}</span>
                  ))}
                  <div className="neg-bubble__time">{now()}</div>
                </div>
                {m.role === 'user' && (
                  <div className="neg-avatar" style={{ background: '#374151' }}>👤</div>
                )}
              </div>
            ))}

            {negotiation?.status === 'FAILED' && (
              <div className="neg-status-chip">❌ انتهى التفاوض بدون اتفاق</div>
            )}
            {negotiation?.status === 'AGREED' && (
              <div className="neg-status-chip" style={{ background: 'var(--primary)' }}>
                ✅ تم الاتفاق!
              </div>
            )}

            {errorMsg && (
              <div className="alert alert-error" style={{ margin: '8px 0' }}>{errorMsg}</div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Action bar — only when ACTIVE */}
          {isActive && (
            <div className="neg-action-bar">
              {!showCounterInput ? (
                <div className="neg-action-bar__buttons">
                  <button
                    className="btn btn-primary"
                    disabled={actionLoading}
                    onClick={() => onAction('accept')}
                  >
                    ✅ قبول
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={actionLoading}
                    onClick={() => onAction('reject')}
                  >
                    ❌ رفض
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={actionLoading}
                    onClick={() => setShowCounterInput(true)}
                  >
                    🔄 عرض مضاد
                  </button>
                </div>
              ) : (
                <div>
                  <div className="neg-action-bar__counter-row">
                    <input
                      type="number"
                      className="neg-action-bar__counter-input"
                      placeholder="أدخل مبلغ العرض المضاد…"
                      value={counterValue}
                      onChange={(e) => setCounterValue(e.target.value)}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={actionLoading || !counterValue}
                      onClick={() => onAction('request_counter')}
                    >
                      إرسال
                    </button>
                    <button
                      className="btn btn-muted btn-sm"
                      onClick={() => { setShowCounterInput(false); setCounterValue(''); }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* When AGREED but still on chat page — prompt to go to payment */}
          {negotiation?.status === 'AGREED' && (
            <div className="neg-action-bar">
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={() => setPageState('payment')}
              >
                💳 إتمام الدفع لكشف بيانات المالك
              </button>
            </div>
          )}

          {/* When FAILED — prompt to restart */}
          {negotiation?.status === 'FAILED' && (
            <div className="neg-action-bar">
              <Link to="/" className="btn btn-ghost btn-full">
                🔍 البحث عن عقار آخر
              </Link>
            </div>
          )}
        </>
      )}

      {/* ── Payment step ── */}
      {pageState === 'payment' && (
        <div style={{ padding: 20 }}>
          <div className="payment-step">
            <div className="payment-step__icon">🤝</div>
            <div className="payment-step__title">تم الاتفاق!</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
              تحتاج لدفع رسوم الخدمة للحصول على بيانات تواصل المالك
            </div>

            <div className="payment-step__fee-row">
              <span className="payment-step__fee-label">سعر الاتفاق</span>
              <span className="payment-step__fee-amount">
                {agreedPrice ? formatMoney(agreedPrice) : '—'}
              </span>
            </div>
            <div className="payment-step__fee-row">
              <span className="payment-step__fee-label">رسوم الخدمة (0.25%)</span>
              <span className="payment-step__fee-amount">
                {serviceFee ? formatMoney(serviceFee) : '—'}
              </span>
            </div>
            <p className="payment-step__note">
              رسوم رمزية تضمن جودة الخدمة • مدفوعة مرة واحدة فقط لهذه الصفقة
            </p>
            {errorMsg && <div className="alert alert-error" style={{ marginBottom: 12 }}>{errorMsg}</div>}
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleInitiatePayment}
              disabled={paymentLoading || !dealId}
            >
              {paymentLoading ? <span className="spinner" /> : '💳 ادفع الآن'}
            </button>
          </div>
        </div>
      )}

      {/* ── Owner contact ── */}
      {pageState === 'owner' && (
        <div style={{ padding: 20 }}>
          <div className="owner-contact">
            <div className="owner-contact__icon">🎉</div>
            <div className="owner-contact__title">تم الدفع بنجاح!</div>
            <div className="owner-contact__sub">
              يمكنك الآن التواصل مع المالك مباشرةً لإتمام الصفقة
            </div>

            {!ownerPhone ? (
              <>
                {errorMsg && (
                  <div className="alert alert-error" style={{ marginBottom: 12 }}>{errorMsg}</div>
                )}
                <button
                  className="btn btn-primary btn-full btn-lg"
                  onClick={handleRevealOwner}
                  disabled={ownerLoading}
                  style={{ marginBottom: 12 }}
                >
                  {ownerLoading ? <span className="spinner" /> : '📱 اكشف رقم المالك'}
                </button>
              </>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                  رقم المالك
                </div>
                <div className="owner-contact__phone">{ownerPhone}</div>
              </div>
            )}

            <Link to="/" className="btn btn-ghost btn-full">
              🏠 العودة للرئيسية
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
