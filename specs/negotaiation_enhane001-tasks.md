# Tasks — `negotaiation_enhane001`

**Spec**: [specs/negotaiation_enhane001.md](specs/negotaiation_enhane001.md)
**Plan**: [specs/negotaiation_enhane001-plan.md](specs/negotaiation_enhane001-plan.md)
**Created**: 2026-05-01
**Total**: 28 tasks · ~5–7 working days · 4 sprints

Each task is atomic (≤2 hours), independently committable, and listed in dependency order. `[P]` = can run in parallel with the previous task.

---

## Sprint 1 — Foundations & Data Model (Day 1)

| ID | Task | Output / Done When | Files |
|----|------|--------------------|-------|
| **T01** | Add `NegotiationMessage` model + `MessageSenderRole` and `MessageKind` enums to Prisma schema | `prisma format` clean; types generated | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) |
| **T02** | Add `lastActivityAt` (default `now()`, indexed) to `Negotiation` model | Schema field present, indexed | same |
| **T03** | Generate migration `negotiation_messages` and apply locally | `pnpm --filter backend prisma migrate dev --name negotiation_messages` succeeds; row counts in MySQL match | `backend/prisma/migrations/` |
| **T04** [P] | Locate notification creation site (grep `notif`, `inbox`, `bell`) and document file path in plan §0/A2 | One-paragraph note appended to plan with file path & function name | (research only) |
| **T05** | Install Socket.IO deps in backend & frontend | `@nestjs/platform-socket.io`, `socket.io`, `socket.io-client` listed in respective `package.json`; lockfiles updated | `backend/package.json`, `frontend/package.json` |
| **T06** | Stub `NegotiationGateway` (namespace `/negotiations`, empty handlers, no auth yet) | Server boots, gateway logs "Mapped /negotiations namespace" | `backend/src/negotiation/negotiation.gateway.ts` *(new)* |
| **T07** | Register gateway in `NegotiationModule` providers | `nest start:dev` clean; gateway resolved by DI | [backend/src/negotiation/negotiation.module.ts](backend/src/negotiation/negotiation.module.ts) |
| **T08** | Backfill script (dry-run mode by default) — synthesize `NegotiationMessage` rows from `Offer` + `AiLog` | Dry-run prints expected row count per negotiation; `--apply` flag persists | `backend/src/scripts/backfill-negotiation-messages.ts` *(new)* |

**Sprint 1 exit**: schema migrated, gateway boots, backfill dry-run prints expected counts on local data.

---

## Sprint 2 — Backend Real-Time Layer (Day 2)

| ID | Task | Output / Done When | Files |
|----|------|--------------------|-------|
| **T09** | JWT handshake auth in `handleConnection` (reuse existing `JwtService`); reject invalid tokens | Unit test: missing/invalid token closes socket | `negotiation.gateway.ts` |
| **T10** | `join` handler: verify `userId === buyer or seller`, join `neg:<id>` room, emit `history` (last 50 msgs) | Integration test: 2 sockets in same room receive each other's events | `negotiation.gateway.ts` |
| **T11** | `typing` + `read` handlers with rate limit (1/sec typing, 6/min messages) | Rate-limit test: 7th message in a minute returns `error` event | `negotiation.gateway.ts` |
| **T12** | `messageWriter` helper in `NegotiationService` — persists row + emits to room | Unit test verifies persistence + emission ordering | [backend/src/negotiation/negotiation.service.ts](backend/src/negotiation/negotiation.service.ts) |
| **T13** | Wrap every `gemma.chat(...)` call in `NegotiationService` with `ai_thinking:true/false` (try/finally) | Unit test: throwing AI still emits `:false` | same |
| **T14** [P] | New REST endpoints: `GET /negotiation/:id/messages` (cursor pagination), `POST /negotiation/:id/messages`, `POST /negotiation/:id/read` | Controller specs pass; OpenAPI/Swagger updated | [backend/src/negotiation/negotiation.controller.ts](backend/src/negotiation/negotiation.controller.ts) |
| **T15** [X] | Notification service: ensure new-offer / accept / reject notifications carry `link = /negotiation/:id` | Verified: all 6 NotificationType call sites in `negotiation.service.ts` route through `NotificationsService.createForBoth/createForUser` → `buildDeepLink` returns `/negotiation/:id` (buyer), `/negotiation/:id?role=seller`, or `/seller-action/{token}` (one-tap escalation, also negotiation-specific). No code change required. | [backend/src/notifications/constants/templates.ts](backend/src/notifications/constants/templates.ts), [backend/src/negotiation/negotiation.service.ts](backend/src/negotiation/negotiation.service.ts) |
| **T16** [X] | Existing `negotiation.service.spec.ts` still green (regression guard for algorithm) | 95/95 passing after adding `NegotiationGateway` mock provider to test module | [backend/src/negotiation/negotiation.service.spec.ts](backend/src/negotiation/negotiation.service.spec.ts) |

