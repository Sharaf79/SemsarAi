import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useChatContext } from '../store/ChatContext';
import { AuthModal } from './AuthModal';
import {
  sendChatMessage,
  startOnboarding,
  submitOnboardingAnswer,
  finalSubmitOnboarding,
  getOrCreateAnonId,
  type ChatOption,
  type ChatResponseData,
} from '../api/chat';
import { getGovernorates, getCities } from '../api/locations';
import type { PropertyFilters, PropertyType, PropertyKind } from '../types';

// ─── Types ───────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'bot' | 'user';
  text: string;
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function nowLabel(): string {
  return new Date().toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Normalise an option from the API into a display label string. */
function optionLabel(opt: ChatOption): string {
  return typeof opt === 'string' ? opt : opt.label;
}

/** Get the raw answer value to send to the backend for an option. */
function optionAnswer(opt: ChatOption): unknown {
  // Location options have a numeric id — send { id } as the backend expects
  if (typeof opt !== 'string' && opt.id) {
    const numId = Number(opt.id);
    return isNaN(numId) ? opt.id : { id: numId };
  }
  return optionLabel(opt);
}

/** The two persistent main-menu buttons shown at chat open & after flow completion. */
const MAIN_MENU_OPTIONS: ChatOption[] = ['ابحث عن عقار 🔍', 'أضيف عقار 🏠'];

// ─── Search-flow step definitions ───────────────────────────────

type SearchStep = 'S_TYPE' | 'S_KIND' | 'S_GOV' | 'S_CITY' | 'S_BEDS' | 'S_BUDGET' | 'S_RESULTS';

const S_TYPE_OPTIONS: ChatOption[] = [
  { id: 'SALE', label: 'للبيع' },
  { id: 'RENT', label: 'للإيجار' },
  { id: '', label: 'الكل' },
];

const S_KIND_OPTIONS: ChatOption[] = [
  { id: 'APARTMENT', label: 'شقة 🏢' },
  { id: 'VILLA', label: 'فيلا 🏡' },
  { id: 'SHOP', label: 'محل 🏪' },
  { id: 'OFFICE', label: 'مكتب 🏛️' },
  { id: 'SUMMER_RESORT', label: 'مصايف 🏖️' },
  { id: 'COMMERCIAL', label: 'تجارى 🏗️' },
  { id: 'LAND_BUILDING', label: 'مبانى وأراضى 🏗️' },
  { id: '', label: 'الكل' },
];

const S_BEDS_OPTIONS: ChatOption[] = [
  { id: '1', label: '١ غرفة' },
  { id: '2', label: '٢ غرفة' },
  { id: '3', label: '٣ غرف' },
  { id: '4', label: '٤ غرف' },
  { id: '5', label: '٥+' },
  { id: '', label: 'غير محدد' },
];

/** Build URL search string from PropertyFilters for home page navigation. */
function buildFilterSearch(f: PropertyFilters): string {
  const p = new URLSearchParams();
  if (f.propertyType) p.set('type', f.propertyType);
  if (f.propertyKind) p.set('kind', f.propertyKind);
  if (f.governorate) p.set('gov', f.governorate);
  if (f.city) p.set('city', f.city);
  if (f.bedrooms != null && !isNaN(f.bedrooms)) p.set('beds', String(f.bedrooms));
  if (f.maxPrice != null && !isNaN(f.maxPrice)) p.set('maxPrice', String(f.maxPrice));
  const str = p.toString();
  return str ? `/?${str}` : '/';
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'init-1',
    role: 'bot',
    text: 'أهلاً بك 👋 أنا سمسار AI مساعدك العقاري!\n\nتريد البحث عن عقار مناسب أو إضافة عقارك للبيع أو الإيجار؟',
    timestamp: nowLabel(),
  },
];

// ─── Component ───────────────────────────────────────────────────

