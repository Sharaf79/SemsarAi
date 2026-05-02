# Plan — Execute Negotiation Test 02

Source spec: [negotiation_test_02.md](./negotiation_test_02.md).

## Context
Spec 2 (buyer chat) and Spec 4 (notifications + seller chat) shipped to the
backend, but only sparse manual probes have been run. Recent live testing
surfaced three real bugs (catalogued in §11 of the test spec):

- **BUG-01** — `NegotiationEscalation.create` hardcoded `token: 'pending'`,
  causing `P2002` on every BELOW_MIN proposal after the first.
- **BUG-02** — `@Get(':id')` (with `ParseUUIDPipe`) declared before
  `@Get('unread-count')` and `@Get('read-all')` made the bell endpoints
  unreachable (400 instead of 200).
- **BUG-03** — `NotificationsModule` did not import `AuthModule`, so
  `JwtAuthGuard` couldn't resolve `JwtService` at boot.

Patches are landed but **not yet rerun** end-to-end. This plan turns the test
catalogue into an executable check, in two waves: an automated wave (Jest +
Prisma fixtures + supertest) followed by a manual wave (live UI + WhatsApp).

## Goal
By the end of this plan: every TC-* in `negotiation_test_02.md` is either
passing in CI or has a manual sign-off line in the result ledger, and §11
bugs are closed with a regression test guarding each one.

## Scope
**In**:
- New Jest specs for: BELOW_MIN regression, route-order regression,
  AuthModule wiring, fan-out trigger assertions, seller-chat intent matrix
  (Arabic phrasings + Arabic-Indic digits), concurrency safety.
- An e2e harness using supertest against an in-process Nest app with the
  Prisma test schema, seeded with deterministic buyer/seller/property
  fixtures.
- A manual-probe runbook (curl + DB queries) for the cases that touch Gemma /
  WhatsApp / the live UI.
- A markdown result ledger committed alongside this plan.

**Out**:
- Frontend component tests (separate UI spec).
- Performance / load tests.
- Real WhatsApp send (kept as a manual probe; mock mode is the default).
- Anything outside `negotiation/` and `notifications/`.

## Critical Files

**Edit**:
- `backend/src/negotiation/negotiation.service.spec.ts` — add 6 fan-out
  trigger assertions (TC-06.*), and a BELOW_MIN-twice case (TC-03.4).
- `backend/src/negotiation/seller-chat.intent.spec.ts` — extend matrix to
  cover Arabic-Indic digits and comma/space variants (TC-05.5 phrasings).
- `backend/src/notifications/notifications.controller.spec.ts` — add a
  static-vs-dynamic route-order regression test (TC-07.1).

**Create**:
- `backend/test/negotiation.e2e-spec.ts` — supertest harness for
  TC-01.* / TC-03.* / TC-06.* / TC-07.* end-to-end.
- `backend/test/fixtures/users.ts` — buyer + seller + property seed helpers.
- `specs/negotiation_test_02-results.md` — result ledger (TC-id, status,
  date, notes) — append-only.

**Read-only (verify)**:
- `backend/src/negotiation/negotiation.service.ts` — confirm BUG-01 fix
  (per-row placeholder token) is present.
- `backend/src/notifications/notifications.controller.ts` — confirm BUG-02
  fix (static routes declared first) is present.
- `backend/src/notifications/notifications.module.ts` — confirm BUG-03 fix
  (`forwardRef(() => AuthModule)`).

## Reused Pieces
- `NegotiationService.proposePrice` / `handleAction` / `submitSellerAction`.
- `SellerChatService.chat` and `classifyIntent`.
- `NotificationsService.createForBoth` / `listForUser` / `unreadCount`.
- `WhatsAppService` mock-mode path — already returns silently in dev.
- `JwtService.sign` for forging test tokens (no real auth flow needed).
- The deterministic Prisma stub pattern already used in
  `negotiation.service.spec.ts` (`$transaction` runs the callback inline).

## Implementation Order

### Wave 1 — Regression tests for the three live bugs

1. **BUG-01 — BELOW_MIN twice**:
   add a unit test that calls `proposePrice` with a below-floor price twice
   on the same negotiation and asserts both calls succeed and produce two
   `negotiation_escalations` rows with distinct tokens.
2. **BUG-02 — route order**:
   in the controller spec, instantiate the controller via `Test.createTesting
   Module`, hit `GET /notifications/unread-count` with a forged JWT, expect
   200 + `{ count: 0 }` (not a 400 BadUUID).
3. **BUG-03 — AuthModule wiring**:
   smoke test that boots the full `AppModule` with `Test.createTestingModule`
   and asserts `app.init()` does not throw — guards future regressions.

### Wave 2 — Engine & algorithm (TC-01.*, TC-02.*, TC-03.*)

4. Extend `negotiation.service.spec.ts` with cases for:
   IN_BAND, ABOVE_MAX, BELOW_MIN-then-AGREED, max-rounds auto-fail, status
   guard on `proposePrice` after `AGREED`/`FAILED`.