**Sprint 2 exit**: `pnpm --filter backend test` green; 2-socket integration test passes; algorithm spec untouched.

---

## Sprint 3 — Frontend Unified Page (Days 3–4)

| ID | Task | Output / Done When | Files |
|----|------|--------------------|-------|
| **T17** | Socket.IO client wrapper with auto-reconnect + JWT from auth store | `connect()` resolves; `disconnect()` cleans listeners | `frontend/src/realtime/socket.ts` *(new)* |
| **T18** | Zustand store for negotiation page state (`messages`, `viewerRole`, `remoteTyping`, `aiThinking`, `sending`, `pendingClientId`) | Store actions: `connect`, `send`, `proposeCounter`, `accept`, `reject`, `markRead` typed and unit-tested | `frontend/src/store/negotiation.ts` *(new)* |
| **T19** | API client additions: `getMessages`, `sendMessage`, `markRead` | Typed; covers cursor pagination | [frontend/src/api/negotiations.ts](frontend/src/api/negotiations.ts) |
| **T20** | Refactor `NegotiationPage.tsx` shell — drop `useReducer`, mount store, render `Header / MessageList / ActionBar / Composer` | Page renders for both roles; existing buyer flow unbroken | [frontend/src/pages/NegotiationPage.tsx](frontend/src/pages/NegotiationPage.tsx) |
| **T21** | `<MessageBubble>` (role tag, timestamp, alignment by viewer-vs-sender) + `<TypingIndicator>` (3-dot CSS, role-aware label) | Storybook or visual test renders all 4 sender roles | `frontend/src/components/negotiation/` *(new)* |
| **T22** | `<Composer>` with role badge + `cursor: wait` + send-button spinner + `disabled` while `isWaiting`. **Mobile**: full-width on ≤480px, anchored to `visualViewport` so it tracks the on-screen keyboard, send button ≥44×44px. | Manual: rapid double-click produces 1 bubble; iOS Safari keyboard doesn't cover the input | same |
| **T23** | `clientId` dedupe — optimistic bubble replaced by echoed message via matching `clientId` | Unit test: two store dispatches collapse to one rendered bubble | store + bubble |
| **T24** [P] | Sound cue: `useThinkingSound` hook, **on by default**, opt-out via `localStorage.semsar.sound = 'off'`. Honors `prefers-reduced-motion` (auto-mute) and browser autoplay policy (gracefully no-op until first user interaction). | Audio plays automatically while `aiThinking`; muted when system reduces motion or user opts out | `frontend/src/hooks/useThinkingSound.ts` + `frontend/public/sfx/thinking.mp3` |
| **T25** | Notification deep-link: `/negotiation/:id?focus=<msgId>` scrolls into view + 1 s pulse | Click any notification → correct thread + highlighted message | router effect inside page |
| **T26** [X] | Retire seller's old chat UI; redirect its routes to `/negotiation/:id` | Audit confirmed no standalone seller-chat React page exists — both roles already share `/negotiation/:id`. The actual orphan was the `/seller-action/:token` notification deep-link (no frontend route → fell through to HomePage). Added `SellerActionRedirect` page that resolves the token via `getSellerEscalation` and replaces history with `/negotiation/:negotiationId?escalation=<token>`. Backend `getEscalationByToken` now returns `negotiationId`. | [frontend/src/pages/SellerActionRedirect.tsx](frontend/src/pages/SellerActionRedirect.tsx), [frontend/src/App.tsx](frontend/src/App.tsx), [backend/src/negotiation/negotiation.service.ts](backend/src/negotiation/negotiation.service.ts), [frontend/src/api/negotiations.ts](frontend/src/api/negotiations.ts) |
| **T26b** | **Mobile pass** across `<MessageBubble>`, `<MessageList>`, `<Header>`: bubble max-width 85vw on ≤480px, sticky header with safe-area-inset-top, swipe-back-from-edge tested in iOS Safari, RTL-mirrored properly. | Lighthouse mobile score ≥90; manual smoke on iPhone Safari + Android Chrome | components |

