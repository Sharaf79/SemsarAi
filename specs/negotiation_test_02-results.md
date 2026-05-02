# Negotiation Test 02 — Result Ledger

Append-only log of test outcomes for the cases catalogued in
[negotiation_test_02.md](./negotiation_test_02.md).

| TC | status | date | notes |
|---|---|---|---|
| BUG-01 | PASS | 2026-04-30 | Regression test in `negotiation.service.spec.ts` ("BELOW_MIN twice → two escalation rows with distinct tokens"). Caught a flaw in the original fix (`Date.now()` collides in fast back-to-back calls); replaced with `randomUUID()`. End-to-end verified: 2 BELOW_MIN proposals → 2 escalations + 4 notifications. |
| BUG-02 | PASS | 2026-04-30 | Regression test in `notifications.controller.spec.ts` ("BUG-02: static routes declared before dynamic :id route"). Asserts method declaration order so `/notifications/unread-count` and `/notifications/read-all` are matched before `:id`. |
| BUG-03 | PASS | 2026-04-30 | Regression test in `app.smoke.spec.ts` reading `NotificationsModule`'s `@Module()` metadata and asserting `AuthModule` is in `imports`. |
| BUG-04 (new) | PASS | 2026-04-30 | `negotiation_escalations.token` was `VARCHAR(191)` — too short for a 48h JWT (~250 chars). Widened to `VARCHAR(512)` in schema + live MySQL. |
| BUG-05 (new) | PASS | 2026-04-30 | `notifications.link` was the default `VARCHAR(191)` — too short when the seller's link includes the JWT escalation token. Widened to `VARCHAR(1024)`. |
| TC-01.* | PASS | 2026-04-30 | Existing `startNegotiation()` tests in `negotiation.service.spec.ts`. |
| TC-02.* | PASS | 2026-04-30 | Existing concession + decision tests. |
| TC-03.3 | PASS | 2026-04-30 | Single BELOW_MIN through HTTP (escalation row + 2 notifications). |
| TC-03.4 | PASS | 2026-04-30 | Two BELOW_MIN proposals (BUG-01 regression). |
| TC-06.1 | PASS | 2026-04-30 | `OFFER_PROPOSED` fan-out unit test + live HTTP verification. |
| TC-06.2..6.6 | PASS | 2026-04-30 | All 6 fan-out triggers covered in `negotiation.service.spec.ts`. |
| TC-07.1 | PASS | 2026-04-30 | `GET /notifications/unread-count` returns 200 + count (no longer routed through `:id`). Covered by BUG-02 regression + live curl. |
| TC-07.2..7.5 | PASS | 2026-04-30 | Existing `notifications.controller.spec.ts` cases. |
| TC-08.1 | PASS | 2026-04-30 | `[WhatsApp Mock] sendTextMessage to=...` lines visible in backend log per fan-out turn. `whatsappSent=1` recorded after `sendTextMessage` returned (mock returns OK). |
| TC-04.* | SKIP | 2026-04-30 | Buyer-side Spec 2 chat — manual probe; Ollama-dependent. |
| TC-05.* | SKIP | 2026-04-30 | Seller-side Spec 4 chat — manual probe; Ollama-dependent. |
| TC-08.2 | SKIP | 2026-04-30 | Real WhatsApp send — `.env` placeholders still in place; needs Meta credentials. |
| TC-09.1 | DEFERRED | 2026-04-30 | Parallel BELOW_MIN — covered indirectly by BUG-01 regression (per-row `randomUUID()` token); dedicated supertest harness scheduled in Wave 5. |

## Suite snapshot
- `npm test` → **27 suites · 422 tests passing** (up from 419).
- `npm run build` → clean.
- Backend running on `:3000` with the latest patches:
  - `negotiation_escalations.token VARCHAR(512)` ✓
  - `notifications.link VARCHAR(1024)` ✓
  - `randomUUID()` placeholder token ✓
  - Notifications routes ordered (static before dynamic) ✓
  - `NotificationsModule` imports `AuthModule` ✓

## Outstanding (deferred or out-of-session)
- TC-04 / TC-05 — manual probes; need a logged-in browser session and Ollama up.
- TC-08.2 / TC-08.3 — real Meta WhatsApp credentials.
- TC-09.* / TC-10.* — supertest harness (Wave 5).
- Coverage report (T40).
