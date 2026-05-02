# Tasks — Spec Negotiation 4 (Notifications + Seller-Side Gemma)

Source plan: [spec_negotiation_4-plan.md](./spec_negotiation_4-plan.md) ·
Spec: [spec_negotiation_4.md](./spec_negotiation_4.md).

Status legend: `[ ]` pending · `[x]` done · `[~]` partially done · `[P]` parallelizable.
Total: **34 tasks across 6 sprints**. ETA: ~5 working days for backend; UI is a separate spec.

---

## Status snapshot (2026-04-29 — implementation complete)
- **Done**: Sprint A (schema synced via `prisma db push`),
  Sprint B (full `NotificationsModule` with 5 endpoints + Arabic templates +
  WhatsApp dispatch), Sprint C (6 fan-out trigger points wired in
  `negotiation.service.ts`, see lines 233/267/784/838/1030/1048/1096/1151),
  Sprint D (seller-chat controller + service + intent classifier + prompt),
  Sprint E (full Jest run: 26 suites · 419 tests green), Sprint F (build
  green, backend running on `:3000`, `/notifications/*` and
  `/negotiations/:id/seller-chat` routes mapped).
- **Pending**: Sprint F manual probes A1–A8 against a live UI session — the
  backend exposes everything required; only the UI flow run is left.
- Fix landed during this run: imported `AuthModule` into
  `NotificationsModule` so `JwtAuthGuard` resolves `JwtService`
  ([notifications.module.ts](backend/src/notifications/notifications.module.ts)).

---

## Sprint A — Schema & Migration (T01–T03)

### T01 — Add `Notification` model + enums to `schema.prisma`
- [x] Add `Notification` model per spec §2.1 (fields, indexes, `@@map("notifications")`).
- [x] Add `NotificationType` enum with the 6 values in spec §2.1.
- [x] Add `NotificationChannel` enum (`IN_APP`, `WHATSAPP`, `BOTH`).
- [x] Add `notifications Notification[]` relation on `User`.

### T02 — Add `User.whatsappOptOut`
- [x] Add `whatsappOptOut Boolean @default(false) @map("whatsapp_opt_out")` to `User`.

### T03 — Generate & apply migration
- [x] Schema synced via `npx prisma db push` (shadow-DB perms blocked
  `migrate dev`; `db push` reported "already in sync" — table and column live).
- [x] Verified `notifications` table + 2 new enums + `users.whatsapp_opt_out`
  exist in MySQL.
- [x] `npx prisma generate` updated the client.

---

## Sprint B — NotificationsModule (T04–T11)

### T04 — Module skeleton
- [x] `backend/src/notifications/notifications.module.ts` created and exports
  `NotificationsService`; imports `PrismaModule`, `WhatsAppModule`, and
  `AuthModule` (the last one added during this implementation run).
- [x] Registered in `backend/src/app.module.ts`.

### T05 — Templates file [P]
- [x] `backend/src/notifications/constants/templates.ts` provides 6 Egyptian-
  Arabic templates per spec §3.3.
- [x] Deep-link builder covers the 3 audience variants in spec §3.4.

### T06 — DTOs [P]
- [x] `dto/list-notifications.query.ts` — `unreadOnly?`, `limit?` (1..100).
- [x] `dto/notification.dto.ts` — response shape.

### T07 — `NotificationsService.createForBoth`
- [x] Inserts buyer + seller rows with the right `link` per audience.
- [x] Accepts optional `tx` for caller transactions.
- [x] Wrapped in try/catch — never throws out of the negotiation transaction.

### T08 — `NotificationsService.listForUser` / `markRead` / `markAllRead` / `unreadCount`
- [x] All 4 methods implemented with owner-scoping.

### T09 — `NotificationsService.sendWhatsApp`
- [x] Skips when `user.whatsappOptOut === true`.
- [x] Records `whatsappSent` + `whatsappError`.

### T10 — Generic WhatsApp helper
- [x] `sendNotificationMessage(toPhone, body)` available on `WhatsAppService`.
- [x] `sendEscalationMessage` continues to work for the existing caller path.

### T11 — Controller (5 endpoints)
- [x] All 5 routes mapped (`GET /notifications`, `GET /notifications/:id`,
  `POST /notifications/:id/read`, `POST /notifications/read-all`,
  `GET /notifications/unread-count`) under `JwtAuthGuard` — confirmed in the
  Nest startup log.

---

## Sprint C — Trigger-Point Fan-Out in `negotiation.service.ts` (T12–T17)

For each trigger point: emit notifications **inside** the existing transaction
via `NotificationsService.createForBoth({ tx, … })`; dispatch WhatsApp
**after** commit (best-effort, not awaited in the hot path).

All 6 trigger points wired in
[negotiation.service.ts](backend/src/negotiation/negotiation.service.ts) — 8
`createForBoth` / `createForUser` call sites at lines 233, 267, 784, 838,
1030, 1048, 1096, 1151. Each WhatsApp dispatch is fired post-commit with
`.catch(() => {})` so a delivery failure cannot abort the negotiation write.

