# Tasks — Execute Negotiation Test 02

Source plan: [negotiation_test_02-plan.md](./negotiation_test_02-plan.md) ·
Spec / catalogue: [negotiation_test_02.md](./negotiation_test_02.md).

Status legend: `[ ]` pending · `[x]` done · `[~]` partial · `[P]` parallelizable · `[M]` manual · `[LLM]` requires Ollama up.
Total: **42 tasks across 7 waves**. ETA: ~3 working days for the automated waves; manual waves run alongside.

---

## Wave 1 — Bug regressions (T01–T05)

### T01 — Test fixtures helper [P]
- [ ] Create `backend/test/fixtures/users.ts` exporting:
  - `seedBuyerSeller(prisma)` → returns `{ buyerId, sellerId, buyerPhone, sellerPhone }`.
  - `seedActiveProperty(prisma, sellerId, price)` → returns `propertyId`.
  - `signJwt(userId, phone, jwt)` → string.
- [ ] Wipe rows on test teardown (rely on `prisma.$executeRawUnsafe`).

### T02 — BUG-01 regression: BELOW_MIN twice
- [x] Added in `negotiation.service.spec.ts` ("BUG-01: BELOW_MIN twice → two
  escalation rows with distinct tokens"). The test caught a flaw in the
  original `Date.now()`-based fix and forced the switch to `randomUUID()`.

### T03 — BUG-02 regression: route order
- [x] Added in `notifications.controller.spec.ts` — reads
  `NotificationsController.prototype` method order and asserts static handlers
  come before the dynamic `:id` handler.

### T04 — BUG-03 regression: NotificationsModule wiring
- [x] Added in `src/app.smoke.spec.ts` — reads `@Module()` metadata via
  `Reflect.getMetadata('imports', NotificationsModule)` and asserts
  `AuthModule` is included (forwardRef-aware). Lighter than booting the full
  app; works without a DB.

### T05 — Wave 1 gate
- [x] `cd backend && npm test` → 27 suites · **422 tests passing** (up from 419).
- [x] BUG-01 / BUG-02 / BUG-03 closed in the result ledger.
- [x] Two extra DB schema bugs found during live testing and fixed (BUG-04
  `token VARCHAR(191)→512`, BUG-05 `notifications.link VARCHAR(191)→1024`).
- [x] End-to-end verified: 2 BELOW_MIN proposals → 2 escalations + 4
  notifications (2 buyer + 2 seller); buyer + seller unread counts match.

---

## Wave 2 — Engine & algorithm (T06–T11)

### T06 — TC-01.* startNegotiation cases [P]
- [ ] Cover happy start, resume, not-found, not-active, buyer-is-seller,
  Gemini-failure fallback. Some are already present — fill the gaps.

### T07 — TC-02.1 — initial-offer formula assertion
- [ ] Parametrize over 3 `buyerMaxPrice` values; assert
  `initialOffer === round2dp(maxPrice * 0.85)`.

### T08 — TC-02.2 — concession schedule
- [ ] Drive `request_counter` 6 times; assert each `currentOffer` jump
  matches the constitution (5 % rounds 1–2, 10 % 3–5, 15 % 6+).

### T09 — TC-02.3 / TC-02.4 — auto-accept and auto-fail edges
- [ ] Auto-accept: pick params so a counter reaches `minPrice` early;
  assert `status=AGREED`, deal created.
- [ ] Auto-fail: small concession; drive to round 7;
  assert `status=FAILED`, no deal.

### T10 — TC-03.* proposePrice branches [P]
- [ ] IN_BAND, ABOVE_MAX, BELOW_MIN-then-AGREED, after-AGREED conflict.

### T11 — Wave 2 gate
- [ ] `cd backend && npm test -- negotiation.service` — green; coverage
  diff shows new branches hit.

---

## Wave 3 — Notifications fan-out (T12–T15)

### T12 — TC-06.1–TC-06.6 fan-out assertions
- [ ] After each algorithmic trigger, assert
  `notifications.createForBoth` was called once with the expected
  `type` and audience IDs.
- [ ] One assertion per trigger: BELOW_MIN, IN_BAND, ACCEPT, REJECT,
  COUNTER, max-rounds-fail.

### T13 — TC-06.7 fan-out failure isolation
- [ ] Stub `createForBoth` to reject with `new Error('boom')`.
- [ ] Assert the negotiation/escalation rows still commit;
  `logger.warn` recorded `Notification fan-out (...) failed`.

### T14 — Notifications service unit tests [P]
- [ ] `notifications.service.spec.ts` covers `listForUser` filter,
  `markRead` ownership, `markAllRead`, `unreadCount`, and `sendWhatsApp`
  opt-out / missing-phone branches.

### T15 — Wave 3 gate
- [ ] `cd backend && npm test -- notifications.service negotiation.service`
  — green.

---

## Wave 4 — Seller-side chat (T16–T20)

### T16 — TC-05.5 intent matrix expansion [P]
- [ ] Extend `seller-chat.intent.spec.ts` with:
  - Arabic-Indic digits `٢٠٠٠٠٠٠`.
  - Comma-grouped `1,700,000`.
  - Spaced `1 700 000`.
  - Decimal-million `1.7 مليون` (parser rule: `<= 100`-then-`مليون` → ×1_000_000).
  - "موافق بس" → accept (keyword wins over filler).
  - Bare numeric without keyword → counter.

### T17 — TC-05.1 / TC-05.2 — owner check + comment turn
- [ ] Non-seller caller → `403`.
- [ ] Comment turn → no `submitSellerAction`, no notifications.

### T18 — TC-05.6 — already-RESOLVED escalation
- [ ] Stub the latest escalation as `RESOLVED`.
- [ ] Assert polite reply, no `ConflictException` thrown.

### T19 — TC-05.7 — Gemma null fallback
- [ ] Stub `gemma.chat` to return `null`; assert §4.4 fallback string returned.

### T20 — Wave 4 gate
- [ ] `cd backend && npm test -- seller-chat` — green.

---

## Wave 5 — e2e harness (T21–T28)

### T21 — Test schema + DATABASE_URL_TEST [P]
- [ ] Add `semsar_ai_test` MySQL schema; commit a `prisma db push` script
  (`backend/scripts/test-db-push.sh`).
- [ ] `backend/.env.test.example` documents `DATABASE_URL_TEST=mysql://…/semsar_ai_test`.

### T22 — Supertest harness skeleton
- [ ] Create `backend/test/negotiation.e2e-spec.ts`.
- [ ] `beforeAll`: `Test.createTestingModule([AppModule])`, override
  `WhatsAppService.sendTextMessage` with a no-op spy.
- [ ] `afterAll`: `prisma.$disconnect()`, truncate test tables.

### T23 — TC-01 happy path through HTTP
- [ ] Buyer: `POST /negotiations/start` → 200 + payload.
- [ ] Buyer: `POST /negotiations/propose-price` (in-band) → 200 + `dealId`.

### T24 — TC-03.4 + TC-09.1 BELOW_MIN twice (incl. parallel)
- [ ] Sequential: two BELOW_MIN proposals → expect 2 escalation rows
  with distinct tokens; expect 4 notifications (2 buyer + 2 seller).
- [ ] Parallel via `Promise.all([propose, propose])` → both succeed; no
  `P2002`.

### T25 — TC-07.1 + TC-07.5 notifications API
- [ ] `GET /notifications/unread-count` for buyer → matches DB count.
- [ ] Cross-user isolation: buyer JWT cannot read seller's notification
  by id (404).

### T26 — TC-06.* via HTTP
- [ ] After each milestone reached over HTTP, query DB and assert the
  expected notification rows.

### T27 — TC-09.2 race: static-page accept vs chat accept
- [ ] Two parallel calls (one to `/negotiations/seller-action/:token`, one
  to `/negotiations/:id/seller-chat` with "أوافق").
- [ ] Assert exactly one `Deal` and exactly one `OFFER_ACCEPTED + AGREED`
  fan-out; the loser returns a polite "already resolved" reply.

### T28 — Wave 5 gate
- [ ] `cd backend && npm run test:e2e -- negotiation` — green.
- [ ] Test schema is left clean after the run.

---

## Wave 6 — Manual probes (T29–T36) [M]

### T29 — Spec 2 buyer-chat probes (TC-04.1–TC-04.10) [M] [LLM]
- [ ] Run all 10 probes against the live backend with Ollama up.
- [ ] Record one transcript snippet per probe in the result ledger.
- [ ] Special attention: TC-04.7 (owner-phone refusal) and TC-04.8
  (min-price probe) — must not leak.

### T30 — TC-04.10 Ollama-down probe [M]
- [ ] Stop Ollama (`pkill ollama` or change `OLLAMA_BASE_URL`).
- [ ] Send any chat message; expect §3 fallback line; restart Ollama.

### T31 — UI bell smoke (TC-07.6 / TC-07.7 / TC-07.8) [M]
- [ ] Log in at http://localhost:5174 as a buyer.
- [ ] Trigger a BELOW_MIN proposal in another tab; bell badge increments
  within 25 s.
- [ ] Click the item — `isRead=true` in DB; navigated to deep link.
- [ ] Empty state visible after `mark-all-read`.

### T32 — WhatsApp mock-mode (TC-08.1) [M]
- [ ] Tail `tail -f /tmp/semsar-backend.log | grep "WhatsApp Mock"`.
- [ ] Trigger any milestone; expect one `[WhatsApp Mock] sendTextMessage…`
  line per recipient.

### T33 — WhatsApp opt-out (TC-08.4) [M]
- [ ] `UPDATE users SET whatsapp_opt_out = 1 WHERE id = '<sellerId>'`.
- [ ] Trigger a milestone; assert no mock-log line for that user; in-app
  row still present.

### T34 — WhatsApp missing phone (TC-08.5) [M]
- [ ] Temporarily null the user's phone; expect a warn-log; no error
  thrown; in-app row still present.

### T35 — WhatsApp real-credentials path (TC-08.2 / TC-08.3) [M]
- [ ] Provision real `WHATSAPP_*` env vars in `backend/.env`; restart.
- [ ] Trigger a milestone for an allow-list phone; assert message arrives
  + `whatsappSent=true`.
- [ ] Set an invalid token; trigger again; assert `whatsappSent=false`,
  `whatsappError` populated, in-app row visible.
- [ ] Skip-with-note acceptable until credentials are provisioned.

### T36 — Manual run sign-off [M]
- [ ] Append every TC outcome above to the result ledger with date.

---

## Wave 7 — Result ledger & sign-off (T37–T42)

### T37 — Create the result ledger
- [ ] `specs/negotiation_test_02-results.md` with columns
  `| TC | status | date | notes |`.

### T38 — Auto-fill automated rows from Jest
- [ ] After Wave 5, append a row per automated TC with `PASS` and the run
  date.

### T39 — Append manual probes
- [ ] One row per manual TC from Waves 6.

### T40 — Coverage report
- [ ] `cd backend && npm test -- --coverage` — confirm
  `notifications/` and `seller-chat.*` ≥ 80 %.
- [ ] Attach the summary line to the result ledger.

### T41 — Tick `negotiation_test_02.md` §12 Definition of done
- [ ] All TC-* boxes referenced.
- [ ] All §11 BUG-* rows show "Fixed + regression test landed".

### T42 — Sprint sign-off
- [ ] Confirm `npm test` returns 0 across the full backend suite.
- [ ] No `P2002` / `P2003` / `P2025` in the run.
- [ ] Bell badge update verified in ≤ 25 s.

---

## Status snapshot (2026-04-30)
- Wave 1 complete. **27 suites · 422 tests passing.** BUG-01 / BUG-02 /
  BUG-03 each have a dedicated regression test that fails on the pre-fix
  code. Two extra DB schema bugs (BUG-04 / BUG-05) discovered during live
  testing and patched.
- End-to-end smoke (HTTP + DB) verified that BELOW_MIN fans out one
  notification to buyer **and** one to seller; unread-count badge updates
  for both.
- Live UI bell ([NotificationBell.tsx](frontend/src/components/NotificationBell.tsx))
  wired into the global header; polls `/notifications/unread-count` every
  20 s and renders the panel with mark-all-read.
- Pending: Waves 2–5 (broader coverage + e2e harness), Wave 6 (manual
  Gemma probes + UI walkthrough), Wave 7 (coverage report + sign-off).
- WhatsApp still in mock mode (provider credentials not provisioned —
  spec §8 gates this as `[M]`).

---

## Out of Scope
- React component tests (separate UI spec).
- Performance / load.
- Changes to the negotiation algorithm itself or to the buyer-chat (Spec 2)
  prompt — both are tested as-is.
- Persisting the seller persona across negotiations (out of Spec 4).
