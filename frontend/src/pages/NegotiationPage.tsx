import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useNavigate, useParams, useLocation, Link, useSearchParams } from 'react-router-dom';
import {
  getBuyerNegotiation,
  getNegotiation,
  startNegotiation,
  proposePrice,
  submitBuyerReply,
  type BuyerReplyDto,
  type LatestEscalation,
} from '../api/negotiations';
import { initiateDeposit, completePayment, getPayment } from '../api/payments';
import { fetchPropertyById, getOwnerContact } from '../api/properties';
import type { Property, NegotiationStatus } from '../types';
import { useNegotiationStore } from '../store/negotiation';
import {
  MessageBubble,
  TypingIndicator,
  AiThinkingIndicator,
  negotiationComponentsCSS,
} from '../components/negotiation/MessageBubble';
import { Composer, composerCSS } from '../components/negotiation/Composer';
import { useThinkingSound } from '../hooks/useThinkingSound';

// ─── Types ──────────────────────────────────────────────────

type Phase =
  | 'loading'
  | 'greeting'
  | 'awaiting_choice'
  | 'awaiting_price'
  | 'evaluating'
  | 'waiting_seller'
  | 'awaiting_payment'
  | 'revealing_phone'
  | 'done'
  | 'ended'
  | 'error';

interface Msg {
  id: string;
  role: 'assistant' | 'user' | 'system';
  text: string;
  ts: number;
}

interface State {
  phase: Phase;
  property: Property | null;
  negotiationId: string | null;
  propertyId: string | null;
  messages: Msg[];
  pendingPaymentId: string | null;
  pendingDealId: string | null;
  ownerPhone: string | null;
  inputText: string;
  micActive: boolean;
  showPriceModal: boolean;
  priceInput: string;
  error: string | null;
  lastEscalationId: string | null;
  offers: { id: string; amount: number; round: number; createdBy: string }[];
  deals: { id: string; finalPrice: number; status: string }[];
}

type Action =
  | { type: 'SET_PROPERTY'; property: Property; propertyId: string }
  | { type: 'SET_NEGOTIATION'; negotiationId: string }
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'PUSH'; msg: Msg }
  | { type: 'INPUT'; text: string }
  | { type: 'MIC'; active: boolean }
  | { type: 'PRICE_MODAL'; open: boolean }
  | { type: 'PRICE_INPUT'; v: string }
  | { type: 'PAYMENT'; paymentId: string; dealId: string }
  | { type: 'OWNER'; phone: string }
  | { type: 'ESCALATION'; id: string | null }
  | { type: 'SET_OFFERS'; offers: { id: string; amount: number; round: number; createdBy: string }[] }
  | { type: 'SET_DEALS'; deals: { id: string; finalPrice: number; status: string }[] }
  | { type: 'ERR'; msg: string };

const initialState: State = {
  phase: 'loading',
  property: null,
  negotiationId: null,
  propertyId: null,
  messages: [],
  pendingPaymentId: null,
  pendingDealId: null,
  ownerPhone: null,
  inputText: '',
  micActive: false,
  showPriceModal: false,
  priceInput: '',
  error: null,
  lastEscalationId: null,
  offers: [],
  deals: [],
};

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'SET_PROPERTY':
      return { ...state, property: a.property, propertyId: a.propertyId };
    case 'SET_NEGOTIATION':
      return { ...state, negotiationId: a.negotiationId };
    case 'SET_PHASE':
      // eslint-disable-next-line no-console
      console.debug('[neg] phase →', a.phase);
      return { ...state, phase: a.phase };
    case 'PUSH':
      return { ...state, messages: [...state.messages, a.msg] };
    case 'INPUT':
      return { ...state, inputText: a.text };
    case 'MIC':
      return { ...state, micActive: a.active };
    case 'PRICE_MODAL':
      return { ...state, showPriceModal: a.open, priceInput: a.open ? state.priceInput : '' };
    case 'PRICE_INPUT':
      return { ...state, priceInput: a.v };
    case 'PAYMENT':
      return { ...state, pendingPaymentId: a.paymentId, pendingDealId: a.dealId };
    case 'OWNER':
      return { ...state, ownerPhone: a.phone };
    case 'ESCALATION':
      return { ...state, lastEscalationId: a.id };
    case 'SET_OFFERS':
      return { ...state, offers: a.offers };
    case 'SET_DEALS':
      return { ...state, deals: a.deals };
    case 'ERR':
      return { ...state, error: a.msg, phase: 'error' };
  }
}

