# Tasks — Spec Negotiation 4 (Notifications + Seller-Side Gemma)

Source plan: [spec_negotiation_4-plan.md](./spec_negotiation_4-plan.md) ·
Spec: [spec_negotiation_4.md](./spec_negotiation_4.md).

Status legend: `[ ]` pending · `[x]` done · `[~]` partially done · `[P]` parallelizable.
Total: **34 tasks across 6 sprints**. ETA: ~5 working days for backend; UI is a separate spec.

---

## Sprint A — Schema & Migration (T01–T03)

### T01 — Add `Notification` model + enums to `schema.prisma`
- [ ] Add `Notification` model per spec §2.1 (fields, indexes, `@@map("notifications")`).
- [ ] Add `NotificationType` enum with the 6 values in spec §2.1.
- [ ] Add `NotificationChannel` enum (`IN_APP`, `WHATSAPP`, `BOTH`).
- [ ] Add `notifications Notification[]` relation on `User`.

### T02 — Add `User.whatsappOptOut`
- [ ] Add `whatsappOptOut Boolean @default(false) @map("whatsapp_opt_out")` to `User`.

### T03 — Generate & apply migration
- [ ] `cd backend && npx prisma migrate dev --name add_notifications`.
- [ ] Verify `notifications` table + new enums + `users.whatsapp_opt_out` exist in MySQL.
- [ ] `npx prisma generate` updates the client.

---

## Sprint B — NotificationsModule (T04–T11)

### T04 — Module skeleton
- [ ] Create `backend/src/notifications/notifications.module.ts` exporting
  `NotificationsService`. Imports `PrismaModule`, `WhatsAppModule`.
- [ ] Register in `backend/src/app.module.ts`.

### T05 — Templates file [P]
- [ ] Create `backend/src/notifications/constants/templates.ts` with the 6
  Egyptian-Arabic templates from spec §3.3, each ending with `{link}`.
- [ ] Export `buildDeepLink(notificationId, opts)` helper covering the 3
  audience variants in spec §3.4.

### T06 — DTOs [P]
- [ ] `dto/list-notifications.query.ts` — `unreadOnly?`, `limit?` (1..100).
- [ ] `dto/notification.dto.ts` — response shape (id, type, title, body, link,
  isRead, createdAt).

### T07 — `NotificationsService.createForBoth`
- [ ] Insert two `Notification` rows (buyer + seller) with the right `link`
  per audience and the templates from T05.
- [ ] Accept an optional `tx?: Prisma.TransactionClient` so callers can include
  the create in their own transaction.
- [ ] Wrap the insert in a try/catch — failure must not throw out of the
  transaction; log to `aiLog` and return `null`s.

### T08 — `NotificationsService.listForUser` / `markRead` / `markAllRead` / `unreadCount`
- [ ] List: `where: { userId }`, `orderBy: createdAt desc`, optional
  `isRead = false`, `take = limit ?? 50`.
- [ ] `markRead(userId, id)` — owner check, sets `readAt` + `isRead = true`.
- [ ] `markAllRead(userId)` — bulk update unread.
- [ ] `unreadCount(userId)` — `count({ where: { userId, isRead: false } })`.

### T09 — `NotificationsService.sendWhatsApp`
- [ ] Reads the notification, skips if `user.whatsappOptOut === true`.
- [ ] Calls `WhatsAppService.sendNotificationMessage(toPhone, body)`
  (introduced in T10).
- [ ] On success: `whatsappSent = true`. On failure: `whatsappSent = false`,
  `whatsappError = err.message`.

### T10 — Generic WhatsApp helper
- [ ] Add `sendNotificationMessage(toPhone: string, body: string): Promise<void>`
  to `WhatsAppService`. Reuse the existing transport.
- [ ] Keep `sendEscalationMessage` as a thin wrapper around the new generic
  method to avoid breaking existing callers.

### T11 — Controller (5 endpoints)
- [ ] `GET /notifications` (auth, owner-only).
- [ ] `GET /notifications/:id` (owner-only).
- [ ] `POST /notifications/:id/read`.
- [ ] `POST /notifications/read-all`.
- [ ] `GET /notifications/unread-count`.
- [ ] Use `JwtAuthGuard`; pull `userId` from `req.user`.

---

## Sprint C — Trigger-Point Fan-Out in `negotiation.service.ts` (T12–T17)

For each trigger point: emit notifications **inside** the existing transaction
via `NotificationsService.createForBoth({ tx, … })`; dispatch WhatsApp
**after** commit (best-effort, not awaited in the hot path).

### T12 — `OFFER_PROPOSED` (below-floor)
- [ ] In the BELOW_MIN branch of `proposePrice()`, after the
  `NegotiationEscalation` row is created, fan out one seller notification
  (with `link = /seller-action/{token}`) and one buyer mirror.

### T13 — `OFFER_ACCEPTED` + `NEGOTIATION_AGREED`
- [ ] In `submitSellerAction(ACCEPT)`, after status flips to `AGREED` and the
  deal row is created, fan out `OFFER_ACCEPTED` to buyer and
  `NEGOTIATION_AGREED` to both parties (link → negotiation page).

### T14 — `OFFER_REJECTED`
- [ ] In `submitSellerAction(REJECT)`, fan out `OFFER_REJECTED` to buyer.

### T15 — `OFFER_COUNTERED`
- [ ] In `submitSellerAction(COUNTER)`, fan out `OFFER_COUNTERED` to buyer
  with `payload.counterPrice`.

### T16 — In-band auto-accept inside `proposePrice`
- [ ] On IN_BAND or ABOVE_MAX where a deal is created, fan out
  `NEGOTIATION_AGREED` to both parties.

