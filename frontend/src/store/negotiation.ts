/**
 * T18: Zustand store for the unified Negotiation page.
 *
 * Manages:
 * - Socket connection lifecycle
 * - Message list (real-time + REST history)
 * - Viewer role (BUYER | SELLER)
 * - AI thinking state
 * - Remote typing state
 * - Optimistic sends with clientId dedup
 * - Read receipts
 */

import { create } from 'zustand';
import {
  negotiationSocket,
  type ServerMessage,
  type JoinedPayload,
  type TypingPayload,
  type AiThinkingPayload,
  type ReadPayload,
} from '../realtime/socket';
import {
  getMessages,
  sendMessage,
  markRead,
} from '../api/negotiations';
import { getCachedFeatureFlags, getFeatureFlags } from '../api/featureFlags';

// ─── Types ──────────────────────────────────────────────────

export type ViewerRole = 'BUYER' | 'SELLER';

export interface NegotiationState {
  // Connection
  connected: boolean;
  negotiationId: string | null;
  viewerRole: ViewerRole | null;

  // Messages
  messages: ServerMessage[];

  // AI thinking
  aiThinking: boolean;

  // Remote typing (null = nobody typing)
  remoteTypingUserId: string | null;

  // Sending state
  sending: boolean;

  // Optimistic pending clientId → temp message
  pendingClientId: string | null;

  // Read receipt tracking
  unreadCount: number;

  // Error
  error: string | null;

  // Focus message (from notification deep-link)
  focusMessageId: string | null;
}

export interface NegotiationActions {
  /** Connect socket and join room */
  connect: (negotiationId: string) => Promise<void>;

  /** Disconnect socket and reset state */
  disconnect: () => void;

  /** Send a text message (optimistic) */
  send: (body: string) => Promise<void>;

  /** Mark all messages as read */
  markAllRead: () => Promise<void>;

  /** Set focus message (from URL param) */
  setFocusMessage: (messageId: string | null) => void;

  /** Clear error */
  clearError: () => void;
}