function fmt(n: number): string {
  return n.toLocaleString('ar-EG') + ' ج.م';
}
function nowId(): string {
  return Math.random().toString(36).slice(2);
}

// ─── Web Speech API typing ──────────────────────────────────
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── Phase label helper ────────────────────────────────────
function phaseLabel(p: Phase): string {
  switch (p) {
    case 'awaiting_choice':
      return 'في انتظار قرارك';
    case 'awaiting_price':
      return 'اقتراح سعر';
    case 'evaluating':
      return 'جاري التقييم';
    case 'waiting_seller':
      return 'في انتظار البائع';
    case 'awaiting_payment':
      return 'في انتظار الدفع';
    case 'revealing_phone':
      return 'كشف الرقم';
    case 'done':
      return 'تم';
    case 'ended':
      return 'انتهى';
    case 'greeting':
      return 'بدأ التفاوض';
    default:
      return '';
  }
}

// ─── Component ──────────────────────────────────────────────

export const NegotiationPage: React.FC = () => {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { property?: Property } | null;
  const [state, dispatch] = useReducer(reducer, initialState);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pollRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  const SR = useMemo(getSpeechRecognition, []);

  const push = useCallback((role: Msg['role'], text: string) => {
    dispatch({ type: 'PUSH', msg: { id: nowId(), role, text, ts: Date.now() } });
  }, []);

  // Current offer summary for buyer negotiation
  const lastOffer = useMemo(() => {
    return state.offers.length ? state.offers[state.offers.length - 1] : null;
  }, [state.offers]);

  const refreshBuyerNegotiation = useCallback(async () => {
    if (!state.negotiationId) return null;
    try {
      const result = await getBuyerNegotiation(state.negotiationId);
      if (!aliveRef.current) return null;
      dispatch({ type: 'SET_OFFERS', offers: result.data.offers });
      dispatch({ type: 'SET_DEALS', deals: result.data.deals });
      return result.data;
    } catch {
      return null;
    }
  }, [state.negotiationId]);

  // ── Initial load ─────────────────────────────────────────
  useEffect(() => {
    aliveRef.current = true;
    if (!routeId) {
      navigate('/');
      return;
    }
    (async () => {
      try {
        // ── Determine if we came from HomePage with a property (vs direct URL) ──
        const passedProperty = locationState?.property;

        let negotiationId: string;
        let property: Property;

        if (passedProperty) {
          // ── Case A: Navigated from HomePage → routeId is a propertyId ──
          property = passedProperty;
          const propertyId = property.id;

          dispatch({ type: 'SET_PROPERTY', property, propertyId });

          // Start a new negotiation (buyerMaxPrice = property price * 1.1 as ceiling)
          const buyerMaxPrice = Math.round(Number(property.price ?? 0) * 1.1);
          const startRes = await startNegotiation(propertyId, buyerMaxPrice);
          if (!aliveRef.current) return;

          negotiationId = startRes.data.negotiationId;

          dispatch({ type: 'SET_NEGOTIATION', negotiationId });
          dispatch({ type: 'SET_PHASE', phase: 'greeting' });

          // The backend already generated an initial greeting message
          if (startRes.data.message) {
            push('assistant', startRes.data.message);
          }
          dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
          return;
        }

        // ── Case B: Direct URL → routeId is a negotiationId ──
        const neg = await getBuyerNegotiation(routeId);
        if (!aliveRef.current) return;
        const negData = neg.data.negotiation;
        const propertyId = negData.propertyId;
        property = (await fetchPropertyById(propertyId))!;
        if (!aliveRef.current) return;
        dispatch({ type: 'SET_PROPERTY', property, propertyId });
        dispatch({ type: 'SET_NEGOTIATION', negotiationId: negData.negotiationId });
        dispatch({ type: 'SET_OFFERS', offers: neg.data.offers });
        dispatch({ type: 'SET_DEALS', deals: neg.data.deals });
        negotiationId = negData.negotiationId;

        if (negData.status === 'AGREED' && neg.data.deals[0]) {
          dispatch({
            type: 'PAYMENT',
            paymentId: '',
            dealId: neg.data.deals[0].id,
          });
          try {
            const dep = await initiateDeposit(neg.data.deals[0].id);
            if (!aliveRef.current) return;
            dispatch({ type: 'PAYMENT', paymentId: dep.paymentId, dealId: neg.data.deals[0].id });
            dispatch({ type: 'SET_PHASE', phase: 'awaiting_payment' });
          } catch {
            dispatch({ type: 'SET_PHASE', phase: 'awaiting_payment' });
          }
          return;
        }
        if (negData.status === 'FAILED') {
          dispatch({ type: 'SET_PHASE', phase: 'ended' });
          return;
        }

        if (negData.message) {
          push('assistant', negData.message);
        }
        dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'تعذّر تحميل التفاوض.';
        dispatch({ type: 'ERR', msg });
      }
    })();
    return () => {
      aliveRef.current = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // ── Auto-scroll ──────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // ── Socket.IO real-time connection (Sprint 3) ────────────
  const storeConnect = useNegotiationStore((s) => s.connect);
  const storeDisconnect = useNegotiationStore((s) => s.disconnect);
  const storeMessages = useNegotiationStore((s) => s.messages);
  const storeViewerRole = useNegotiationStore((s) => s.viewerRole);
  const storeAiThinking = useNegotiationStore((s) => s.aiThinking);
  const storeRemoteTyping = useNegotiationStore((s) => s.remoteTypingUserId);
  const storeMarkAllRead = useNegotiationStore((s) => s.markAllRead);
  const storeSetFocus = useNegotiationStore((s) => s.setFocusMessage);
  const storeFocusId = useNegotiationStore((s) => s.focusMessageId);

  const [searchParams] = useSearchParams();
  const focusMsgParam = searchParams.get('focus');

  // Connect socket when negotiationId is available
  useEffect(() => {
    if (!state.negotiationId) return;
    storeConnect(state.negotiationId);
    return () => storeDisconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.negotiationId]);

  // Handle notification deep-link focus
  useEffect(() => {
    if (focusMsgParam) {
      storeSetFocus(focusMsgParam);
      // Scroll to focused message after a short delay
      setTimeout(() => {
        const el = document.getElementById(`msg-${focusMsgParam}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  }, [focusMsgParam, storeSetFocus]);

  // Mark all as read on mount
  useEffect(() => {
    if (state.negotiationId) {
      storeMarkAllRead();
    }
  }, [state.negotiationId, storeMarkAllRead]);

  // Play thinking sound when AI starts thinking (T24)
  const playThinkingSound = useThinkingSound();
  const prevAiThinkingRef = useRef(false);
  useEffect(() => {
    if (storeAiThinking && !prevAiThinkingRef.current) {
      playThinkingSound();
    }
    prevAiThinkingRef.current = storeAiThinking;
  }, [storeAiThinking, playThinkingSound]);

  const handleBuyerReply = useCallback(
    async (payload: BuyerReplyDto, userText: string) => {
      if (!state.negotiationId) return;
      dispatch({ type: 'SET_PHASE', phase: 'evaluating' });
      push('user', userText);
      try {
        const res = await submitBuyerReply(state.negotiationId, payload);
        if ('message' in res && res.message) {
          push('assistant', res.message);
        }
        const status = (res as { status?: NegotiationStatus }).status;
        if (status === 'FAILED') {
          dispatch({ type: 'SET_PHASE', phase: 'ended' });
          return;
        }
        if ('paymentId' in res && res.paymentId && 'dealId' in res && res.dealId) {
          dispatch({ type: 'PAYMENT', paymentId: res.paymentId, dealId: res.dealId });
          dispatch({ type: 'SET_PHASE', phase: 'awaiting_payment' });
          return;
        }
        const refreshed = await refreshBuyerNegotiation();
        if (!refreshed) {
          dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
          return;
        }
        if (refreshed.negotiation.status === 'FAILED') {
          dispatch({ type: 'SET_PHASE', phase: 'ended' });
          return;
        }
        if (refreshed.negotiation.status === 'AGREED' && refreshed.deals[0]) {
          dispatch({ type: 'PAYMENT', paymentId: '', dealId: refreshed.deals[0].id });
          dispatch({ type: 'SET_PHASE', phase: 'awaiting_payment' });
          return;
        }
        dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'تعذّر إرسال الرد.';
        push('assistant', `⚠️ ${msg}`);
        dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
      }
    },
    [state.negotiationId, push, refreshBuyerNegotiation],
  );

  const handleSubmitOpinion = useCallback(async () => {
    const text = state.inputText.trim();
    if (!text || !state.negotiationId) return;
    dispatch({ type: 'INPUT', text: '' });
    await handleBuyerReply({ responseType: 'opinion', comment: text }, text);
  }, [state.inputText, state.negotiationId, handleBuyerReply]);

  // ── Handlers ─────────────────────────────────────────────

  const handleProposePrice = useCallback(
    async (price: number) => {
      if (!state.negotiationId) return;
      dispatch({ type: 'SET_PHASE', phase: 'evaluating' });
      push('user', `أعرض ${fmt(price)}`);
      try {
        const res = await proposePrice(state.negotiationId, price);
        push('assistant', res.message);
        if (res.decision === 'BELOW_MIN') {
          dispatch({ type: 'ESCALATION', id: res.escalationId ?? null });
          dispatch({ type: 'SET_PHASE', phase: 'waiting_seller' });
          return;
        }
        // IN_BAND or ABOVE_MAX → deposit
        if (res.paymentId && res.dealId) {
          dispatch({ type: 'PAYMENT', paymentId: res.paymentId, dealId: res.dealId });
          dispatch({ type: 'SET_PHASE', phase: 'awaiting_payment' });
        }
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'تعذّر إرسال العرض.';
        push('assistant', `⚠️ ${msg}`);
        dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
      }
    },
    [state.negotiationId, push],
  );

  const handleAcceptListedPrice = useCallback(() => {
    if (!state.property) return;
    handleProposePrice(Number(state.property.price ?? 0));
  }, [state.property, handleProposePrice]);

  const handleSubmitPriceModal = useCallback(() => {
    const v = Number(state.priceInput.replace(/[^\d.]/g, ''));
    if (!v || v <= 0) return;
    dispatch({ type: 'PRICE_MODAL', open: false });
    handleProposePrice(v);
  }, [state.priceInput, handleProposePrice]);

  const handleFreeText = useCallback(async () => {
    const text = state.inputText.trim();
    if (!text || !state.negotiationId) return;
    dispatch({ type: 'INPUT', text: '' });

    // If pure number, treat as price proposal
    const numeric = Number(text.replace(/[,\s]/g, ''));
    if (!Number.isNaN(numeric) && numeric > 0 && /^[\d,.\s]+$/.test(text)) {
      handleProposePrice(numeric);
      return;
    }

    await handleSubmitOpinion();
  }, [state.inputText, state.negotiationId, handleSubmitOpinion, handleProposePrice]);

  // ── Mic ──────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    if (!SR) return;
    if (state.micActive) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
      dispatch({ type: 'MIC', active: false });
      return;
    }
    const rec = new SR();
    rec.lang = 'ar-EG';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const out = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      dispatch({ type: 'INPUT', text: out });
    };
    rec.onerror = () => {
      dispatch({ type: 'MIC', active: false });
    };
    rec.onend = () => {
      dispatch({ type: 'MIC', active: false });
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      dispatch({ type: 'MIC', active: true });
    } catch {
      dispatch({ type: 'MIC', active: false });
    }
  }, [SR, state.micActive]);

  // ── Payment polling & mock-pay ───────────────────────────
  const completePollLoop = useCallback(
    (paymentId: string, dealId: string, propertyId: string) => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      let attempts = 0;
      pollRef.current = window.setInterval(async () => {
        attempts += 1;
        try {
          const p = await getPayment(paymentId);
          if (p.status === 'COMPLETED') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            dispatch({ type: 'SET_PHASE', phase: 'revealing_phone' });
            try {
              const oc = await getOwnerContact(propertyId);
              dispatch({ type: 'OWNER', phone: oc.ownerPhone });
              dispatch({ type: 'SET_PHASE', phase: 'done' });
              push('system', 'تم الدفع. تم كشف رقم المالك.');
            } catch {
              push('system', 'تم الدفع، لكن تعذّر كشف الرقم. حاول لاحقًا.');
              dispatch({ type: 'SET_PHASE', phase: 'done' });
            }
          }
          if (attempts > 60) {
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        } catch {
          /* noop */
        }
      }, 2000) as unknown as number;
      // suppress unused
      void dealId;
    },
    [push],
  );

  const handleMockPay = useCallback(async () => {
    if (!state.pendingPaymentId || !state.pendingDealId || !state.propertyId) return;
    try {
      await completePayment(state.pendingPaymentId, 100);
      push('system', 'تم استلام الدفع، جارٍ كشف بيانات المالك…');
      completePollLoop(state.pendingPaymentId, state.pendingDealId, state.propertyId);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'تعذّر إتمام الدفع.';
      push('system', `⚠️ ${msg}`);
    }
  }, [state.pendingPaymentId, state.pendingDealId, state.propertyId, completePollLoop, push]);

  // ── Poll seller escalation while waiting ─────────────────
  useEffect(() => {
    if (state.phase !== 'waiting_seller' || !state.negotiationId) return;
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await getNegotiation(state.negotiationId!);
        const esc: LatestEscalation | null | undefined = r.data.latestEscalation;
        if (!esc || esc.status !== 'RESOLVED') return;
        if (pollRef.current) window.clearInterval(pollRef.current);

        if (esc.sellerAction === 'ACCEPT') {
          push('assistant', 'البائع وافق على عرضك! اتفضل اكمل الدفع علشان نكشف رقمه.');
          const deals = r.data.deals ?? [];
          const deal = deals[deals.length - 1];
          if (deal?.id) {
            try {
              const dep = await initiateDeposit(deal.id);
              dispatch({ type: 'PAYMENT', paymentId: dep.paymentId, dealId: deal.id });
              dispatch({ type: 'SET_PHASE', phase: 'awaiting_payment' });
            } catch {
              dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
            }
          }
        } else if (esc.sellerAction === 'REJECT') {
          push('assistant', 'مع الأسف، البائع رفض العرض. تقدر تجرب سعر تاني أو تبحث عن عقار آخر.');
          dispatch({ type: 'SET_PHASE', phase: 'ended' });
        } else if (esc.sellerAction === 'COUNTER') {
          const counter = Number(esc.sellerCounter ?? 0);
          push(
            'assistant',
            `البائع رد بعرض مضاد: ${fmt(counter)}. تقدر توافق أو تقترح سعر تاني.`,
          );
          dispatch({ type: 'SET_PHASE', phase: 'awaiting_choice' });
        }
      } catch {
        /* noop */
      }
    }, 4000) as unknown as number;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [state.phase, state.negotiationId, push]);

  // ── Render ───────────────────────────────────────────────

  if (state.phase === 'loading') {
    return (
      <div className="neg-page">
        <div className="loading-center">
          <div className="spinner spinner-lg" />
        </div>
      </div>
    );
  }
  if (state.phase === 'error') {
    return (
      <div className="neg-page">
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>😕</div>
          <p style={{ color: 'var(--danger)' }}>{state.error}</p>
          <Link to="/" className="btn btn-primary">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  const property = state.property;
  return (
    <div className="neg-page">
      {/* Inject component CSS (Sprint 3) */}
      <style dangerouslySetInnerHTML={{ __html: negotiationComponentsCSS + composerCSS }} />
      <header className="header">
        <Link to="/" className="header__logo">
          <div className="header__logo-icon">🏠</div>
          <span>سمسار AI</span>
        </Link>
        <div className="header__spacer" />
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 16px' }}>
          {property && (
            <span>
              {property.title} • <strong>{fmt(Number(property.price ?? 0))}</strong>
            </span>
          )}
        </div>
        <div style={{ padding: '0 12px' }}>
          <span className={`neg-status-badge neg-status-badge--${state.phase}`}>
            {phaseLabel(state.phase)}
          </span>
        </div>
      </header>

      {/* Chat */}
      <div className="neg-chat-container">
        {/* Legacy phase-based messages (buyer flow) */}
        {state.messages.map((m) => (
          <div
            key={m.id}
            className={`neg-message neg-message--${m.role === 'user' ? 'user' : 'ai'}`}
          >
            {m.role !== 'user' && <div className="neg-avatar">{m.role === 'system' ? 'ℹ️' : '🤖'}</div>}
            <div className={`neg-bubble neg-bubble--${m.role === 'user' ? 'user' : 'ai'}`}>
              {m.text.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < m.text.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
            {m.role === 'user' && (
              <div className="neg-avatar" style={{ background: '#374151' }}>
                👤
              </div>
            )}
          </div>
        ))}

        {/* Real-time Socket.IO messages (Sprint 3 — unified) */}
        {storeMessages.length > 0 && (
          <div className="neg-realtime-divider">
            <span>الرسائل المباشرة</span>
          </div>
        )}
        {storeMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            viewerRole={storeViewerRole ?? 'BUYER'}
            isFocus={storeFocusId === msg.id}
          />
        ))}

        {/* AI Thinking indicator */}
        {storeAiThinking && <AiThinkingIndicator />}

        {/* Typing indicator */}
        <TypingIndicator userId={storeRemoteTyping} />

        {state.phase === 'waiting_seller' && (
          <div className="neg-status-chip">⏳ بنراجع مع البائع، هتوصلك الإجابة هنا.</div>
        )}
        {state.phase === 'ended' && (
          <div className="neg-status-chip">انتهى التفاوض.</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Real-time Composer (Sprint 3) */}
      {state.negotiationId && (
        <Composer negotiationId={state.negotiationId} disabled={state.phase === 'ended'} />
      )}

      {/* Action chips */}
      {state.phase === 'awaiting_choice' && property && (
        <>
          {lastOffer && (
            <div className="neg-snippet-card">
              <div>
                <strong>عرض البائع الحالي</strong>
              </div>
              <div>{fmt(lastOffer.amount)} • جولة {lastOffer.round}</div>
            </div>
          )}
          <div className="neg-action-bar">
            <div className="neg-action-bar__buttons">
              <button className="btn btn-primary" onClick={handleAcceptListedPrice}>
                ✅ أوافق على السعر المعروض
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => dispatch({ type: 'PRICE_MODAL', open: true })}
              >
                💬 اقترح سعر آخر
              </button>
            </div>
          </div>
          {lastOffer && (
            <div className="neg-action-bar">
              <div className="neg-action-bar__buttons">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    handleBuyerReply(
                      { responseType: 'accept' },
                      `أوافق على العرض الحالي ${fmt(lastOffer.amount)}`,
                    )
                  }
                >
                  ✅ أوافق على العرض الحالي
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    handleBuyerReply({ responseType: 'reject' }, 'أرفض العرض الحالي')
                  }
                >
                  ❌ أرفض العرض الحالي
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Composer */}
      {(state.phase === 'awaiting_choice' ||
        state.phase === 'waiting_seller' ||
        state.phase === 'evaluating') && (
        <div className="neg-action-bar">
          <div className="neg-action-bar__counter-row">
            {SR && (
              <button
                type="button"
                className={`neg-mic ${state.micActive ? 'neg-mic--active' : ''}`}
                onClick={toggleMic}
                title="تحدث"
              >
                🎤
              </button>
            )}
            <input
              type="text"
              className="neg-action-bar__counter-input"
              placeholder="اكتب رسالتك أو سعرك…"
              value={state.inputText}
              onChange={(e) => dispatch({ type: 'INPUT', text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFreeText();
              }}
            />
            <button className="btn btn-primary" onClick={handleFreeText}>
              إرسال
            </button>
          </div>
        </div>
      )}

      {/* Price modal */}
      {state.showPriceModal && (
        <div
          className="neg-deposit-modal"
          onClick={() => dispatch({ type: 'PRICE_MODAL', open: false })}
        >
          <div className="neg-deposit-modal__card" onClick={(e) => e.stopPropagation()}>
            <h3>اقترح سعر</h3>
            <input
              autoFocus
              type="number"
              className="form-input"
              placeholder="السعر بالجنيه"
              value={state.priceInput}
              onChange={(e) => dispatch({ type: 'PRICE_INPUT', v: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitPriceModal();
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary"
                disabled={!state.priceInput}
                onClick={handleSubmitPriceModal}
              >
                إرسال العرض
              </button>
              <button
                className="btn btn-muted"
                onClick={() => dispatch({ type: 'PRICE_MODAL', open: false })}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit modal */}
      {state.phase === 'awaiting_payment' && state.pendingPaymentId && (
        <div className="neg-deposit-modal">
          <div className="neg-deposit-modal__card">
            <div style={{ fontSize: 36, textAlign: 'center' }}>💳</div>
            <h3 style={{ textAlign: 'center' }}>ادفع 100 ج.م لكشف رقم المالك</h3>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
              رسوم رمزية تضمن جودة الخدمة — مدفوعة مرة واحدة فقط لهذه الصفقة.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-lg" onClick={handleMockPay}>
                ادفع الآن (محاكاة)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phone reveal */}
      {state.phase === 'done' && state.ownerPhone && (
        <div className="neg-phone-card">
          <div style={{ fontSize: 32 }}>🎉</div>
          <h3>تم الدفع — رقم المالك</h3>
          <div className="owner-contact__phone" style={{ marginBottom: 12 }}>
            {state.ownerPhone}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <a className="btn btn-primary" href={`tel:${state.ownerPhone}`}>
              📞 اتصال
            </a>
            <a
              className="btn btn-ghost"
              href={`https://wa.me/${state.ownerPhone.replace(/^\+|^0/, '20')}`}
              target="_blank"
              rel="noreferrer"
            >
              💬 واتساب
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

function phaseLabel(p: Phase): string {
  switch (p) {
    case 'awaiting_choice':
      return 'في انتظار قرارك';
    case 'awaiting_price':
      return 'اقتراح سعر';
    case 'evaluating':
      return 'جاري التقييم';
    case 'waiting_seller':
      return 'في انتظار البائع';
    case 'awaiting_payment':
      return 'في انتظار الدفع';
    case 'revealing_phone':
      return 'كشف الرقم';
    case 'done':
      return 'تم';
    case 'ended':
      return 'انتهى';
    case 'greeting':
      return 'بدأ التفاوض';
    default:
      return '';
  }
}
