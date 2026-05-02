/**
 * Socket.IO client wrapper for the Negotiation namespace.
 *
 * Provides:
 * - Auto-reconnect with JWT from localStorage
 * - Typed event emission / listening
 * - Singleton pattern — call `connect()` to get the socket
 *
 * Usage:
 *   import { negotiationSocket } from './socket';
 *   negotiationSocket.connect();
 *   negotiationSocket.join(negId);
 *   negotiationSocket.onMessage((msg) => ...);
 */

import { io, Socket } from 'socket.io-client';

// ─── Event types ────────────────────────────────────────────

export interface ServerMessage {
  id: string;
  negotiationId: string;
  senderRole: 'BUYER' | 'SELLER' | 'AI' | 'SYSTEM';
  senderUserId: string | null;
  body: string;
  kind: 'TEXT' | 'OFFER' | 'ACTION' | 'NOTICE';
  meta: Record<string, unknown> | null;
  clientId: string | null;
  createdAt: string;
  readByBuyerAt: string | null;
  readBySellerAt: string | null;
}

export interface JoinedPayload {
  negotiationId: string;
  viewerRole: 'BUYER' | 'SELLER';
  history: ServerMessage[];
}

export interface TypingPayload {
  userId?: string;
  isTyping: boolean;
}

export interface AiThinkingPayload {
  isThinking: boolean;
}

export interface ReadPayload {
  messageId: string;
  userId?: string;
}

export interface ErrorPayload {
  message: string;
}

// ─── Socket wrapper class ───────────────────────────────────

class NegotiationSocket {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  /** Get or create the socket connection */
  connect(): Socket {
    if (this.socket?.connected) return this.socket;

    const token = localStorage.getItem('semsar_token');

    this.socket = io(`${window.location.origin}/negotiations`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    // Re-attach all stored listeners
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => {
        this.socket?.on(event, cb as (...args: unknown[]) => void);
      });
    });

    this.socket.on('connect', () => {
      console.debug('[socket] connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.debug('[socket] disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[socket] connect_error:', err.message);
    });

    return this.socket;
  }

  /** Disconnect and clean up */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  /** Get the raw socket (null if not connected) */
  getRaw(): Socket | null {
    return this.socket;
  }

  /** Whether socket is currently connected */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ─── Domain methods ───────────────────────────────────────

  /** Join a negotiation room */
  join(negotiationId: string): void {
    this.socket?.emit('join', { negotiationId });
  }

  /** Send typing indicator */
  typing(negotiationId: string, isTyping: boolean): void {
    this.socket?.emit('typing', { negotiationId, isTyping });
  }

  /** Mark a message as read */
  read(negotiationId: string, messageId: string): void {
    this.socket?.emit('read', { negotiationId, messageId });
  }

  // ─── Event listeners ──────────────────────────────────────

  private addListener(event: string, cb: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    this.socket?.on(event, cb);
  }

  private removeListener(event: string, cb: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(cb);
    this.socket?.off(event, cb);
  }

  /** Listen for successful room join */
  onJoined(cb: (payload: JoinedPayload) => void): () => void {
    const handler = (...args: unknown[]) => cb(args[0] as JoinedPayload);
    this.addListener('joined', handler);
    return () => this.removeListener('joined', handler);
  }

  /** Listen for new messages */
  onMessage(cb: (msg: ServerMessage) => void): () => void {
    const handler = (...args: unknown[]) => cb(args[0] as ServerMessage);
    this.addListener('message', handler);
    return () => this.removeListener('message', handler);
  }

  /** Listen for typing indicators */
  onTyping(cb: (payload: TypingPayload) => void): () => void {
    const handler = (...args: unknown[]) => cb(args[0] as TypingPayload);
    this.addListener('typing', handler);
    return () => this.removeListener('typing', handler);
  }

  /** Listen for AI thinking state */
  onAiThinking(cb: (payload: AiThinkingPayload) => void): () => void {
    const handler = (...args: unknown[]) => cb(args[0] as AiThinkingPayload);
    this.addListener('ai_thinking', handler);
    return () => this.removeListener('ai_thinking', handler);
  }

  /** Listen for read receipts */
  onRead(cb: (payload: ReadPayload) => void): () => void {
    const handler = (...args: unknown[]) => cb(args[0] as ReadPayload);
    this.addListener('read', handler);
    return () => this.removeListener('read', handler);
  }

  /** Listen for errors */
  onError(cb: (payload: ErrorPayload) => void): () => void {
    const handler = (...args: unknown[]) => cb(args[0] as ErrorPayload);
    this.addListener('error', handler);
    return () => this.removeListener('error', handler);
  }
}

/** Singleton instance — import and use across the app */
export const negotiationSocket = new NegotiationSocket();
