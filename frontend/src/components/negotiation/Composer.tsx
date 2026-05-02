import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNegotiationStore } from '../../store/negotiation';

// ─── Composer ───────────────────────────────────────────────

interface ComposerProps {
  negotiationId: string;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({ negotiationId, disabled }) => {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const send = useNegotiationStore((s) => s.send);
  const sending = useNegotiationStore((s) => s.sending);
  const aiThinking = useNegotiationStore((s) => s.aiThinking);
  const viewerRole = useNegotiationStore((s) => s.viewerRole);
  useNegotiationStore((s) => s.connect); // ensure store is initialized

  const isWaiting = sending || aiThinking || disabled;

  // Typing indicator debounce
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitTyping = useCallback(
    async (isTyping: boolean) => {
      // Import socket directly to emit typing
      const { negotiationSocket: socket } = await import('../../realtime/socket');
      socket.typing(negotiationId, isTyping);
    },
    [negotiationId],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setText(val);

      // Emit typing:start
      if (val.trim()) {
        emitTyping(true);
        // Auto-stop typing after 3 seconds of inactivity
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => emitTyping(false), 3000);
      } else {
        emitTyping(false);
      }
    },
    [emitTyping],
  );

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || isWaiting) return;

    setText('');
    emitTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    await send(body);
    inputRef.current?.focus();
  }, [text, isWaiting, send, emitTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return (
    <div className="neg-composer">
      <div className="neg-composer__role-badge">
        {viewerRole === 'BUYER' ? '👤' : '🏠'}
      </div>

      <input
        ref={inputRef}
        type="text"
        className="neg-composer__input"
        placeholder={
          isWaiting
            ? aiThinking
              ? 'سمسار AI بيفكّر…'
              : 'جاري الإرسال…'
            : 'اكتب رسالتك…'
        }
        value={text}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={isWaiting}
        style={isWaiting ? { cursor: 'wait' } : undefined}
        dir="rtl"
      />

      <button
        className="neg-composer__send-btn"
        onClick={handleSend}
        disabled={isWaiting || !text.trim()}
      >
        {sending ? (
          <span className="neg-composer__spinner" />
        ) : (
          '➤'
        )}
      </button>
    </div>
  );
};

// ─── CSS ────────────────────────────────────────────────────

export const composerCSS = `
.neg-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-primary, white);
  border-top: 1px solid var(--border, #e5e7eb);
  position: sticky;
  bottom: 0;
  z-index: 10;
}

.neg-composer__role-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-secondary, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.neg-composer__input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 20px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--bg-primary, white);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.neg-composer__input:focus {
  border-color: var(--primary, #2563eb);
}
.neg-composer__input:disabled {
  background: var(--bg-secondary, #f9fafb);
  opacity: 0.7;
}

.neg-composer__send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--primary, #2563eb);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s;
  flex-shrink: 0;
}
.neg-composer__send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.neg-composer__send-btn:not(:disabled):hover {
  background: var(--primary-dark, #1d4ed8);
  transform: scale(1.05);
}

.neg-composer__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: negSpin 0.6s linear infinite;
}

@keyframes negSpin {
  to { transform: rotate(360deg); }
}

@media (max-width: 480px) {
  .neg-composer {
    padding: 8px 12px;
  }
  .neg-composer__input {
    font-size: 16px; /* prevent iOS zoom */
  }
}
`;
