import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'init-1',
    role: 'bot',
    text: 'أهلاً بيك 👋 أنا سمسار AI مساعدك العقاري!\n\nتحب تدور على عقار مناسب ولا تضيف عقارك للبيع أو الإيجار؟',
    timestamp: nowLabel(),
  },
];

// ─── Component ───────────────────────────────────────────────────

export const ChatWidget: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOpen, pendingMessage, consumePendingMessage, openChat, closeChat } = useChatContext();

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  /** Options surfaced by the last bot reply (multi-choice step). */
  const [options, setOptions] = useState<ChatOption[]>(['أضيف عقار 🏠']);
  /** Track the current entity ID so we can pass it on follow-up messages. */
  const [entityId, setEntityId] = useState<string | undefined>();
  /** Track the active flow so we can pass it explicitly on follow-up messages. */
  const [activeFlow, setActiveFlow] = useState<'onboarding' | 'negotiation' | undefined>();
  /** Track the active step for the onboarding API */
  const [currentStep, setCurrentStep] = useState<string | undefined>();
  /** Track the input type requested by the backend (e.g. file, multi-choice) */
  const [inputType, setInputType] = useState<string | undefined>();

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll whenever messages change or the window opens.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, loading]);

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
        } else if (activeFlow === 'onboarding' && currentStep) {
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

        // Surface options if this is a multi-choice step.
        if (
          response.data?.inputType === 'multi-choice' &&
          Array.isArray(response.data.options)
        ) {
          const opts = [...(response.data.options as ChatOption[])];
          if (response.data.step) opts.push('ابدا من جديد ♻️');
          setOptions(opts);
        } else if (response.data?.step) {
          // If in onboarding but no options (e.g. text input), still show restart
          setOptions(['ابدا من جديد ♻️']);
        }

        // Handle special terminal actions.
        handleAction(response.action, response.data);
      } catch (err: unknown) {
        let msg = 'حدث خطأ، حاول مرة ثانية.';
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
          const apiMsg = axiosErr.response?.data?.message;
          if (Array.isArray(apiMsg)) msg = apiMsg.join('\n');
          else if (typeof apiMsg === 'string') msg = apiMsg;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        pushMessage({ role: 'bot', text: `⚠️ ${msg}` });
      } finally {
        setLoading(false);
      }
    },
    [loading, user, activeFlow, entityId, pushMessage],
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
        setOptions(['أضيف عقار 🏠']);
      }, 1000);
    }
    if (action === 'negotiation_started' && data?.negotiationId) {
      setTimeout(() => navigate(`/negotiation/${data.negotiationId}`), 800);
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

    // Show message optimistically
    pushMessage({ role: 'user', text: label });
    setOptions([]);
    setLoading(true);

    const uid = user?.id ?? getOrCreateAnonId();

    const doSubmit = async () => {
      try {
        let response;
        if (label === 'أضيف عقار 🏠') {
          response = await startOnboarding(uid);
          setActiveFlow('onboarding');
        } else if (label === 'ابدا من جديد ♻️' || label === 'إلغاء والبدء من جديد') {
          response = await startOnboarding(uid, true);
          setActiveFlow('onboarding');
        } else if (activeFlow === 'onboarding' && currentStep === 'REVIEW') {
          // REVIEW step confirms and publishes via POST /onboarding/submit
          response = await finalSubmitOnboarding(uid);
        } else if (activeFlow === 'onboarding' && currentStep) {
          response = await submitOnboardingAnswer(uid, currentStep, answer);
        } else {
          response = await sendChatMessage({ message: label, userId: uid });
        }

        if (response.data?.step) {
          setActiveFlow('onboarding');
          setCurrentStep(response.data.step);
        }
        pushMessage({ role: 'bot', text: response.message });
        setInputType(response.data?.inputType);
        if (response.data?.inputType === 'multi-choice' && Array.isArray(response.data.options)) {
          const opts = [...(response.data.options as ChatOption[])];
          if (response.data.step) opts.push('ابدا من جديد ♻️');
          setOptions(opts);
        } else if (response.data?.step) {
          setOptions(['ابدا من جديد ♻️']);
        }
        handleAction(response.action, response.data);
      } catch (err: unknown) {
        let msg = 'حدث خطأ، حاول مرة ثانية.';
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
          const apiMsg = axiosErr.response?.data?.message;
          if (Array.isArray(apiMsg)) msg = apiMsg.join('\n');
          else if (typeof apiMsg === 'string') msg = apiMsg;
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
            <button
              className="chat-widget__close"
              onClick={closeChat}
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
                {options.map((opt) => (
                  <button
                    key={optionLabel(opt)}
                    className="chat-widget__option-btn"
                    onClick={() => handleOptionClick(opt)}
                  >
                    {optionLabel(opt)}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ──────────────────────────────────── */}
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
        </div>
      )}

      <button
        className="chat-widget__trigger"
        onClick={() => (isOpen ? closeChat() : openChat())}
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
            setOptions(['أضيف عقار 🏠']);
          }}
        />
      )}
    </div>
  );
};