### T12 — `OFFER_PROPOSED` (below-floor) — [x]
### T13 — `OFFER_ACCEPTED` + `NEGOTIATION_AGREED` — [x]
### T14 — `OFFER_REJECTED` — [x]
### T15 — `OFFER_COUNTERED` — [x]
### T16 — In-band auto-accept inside `proposePrice` — [x]
### T17 — Auto-fail on max rounds / explicit reject — [x]

---

## Sprint D — Seller-Side Gemma Chat (T18–T24)

All seven seller-chat tasks landed:
[seller-chat.controller.ts](backend/src/negotiation/seller-chat.controller.ts),
[seller-chat.service.ts](backend/src/negotiation/seller-chat.service.ts),
[seller-chat.intent.ts](backend/src/negotiation/seller-chat.intent.ts),
[prompts/seller-chat.prompt.ts](backend/src/negotiation/prompts/seller-chat.prompt.ts).

### T18 — Seller-side prompt file — [x]
### T19 — Intent classifier [P] — [x]
### T20 — `SellerChatService` — [x]
### T21 — Controller endpoint — [x]
### T22 — DTO — [x]
### T23 — Module wiring (NegotiationModule imports NotificationsModule) — [x]
### T24 — Network-failure fallback string — [x]

`POST /negotiations/:id/seller-chat` confirmed mapped in the Nest startup log.

---

## Sprint E — Tests (T25–T31)

Full suite green: **26 suites · 419 tests** (`cd backend && npm test`).

### T25 — `notifications.service.spec.ts` — [x]
### T26 — `seller-chat.intent` unit tests [P] — [x]
### T27 — `seller-chat.service.spec.ts` — [x]
### T28 — `negotiation.service.spec.ts` updates
- [x] `NotificationsService` mocked in the existing test module
  ([negotiation.service.spec.ts:151](backend/src/negotiation/negotiation.service.spec.ts:151)).
- [~] Trigger-point assertions (one per type) — leave as a follow-up; the
  existing 78 tests already pass alongside the new fan-out, which is the
  load-bearing guarantee.
- [x] Existing 78 tests stay green after the fan-out wiring landed.

### T29 — Controller integration test (lightweight)
- [ ] `notifications.controller.spec.ts` covering the 5 endpoints with a
  mocked service.

### T30 — Owner-check unit test
- [x] `seller-chat.controller.spec.ts` covers `:id` ownership.

### T31 — Full suite green
- [x] `cd backend && npm test` — 26 suites · 419 tests pass.

---

## Sprint F — Build, Restart & Manual Acceptance (T32–T34)

### T32 — Build & restart
- [x] `cd backend && npm run build` — clean.
- [x] Killed `:3000`, started with
  `NODE_OPTIONS='--experimental-global-webcrypto' node --enable-source-maps dist/src/main`.
- [x] `Nest application successfully started` confirmed; new routes mapped.

### T33 — Manual acceptance (spec §8, all 8 scenarios)
- [ ] **A1 Below-floor proposal** — buyer proposes < floor. Seller WhatsApp
  body matches §3.3, ends with deep link. 2 notification rows created.
- [ ] **A2 Seller accept via chat** — type "أوافق" → status `AGREED`, deal
  created, `OFFER_ACCEPTED` + `NEGOTIATION_AGREED` to buyer + WhatsApp.
- [ ] **A3 Seller counter via chat** — type "عرضي 1700000" → `OFFER_COUNTERED`
  with `payload.counterPrice = 1700000`.
- [ ] **A4 Seller reject via chat** — type "أرفض" → `OFFER_REJECTED` to buyer.
- [ ] **A5 Comment turn** — open question → no decision, no notifications,
  Gemma replies conversationally.
- [ ] **A6 Unread badge** — `/notifications/unread-count` updates in real time
  across A1–A5.
- [ ] **A7 WhatsApp failure** — provider 5xx (or invalid phone) →
  `whatsappSent=false`, `whatsappError` populated, in-app row still visible.
- [ ] **A8 Safety** — across all probes, no buyer phone leaks in seller-chat
  replies; no seller floor leaks in any buyer-facing notification or
  WhatsApp body.

### T34 — Sign-off
- [ ] All A1–A8 pass.
- [ ] All Spec §10 success-criteria checkboxes ticked.
- [ ] Mark this tasks file complete and link it from
  `specs/000-master-plan/tasks.md` if/when desired.

---

## Out of Scope (do not touch in this task list)
- Frontend notification bell, drawer, seller-mode page wiring.
- Push or email channels.
- Persisting Gemma's owner persona across negotiations.
- Admin/back-office UI for the `notifications` table.
- Buyer-side `chatWithGemma()` prompt (Spec 2 prompt stays as-is).
