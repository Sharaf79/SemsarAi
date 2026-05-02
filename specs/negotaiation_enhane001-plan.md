# Implementation Plan — `negotaiation_enhane001`

**Spec**: [specs/negotaiation_enhane001.md](specs/negotaiation_enhane001.md)
**Created**: 2026-05-01
**Status**: Approved — clarifications resolved 2026-05-01 (see Assumptions; A4 and A6 were overridden by the user)
**Estimated effort**: 5–7 working days for one engineer (front + back).

---

## 0. Decisions (resolved 2026-05-01)

| # | Decision | Source |
|---|----------|--------|
| A1 | Seller composer stays **action-buttons + price field** (no free text). Buyer keeps existing free-text comment path. | Spec §13 Q1 — confirmed. |
| A2 | Notifications already emit through `NotificationsService.createForBoth/createForUser` → `buildDeepLink` returns `/negotiation/:id` (singular). **No new hooks needed.** | Verified during T15. |
| A3 | Read receipts are **sender-only visible** (WhatsApp-style ✓✓). Recipient sees nothing extra. | Spec §13 Q3 — confirmed. |
| A4 | Sound effect: **on by default**, opt-out via user preference. Asset shipped in repo (`/frontend/public/sfx/thinking.mp3`, ≤30 KB). Must respect browser autoplay policy and `prefers-reduced-motion` (auto-mute). | Spec §13 Q1 — flipped from initial recommendation. |
| A5 | Seller's existing chat UI is **fully retired** at cutover. Old route 301-redirects to `/negotiation/:id`. Backend `seller-chat.service.ts` business logic stays (still used by AI extractors). | Spec §13 Q4 — confirmed. |
| A6 | **Mobile-first design pass in Sprint 3.** Touch targets ≥44px, keyboard-aware scroll (`visualViewport` API), full-height composer that anchors to keyboard, swipe-back gesture handled. RTL safe. | Spec §13 Q5 — flipped from initial recommendation. Adds ~1 day to Sprint 3. |

---

## 1. Sprints

### Sprint 1 — Foundations & Data Model (Day 1)

**Goal**: schema changes merged, backfill ready, gateway skeleton boots.

| # | Task | Files | Notes |
|---|------|-------|-------|
| 1.1 | Add `NegotiationMessage`, `MessageSenderRole`, `MessageKind` enums + `lastActivityAt` to schema | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | Per spec §6.1–6.2 |
| 1.2 | Generate & apply Prisma migration | `backend/prisma/migrations/` | `pnpm --filter backend prisma migrate dev --name negotiation_messages` |
| 1.3 | Backfill script: synthesize messages from `Offer` + `AiLog` | `backend/src/scripts/backfill-negotiation-messages.ts` | Idempotent: keyed on `(negotiationId, sourceId)`. |
| 1.4 | Locate notification creation site | grep for `notification`, `notify`, `inbox` across `backend/src/` | Resolves A2. |
| 1.5 | Install Socket.IO deps | `backend/package.json`, `frontend/package.json` | `@nestjs/platform-socket.io`, `socket.io`, `socket.io-client` |
| 1.6 | Stub `NegotiationGateway` (no logic, just connection) | `backend/src/negotiation/negotiation.gateway.ts` | Verify it boots in dev. |

**Exit**: migration applied, backfill dry-run logs expected row counts, gateway connects from a smoke-test client.

---

### Sprint 2 — Backend Real-Time Layer (Day 2)

**Goal**: gateway fully wired, REST additions, `NegotiationService` emits without changing pricing logic.

| # | Task | Files |
|---|------|-------|
| 2.1 | JWT handshake auth + `join` handler with room scoping | `negotiation.gateway.ts` |
| 2.2 | `typing`, `read`, `ai_thinking` events + rate-limit guard (6/min msgs, 1/sec typing) | `negotiation.gateway.ts` |
| 2.3 | `messageWriter` helper inside `NegotiationService` — persists row + emits to room | [backend/src/negotiation/negotiation.service.ts](backend/src/negotiation/negotiation.service.ts) |
| 2.4 | Wrap every existing `gemma.chat(...)` call: emit `ai_thinking:true` before, `:false` after (try/finally) | `negotiation.service.ts` |
| 2.5 | New REST: `GET /negotiations/:id/messages`, `POST /negotiations/:id/messages`, `POST /negotiations/:id/read` | [backend/src/negotiation/negotiation.controller.ts](backend/src/negotiation/negotiation.controller.ts) |
| 2.6 | Notification deep-link: ensure new-offer / accept / reject notifications carry `link = /negotiations/:id` | NotificationService (location TBD per A2) |
| 2.7 | Unit + integration tests for new code paths | `*.spec.ts` |

**Exit**: existing `negotiation.service.spec.ts` passes unchanged (proves algorithm untouched); new tests cover gateway broadcast, message persistence, and AI thinking lifecycle.

---

### Sprint 3 — Frontend Unified Page (Days 3–4)

**Goal**: one page for both roles, real-time, with waiting UX.

