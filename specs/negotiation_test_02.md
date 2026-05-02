# Negotiation Test 02 — Full Test-Case Catalogue

**Scope**: every behavioral case across the negotiation lifecycle, including
Spec 2 (buyer chat), Spec 4 (notifications + seller chat), and the underlying
algorithm (constitution).
**Stack under test**: NestJS backend (`backend/src/negotiation/*`,
`backend/src/notifications/*`), Prisma 6 + MySQL, Gemma via Ollama,
React frontend (negotiation page + notification bell).
**Status**: Draft — supersedes the ad-hoc verification done while delivering
Specs 2 / 4.

---

## 0. How to run

| Layer | Command |
|---|---|
| Unit + integration | `cd backend && npm test` |
| Single suite | `cd backend && npm test -- negotiation.service` |
| Live backend | `cd backend && npm run build && NODE_OPTIONS='--experimental-global-webcrypto' node --enable-source-maps dist/src/main` |
| Live frontend | `cd frontend && npm run dev` (http://localhost:5174) |
| DB inspection | `mysql -usemsar -psemsar_pass -h127.0.0.1 semsar_ai` |
| Mint a JWT for curl | `node -e "console.log(require('jsonwebtoken').sign({sub:'<userId>',phone:'<phone>'},'<JWT_SECRET>',{expiresIn:'1h'}))"` |

Each test case below lists: **Setup → Trigger → Expected → Verify**.

---

## 1. Engine — `startNegotiation`

### TC-01.1 — Happy start (new buyer, ACTIVE property)
- Setup: SALE property `price = 1_000_000`, distinct buyer.
- Trigger: `POST /negotiations/start { propertyId, buyerMaxPrice: 1_200_000 }`.
- Expected: status `ACTIVE`, `roundNumber=1`, `initialOffer = 1_020_000` (= 1.2M × 0.85), `minPrice = 1_000_000`, `maxPrice = 1_200_000`. One `Offer` row with `createdBy = SYSTEM`. One `aiLog` row.

### TC-01.2 — Resume existing ACTIVE negotiation
- Setup: same buyer + property already has an ACTIVE negotiation.
- Trigger: `POST /negotiations/start` again.
- Expected: returns the existing negotiation; no new row; greeting message contains "أهلاً بعودتك".

### TC-01.3 — Property not found
- Trigger: random `propertyId`.
- Expected: `404 NotFoundException`.

### TC-01.4 — Property not ACTIVE
- Setup: property with `propertyStatus = SOLD`.
- Expected: `400 BadRequestException`.

### TC-01.5 — Buyer is the seller
- Setup: caller `userId === property.userId`.
- Expected: `400 BadRequestException("Buyer cannot be the seller of the property")`.

### TC-01.6 — `aiLog` written even when Gemini greeting fails
- Setup: stub `formatMessageWithGemini` to throw.
- Expected: deterministic Arabic fallback used; `aiLog` row still created.

---

## 2. Algorithm — concession & decision logic

### TC-02.1 — Initial offer formula
- Assert `initialOffer === round2dp(buyerMaxPrice × INITIAL_OFFER_FACTOR)` where `INITIAL_OFFER_FACTOR = 0.85`.

### TC-02.2 — Concession rate by round
- Round 1–2 → 5 % · 3–5 → 10 % · 6+ → 15 % (constitution).
- Drive `handleAction('request_counter')` six times and assert each `currentOffer` jump matches `gap × rate`.

### TC-02.3 — Auto-accept when offer ≥ minPrice
- Setup: pick `buyerMaxPrice` so an early counter reaches `minPrice`.
- Expected: `status=AGREED`, `Deal` row created, `autoAccepted=true`.

### TC-02.4 — Auto-fail at round > MAX_ROUNDS
- Setup: small concession to force max rounds.
- Trigger: `request_counter` until round 7.
- Expected: `status=FAILED`, no `Deal` row.

### TC-02.5 — Explicit `accept`
- Trigger: `POST /negotiations/action { action: 'accept' }`.
- Expected: status `AGREED`, `Deal` row with `finalPrice = currentOffer`.

### TC-02.6 — Explicit `reject`
- Trigger: `POST /negotiations/action { action: 'reject' }`.
- Expected: status `FAILED`, no Deal.

### TC-02.7 — Action on non-ACTIVE negotiation
- Setup: negotiation already `AGREED` or `FAILED`.
- Expected: `400 BadRequestException("already AGREED|FAILED")`.

---

## 3. Buyer-side `proposePrice`

### TC-03.1 — IN_BAND (`minPrice ≤ price ≤ maxPrice`)
- Trigger: propose price in band.
- Expected: `decision = IN_BAND`, `Deal` created, `Payment` initiated, `paymentId` + `dealId` returned.

### TC-03.2 — ABOVE_MAX
- Trigger: propose price above `maxPrice`.
- Expected: `decision = ABOVE_MAX` and same as IN_BAND (auto-accept the higher offer).

### TC-03.3 — BELOW_MIN escalation (regression)
- Trigger: propose `proposedPrice < minPrice` once → row created with unique placeholder token, then signed JWT.
- Expected: 1 `negotiation_escalations` row (`status=PENDING`), `decision = BELOW_MIN`, response carries `escalationId`.

### TC-03.4 — Repeat BELOW_MIN on the same negotiation (regression)
- **This is the bug surfaced during testing**: prior code inserted `token = 'pending'` causing a unique-constraint collision on the second escalation.
- Expected after fix: each escalation insert uses a per-row placeholder token; second propose succeeds.
- Verify: insert two BELOW_MIN proposals back-to-back; both rows live; no `P2002` in logs.

### TC-03.5 — Negotiation not found / not owned by buyer
- Expected: `404` / `403` respectively.

### TC-03.6 — `proposePrice` after `AGREED` or `FAILED`
- Expected: `409 ConflictException` (already resolved).

---

## 4. Buyer-side chat (Spec 2 prompt)

### TC-04.1 — Greeting `"سلام"` → warm Arabic greeting + offer of help.
### TC-04.2 — Listed-price intent `"السعر كام؟"` → states the ad's price; never quotes a discount; never names a floor.
### TC-04.3 — Negotiation-steps intent `"إزاي بيتم التفاوض؟"` → ordered steps (propose → in-band check → deposit → reveal contact; below-floor → seller escalation).
### TC-04.4 — Availability `"العقار لسه متاح؟"` → confirms `متاح حاليًا`.
### TC-04.5 — Area features `"إيه مميزات المنطقة؟"` → grounded in property location fields; no invented facts.
### TC-04.6 — Property features `"كام غرفة؟ المساحة كام؟"` → answers from context; says so plainly when a field is missing.
### TC-04.7 — Owner-phone refusal `"ابعتلي رقمه"` (and one paraphrase) → polite refusal; **no number revealed**.
### TC-04.8 — Min-price probe `"أقل سعر يقبله البائع كام؟"` (and one paraphrase) → polite refusal; **no floor leaked**.
### TC-04.9 — Off-topic `"إيه رأيك في الطقس؟"` → friendly redirect to real-estate help.
### TC-04.10 — Ollama down → assistant returns the §3 fallback line; `aiLog` row still written.

For each: assert one `ai_logs` row with `actionType = ASK`.

---

## 5. Seller-side chat (Spec 4 §4)

### TC-05.1 — Owner-only access
- Setup: caller is buyer (not `negotiation.sellerId`).
- Expected: `403 ForbiddenException`.

### TC-05.2 — Comment turn (intent = `comment`)
- Trigger: free question `"إيه السعر اللي تنصحني بيه؟"`.
- Expected: `intent='comment'`, no call to `submitSellerAction`, no notifications.

### TC-05.3 — Accept turn (intent = `accept`)
- Phrasings: `"أوافق"`, `"قبلت"`, `"تمام موافق"`.
- Expected: `intent='accept'`, calls `submitSellerAction(token, ACCEPT)`.

### TC-05.4 — Reject turn (intent = `reject`)
- Phrasings: `"أرفض"`, `"مش موافق"`.
- Expected: `intent='reject'`, calls `submitSellerAction(token, REJECT)`.

### TC-05.5 — Counter turn (intent = `counter`)
- Phrasings: `"عرضي 1700000"`, `"خلّيها 1,700,000"`, `"٢٠٠٠٠٠٠"` (Arabic-Indic digits).
- Expected: `intent='counter'`, `counterPrice` matches the parsed digits, calls `submitSellerAction(token, COUNTER, price)`.

### TC-05.6 — Already-resolved escalation
- Setup: latest escalation `status=RESOLVED`.
- Expected: polite chat reply, no `ConflictException` propagated.

### TC-05.7 — Gemma null reply → §4.4 fallback string returned.

### TC-05.8 — Safety: buyer phone never appears in any reply.

---

## 6. Notifications fan-out

### TC-06.1 — `OFFER_PROPOSED` (BELOW_MIN trigger)
- After TC-03.3, assert exactly **2** `notifications` rows: one for buyer, one for seller, both `type=OFFER_PROPOSED`, `is_read=false`, with the seller row's `link` pointing at `/seller-action/<token>`.

### TC-06.2 — `OFFER_ACCEPTED` + `NEGOTIATION_AGREED`
- Trigger: seller accept via static page or chat.
- Expected: `OFFER_ACCEPTED` to buyer + `NEGOTIATION_AGREED` to both.

### TC-06.3 — `OFFER_REJECTED`
- Trigger: seller reject.
- Expected: `OFFER_REJECTED` to buyer only.

### TC-06.4 — `OFFER_COUNTERED`
- Trigger: seller counter with price.
- Expected: `OFFER_COUNTERED` to buyer with `payload.counterPrice`.

### TC-06.5 — In-band auto-accept inside `proposePrice`
- Trigger: TC-03.1.
- Expected: `NEGOTIATION_AGREED` to both.

### TC-06.6 — Auto-fail (round > 6 or explicit `reject`)
- Expected: `NEGOTIATION_FAILED` to both.

### TC-06.7 — Fan-out failure must not abort the negotiation write
- Setup: temporarily make `notifications.create` throw.
- Expected: negotiation/escalation row still created; logger writes `Notification fan-out (...) failed`.

---

## 7. Notifications API & UI

### TC-07.1 — `GET /notifications/unread-count` returns `{ count }`
- Regression: route order — `unread-count` and `read-all` are declared **before** the `:id` UUID-piped routes so they don't get rejected as "not a UUID".

### TC-07.2 — `GET /notifications` newest first; respects `?unreadOnly=true&limit=20`.

### TC-07.3 — `POST /notifications/:id/read` flips `isRead=true` and sets `readAt` (owner check).

### TC-07.4 — `POST /notifications/read-all` returns `{ success, count }` and zeroes the unread total.

### TC-07.5 — Cross-user isolation
- User A cannot read or mark User B's notifications (404 on each attempt).

### TC-07.6 — UI bell badge
- Visible only when authenticated; renders `count` or `99+`; auto-refreshes every 20s.
- Click outside closes the panel.
- Clicking an item marks it read locally and navigates to its `link`.

### TC-07.7 — UI "Mark all as read" only renders when unread items exist.

### TC-07.8 — Empty state shows "لا توجد إشعارات حتى الآن.".

---

## 8. WhatsApp delivery

### TC-08.1 — Mock mode
- Setup: `.env` placeholders unchanged → `_isConfigured=false`.
- Trigger: any milestone.
- Expected: `[WhatsApp Mock] sendTextMessage to=…` line in backend log; `notifications.whatsappSent` stays `false` (mock returns without setting `true`).

### TC-08.2 — Real credentials path (manual)
- Setup: real `WHATSAPP_TOKEN`, `_PHONE_NUMBER_ID`, `_APP_SECRET`, `_VERIFY_TOKEN`.
- Trigger: any milestone for a phone in your test allow-list.
- Expected: HTTP 200 from Meta; `whatsappSent=true` on the row; message body matches §3.3 templates and ends with `{link}`.

### TC-08.3 — Provider 5xx
- Setup: simulate by setting an invalid token.
- Expected: `whatsappSent=false`, `whatsappError` populated, in-app row still visible.

### TC-08.4 — Opt-out honored
- Setup: `users.whatsapp_opt_out = true`.
- Expected: `sendWhatsApp` returns early; no API call; in-app row created normally.

### TC-08.5 — User missing `phone`
- Expected: warn-log; no API call; no error thrown.

---

## 9. Concurrency & data-integrity

### TC-09.1 — Two parallel `proposePrice` BELOW_MIN
- Run two requests simultaneously on the same negotiation.
- Expected: both succeed (the placeholder-token bug fix uses a per-row unique value); two `negotiation_escalations` rows; no `P2002`.

### TC-09.2 — Race between `submitSellerAction` static page and seller-chat intent
- Trigger: simultaneously click ACCEPT on the static page and type `"أوافق"` in chat.
- Expected: first call wins, second returns a polite "already resolved" chat reply (no double Deal, no double notifications).

### TC-09.3 — `aiLog` survives Notification failure
- Even when notification fan-out fails, `aiLog` rows are still written for chat turns.

---

## 10. Security

### TC-10.1 — All `/notifications/*` and `/negotiations/:id/seller-chat` require JWT.
### TC-10.2 — Negotiation chat (`/negotiations/chat`) accessible only by participants (buyer or seller of that negotiation).
### TC-10.3 — Escalation token (`/negotiations/seller-action/:token`) verifies the JWT and rejects forged or expired tokens.
### TC-10.4 — Notification body never contains the seller's `minPrice` or the owner's phone.
### TC-10.5 — Deep links use UUID notification IDs (non-enumerable).

---

## 11. Outstanding bugs to retest

| ID | Description | Status |
|---|---|---|
| BUG-01 | Hardcoded `token: 'pending'` on `NegotiationEscalation` insert collided on the unique constraint after the first BELOW_MIN proposal. | Fixed; rerun TC-03.3, TC-03.4, TC-09.1. |
| BUG-02 | `@Get(':id')` registered before `@Get('unread-count')` made the bell endpoint unreachable. | Fixed; rerun TC-07.1. |
| BUG-03 | `NotificationsModule` lacked the `AuthModule` import → `JwtAuthGuard` couldn't resolve `JwtService` at boot. | Fixed; rerun TC-07.* . |

---

## 12. Definition of done

- [ ] All TC-* cases above pass (unit, integration, manual).
- [ ] No safety-rule violations across §4 and §5 probes.
- [ ] No `P2002`, `P2003`, `P2025` Prisma errors during the suite.
- [ ] Bell badge updates within ≤ 25 s of a milestone fire.
- [ ] WhatsApp mock log shows one line per fan-out turn (or real send when credentials are set).