export const ChatWidget: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isOpen, pendingMessage, consumePendingMessage, openChat, closeChat } = useChatContext();

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  /** Options surfaced by the last bot reply (multi-choice step). */
  const [options, setOptions] = useState<ChatOption[]>(MAIN_MENU_OPTIONS);
  /** Track the current entity ID so we can pass it on follow-up messages. */
  const [entityId, setEntityId] = useState<string | undefined>();
  /** Track the active flow so we can pass it explicitly on follow-up messages. */
  const [activeFlow, setActiveFlow] = useState<'onboarding' | 'negotiation' | undefined>();
  /** Track the active step for the onboarding API */
  const [currentStep, setCurrentStep] = useState<string | undefined>();
  /** Track the input type requested by the backend (e.g. file, multi-choice) */
  const [inputType, setInputType] = useState<string | undefined>();

  /** ── Search flow state ── */
  const [searchStep, setSearchStep] = useState<SearchStep | undefined>();
  const [searchFilters, setSearchFilters] = useState<PropertyFilters>({});

  const bottomRef = useRef<HTMLDivElement>(null);

  // ─── Close chat and reset all state ─────────────────────────────
  const handleCloseChat = useCallback(() => {
    setMessages(INITIAL_MESSAGES);
    setInput('');
    setLoading(false);
    setOptions(MAIN_MENU_OPTIONS);
    setEntityId(undefined);
    setActiveFlow(undefined);
    setCurrentStep(undefined);
    setInputType(undefined);
    setSearchStep(undefined);
    setSearchFilters({});
    closeChat();
  }, [closeChat]);

  // Auto-scroll whenever messages change or the window opens.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, loading]);

  // After successful listing fee payment, the user is redirected to /?add_property=1.
  // Detect this, clean the URL, and auto-open the chat to start onboarding.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('add_property') === '1') {
      navigate('/', { replace: true });
      setTimeout(() => openChat('أضيف عقار 🏠'), 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // When the widget is opened or when a new pending message is set (e.g. from the header),
  // auto-send that message once the user is ready.
  useEffect(() => {
    if (!isOpen || !pendingMessage) return;
    const pending = consumePendingMessage();
    if (pending) {
      void dispatchMessage(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingMessage, consumePendingMessage]);

  // ─── Message helpers ────────────────────────────────────────────

  const pushMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random()}`, timestamp: nowLabel() },
    ]);
  }, []);

  // ─── API call ───────────────────────────────────────────────────

  const dispatchMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      // ── Search flow start ────────────────────────────────────────────
      if (text === 'ابحث عن عقار 🔍') {
        pushMessage({ role: 'user', text });
        setSearchFilters({});
        setSearchStep('S_TYPE');
        setActiveFlow(undefined);
        setCurrentStep(undefined);
        navigate('/');
        pushMessage({ role: 'bot', text: 'سنبحث لك عن عقار مناسب! 🏡\nتريد شراء أم إيجار؟' });
        setOptions(S_TYPE_OPTIONS);
        setInputType('multi-choice');
        return;
      }

      // ── Search flow in progress — route input to search handler ──────
      if (searchStep) {
        pushMessage({ role: 'user', text: text.trim() });
        setInput('');
        setOptions([]);
        await handleSearchInput(text.trim());
        return;
      }

      // ── Auth gate ──────────────────────────────────────────────────
      if (text === 'أضيف عقار 🏠') {
        if (!user) {
          setShowAuthModal(true);
          return;
        }
        // Logged-in users automatically get free listing credits on the backend
      }

      // Optimistically show the user's message.
      pushMessage({ role: 'user', text: text.trim() });
      setInput('');
      setOptions([]);
      setLoading(true);

      try {
        const uid = user?.id ?? getOrCreateAnonId();
        let response;

        if (text === 'أضيف عقار 🏠') {
          response = await startOnboarding(uid);
          setActiveFlow('onboarding');
        } else if (text === 'ابدا من جديد ♻️' || text === 'إلغاء والبدء من جديد') {
          response = await startOnboarding(uid, true);
          setActiveFlow('onboarding');
        } else if (activeFlow === 'onboarding' && currentStep === 'REVIEW') {
          // REVIEW step confirms and publishes via POST /onboarding/submit
          response = await finalSubmitOnboarding(uid);
        } else if (activeFlow === 'onboarding' && currentStep && currentStep !== 'DETAILS') {
          response = await submitOnboardingAnswer(uid, currentStep, text);
        } else {
          response = await sendChatMessage({
            message: text.trim(),
            userId: uid,
            ...(activeFlow ? { flow: activeFlow } : {}),
            ...(entityId ? { entityId } : {}),
          });
        }

        // Persist context for follow-up turns.
        if (response.data?.step) {
          setActiveFlow('onboarding');
          setCurrentStep(response.data.step);
        }
        if (response.data?.negotiationId) {
          setActiveFlow('negotiation');
          setEntityId(response.data.negotiationId);
        }

        // Show the bot reply.
        pushMessage({ role: 'bot', text: response.message });

        // Store input type if available
        setInputType(response.data?.inputType);

        // Surface options if this step has options (quick-pick buttons).
        if (Array.isArray(response.data?.options) && (response.data.options as ChatOption[]).length > 0) {
          setOptions([...(response.data.options as ChatOption[])]);
        } else {
          setOptions([]);
        }

        // Handle special terminal actions.
        handleAction(response.action, response.data);
      } catch (err: unknown) {
        let msg = 'حدث خطأ، حاول مرة ثانية.';
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { status?: number; data?: { message?: string | string[]; creditId?: string } } };
          const apiMsg = axiosErr.response?.data?.message;
          if (Array.isArray(apiMsg)) msg = apiMsg.join('\n');
          else if (typeof apiMsg === 'string') msg = apiMsg;
          
          // Check if this is a payment required error (403 with creditId)
          const creditId = axiosErr.response?.data?.creditId;
          if (creditId) {
            pushMessage({ role: 'bot', text: `⚠️ ${msg}` });
            navigate(`/listing-payment/${creditId}`);
            setLoading(false);
            return;
          }
        } else if (err instanceof Error) {
          msg = err.message;
        }
        pushMessage({ role: 'bot', text: `⚠️ ${msg}` });
      } finally {
        setLoading(false);
      }
    },
    [loading, user, activeFlow, currentStep, entityId, searchStep, pushMessage],
  );

  // ─── Action routing ─────────────────────────────────────────────

  function handleAction(action?: string, data?: ChatResponseData) {
    if (!action) return;
    if (action === 'COMPLETED') {
      // Onboarding finished — reset flow state and offer to start again.
      setActiveFlow(undefined);
      setCurrentStep(undefined);
      setEntityId(undefined);
      setTimeout(() => {
        setOptions(MAIN_MENU_OPTIONS);
      }, 1000);
    }
    if (action === 'negotiation_started' && data?.negotiationId) {
      setTimeout(() => navigate(`/negotiation/${data.negotiationId}`), 800);
    }
  }

  // ─── Search flow handler ───────────────────────────────────────

  async function handleSearchInput(rawValue: string, _displayLabel?: string) {
    const val = rawValue.trim();

    switch (searchStep) {
      case 'S_TYPE': {
        const map: Record<string, PropertyType | undefined> = { SALE: 'SALE', RENT: 'RENT', '': undefined };
        const mapped = Object.prototype.hasOwnProperty.call(map, val) ? map[val] : undefined;
        setSearchFilters((f) => ({ ...f, propertyType: mapped }));
        navigate(buildFilterSearch({ ...searchFilters, propertyType: mapped }));
        setSearchStep('S_KIND');
        pushMessage({ role: 'bot', text: 'ما نوع العقار الذي تبحث عنه؟' });
        setOptions(S_KIND_OPTIONS);
        setInputType('multi-choice');
        break;
      }
      case 'S_KIND': {
        const kind = val as PropertyKind | '';
        setSearchFilters((f) => ({ ...f, propertyKind: kind || undefined }));
        navigate(buildFilterSearch({ ...searchFilters, propertyKind: kind || undefined }));
        setSearchStep('S_GOV');
        pushMessage({ role: 'bot', text: 'في أي محافظة؟' });
        setLoading(true);
        try {
          const { governorates } = await getGovernorates();
          const govOpts: ChatOption[] = governorates.map((g) => ({ id: g.id.toString(), label: g.nameAr }));
          govOpts.push({ id: '', label: 'أي محافظة' });
          setOptions(govOpts);
        } catch {
          setOptions([{ id: '', label: 'أي محافظة' }]);
        } finally {
          setLoading(false);
        }
        setInputType('multi-choice');
        break;
      }
      case 'S_GOV': {
        const govId = val ? Number(val) : NaN;
        if (!isNaN(govId) && govId > 0) {
          // Find the label for the chosen governorate from the currently displayed options
          const govLabel = _displayLabel ?? val;
          setSearchFilters((f) => ({ ...f, governorate: govLabel }));
          navigate(buildFilterSearch({ ...searchFilters, governorate: govLabel }));
          // Load cities for this governorate
          setSearchStep('S_CITY');
          pushMessage({ role: 'bot', text: 'في أي مدينة؟' });
          setLoading(true);
          try {
            const { cities } = await getCities(govId);
            if (cities.length > 0) {
              const cityOpts: ChatOption[] = cities.map((c) => ({ id: c.id.toString(), label: c.nameAr }));
              cityOpts.push({ id: '', label: 'أي مدينة' });
              setOptions(cityOpts);
              setInputType('multi-choice');
            } else {
              // No cities — skip to bedrooms
              setSearchStep('S_BEDS');
              pushMessage({ role: 'bot', text: 'كم غرفة تقريباً؟' });
              setOptions(S_BEDS_OPTIONS);
              setInputType('multi-choice');
            }
          } catch {
            setSearchStep('S_BEDS');
            pushMessage({ role: 'bot', text: 'كم غرفة تقريباً؟' });
            setOptions(S_BEDS_OPTIONS);
            setInputType('multi-choice');
          } finally {
            setLoading(false);
          }
        } else {
          // "أي محافظة" chosen
          setSearchStep('S_BEDS');
          pushMessage({ role: 'bot', text: 'كم غرفة تقريباً؟' });
          setOptions(S_BEDS_OPTIONS);
          setInputType('multi-choice');
        }
        break;
      }
      case 'S_CITY': {
        if (val) {
          const cityLabel = _displayLabel ?? val;
          setSearchFilters((f) => ({ ...f, city: cityLabel }));
          navigate(buildFilterSearch({ ...searchFilters, city: cityLabel }));
        }
        setSearchStep('S_BEDS');
        pushMessage({ role: 'bot', text: 'كم غرفة تقريباً؟' });
        setOptions(S_BEDS_OPTIONS);
        setInputType('multi-choice');
        break;
      }
      case 'S_BEDS': {
        const beds = val ? Number(val) : undefined;
        const bedsNum = beds && !isNaN(beds) ? beds : undefined;
        setSearchFilters((f) => ({ ...f, bedrooms: bedsNum }));
        navigate(buildFilterSearch({ ...searchFilters, bedrooms: bedsNum }));
        setSearchStep('S_BUDGET');
        pushMessage({ role: 'bot', text: 'ما ميزانيتك بالجنيه المصري؟ (اكتب الحد الأقصى أو اضغط تخطي)' });
        setOptions([{ id: '', label: 'تخطي ⏭️' }]);
        setInputType(undefined); // allow free text
        break;
      }
      case 'S_BUDGET': {
        const maxPrice = val ? Number(val.replace(/[^\d]/g, '')) : NaN;
        const finalFilters: PropertyFilters = {
          ...searchFilters,
          ...((!isNaN(maxPrice) && maxPrice > 0) ? { maxPrice } : {}),
        };
        navigate(buildFilterSearch(finalFilters));
        pushMessage({ role: 'bot', text: 'تم! 🎉 جاري عرض النتائج على الصفحة الرئيسية...' });
        setSearchStep(undefined);
        setSearchFilters({});
        setInputType(undefined);
        setOptions([]);
        setTimeout(() => handleCloseChat(), 800);
        break;
      }
      default:
        break;
    }
  }

  // ─── Input handlers ─────────────────────────────────────────────

  const handleSend = () => {
    void dispatchMessage(input);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOptionClick = (opt: ChatOption) => {
    const label = optionLabel(opt);
    const answer = optionAnswer(opt);

    setOptions([]);

    const uid = user?.id ?? getOrCreateAnonId();

    const doSubmit = async () => {
      try {
        // ── View more results — go to home page ────────────────────
        if (typeof opt !== 'string' && opt.id === '__view_more__') {
          handleCloseChat();
          navigate('/');
          return;
        }

        // ── Search flow start / in-progress ──────────────────────────
        if (label === 'ابحث عن عقار 🔍') {
          pushMessage({ role: 'user', text: label });
          setSearchFilters({});
          setSearchStep('S_TYPE');
          setActiveFlow(undefined);
          setCurrentStep(undefined);
          navigate('/');
          pushMessage({ role: 'bot', text: 'سنبحث لك عن عقار مناسب! 🏡\nتريد شراء أم إيجار؟' });
          setOptions(S_TYPE_OPTIONS);
          setInputType('multi-choice');
          return;
        }
        if (searchStep) {
          pushMessage({ role: 'user', text: label });
          await handleSearchInput(typeof opt === 'string' ? label : (opt.id?.toString() ?? label), label);
          return;
        }

        // ── Auth gate ──────────────────────────────────────────────
        if (label === 'أضيف عقار 🏠') {
          if (!user) {
            setShowAuthModal(true);
            return;
          }
          // Logged-in users automatically get free listing credits on the backend
        }

        // Show message optimistically (after gate passes)
        pushMessage({ role: 'user', text: label });
        setLoading(true);

        let response;
        if (label === 'أضيف عقار 🏠') {
          response = await startOnboarding(uid);
          setActiveFlow('onboarding');
        } else if (label === 'ابدا من جديد ♻️' || label === 'إلغاء والبدء من جديد') {
          response = await startOnboarding(uid, true);
          setActiveFlow('onboarding');
        } else if (activeFlow === 'onboarding' && currentStep === 'REVIEW') {
          response = await finalSubmitOnboarding(uid);
        } else if (activeFlow === 'onboarding' && currentStep && currentStep !== 'DETAILS') {
          response = await submitOnboardingAnswer(uid, currentStep, answer);
        } else {
          response = await sendChatMessage({ message: label, userId: uid, flow: activeFlow });
        }
        
        if (response.data?.step) {
          setActiveFlow('onboarding');
          setCurrentStep(response.data.step);
        }
        pushMessage({ role: 'bot', text: response.message });
        setInputType(response.data?.inputType);
        
        if (Array.isArray(response.data?.options) && (response.data.options as ChatOption[]).length > 0) {
          setOptions([...(response.data.options as ChatOption[])]);
        } else {
          setOptions([]);
        }

        handleAction(response.action, response.data);
      } catch (err: unknown) {
        let msg = 'حدث خطأ، حاول مرة ثانية.';
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { status?: number; data?: { message?: string | string[]; creditId?: string } } };
          const apiMsg = axiosErr.response?.data?.message;
          if (Array.isArray(apiMsg)) msg = apiMsg.join('\n');
          else if (typeof apiMsg === 'string') msg = apiMsg;
          
          // Check if this is a payment required error (403 with creditId)
          const creditId = axiosErr.response?.data?.creditId;
          if (creditId) {
            pushMessage({ role: 'bot', text: `⚠️ ${msg}` });
            navigate(`/listing-payment/${creditId}`);
            setLoading(false);
            return;
          }
        } else if (err instanceof Error) {
          msg = err.message;
        }
        pushMessage({ role: 'bot', text: `⚠️ ${msg}` });
      } finally {
        setLoading(false);
      }
    };

    void doSubmit();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    pushMessage({ role: 'user', text: `تم اختيار ${files.length} ${files.length === 1 ? 'ملف' : 'ملفات'}... جاري الرفع ⏳` });
    setLoading(true);

    try {
      const { apiClient } = await import('../api/client');
      const uid = user?.id ?? getOrCreateAnonId();

      for (const file of files) {
        const isVideo = file.type.startsWith('video');

        // Upload the actual file via multipart FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', uid);
        formData.append('type', isVideo ? 'VIDEO' : 'IMAGE');

        const uploadRes = await apiClient.post<{ success: boolean; data: { url: string } }>(
          '/onboarding/upload-file',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );

        const mediaUrl = uploadRes.data.data?.url;
        if (mediaUrl) {
          await apiClient.post('/onboarding/upload-media', {
            userId: uid,
            url: mediaUrl,
            type: isVideo ? 'VIDEO' : 'IMAGE',
          });
        }
      }

      pushMessage({ role: 'user', text: `✅ تم رفع ${files.length} ${files.length === 1 ? 'ملف' : 'ملفات'} بنجاح` });
      // Advance to next step
      await dispatchMessage('skip');
    } catch (err) {
      pushMessage({ role: 'bot', text: '⚠️ حدث خطأ أثناء رفع الملفات.' });
    } finally {
      setLoading(false);
    }
  };


  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-widget__window">
          {/* ── Header ─────────────────────────────────────── */}
          <div className="chat-widget__header">
            <div className="chat-widget__avatar">🤖</div>
            <div className="chat-widget__header-text">
              <div className="chat-widget__header-name">سمسار AI</div>
              <div className="chat-widget__header-status">
                {loading ? 'يكتب…' : 'متاح دائماً ✓'}
              </div>
            </div>
            {activeFlow === 'onboarding' && (
              <button
                className="chat-widget__restart"
                onClick={() => { void dispatchMessage('ابدا من جديد ♻️'); }}
                disabled={loading}
                title="ابدأ من جديد"
              >
                ♻️
              </button>
            )}
            {searchStep && (
              <button
                className="chat-widget__restart"
                onClick={() => {
                  setSearchStep(undefined);
                  setSearchFilters({});
                  setInputType(undefined);
                  navigate('/');
                  pushMessage({ role: 'bot', text: 'تم إلغاء البحث. تحب تبدأ من جديد؟' });
                  setOptions(MAIN_MENU_OPTIONS);
                }}
                disabled={loading}
                title="إلغاء البحث"
              >
                ✖️
              </button>
            )}
            <button
              className="chat-widget__close"
              onClick={handleCloseChat}
            >
              ✕
            </button>
          </div>

          {/* ── Messages ───────────────────────────────────── */}
          <div className="chat-widget__body">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chat-bubble chat-bubble--${m.role === 'bot' ? 'bot' : 'user'}`}
              >
                {m.text.split('\n').map((line, i, arr) => (
                  <span key={i}>
                    {line}
                    {i < arr.length - 1 && <br />}
                  </span>
                ))}
                <div className="chat-bubble--time">{m.timestamp}</div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="chat-bubble chat-bubble--bot chat-bubble--typing">
                <span />
                <span />
                <span />
              </div>
            )}

            {/* Multi-choice option buttons */}
            {!loading && options.length > 0 && (
              <div className="chat-widget__options">
                {options.map((opt) => {
                  const lbl = optionLabel(opt);
                  const isAddProperty = lbl === 'أضيف عقار 🏠';
                  const isSearch = lbl === 'ابحث عن عقار 🔍';
                  const locked = isAddProperty && !user;
                  const cls = [
                    'chat-widget__option-btn',
                    locked ? 'chat-widget__option-btn--locked' : '',
                    isSearch ? 'chat-widget__option-btn--search' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      key={lbl}
                      className={cls}
                      onClick={() => !locked && handleOptionClick(opt)}
                      disabled={locked}
                      title={locked ? 'سجّل دخولك أولاً لإضافة عقار' : undefined}
                    >
                      {lbl}
                      {locked && <span className="chat-widget__option-lock"> 🔒</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ──────────────────────────────────── */}
          {/* Only show input bar if user has selected a flow (not on main menu) */}
          {(activeFlow || searchStep) && (
          <div className="chat-widget__input-bar">
            {inputType === 'file' ? (
              <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  id="chat-file-upload"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
                <button
                  className="chat-widget__send"
                  style={{ flex: 1, borderRadius: '8px', padding: '10px', fontSize: '14px', width: 'auto' }}
                  onClick={() => document.getElementById('chat-file-upload')?.click()}
                  disabled={loading}
                >
                  🖼️ اختر صور / فيديوهات
                </button>
                <button
                  style={{
                    background: 'transparent',
                    border: '1.5px solid #8696a0',
                    color: '#8696a0',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.5 : 1
                  }}
                  onClick={() => dispatchMessage('skip')}
                  disabled={loading}
                >
                  تخطي
                </button>
              </div>
            ) : inputType === 'map' ? (
              <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                <button
                  className="chat-widget__send"
                  style={{ flex: 1, borderRadius: '8px', padding: '10px', fontSize: '14px', width: 'auto' }}
                  disabled={loading}
                  onClick={() => {
                    const sendMapAnswer = (msg: string, userText: string) => {
                      pushMessage({ role: 'user', text: userText });
                      setOptions([]);
                      setLoading(true);
                      const uid = user?.id ?? getOrCreateAnonId();
                      void sendChatMessage({ message: msg, userId: uid, flow: 'onboarding' })
                        .then((response) => {
                          pushMessage({ role: 'bot', text: response.message });
                          if (response.data?.step) setCurrentStep(response.data.step);
                          setInputType(response.data?.inputType);
                          if (Array.isArray(response.data?.options) && (response.data.options as ChatOption[]).length > 0) {
                            setOptions([...(response.data.options as ChatOption[])]);
                          } else {
                            setOptions([]);
                          }
                          handleAction(response.action, response.data);
                        })
                        .catch(() => pushMessage({ role: 'bot', text: '⚠️ حدث خطأ، حاول مرة ثانية.' }))
                        .finally(() => setLoading(false));
                    };

                    if (!navigator.geolocation) {
                      sendMapAnswer('skip', '📍 تخطي تحديد الموقع');
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        const payload = JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                        sendMapAnswer(payload, `📍 تم تحديد الموقع (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
                      },
                      () => sendMapAnswer('skip', '📍 تخطي تحديد الموقع'),
                    );
                  }}
                >
                  📍 احصل على موقعي
                </button>
                <button
                  style={{
                    background: 'transparent',
                    border: '1.5px solid #8696a0',
                    color: '#8696a0',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                  }}
                  disabled={loading}
                  onClick={() => {
                    pushMessage({ role: 'user', text: '📍 تخطي تحديد الموقع' });
                    setOptions([]);
                    setLoading(true);
                    const uid = user?.id ?? getOrCreateAnonId();
                    void sendChatMessage({ message: 'skip', userId: uid, flow: 'onboarding' })
                      .then((response) => {
                        pushMessage({ role: 'bot', text: response.message });
                        if (response.data?.step) setCurrentStep(response.data.step);
                        setInputType(response.data?.inputType);
                        if (Array.isArray(response.data?.options) && (response.data.options as ChatOption[]).length > 0) {
                          setOptions([...(response.data.options as ChatOption[])]);
                        } else {
                          setOptions([]);
                        }
                        handleAction(response.action, response.data);
                      })
                      .catch(() => pushMessage({ role: 'bot', text: '⚠️ حدث خطأ، حاول مرة ثانية.' }))
                      .finally(() => setLoading(false));
                  }}
                >
                  تخطي
                </button>
              </div>
            ) : inputType === 'optional-textarea' ? (
              <>
                <textarea
                  className="chat-widget__input"
                  placeholder="اكتب الكماليات هنا… (اختياري)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  rows={3}
                  style={{ resize: 'vertical', borderRadius: '8px', padding: '8px', flex: 1, fontFamily: 'inherit', fontSize: '14px', direction: 'rtl' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button
                    className="chat-widget__send"
                    onClick={handleSend}
                    disabled={loading}
                    title="إرسال"
                  >
                    ➤
                  </button>
                  <button
                    style={{ background: 'transparent', border: '1.5px solid #8696a0', color: '#8696a0', borderRadius: '8px', padding: '4px 8px', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1, fontSize: '12px' }}
                    disabled={loading}
                    onClick={() => { setInput(''); dispatchMessage('لا'); }}
                  >
                    تخطي
                  </button>
                </div>
              </>
            ) : inputType === 'textarea' ? (
              <>
                <textarea
                  className="chat-widget__input"
                  placeholder="اكتب هنا…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  rows={4}
                  style={{ resize: 'vertical', borderRadius: '8px', padding: '8px', flex: 1, fontFamily: 'inherit', fontSize: '14px', direction: 'rtl' }}
                />
                <button
                  className="chat-widget__send"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                >
                  ➤
                </button>
              </>
            ) : (
              <>
                <input
                  className="chat-widget__input"
                  placeholder="اكتب رسالتك…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={loading || inputType === 'multi-choice'}
                />
                <button
                  className="chat-widget__send"
                  onClick={handleSend}
                  disabled={loading || !input.trim() || inputType === 'multi-choice'}
                >
                  ➤
                </button>
              </>
            )}
          </div>
          )}
        </div>
      )}

      <button
        className="chat-widget__trigger"
        onClick={() => (isOpen ? handleCloseChat() : openChat())}
        title="تحدث مع سمسار AI"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Login gate — rendered outside the chat window so it covers the full viewport */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            pushMessage({
              role: 'bot',
              text: 'أهلاً بك! 👋 يمكنك الآن إضافة عقارك أو الاستفسار عن أي شيء.',
            });
            setOptions(MAIN_MENU_OPTIONS);
          }}
        />
      )}
    </div>
  );
};
