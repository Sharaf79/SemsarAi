# Plan — Spec Negotiation 4 (Notifications + Seller-Side Gemma)

Source spec: [spec_negotiation_4.md](./spec_negotiation_4.md).

## Context
Today, when a buyer's proposal goes below the seller's floor, the backend creates
a `NegotiationEscalation` row and `WhatsAppService` sends the seller a one-shot
"action page" link. There is **no notification center**, and there is **no
seller-side Gemma chat** — the seller can only click ACCEPT / REJECT / COUNTER on
a static page.

Spec 4 adds:
1. A persistent in-app notification center (with unread badge) fan-out to **both**
   buyer and seller for every negotiation milestone.
2. WhatsApp branding/templating for all milestones (not just escalations), each
   message ending in a deep link back into the system.
3. A seller-mode Gemma chat (`POST /negotiations/:id/seller-chat`) where the
   owner can accept, counter, reject, or just comment in natural Arabic.
   Decisions are still persisted through the existing `submitSellerAction(token,
   …)` path — Gemma only **parses & relays**, it never decides.

This plan keeps the constitution invariant "AI doesn't decide" intact, reuses
`NegotiationEscalation` as the deterministic decision record, and treats the new
`Notification` table as the pure user-facing fan-out.

## Scope
**In**:
- New `Notification` model + 2 enums + Prisma migration.
- New `NotificationsModule` (service + controller + 5 endpoints + Arabic
  templates).
- Wire trigger points inside `negotiation.service.ts` to fan out notifications
  on the 6 milestones in spec §3.1, inside the existing transactions.
- New `seller-chat.controller.ts` + `seller-chat.service.ts` under
  `backend/src/negotiation/`, using a new seller-side system prompt and a small
  intent classifier (accept / reject / counter / comment).
- WhatsApp send happens through the existing `WhatsAppService` (one new generic
  `sendNotificationMessage(toPhone, body)` helper if missing).
- Backend unit tests for notifications service and seller-chat intent parsing.

**Out** (explicitly):
- Frontend notification bell + drawer + seller-mode page wiring (separate UI
  spec — referenced but not implemented here).
- Push / email channels.
- Persisting Gemma's owner persona across negotiations.
- Admin views for `notifications` table.

## Critical Files

**Edit**:
- `backend/prisma/schema.prisma` — add `Notification` model + `NotificationType`
  + `NotificationChannel` enums; add `whatsappOptOut Boolean @default(false)` to
  `User` (per §7).
- `backend/src/negotiation/negotiation.service.ts` — emit notifications at the
  6 trigger points in spec §3.1, inside the existing `prisma.$transaction`
  blocks; never re-throw a notification error in a way that aborts the
  negotiation write.
- `backend/src/negotiation/negotiation.module.ts` — import
  `NotificationsModule`; register the new seller-chat provider/controller.
- `backend/src/whatsapp/whatsapp.service.ts` — add (or reuse) a generic
  `sendNotificationMessage(toPhone, body)` if not already present.
- `backend/src/app.module.ts` — register `NotificationsModule`.

**Create**:
- `backend/src/notifications/notifications.module.ts`
- `backend/src/notifications/notifications.controller.ts` (5 endpoints)
- `backend/src/notifications/notifications.service.ts` (CRUD + WhatsApp
  dispatch)
- `backend/src/notifications/constants/templates.ts` (6 Arabic copy templates +
  deep-link builder)
- `backend/src/notifications/dto/list-notifications.query.ts`,
  `notification.dto.ts`
- `backend/src/notifications/notifications.service.spec.ts`
- `backend/src/negotiation/seller-chat.controller.ts`
- `backend/src/negotiation/seller-chat.service.ts`
- `backend/src/negotiation/prompts/seller-chat.prompt.ts`
- `backend/src/negotiation/seller-chat.service.spec.ts`

**Read-only (verify untouched)**:
- `backend/src/negotiation/negotiation.controller.ts` — existing routes intact
  (escalation seller-action endpoint kept verbatim as the decision path).
- `backend/src/negotiation/gemma.client.ts` — no edits.
- `frontend/**` — no edits in this plan (UI is a separate task).

## Reused Pieces (no new code paths)
- `NegotiationEscalation` — unchanged; remains the deterministic decision record.
- `submitSellerAction(token, action, counterPrice?)` in `negotiation.service.ts` —
  the **only** function that mutates a negotiation from a seller decision; the
  new seller-chat intent relay calls this rather than writing directly.
- `GemmaClient.chat(systemPrompt, history, userMessage)` —
  reused for seller-chat with a different system prompt.
- `InvoiceExtractorService.containsPriceOffer` — used as a starting point for
  the `counter <price>` intent detector (combine with a small Arabic keyword
  check for "أوافق / أرفض").
- `WhatsAppService.sendEscalationMessage` — generalize to
  `sendNotificationMessage` (or add a sibling) to keep all WhatsApp delivery
  in one place.
- Existing `aiLog` writes — extend with `actionType = ASK` for seller-chat
  turns; no schema change.

## Implementation Order

1. **Schema**
   - Add `Notification` model + 2 enums + `User.whatsappOptOut`.
   - `prisma migrate dev --name add_notifications`.

2. **NotificationsModule**
   - Templates file (6 entries, all ending with `{link}`).
   - Service: `createForBoth`, `listForUser`, `markRead`, `markAllRead`,
     `unreadCount`, `sendWhatsApp(notificationId)`.
   - Controller: 5 REST endpoints (auth: JWT, ownership-guarded).
   - Unit tests for create/list/mark/unread-count and WhatsApp dispatch (mock
     `WhatsAppService`).