5. Add Prisma stub support for `negotiationEscalation.create/update` so the
   BELOW_MIN test doesn't need a real DB.

### Wave 3 — Notifications fan-out (TC-06.*)

6. In `negotiation.service.spec.ts`, after each algorithm trigger (proposeP
   rice IN_BAND, BELOW_MIN, submitSellerAction ACCEPT/REJECT/COUNTER,
   handleAction reject, max rounds), assert that
   `notifications.createForBoth` was called with the expected `type` and
   audience `userId`s.
7. Add a "fan-out failure isolation" test: stub `createForBoth` to reject;
   assert the negotiation/escalation write still commits.

### Wave 4 — Seller chat (TC-05.*)

8. Extend `seller-chat.intent.spec.ts` with Arabic-Indic digits
   (`٢٠٠٠٠٠٠`), comma/space-separated counters, and edge cases like
   `"موافق بس"` (still accept), `"عرضي 1.7 مليون"` (counter).
9. Add `seller-chat.service.spec.ts` cases for:
   non-seller caller → 403; comment turn → no `submitSellerAction`;
   already-RESOLVED escalation → polite reply; Gemma null → fallback.

### Wave 5 — e2e harness (TC-07.*, TC-09.*, TC-10.*)

10. Create `test/negotiation.e2e-spec.ts` using supertest:
    - Seeds two users (buyer, seller) and one ACTIVE property via Prisma.
    - Mints two JWTs with `JwtService.sign`.
    - Drives the full BELOW_MIN flow → asserts 1 escalation row, 2
      notifications, 401 → 200 on `/unread-count`, route-order regression,
      cross-user isolation (buyer cannot read seller's notification).
    - Concurrency: fires two BELOW_MIN proposals in parallel via
      `Promise.all` and asserts both succeed.

### Wave 6 — Manual probes

11. Run the buyer-side Spec 2 chat probes (TC-04.*) against the live
    backend with Ollama up. Record one transcript line per case in the
    result ledger.
12. Run WhatsApp cases (TC-08.*):
    mock mode line in log (default), opt-out user, missing phone.
    Real-credential case stays open until `.env` is provisioned.
13. Manual UI bell smoke (TC-07.6 / TC-07.7 / TC-07.8) at
    http://localhost:5174 — log in as buyer, propose below-floor, confirm
    badge increments within 25 s, click an item, confirm `isRead=true`.

### Wave 7 — Result ledger

14. Append every TC-id to `specs/negotiation_test_02-results.md` with one
    line each: `| TC-id | PASS/FAIL/SKIP | date | notes |`.
15. Tick `§12 Definition of done` checkboxes once all cases land.

## Verification (per wave)

| Wave | How to verify |
|---|---|
| 1 | `cd backend && npm test -- negotiation.service notifications.controller` — green; `npm test -- app.smoke` for AppModule boot. |
| 2 | `cd backend && npm test -- negotiation.service` — coverage report shows the new branches hit. |
| 3 | Same suite — extra `expect(notifications.createForBoth).toHaveBeenCalledWith(…)` lines pass. |
| 4 | `cd backend && npm test -- seller-chat` — full intent matrix green. |
| 5 | `cd backend && npm run test:e2e -- negotiation` — supertest passes; check the seeded DB is wiped after run. |
| 6 | Manual transcripts in `negotiation_test_02-results.md`. |
| 7 | Results file committed; spec §12 boxes ticked. |

## Risks & Mitigations
- **Flakey Gemma**: Spec 2 / 4 chat tests depend on the local Ollama model.
  Mitigation: gate the LLM-content assertions behind a `RUN_LLM_E2E=1`
  env flag; default-skip in CI; document so manual probes are still owned.
- **Real DB in e2e**: `prisma migrate reset` would wipe dev data. Mitigation:
  point the e2e harness at a separate schema (`semsar_ai_test`) using a
  `DATABASE_URL_TEST` env var.
- **Race tests are inherently noisy**: the BELOW_MIN-parallel case can
  occasionally false-pass on slow machines. Mitigation: assert on row count
  + distinct tokens, not on timing.
- **Mock-mode WhatsApp doesn't write `whatsappSent=true`**: by design.
  Mitigation: TC-08.1 explicitly asserts `whatsappSent` stays `false` in mock
  mode; only TC-08.2 (real credentials) flips it true.

## Success Criteria
- [ ] §11 BUG-01 / BUG-02 / BUG-03 each have a dedicated regression test
  that fails on the pre-fix code and passes on the post-fix code.
- [ ] All TC-* in §1 / §2 / §3 / §6 / §7 / §9 / §10 are automated.
- [ ] All TC-* in §4 / §5 / §8 have a manual-probe entry in the result
  ledger with date and outcome.
- [ ] No `P2002`, `P2003`, `P2025` Prisma errors during the suite.
- [ ] `npm test` returns 0 with all suites green.
- [ ] Spec §12 Definition of done boxes ticked.