| # | Task | Files |
|---|------|-------|
| 3.1 | Add `socket.io-client` wrapper with auto-reconnect + JWT auth | `frontend/src/realtime/socket.ts` *(new)* |
| 3.2 | Zustand store: `negotiation`, `messages`, `viewerRole`, `remoteTyping`, `aiThinking`, `sending`, `pendingClientId` + actions | `frontend/src/store/negotiation.ts` *(new)* |
| 3.3 | Refactor `NegotiationPage.tsx` → unified shell consuming the store; drop `useReducer` | [frontend/src/pages/NegotiationPage.tsx](frontend/src/pages/NegotiationPage.tsx) |
| 3.4 | `<MessageBubble>` with role tag, `<TypingIndicator>` with three-dot CSS animation | `frontend/src/components/negotiation/` *(new)* |
| 3.5 | `<Composer>` with role badge + `cursor: wait` + send-button spinner + disabled while `isWaiting` | same dir |
| 3.6 | `clientId` dedupe path (optimistic bubble replaced by echoed message) | store |
| 3.7 | Sound cue (opt-in via localStorage), `prefers-reduced-motion` honored | `frontend/public/sfx/thinking.mp3` + `useThinkingSound.ts` |
| 3.8 | Notification → deep-link: `/negotiations/:id?focus=<msgId>` scrolls + pulses | router + page effect |
| 3.9 | Virtualize message list (`react-virtuoso`) once threads exceed 100 msgs | MessageList component |
| 3.10 | Retire seller's previous chat UI, redirect its routes to `/negotiations/:id` | seller route file |

**Exit**: two-browser manual test — buyer counter shows on seller in <1 s; AI thinking dots appear during Gemini latency; double-clicking send creates exactly one bubble.

---

### Sprint 4 — Hardening & Rollout (Day 5)

**Goal**: feature flag, automated E2E, dual-write window started.

| # | Task |
|---|------|
| 4.1 | `NEGOTIATION_V2` env flag in backend; gateway only registered when true |
| 4.2 | Frontend reads `/api/feature-flags` and falls back to REST polling when off |
| 4.3 | Playwright E2E: 2 contexts (buyer, seller) running the spec §12.2 scenarios 1–5 |
| 4.4 | Performance smoke: 100 rooms × 2 sockets, p95 emit→receive < 200 ms |
| 4.5 | Enable flag for 10 % of users (hash-based); monitor 48 h; ramp to 100 % |
| 4.6 | Remove dual-write code, retire old REST polling client paths |

**Exit**: success criteria checklist (spec §15) all green.

---

## 2. Critical Files

**Modify**
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — new model + enums + index.
- [backend/src/negotiation/negotiation.service.ts](backend/src/negotiation/negotiation.service.ts) — add `messageWriter`; wrap Gemini calls. **Do not touch `calculateCounterOffer` / `getConcessionRate` / `nextStep` decision logic.**
- [backend/src/negotiation/negotiation.controller.ts](backend/src/negotiation/negotiation.controller.ts) — 3 new endpoints.
- [backend/src/negotiation/negotiation.module.ts](backend/src/negotiation/negotiation.module.ts) — register gateway.
- [frontend/src/pages/NegotiationPage.tsx](frontend/src/pages/NegotiationPage.tsx) — full rewrite to unified shell.
- [frontend/src/api/negotiations.ts](frontend/src/api/negotiations.ts) — add `getMessages`, `sendMessage`, `markRead`.

**Create**
- `backend/src/negotiation/negotiation.gateway.ts`
- `backend/src/scripts/backfill-negotiation-messages.ts`
- `frontend/src/realtime/socket.ts`
- `frontend/src/store/negotiation.ts`
- `frontend/src/components/negotiation/{MessageBubble,TypingIndicator,Composer,RoleBadge}.tsx`
- `frontend/src/hooks/useThinkingSound.ts`
- `frontend/public/sfx/thinking.mp3`

**Reuse (do not reinvent)**
- `gemma.client.ts` — AI message formatter, already wraps Gemini.
- `negotiation-simulator.service.ts` — useful for the Playwright E2E fixtures.
- Existing JWT guard from `auth/` — reuse for socket handshake.
- Existing `Negotiation` / `Offer` Prisma models — untouched.

---

## 3. Risk Register

| Risk | Mitigation |
|------|-----------|
| Algorithm regression from accidental edits while wiring messages | Lock `nextStep` / pricing tests; CI fails on coverage drop in `negotiation.service.ts`. |
| Socket auth bypass | JWT verified in `handleConnection`; reject before any `join`. |
| Duplicate messages from race (REST ack + socket echo) | `clientId` dedupe in store; server includes `clientId` in echoed message. |
| Sticky sessions needed if we ever scale to >1 backend instance | Defer — single-instance for now. Add Redis adapter (`@socket.io/redis-adapter`) when horizontal scale lands. Note in code as TODO. |
| Stale `aiThinking` if Gemini call throws | `try/finally` guarantees `:false` emission; 15 s client-side timeout fallback. |
| Backfill misclassifies historical AiLog rows | Dry-run mode prints diff; require manual `--apply` flag. |

---

## 4. Verification

End-to-end smoke (after Sprint 3 lands):
1. `bash run_system_on_the_browser.sh` from `/Users/sherif/Projects/SemsarAi`.
2. Open two browser profiles → log in as buyer + seller of the same property.
3. Both navigate to `/negotiations/:id`; confirm role badge differs.
4. Buyer clicks **Counter** → enter price → seller's window shows new bubble within 1 s.
5. Buyer clicks **Comment** → send free text → both windows show "المساعد بيكتب…" → AI reply lands.
6. Click any negotiation notification → lands on the same thread (deep-link).
7. Run `pnpm --filter backend test` → all existing + new tests green.
8. Run `pnpm --filter frontend playwright test negotiation.e2e.ts` → all 5 scenarios green.

---

## 5. Next Step

After this plan is approved, run `/speckit.tasks` to generate `negotaiation_enhane001-tasks.md` with dependency-ordered atomic tasks (~25 tasks, T01–T25).
