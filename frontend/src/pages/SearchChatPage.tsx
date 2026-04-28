import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { sendSearchChatMessage, type HistoryEntry, type SearchFilters } from '../api/chat';

// ─── Types ───────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'bot' | 'user';
  text: string;
  timestamp: string;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'init-1',
    role: 'bot',
    text: 'أهلاً بك 👋 أنا سمسار AI مساعدك العقاري!\n\nاسألني عن أي عقار وسأبحث لك في قاعدة البيانات.',
    timestamp: nowLabel(),
  },
];

// ─── Page Component ──────────────────────────────────────────────

export function SearchChatPage() {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastFilters, setLastFilters] = useState<SearchFilters | undefined>(undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const pushMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `${Date.now()}-${Math.random()}`, timestamp: nowLabel() },
    ]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    pushMessage({ role: 'user', text });
    setLoading(true);

    const nextHistory: HistoryEntry[] = [...history, { role: 'user', text }];

    try {
      const res = await sendSearchChatMessage(text, nextHistory, lastFilters);
      pushMessage({ role: 'bot', text: res.message });

      setHistory([...nextHistory, { role: 'bot' as const, text: res.message }].slice(-12));

      if (res.filters) setLastFilters(res.filters);

      if (res.filters) {
        const p = new URLSearchParams();
        if (res.filters.type)        p.set('type', res.filters.type);
        if (res.filters.kind)        p.set('kind', res.filters.kind);
        if (res.filters.governorate) p.set('gov', res.filters.governorate);
        if (res.filters.city)        p.set('city', res.filters.city);
        if (res.filters.bedrooms)    p.set('beds', String(res.filters.bedrooms));
        if (res.filters.maxPrice)    p.set('maxPrice', String(res.filters.maxPrice));
        if (p.toString()) navigate(`/?${p.toString()}`);
      }
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && (err.message.includes('timeout') || err.message.includes('ECONNABORTED'));
      pushMessage({
        role: 'bot',
        text: isTimeout
          ? '⚠️ البحث أخد وقت طويل، حاول تاني.'
          : '⚠️ حدث خطأ، حاول مرة ثانية.',
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, history, lastFilters, pushMessage, navigate]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const startVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      pushMessage({ role: 'bot', text: '⚠️ المتصفح لا يدعم التعرف على الصوت. استخدم Chrome أو Edge.' });
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SR();
    recognition.lang = 'ar-EG';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
    recognitionRef.current = recognition;
  }, [isListening, pushMessage]);

  const handleResetChat = useCallback(() => {
    setMessages(INITIAL_MESSAGES);
    setInput('');
    setHistory([]);
    setLastFilters(undefined);
  }, []);

  return (
    <>
      <Header onLoginClick={() => navigate('/login')} />
      <div className="search-chat-page">
        <div className="search-chat-page__header">
          <h1 className="search-chat-page__title">🔍 البحث الذكي بالمحادثة</h1>
          <button className="btn btn-secondary btn-sm" onClick={handleResetChat}>
            بحث جديد 🗘
          </button>
        </div>

        <div className="search-chat-page__window">
          <div className="search-chat-page__body">
            {messages.map((m) => (
              <div key={m.id} className={`chat-bubble chat-bubble--${m.role === 'bot' ? 'bot' : 'user'}`}>
                {m.text.split('\n').map((line, i, arr) => (
                  <span key={i}>
                    {line}
                    {i < arr.length - 1 && <br />}
                  </span>
                ))}
                <div className="chat-bubble--time">{m.timestamp}</div>
              </div>
            ))}

            {loading && (
              <div className="chat-bubble chat-bubble--bot chat-bubble--typing">
                <span /><span /><span />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="search-chat-page__input-bar">
            <input
              className="chat-widget__input"
              placeholder="اكتب سؤالك أو اضغط 🎤 للكلام…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button
              className={`chat-widget__mic${isListening ? ' listening' : ''}`}
              onClick={startVoice}
              disabled={loading}
              title={isListening ? 'إيقاف التسجيل' : 'تحدث'}
            >
              {isListening ? '🔴' : '🎤'}
            </button>
            <button
              className="chat-widget__send"
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