function generateClientId(): string {
  return `cl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Helper: merge server message, dedup by clientId ────────

function mergeMessage(
  current: ServerMessage[],
  incoming: ServerMessage,
): ServerMessage[] {
  // If incoming has a clientId, replace any optimistic message with same clientId
  if (incoming.clientId) {
    const idx = current.findIndex(
      (m) => m.clientId === incoming.clientId,
    );
    if (idx !== -1) {
      const updated = [...current];
      updated[idx] = incoming;
      return updated;
    }
  }
  // Otherwise append (but skip duplicates by id)
  if (current.some((m) => m.id === incoming.id)) return current;
  return [...current, incoming];
}

// ─── Store ──────────────────────────────────────────────────

export const useNegotiationStore = create<NegotiationState & NegotiationActions>(
  (set, get) => {
    // Cleanup functions for socket listeners
    let unsubFns: (() => void)[] = [];

    return {
      // Initial state
      connected: false,
      negotiationId: null,
      viewerRole: null,
      messages: [],
      aiThinking: false,
      remoteTypingUserId: null,
      sending: false,
      pendingClientId: null,
      unreadCount: 0,
      error: null,
      focusMessageId: null,

      // ─── Actions ──────────────────────────────────────────

      connect: async (negotiationId: string) => {
        // Clean up any previous connection
        get().disconnect();

        set({
          negotiationId,
          connected: false,
          messages: [],
          aiThinking: false,
          remoteTypingUserId: null,
          sending: false,
          error: null,
        });

        // Load history via REST first (faster cold start)
        try {
          const restResult = await getMessages(negotiationId);
          if (restResult.success && restResult.data.length > 0) {
            set({ messages: restResult.data as unknown as ServerMessage[] });
          }
        } catch {
          // REST history is optional; socket join will also send history
        }

        // Check feature flag — fall back to REST polling if Socket.IO is disabled
        await getFeatureFlags(); // ensure cache is populated
        const flags = getCachedFeatureFlags();

        if (!flags.NEGOTIATION_V2) {
          // Feature flag OFF — use REST-only polling (no Socket.IO)
          set({ connected: true, viewerRole: 'BUYER' }); // assume buyer for now
          return;
        }

        // Connect socket
        negotiationSocket.connect();

        // Set up listeners
        unsubFns = [
          negotiationSocket.onJoined((payload: JoinedPayload) => {
            set({
              connected: true,
              viewerRole: payload.viewerRole,
              // Merge socket history with any REST history we already loaded
              messages:
                get().messages.length === 0
                  ? payload.history
                  : mergeHistories(get().messages, payload.history),
            });
          }),

          negotiationSocket.onMessage((msg: ServerMessage) => {
            set((state) => ({
              messages: mergeMessage(state.messages, msg),
              sending: false,
              pendingClientId: null,
            }));
          }),

          negotiationSocket.onTyping((payload: TypingPayload) => {
            // Only show typing for the OTHER user
            if (payload.isTyping) {
              set({ remoteTypingUserId: payload.userId ?? null });
            } else {
              set({ remoteTypingUserId: null });
            }
            // Auto-clear typing after 3 seconds
            setTimeout(() => {
              if (get().remoteTypingUserId === payload.userId) {
                set({ remoteTypingUserId: null });
              }
            }, 3000);
          }),

          negotiationSocket.onAiThinking((payload: AiThinkingPayload) => {
            set({ aiThinking: payload.isThinking });
          }),

          negotiationSocket.onRead((_payload: ReadPayload) => {
            // Could update individual message read status here
            // For now, just trigger a re-count if needed
          }),

          negotiationSocket.onError((err) => {
            set({ error: err.message });
          }),
        ];

        // Join the negotiation room
        negotiationSocket.join(negotiationId);
      },

      disconnect: () => {
        unsubFns.forEach((fn) => fn());
        unsubFns = [];
        negotiationSocket.disconnect();
        set({
          connected: false,
          negotiationId: null,
          viewerRole: null,
          messages: [],
          aiThinking: false,
          remoteTypingUserId: null,
          sending: false,
          pendingClientId: null,
          unreadCount: 0,
          error: null,
          focusMessageId: null,
        });
      },

      send: async (body: string) => {
        const { negotiationId, sending } = get();
        if (!negotiationId || sending || !body.trim()) return;

        const clientId = generateClientId();
        const viewerRole = get().viewerRole ?? 'BUYER';
        const userId = getUserId(); // from localStorage

        // Optimistic message
        const optimistic: ServerMessage = {
          id: clientId, // temporary
          negotiationId,
          senderRole: viewerRole,
          senderUserId: userId,
          body: body.trim(),
          kind: 'TEXT',
          meta: null,
          clientId,
          createdAt: new Date().toISOString(),
          readByBuyerAt: viewerRole === 'BUYER' ? new Date().toISOString() : null,
          readBySellerAt: viewerRole === 'SELLER' ? new Date().toISOString() : null,
        };

        set((state) => ({
          messages: [...state.messages, optimistic],
          sending: true,
          pendingClientId: clientId,
        }));

        try {
          // Send via REST (backend will persist + emit via socket)
          await sendMessage(negotiationId, body.trim(), clientId);
          // The socket.onMessage handler will replace the optimistic message
        } catch (err) {
          // Remove optimistic message on failure
          set((state) => ({
            messages: state.messages.filter((m) => m.id !== clientId),
            sending: false,
            pendingClientId: null,
            error: 'تعذّر إرسال الرسالة.',
          }));
        }
      },

      markAllRead: async () => {
        const { negotiationId } = get();
        if (!negotiationId) return;
        try {
          await markRead(negotiationId);
          set({ unreadCount: 0 });
        } catch {
          // silent fail
        }
      },

      setFocusMessage: (messageId: string | null) => {
        set({ focusMessageId: messageId });
      },

      clearError: () => {
        set({ error: null });
      },
    };
  },
);

// ─── Helpers ────────────────────────────────────────────────

function getUserId(): string | null {
  try {
    const raw = localStorage.getItem('semsar_user');
    if (!raw) return null;
    return JSON.parse(raw).id ?? null;
  } catch {
    return null;
  }
}

/** Merge REST history with socket history, preferring socket history */
function mergeHistories(
  restMsgs: ServerMessage[],
  socketMsgs: ServerMessage[],
): ServerMessage[] {
  if (restMsgs.length === 0) return socketMsgs;
  if (socketMsgs.length === 0) return restMsgs;

  // Use socket history as source of truth; merge in any REST-only messages
  const socketIds = new Set(socketMsgs.map((m) => m.id));
  const extras = restMsgs.filter((m) => !socketIds.has(m.id));
  return [...socketMsgs, ...extras].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
