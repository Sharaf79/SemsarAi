# Semsar AI — Negotiation Page Redesign Specification

**Spec ID**: `negotaiation_enhane001`
**Created**: 2026-05-01
**Status**: Ready for implementation (5/6 §13 questions resolved 2026-05-01; #2 already verified during T15)
**Owner**: Sharaf79
**Stack**: NestJS 11 · Prisma 6.x · MySQL · React 18 + Vite · Socket.IO (proposed)
**Constitution Alignment**: 2-Phase Architecture — this spec covers the **Phase 2 (Negotiation Engine)** UI/transport layer. All pricing decisions remain algorithmic; this spec only redesigns the *communication surface* between buyer, seller, and the AI message formatter.

---

## Clarifications

### Session 2026-05-01

- Q: Seller's free-text channel — should the seller be able to type free-form messages? → A: A — Buyer-only free text (current). Seller composer = action buttons + price field.
- Q: Read-receipt visibility — who sees the read state? → A: A — Sender-only ticks (WhatsApp model). Sender sees "✓✓ Read"; recipient sees nothing extra.
- Q: AI-thinking sound effect — default state? → A: B — On by default, opt-out toggle. Asset bundled in repo. (Note: must respect browser autoplay policy + `prefers-reduced-motion`.)
- Q: Seller's existing chat UI — retirement strategy? → A: A — Full retirement at cutover. Old route 301-redirects to `/negotiation/:id`. Backend `seller-chat.service.ts` extractor logic stays.
- Q: Mobile UX scope — how much mobile work belongs in this spec? → A: B — Mobile-first design pass in Sprint 3 (touch targets ≥44px, keyboard-aware scroll, swipe gestures, full-height composer).

## 1. Goal

Replace the current split buyer/seller negotiation experience with a **single unified, real-time chat page** shared by both parties. The page must feel like a modern messaging app (WhatsApp / iMessage / ChatGPT) — with role-tagged bubbles, live typing indicators, a "waiting for AI" state, and deep-linking from the notification center.

Crucially, the **negotiation algorithm remains untouched** (constitution: "AI does NOT decide"). This spec only changes:
- How messages are *delivered* (HTTP polling → WebSocket).
- How both roles *share* one page instead of two.
- How notifications *deep-link* to a specific thread.
- The *waiting-state UX* during AI message formatting.

---

## 2. Context — Current State

### 2.1 Existing Files
| Layer | Path | Current Behavior |
|------|------|------------------|
| Frontend page | [frontend/src/pages/NegotiationPage.tsx](frontend/src/pages/NegotiationPage.tsx) | Buyer-centric chat using `useReducer`. Polls REST every action. Phases: `greeting → awaiting_choice → awaiting_price → evaluating → waiting_seller → awaiting_payment → revealing_phone → done`. |
| Frontend page | (none) | **Seller has no equivalent chat page** — seller interacts via `seller-chat.controller.ts` endpoints from a different UI. |
| Backend module | [backend/src/negotiation/negotiation.controller.ts](backend/src/negotiation/negotiation.controller.ts) | REST: `startNegotiation`, `proposePrice`, `submitBuyerReply`, `getNegotiation`, `getBuyerNegotiation`. |
| Backend module | [backend/src/negotiation/seller-chat.controller.ts](backend/src/negotiation/seller-chat.controller.ts) | Separate REST endpoints for the seller side. |
| Notifications | (TBD — investigate during T01) | Notification center exists but its current click-target for negotiation-related notifications must be confirmed. |

### 2.2 Pain Points
1. **Two disconnected UIs** — buyer and seller see different surfaces, hard to debug, hard to keep in sync.
2. **No real-time push** — both sides poll; one party only sees the other's move on next poll.
3. **No "AI is thinking" feedback** — Gemini response can take 1–4 s; user sees nothing.
4. **Notifications dump user on a generic page** — they must re-find the negotiation thread manually.
5. **No role identification in the bubble layout** — bubbles are styled `assistant | user | system` only.

---

## 3. In Scope

- Unified `NegotiationPage` shared by both `BUYER` and `SELLER` roles.
- Role-aware rendering (bubble alignment, label, theme accent).
- Real-time bidirectional transport (Socket.IO room per `negotiationId`).
- "Waiting" / typing indicators (local user, remote user, AI).
- Notification → deep-link routing to `/negotiations/:id`.
- Send-button debouncing & duplicate-message guard during waiting state.
- Optional subtle audio cue during AI thinking state (off by default; toggle in user preferences).

## 4. Out of Scope

- **No changes to the negotiation algorithm** (concession schedule, anchor price, max rounds — all stay).
- **No free-text price negotiation** — bounded actions (`accept` / `reject` / `counter <amount>`) remain the only way to move price. Free text is **only** for the buyer's "opinion / comment" path that already exists.
- No new payment flow.
- No mobile-native rewrite (web responsive only).
- No multi-party (>2) negotiations.

---

## 5. Architecture

```
┌──────────────────────┐                    ┌──────────────────────┐
│  Buyer browser       │                    │  Seller browser      │
│  /negotiations/:id   │                    │  /negotiations/:id   │
│  (same React page)   │                    │  (same React page)   │
└──────────┬───────────┘                    └──────────┬───────────┘
           │ WS (room: neg:<id>)                       │
           └────────────────┬─────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │ NegotiationGateway     │  ← new (Socket.IO)
                │ (NestJS WsAdapter)     │
                └───────────┬────────────┘
                            │
                ┌───────────▼───────────┐
                │ NegotiationService     │  ← unchanged algorithm
                │ + AI formatter (Gemini)│
                └───────────┬────────────┘
                            │
                ┌───────────▼───────────┐
                │ Prisma → MySQL         │
                │   Negotiation, Offer,  │
                │   Message (NEW)        │
                └────────────────────────┘
```

**Why Socket.IO over raw WS**: room semantics (one room per negotiation), automatic reconnect, fallback to long-polling for restrictive networks, and first-class NestJS support (`@nestjs/platform-socket.io`). Firebase rejected — adds an external dependency for a problem we can solve in-process.

---

## 6. Data Model Changes

### 6.1 New Model: `NegotiationMessage`

Stores the canonical chat thread. Each row is one bubble.

```prisma
model NegotiationMessage {
  id              String              @id @default(uuid())
  negotiationId   String              @map("negotiation_id")
  senderRole      MessageSenderRole   @map("sender_role")  // BUYER | SELLER | AI | SYSTEM
  senderUserId    String?             @map("sender_user_id") // null for AI / SYSTEM
  body            String              @db.Text
  kind            MessageKind         @default(TEXT)        // TEXT | OFFER | ACTION | NOTICE
  meta            Json?                                     // { offerAmount, round, action, ... }
  createdAt       DateTime            @default(now()) @map("created_at")
  readByBuyerAt   DateTime?           @map("read_by_buyer_at")
  readBySellerAt  DateTime?           @map("read_by_seller_at")

  negotiation     Negotiation         @relation(fields: [negotiationId], references: [id])
  sender          User?               @relation(fields: [senderUserId], references: [id])

  @@index([negotiationId, createdAt])
  @@map("negotiation_messages")
}

enum MessageSenderRole {
  BUYER
  SELLER
  AI
  SYSTEM
}

enum MessageKind {
  TEXT      // free-form (buyer opinions only)
  OFFER     // counter-offer card
  ACTION    // accept / reject marker
  NOTICE    // system event (round advance, status change)
}
```

### 6.2 `Negotiation` — minor addition

Add a `lastActivityAt` index column for sorting in the inbox view:

```prisma
lastActivityAt  DateTime  @default(now()) @map("last_activity_at")
@@index([lastActivityAt])
```

### 6.3 Backfill

One-shot Prisma migration script that synthesizes `NegotiationMessage` rows from existing `Offer` rows + `AiLog` rows so historical threads render.

---

## 7. Backend — WebSocket Gateway

### 7.1 New File: `backend/src/negotiation/negotiation.gateway.ts`

```ts
@WebSocketGateway({ namespace: '/negotiations', cors: { origin: true } })
export class NegotiationGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  // Auth via handshake JWT, then join room "neg:<id>"
  async handleConnection(client: Socket) { /* ... */ }

  @SubscribeMessage('join')
  async onJoin(@MessageBody() { negotiationId }, @ConnectedSocket() client) {
    // Verify user is buyer or seller of negotiationId
    // client.join(`neg:${negotiationId}`)
    // Emit "history" with last N messages
  }

  @SubscribeMessage('typing')
  onTyping(@MessageBody() { negotiationId, isTyping }, @ConnectedSocket() client) {
    client.to(`neg:${negotiationId}`).emit('typing', { role, isTyping });
  }

  @SubscribeMessage('read')
  onRead(@MessageBody() { negotiationId, messageId }, @ConnectedSocket() client) {
    // update read_by_*_at, broadcast
  }

  // Internal — called by NegotiationService after a message is persisted
  emitMessage(negotiationId: string, message: NegotiationMessage) {
    this.server.to(`neg:${negotiationId}`).emit('message', message);
  }

  emitAiThinking(negotiationId: string, isThinking: boolean) {
    this.server.to(`neg:${negotiationId}`).emit('ai_thinking', { isThinking });
  }
}
```

### 7.2 Service Integration

`NegotiationService` (existing) is extended with a private `messages` helper. Wherever the service currently:
1. Creates an offer → also persist a `MessageKind.OFFER` row and emit via gateway.
2. Calls `gemma.chat(...)` → emit `ai_thinking: true` *before* the call, persist & emit the formatted message *after*, then emit `ai_thinking: false`.
3. Records an `AiLog` action — persist a `NOTICE` or `ACTION` message in parallel.

**No algorithmic change** — only the side-effect of broadcasting.

### 7.3 REST Endpoints (additive)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/negotiations/:id/messages?cursor=&limit=` | Paginated history (initial load + scroll-back). |
| `POST` | `/negotiations/:id/messages` | Buyer free-text comment (existing path; now also persists & broadcasts). |
| `POST` | `/negotiations/:id/read` | Mark messages read up to `messageId`. |

Existing `proposePrice` / `submitBuyerReply` / `seller-chat` endpoints **stay** — they now also write to `NegotiationMessage` and broadcast.

---

## 8. Frontend — Unified Page

### 8.1 Routing

| Path | Who | Behavior |
|------|-----|----------|
| `/negotiations/:id` | Either role | Loads negotiation, server returns the user's role (`BUYER` / `SELLER`), page renders accordingly. |
| `/negotiations/property/:propertyId/start` | Buyer only | Existing "start a negotiation" flow → redirects to `/negotiations/:id`. |

The current `NegotiationPage.tsx` becomes the unified page; the seller's existing UI is retired and redirected here.

### 8.2 Component Tree

```
<NegotiationPage>
  ├── <NegotiationHeader>        // property thumbnail, title, status pill, role badge
  ├── <MessageList>              // virtualized (react-virtuoso) for >100 msgs
  │     ├── <MessageBubble>      // one per message; props: senderRole, viewerRole, body, kind, ts, readAt
  │     └── <TypingIndicator>    // shown when remote.typing || ai.thinking
  ├── <ActionBar>                // role-aware action buttons (Accept / Reject / Counter / Comment)
  │     └── <CounterOfferModal>  // numeric input (existing)
  └── <Composer>                 // text input + role label + send btn (disabled while waiting)
```

### 8.3 Role Identification (UX)

- **Header**: "أنت {البائع | المشتري}" badge (top-right).
- **Bubble**: bubble alignment based on `viewerRole === senderRole` (own = right, other = left); a small role tag (`بائع` / `مشتري` / `مساعد`) sits above each bubble's first line.
- **Composer**: subtle role label to the left of the mic icon — e.g. `🛒 المشتري` or `🏠 البائع`.

### 8.4 State Management

Replace the existing `useReducer` with a slim **Zustand store** (already in deps if not — add it; tiny, 1 KB). Key slices:

```ts
interface NegotiationStore {
  negotiation: Negotiation | null;
  viewerRole: 'BUYER' | 'SELLER';
  messages: Message[];
  remoteTyping: boolean;
  aiThinking: boolean;
  sending: boolean;            // local optimistic send in-flight
  pendingClientId: string|null; // for dedupe
  socket: Socket | null;
  // actions
  connect(negotiationId): void;
  send(text): Promise<void>;
  proposeCounter(amount): Promise<void>;
  accept(): Promise<void>;
  reject(): Promise<void>;
  markRead(messageId): void;
}
```

Why Zustand over the existing `useReducer`: the page now has cross-cutting concerns (socket lifecycle, derived `isWaiting`, optimistic send) that bloat reducers; Zustand keeps actions co-located with state and survives unmount during route transitions.

### 8.5 Waiting State (the IMPORTANT one)

A unified `isWaiting` selector:
```ts
const isWaiting = sending || aiThinking || remoteTyping;
```

Rendering rules while `isWaiting`:
- `<Composer>` input: `cursor: wait`, send button shows spinner instead of arrow, `disabled` to prevent double-submit.
- `<TypingIndicator>` renders with three animated dots and a label:
  - `aiThinking` → "المساعد بيكتب…"
  - `remoteTyping` → "البائع بيكتب…" / "المشتري بيكتب…" (depending on `viewerRole`)
  - `sending` → no separate indicator, just the composer spinner.
- Optional **audio cue** (`thinking.mp3`, ~300ms soft chime, looped while `aiThinking`):
  - Off by default. Toggle in `localStorage.semsar.sound = 'on'`.
  - Honors `prefers-reduced-motion` / OS "Do Not Disturb" where detectable.

Transitions:
- `sending` flips true the instant `send()` is called; flips false on either (a) ack from REST POST or (b) corresponding `message` event from socket — whichever arrives first.
- `aiThinking` is *server-driven* — we trust the gateway's `ai_thinking` event. Local timeout fallback: auto-clear after 15 s with a system NOTICE message ("لم يصلنا رد من المساعد، حاول مرة أخرى").
- Duplicate-message guard: when sending, attach a `clientId` (uuid). On receipt of the persisted message, match `clientId` and replace the optimistic bubble in place — never render twice.

### 8.6 Notification Deep-Link

| Notification trigger | Current target | New target |
|---|---|---|
| New offer received | (TBD — verify) | `/negotiations/:id?focus=<messageId>` |
| Negotiation accepted/rejected | (TBD) | `/negotiations/:id` |
| Buyer interested in your listing | (TBD) | `/negotiations/:id` (creates if needed) |

Implementation: each notification row in the notification center stores `link` already; we set it to the canonical path above when the notification is created in the notification service. The `?focus=<messageId>` query param scrolls the message into view and pulses it for 1 s.

---

## 9. API Contract Summary

### 9.1 REST (additive)

| Method | Path | Body / Query | Response |
|--------|------|---|---|
| `GET` | `/negotiations/:id` | — | `{ negotiation, viewerRole, property }` |
| `GET` | `/negotiations/:id/messages` | `?cursor=&limit=50` | `{ items: Message[], nextCursor }` |
| `POST` | `/negotiations/:id/messages` | `{ clientId, body }` | persisted `Message` |
| `POST` | `/negotiations/:id/read` | `{ upToMessageId }` | `{ ok: true }` |

### 9.2 Socket.IO Events (`/negotiations` namespace)

**Client → Server**
- `join` `{ negotiationId }`
- `typing` `{ negotiationId, isTyping }`
- `read` `{ negotiationId, messageId }`

**Server → Client**
- `history` `{ items: Message[] }` (on join)
- `message` `Message`
- `typing` `{ role: 'BUYER'|'SELLER', isTyping }`
- `ai_thinking` `{ isThinking }`
- `negotiation_update` `{ status, currentOffer, round }`
- `error` `{ code, message }`

---

## 10. Security & Validation

| Concern | Implementation |
|---|---|
| Socket auth | JWT in `Socket.handshake.auth.token`; reject on invalid; close socket. |
| Room access | On `join`, verify `userId === negotiation.buyerId || sellerId`. |
| Spam | Rate limit `typing` events to 1/sec per socket; rate limit `messages` POST to 6/min per user per negotiation. |
| Free-text safety | `MessageKind.TEXT` only allowed on the buyer's "comment" path; algorithmic decisions remain bounded. |
| XSS | Server stores `body` raw; client renders with text-only (no `dangerouslySetInnerHTML`). |
| CORS | Gateway shares main app CORS config. |

---

## 11. Migration & Rollout

1. **Migration #1** — add `NegotiationMessage` model, `lastActivityAt`, enums.
2. **Backfill script** — `pnpm --filter backend run backfill:negotiation-messages` synthesizes history rows.
3. **Feature flag** — `NEGOTIATION_V2=true` env var. When false, frontend continues using REST polling. When true, sockets engage.
4. **Dual-write window** (1 week) — REST endpoints write to `NegotiationMessage` even when flag off, so backfill stays current.
5. **Cutover** — flip flag for 10 % of users → 100 % after 48 h with no error budget breach.
6. **Cleanup** — retire seller's standalone chat UI; keep `seller-chat.*.ts` services (still used by AI extraction logic).

---

## 12. Testing

### 12.1 Unit
- `NegotiationGateway`: join auth, room scoping, typing/read broadcast.
- `NegotiationService.send` / message persistence + emission ordering.
- Backfill script idempotency.

### 12.2 Integration / E2E
1. Two-browser test (Playwright): buyer and seller open same `/negotiations/:id` → buyer counters → seller sees bubble within 500 ms → seller accepts → both see `AGREED` status.
2. AI thinking lifecycle: buyer comments → `ai_thinking:true` arrives within 100 ms → AI reply persisted within 5 s → `ai_thinking:false`.
3. Notification deep-link: click notification → lands on `/negotiations/:id` with the right thread loaded.
4. Reconnect: kill socket mid-thread → reconnect → `history` re-syncs without dupes (clientId dedupe).
5. Duplicate-send guard: hammer send button 5× fast → exactly 1 persisted message.

### 12.3 Performance
- Message render: 1 000 messages stay at 60 fps (virtualization).
- Socket fan-out: 100 concurrent rooms with 2 sockets each, p95 emit→receive < 200 ms.

---

## 13. Open Questions (Clarification Needed)

The following ambiguities should be resolved before implementation begins. The user can answer inline or via `/speckit.clarify`.

1. ~~Sound effect~~ — **resolved 2026-05-01**: bundled in repo (`/frontend/public/sfx/thinking.mp3`), **on by default**, opt-out via user preference. Must defer to browser autoplay policy and `prefers-reduced-motion`.
2. **Notification source of truth**: where are notifications currently created (search for `NotificationService` / equivalent)? Does each negotiation event already emit one, or do we need to add hooks?
3. ~~Read receipts visibility~~ — **resolved 2026-05-01**: sender-only ticks (Option A — WhatsApp model).
4. ~~Seller's existing chat UI~~ — **resolved 2026-05-01**: full retirement at cutover (Option A). Old route 301-redirects to `/negotiation/:id`. Backend extractor logic stays.
5. ~~Mobile~~ — **resolved 2026-05-01**: mobile-first design pass in Sprint 3 (Option B). Touch targets ≥44px, keyboard-aware scroll, swipe gestures, full-height composer.
6. ~~Free-text from seller~~ — **resolved 2026-05-01**: buyer-only free text (Option A); seller composer is action buttons + price field.

---

## 14. Critical Files (for implementer)

- [frontend/src/pages/NegotiationPage.tsx](frontend/src/pages/NegotiationPage.tsx) — rewrite to unified shell.
- [backend/src/negotiation/negotiation.service.ts](backend/src/negotiation/negotiation.service.ts) — add message persistence + gateway emissions; **do not change pricing logic**.
- [backend/src/negotiation/negotiation.controller.ts](backend/src/negotiation/negotiation.controller.ts) — add `GET/POST /messages`, `POST /read`.
- [backend/src/negotiation/negotiation.module.ts](backend/src/negotiation/negotiation.module.ts) — register `NegotiationGateway`.
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — add `NegotiationMessage`, enums.
- `backend/src/negotiation/negotiation.gateway.ts` — **new**.
- `frontend/src/api/negotiations.ts` — add `getMessages`, `sendMessage`, `markRead`.
- `frontend/src/realtime/socket.ts` — **new**, central Socket.IO client.
- `frontend/src/store/negotiation.ts` — **new**, Zustand store.

---

## 15. Success Criteria

- [ ] Buyer and seller can open the **same URL** and see live updates from each other.
- [ ] Notification click lands directly on the correct negotiation thread.
- [ ] Role badge visible in header **and** in composer.
- [ ] After `send()`, composer shows spinner + cursor `wait` until ack/echo.
- [ ] AI thinking shows typing indicator within 100 ms of trigger; clears within 100 ms of response.
- [ ] No duplicate messages under fast-clicking or socket reconnect.
- [ ] Negotiation algorithm tests (existing suite) pass unchanged — proves no decision logic was touched.
- [ ] p95 buyer-action → seller-render latency < 500 ms over LAN.
- [ ] All Arabic strings polite Egyptian register, RTL safe.

---

## 16. Next Step

After clarifications in §13 are answered, run `/speckit.plan` to produce `negotaiation_enhane001-plan.md`, followed by `/speckit.tasks` for the dependency-ordered task list.