### T17 — Auto-fail on max rounds / explicit reject
- [ ] In the `request_counter > 6` branch and the explicit `reject` action of
  `handleAction()`, fan out `NEGOTIATION_FAILED` to both parties.

---

## Sprint D — Seller-Side Gemma Chat (T18–T24)

### T18 — Seller-side prompt file
- [ ] Create `backend/src/negotiation/prompts/seller-chat.prompt.ts` exporting
  `buildSellerChatPrompt({ title, listingPrice, buyerOffer, round })` returning
  the Egyptian-Arabic prompt from spec §4.3.

### T19 — Intent classifier [P]
- [ ] Create `seller-chat.intent.ts` with
  `classifyIntent(userMessage: string): { intent, counterPrice? }`.
- [ ] Detect:
  - `accept` — keywords: `أوافق`, `قبلت`, `تمام`, `موافق`, `قبول`.
  - `reject` — keywords: `أرفض`, `مش موافق`, `مرفوض`, `لأ`.
  - `counter` — message contains a number ≥ 1000 (with the existing
    `containsPriceOffer` heuristic) and not an explicit accept/reject keyword.
  - `comment` — anything else.
- [ ] Return the parsed `counterPrice` (digits-only, max 14 digits) for
  `counter`.

### T20 — `SellerChatService`
- [ ] Constructor injects `PrismaService`, `GemmaClient`,
  `NegotiationService` (for `submitSellerAction`), `JwtService` (for token
  lookup), and `NotificationsService`.
- [ ] `chat(negotiationId, sellerId, history, userMessage)`:
  1. Load negotiation + property + latest PENDING escalation. Reject if missing.
  2. Assert `negotiation.sellerId === sellerId` (ForbiddenException otherwise).
  3. Build prompt via T18, call `gemma.chat(systemPrompt, history, userMessage)`,
     fallback to spec §4.4 line on null.
  4. `intent = classifyIntent(userMessage)` from T19.
  5. If `intent ∈ {accept, reject, counter}` → call
     `submitSellerAction(token, ACTION, counterPrice?)`. Catch
     `ConflictException` (already resolved) and turn into a polite chat reply.
  6. Persist the turn in `aiLog` (`actionType = ASK`, `data` includes
     `userMessage`, `intent`, `role: 'seller'`).
  7. Return `{ reply, intent, action?, counterPrice?, notificationsCreated? }`.

### T21 — Controller endpoint
- [ ] Create `backend/src/negotiation/seller-chat.controller.ts`.
- [ ] `POST /negotiations/:id/seller-chat`, body `SellerChatDto` (history,
  userMessage), guard: `JwtAuthGuard`.

### T22 — DTO
- [ ] `seller-chat.dto.ts` with `history: ChatHistoryItem[]` and
  `userMessage: string` (`@MaxLength(2000)`).

### T23 — Module wiring
- [ ] Register `SellerChatController` and `SellerChatService` in
  `negotiation.module.ts`. Import `NotificationsModule`.

### T24 — Network-failure fallback string
- [ ] Centralize the §4.4 fallback line in `seller-chat.prompt.ts` as
  `SELLER_CHAT_FALLBACK` and use it in T20 step 3.

---

## Sprint E — Tests (T25–T31)

### T25 — `notifications.service.spec.ts`
- [ ] `createForBoth` writes 2 rows with correct `userId`, `type`, `link`.
- [ ] `listForUser({ unreadOnly: true })` filters correctly.
- [ ] `markRead` / `markAllRead` flip the flag and set `readAt`.
- [ ] `unreadCount` returns the right number.
- [ ] `sendWhatsApp` skips when `user.whatsappOptOut === true`.
- [ ] `sendWhatsApp` records `whatsappError` on failure (mock provider).

### T26 — `seller-chat.intent` unit tests [P]
- [ ] 8 Arabic phrasings: 2 accept · 2 reject · 3 counter (incl. comma & space
  variants) · 1 comment. Every case asserts the exact `intent` and
  `counterPrice` (where applicable).

### T27 — `seller-chat.service.spec.ts`
- [ ] Rejects when caller is not the seller (ForbiddenException).
- [ ] Comment turn does NOT call `submitSellerAction`.
- [ ] Accept turn calls `submitSellerAction(token, ACCEPT)` and returns
  `intent='accept'`.
- [ ] Counter turn calls `submitSellerAction(token, COUNTER, price)`.
- [ ] When the latest escalation is already RESOLVED, returns a polite chat
  reply and does NOT throw.
- [ ] When Gemma returns null, the reply is the §4.4 fallback string.
- [ ] An `aiLog` row is written for each turn.

### T28 — `negotiation.service.spec.ts` updates
- [ ] Mock `NotificationsService` in the existing test module.
- [ ] Add 6 small assertions — one per trigger point — that
  `createForBoth` was called with the right `type` and audience.
- [ ] Existing 78 tests stay green.

### T29 — Controller integration test (lightweight)
- [ ] `notifications.controller.spec.ts` covering the 5 endpoints with a
  mocked service.

### T30 — Owner-check unit test
- [ ] `seller-chat.controller.spec.ts` ensures `:id` ownership is enforced
  before the service runs.

### T31 — Full suite green
- [ ] `cd backend && npm test` — all suites pass; coverage for
  `notifications/` and `seller-chat.*` ≥ 80%.

---

## Sprint F — Build, Restart & Manual Acceptance (T32–T34)

### T32 — Build & restart
- [ ] `cd backend && npm run build`.
- [ ] Kill `:3000`, start with
  `NODE_OPTIONS='--experimental-global-webcrypto' node --enable-source-maps dist/src/main`.
- [ ] Confirm `Nest application successfully started`.

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