3. **Wire trigger points** in `negotiation.service.ts`
   - On `proposePrice` BELOW_MIN → `OFFER_PROPOSED` to seller (with escalation
     token in link) + buyer mirror.
   - On `submitSellerAction(ACCEPT)` → `OFFER_ACCEPTED` + `NEGOTIATION_AGREED`
     to both.
   - On `submitSellerAction(REJECT)` → `OFFER_REJECTED` to buyer.
   - On `submitSellerAction(COUNTER)` → `OFFER_COUNTERED` to buyer.
   - On in-band auto-accept inside `proposePrice` → `NEGOTIATION_AGREED` to
     both.
   - On round > 6 / explicit `reject` action → `NEGOTIATION_FAILED` to both.
   - Each fan-out call is **inside** the surrounding transaction; WhatsApp send
     is dispatched after commit (best-effort, non-blocking).

4. **Seller-side Gemma chat**
   - `seller-chat.prompt.ts` — owner-persona prompt with `{{title}}`,
     `{{listingPrice}}`, `{{buyerOffer}}`, `{{round}}` placeholders (mirrors
     spec §4.3 verbatim).
   - `seller-chat.service.ts`:
     - `chat(negotiationId, sellerId, history, userMessage) →
       { reply, intent, action?, counterPrice?, notificationsCreated? }`.
     - Parse intent via Arabic keyword matcher + numeric extractor.
     - For `accept` / `reject` / `counter`, look up the latest PENDING
       escalation token for the negotiation and call `submitSellerAction`.
     - For `comment`, just return Gemma's reply.
     - Persist each turn in `aiLog` with `actionType = ASK`, role marker in
       `data`.
   - `seller-chat.controller.ts` — `POST /negotiations/:id/seller-chat`,
     guards: JWT + `negotiation.sellerId === userId`.
   - Unit tests: intent parsing (8 Arabic phrasings), ownership rejection,
     decision relay path mocked, comment turn no-op.

5. **WhatsApp body templates**
   - Move/extend templates from §3.3 into `notifications/constants/templates.ts`.
   - All bodies end with `{link}` and never include the seller's floor price or
     the buyer's phone.

6. **Wiring & DI**
   - `NotificationsModule` exports `NotificationsService`.
   - `NegotiationModule` imports `NotificationsModule` and registers
     `SellerChatController` + `SellerChatService`.
   - `AppModule` imports `NotificationsModule`.

## Verification
1. `cd backend && npm run build` — TypeScript compiles cleanly.
2. `cd backend && npx prisma migrate dev --name add_notifications` — migration
   applies; new tables visible in MySQL.
3. `cd backend && npm test` — full suite green:
   - Existing 78 negotiation.service tests still pass.
   - New NotificationsService tests pass.
   - New seller-chat intent parsing tests pass.
4. Restart backend on `:3000`
   (`NODE_OPTIONS='--experimental-global-webcrypto' node --enable-source-maps dist/src/main`).
5. Run all 8 manual acceptance scenarios from spec §8:
   below-floor proposal · seller accept via chat · seller counter via chat ·
   seller reject via chat · seller comment turn · unread badge ·
   WhatsApp failure · safety probes (buyer phone, seller floor leakage).
6. Confirm `notifications` rows exist for each milestone (one buyer + one
   seller where applicable), `whatsapp_sent = true` after success and `false`
   with `whatsapp_error` populated on failure.

## Risks & Mitigations
- **Transactional fan-out failures**: a failing notification insert must not
  abort the negotiation write. Mitigation: wrap notification create in a
  try/catch inside the transaction (or commit notification + negotiation
  together but fan out WhatsApp post-commit) and log the error to `aiLog`.
- **Gemma intent misclassification**: the LLM might say "أوافق" rhetorically.
  Mitigation: classify intent with a deterministic Arabic keyword + number
  matcher on the **seller's** message (not Gemma's reply); Gemma's reply is
  user-facing only.
- **Decision split-brain**: a seller could click the static action page **and**
  type "أوافق" in the chat. Mitigation: `submitSellerAction(token, …)` is
  idempotent on `RESOLVED` status — it already throws `ConflictException` if
  the escalation is resolved; surface that as a friendly chat reply.
- **WhatsApp leakage**: include only the headline number; never the floor.
  Templates in §3.3 are deterministic — no Gemma in the WhatsApp path.
- **Deep-link tampering**: notification IDs are UUIDs; escalation tokens are
  JWT-signed (existing); seller-mode page checks `userId === sellerId`.

## Success Criteria
- [ ] Migration applied; `notifications` table + 2 enums present.
- [ ] All 5 notification endpoints behave per spec §5.1 (auth-gated, owner-only).
- [ ] All 6 milestone trigger points create the right notification set inside
  the existing transactions; WhatsApp delivery is best-effort post-commit.
- [ ] `POST /negotiations/:id/seller-chat` returns the expected
  `{ reply, intent, action?, counterPrice? }` shape.
- [ ] Seller chat never persists a decision outside
  `submitSellerAction(token, …)`.
- [ ] Buyer-side `chatWithGemma()` prompt remains the Spec 2 prompt — no
  regression.
- [ ] All 8 acceptance scenarios in spec §8 pass.
- [ ] Existing 78 negotiation.service tests still pass; new tests cover
  notifications service, seller-chat intent parser, and the trigger-point
  fan-out.