**Sprint 3 exit**: 2-browser manual smoke (buyer + seller) passes; all spec §15 success items observable manually.

---

## Sprint 4 — Hardening & Rollout (Day 5)

| ID | Task | Output / Done When | Files |
|----|------|--------------------|-------|
| **T27** | Feature flag `NEGOTIATION_V2`: backend conditionally registers gateway; frontend reads `/api/feature-flags` and falls back to REST polling when off | Toggle works without restart on frontend; backend respects env at boot | env + flag service |
| **T28** | Playwright E2E covering spec §12.2 scenarios 1–5 (2-browser handoff, AI thinking lifecycle, notification deep-link, reconnect, dedupe) | `pnpm --filter frontend playwright test negotiation.e2e.ts` 5/5 green | `frontend/tests/e2e/negotiation.e2e.ts` *(new)* |

**Sprint 4 exit**: spec §15 checklist all green; rollout plan (10 % → 100 %) ready to flip.

---

## Dependency Graph (high level)

```
T01 → T02 → T03 ─┬─► T08 (backfill)
                 ├─► T06 → T07 ─► T09 → T10 → T11
                 │                         │
                 └─► T05 ──────────────────┤
                                           ▼
                                T12 → T13 → T14 → T15 → T16
                                                          │
T17 ──► T18 ──► T19 ──► T20 ──► T21 ──► T22 ──► T23 ◄────┤
                                          │
                                          ├──► T24 [P]
                                          ├──► T25
                                          └──► T26
                                                  │
                                                  ▼
                                              T27 → T28
```

`[P]` tasks (T04, T14, T24) can run in parallel with their predecessor in the same sprint.

---

## Out of Scope (explicit non-tasks)

- Redis Socket.IO adapter for multi-instance scaling (deferred per plan §3 risk register).
- Native iOS/Android apps — web responsive only (mobile-web *is* in scope per A6).
- Read-receipts visible to both parties (per plan A3 — sender-only).
- Seller free-text channel (per plan A1 — bounded actions only).
- Pricing-algorithm changes (constitution: untouchable).

---

## Verification (after T28)

1. `bash /Users/sherif/Projects/SemsarAi/run_system_on_the_browser.sh`
2. Open buyer + seller in two browser profiles on `/negotiation/:id`.
3. Walk spec §15 checklist — every item must visibly succeed.
4. `pnpm --filter backend test` and `pnpm --filter frontend playwright test` both green.
5. Flip `NEGOTIATION_V2=true` for 10 % cohort; monitor 48 h; ramp to 100 %.

---

## Next Step

Run `/speckit.implement` to begin executing T01 onward, or `/speckit.taskstoissues` to convert this list into GitHub issues.
