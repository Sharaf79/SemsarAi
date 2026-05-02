import React from 'react';
import type { ServerMessage } from '../../realtime/socket';
import type { ViewerRole } from '../../store/negotiation';

// ─── MessageBubble ─────────────────────────────────────────

interface MessageBubbleProps {
  message: ServerMessage;
  viewerRole: ViewerRole;
  isFocus?: boolean;
}

const senderLabels: Record<string, string> = {
  BUYER: 'المشتري',
  SELLER: 'البائع',
  AI: 'سمسار AI',
  SYSTEM: 'النظام',
};

const senderIcons: Record<string, string> = {
  BUYER: '👤',
  SELLER: '🏠',
  AI: '🤖',
  SYSTEM: 'ℹ️',
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  viewerRole,
  isFocus,
}) => {
  const isSelf = message.senderRole === viewerRole;
  const _isSystem = message.senderRole === 'SYSTEM';
  const _isAi = message.senderRole === 'AI';

  // Compute kind-specific styling
  const isOffer = message.kind === 'OFFER';
  const isAction = message.kind === 'ACTION';
  const _isNotice = message.kind === 'NOTICE';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      id={isFocus ? `msg-${message.id}` : undefined}
      className={`neg-msg ${isSelf ? 'neg-msg--self' : 'neg-msg--other'} ${
        isFocus ? 'neg-msg--focus' : ''
      } ${isOffer ? 'neg-msg--offer' : ''} ${isAction ? 'neg-msg--action' : ''}`}
    >
      {/* Avatar + role tag for non-self messages */}
      {!isSelf && (
        <div className="neg-msg__avatar-col">
          <div className={`neg-msg__avatar neg-msg__avatar--${message.senderRole.toLowerCase()}`}>
            {senderIcons[message.senderRole]}
          </div>
          <span className="neg-msg__role-tag">{senderLabels[message.senderRole]}</span>
        </div>
      )}

      <div className={`neg-msg__bubble neg-msg__bubble--${isSelf ? 'self' : 'other'}`}>
        {/* Offer badge */}
        {isOffer && <div className="neg-msg__offer-badge">💰 عرض سعر</div>}

        {/* Action badge */}
        {isAction && <div className="neg-msg__action-badge">⚡ إجراء</div>}

        {/* Message body */}
        <div className="neg-msg__body">
          {message.body.split('\n').map((line: string, i: number) => (
            <span key={i}>
              {line}
              {i < message.body.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>

        {/* Timestamp + read status */}
        <div className="neg-msg__meta">
          <span className="neg-msg__time">{formatTime(message.createdAt)}</span>
          {isSelf && (
            <span className="neg-msg__read-status">
              {isReadByOther(message, viewerRole) ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>

      {/* Self avatar */}
      {isSelf && (
        <div className="neg-msg__avatar-col neg-msg__avatar-col--self">
          <div className="neg-msg__avatar neg-msg__avatar--self">
            {senderIcons[message.senderRole]}
          </div>
        </div>
      )}
    </div>
  );
};

function isReadByOther(msg: ServerMessage, viewerRole: ViewerRole): boolean {
  if (viewerRole === 'BUYER') return msg.readBySellerAt !== null;
  return msg.readByBuyerAt !== null;
}

// ─── TypingIndicator ────────────────────────────────────────

interface TypingIndicatorProps {
  userId: string | null;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ userId }) => {
  if (!userId) return null;

  return (
    <div className="neg-typing">
      <div className="neg-msg__avatar-col">
        <div className="neg-msg__avatar neg-msg__avatar--other">…</div>
      </div>
      <div className="neg-typing__bubble">
        <span className="neg-typing__dot" />
        <span className="neg-typing__dot" />
        <span className="neg-typing__dot" />
      </div>
    </div>
  );
};

// ─── AiThinkingIndicator ────────────────────────────────────

export const AiThinkingIndicator: React.FC = () => {
  return (
    <div className="neg-ai-thinking">
      <div className="neg-msg__avatar-col">
        <div className="neg-msg__avatar neg-msg__avatar--ai">🤖</div>
      </div>
      <div className="neg-ai-thinking__bubble">
        <div className="neg-ai-thinking__pulse" />
        <span>سمسار AI بيفكّر…</span>
      </div>
    </div>
  );
};

// ─── Inline CSS (will be overridden by global styles) ───────

export const negotiationComponentsCSS = `
/* Message Bubble */
.neg-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  animation: negFadeIn 0.2s ease;
}
.neg-msg--self {
  flex-direction: row-reverse;
}
.neg-msg--focus {
  animation: negPulse 1s ease 1;
}
.neg-msg--focus .neg-msg__bubble {
  box-shadow: 0 0 0 2px var(--primary, #2563eb), 0 0 12px rgba(37, 99, 235, 0.3);
}

.neg-msg__avatar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 36px;
}
.neg-msg__avatar-col--self {
  align-items: flex-end;
}
.neg-msg__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: #e5e7eb;
  flex-shrink: 0;
}
.neg-msg__avatar--buyer { background: #dbeafe; }
.neg-msg__avatar--seller { background: #fef3c7; }
.neg-msg__avatar--ai { background: #e0e7ff; }
.neg-msg__avatar--system { background: #f3f4f6; }
.neg-msg__avatar--self { background: #3b82f6; }

.neg-msg__role-tag {
  font-size: 10px;
  color: var(--text-muted, #9ca3af);
  white-space: nowrap;
}

.neg-msg__bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 16px;
  word-wrap: break-word;
  line-height: 1.5;
  font-size: 14px;
  position: relative;
}
.neg-msg__bubble--self {
  background: var(--primary, #2563eb);
  color: white;
  border-bottom-right-radius: 4px;
}
.neg-msg__bubble--other {
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-primary, #111827);
  border-bottom-left-radius: 4px;
}

.neg-msg--offer .neg-msg__bubble {
  border: 2px solid var(--warning, #f59e0b);
}
.neg-msg--action .neg-msg__bubble {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.neg-msg__offer-badge {
  font-size: 11px;
  font-weight: 600;
  color: #d97706;
  margin-bottom: 4px;
}
.neg-msg__action-badge {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  margin-bottom: 4px;
}

.neg-msg__body {
  white-space: pre-wrap;
}

.neg-msg__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.7;
}
.neg-msg__time {
  color: inherit;
}
.neg-msg__read-status {
  font-size: 12px;
}

/* Typing Indicator */
.neg-typing {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  animation: negFadeIn 0.2s ease;
}
.neg-typing__bubble {
  background: var(--bg-secondary, #f3f4f6);
  padding: 10px 16px;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  display: flex;
  gap: 4px;
  align-items: center;
}
.neg-typing__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted, #9ca3af);
  animation: negTypingBounce 1.4s infinite ease-in-out;
}
.neg-typing__dot:nth-child(2) { animation-delay: 0.2s; }
.neg-typing__dot:nth-child(3) { animation-delay: 0.4s; }

/* AI Thinking */
.neg-ai-thinking {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  animation: negFadeIn 0.2s ease;
}
.neg-ai-thinking__bubble {
  background: var(--bg-secondary, #f3f4f6);
  padding: 10px 16px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}
.neg-ai-thinking__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #818cf8;
  animation: negPulseDot 1.2s infinite ease-in-out;
}

/* Animations */
@keyframes negFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes negPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
}
@keyframes negTypingBounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}
@keyframes negPulseDot {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* Responsive */
@media (max-width: 480px) {
  .neg-msg__bubble {
    max-width: 85%;
  }
}
`;
