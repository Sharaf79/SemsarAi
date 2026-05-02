# Plan — Buyer Negotiation

## Purpose
Create a buyer-facing negotiation flow where a logged-in buyer can view seller proposals, reply with a decision or opinion, and let Gemma 4 process the buyer decision into the next negotiation step.

## Goal
Build a working buyer negotiation page and backend flow that supports:
- Buyer login and secure access to negotiated conversations
- Buyer viewing the seller proposal history and current offer
- Buyer replying with a decision, counter-offer, or opinion text
- Seller seeing the buyer’s response and proposal state
- Gemma 4 processing buyer decisions to generate the next response text and action

## Scope
**In**:
- Buyer negotiation page and page-level auth
- Backend endpoints for negotiation state, seller proposal display, buyer reply submission
- Seller view of buyer responses and proposal status
- Gemma 4 integration as a decision processor/response formatter
- Test coverage for buyer reply flow and seller visibility

**Out**:
- Full frontend negotiation UI polish beyond the minimum functional flow
- Multi-tenant negotiation marketplace logic
- WhatsApp or external channel delivery (will be handled in a later refinement)

## User story
- As a buyer, I can log in and open the negotiation page for a property.
- I can read the seller’s latest proposal and the negotiation thread.
- I can enter my opinion or reply to the seller proposal with a counter.
- As a seller, I can see the buyer’s proposal and the updated negotiation status.
- The system sends the buyer decision through Gemma 4 and uses the result to drive the next negotiation step.

## Acceptance criteria
- Buyer must be authenticated and authorized to access the negotiation page for the negotiation.
- Buyer can see the current seller proposal, previous messages, and negotiation status.
- Buyer can submit a reply containing either:
  - accept
  - reject
  - counter offer amount
  - opinion/comment text
- Seller can view the buyer reply and the latest proposal state.
- Gemma 4 is invoked for buyer decisions that require response formatting, and the returned message is saved and displayed.
- The negotiation record advances correctly: `PENDING` → `COUNTER` / `AGREED` / `FAILED` where applicable.
- API surface is covered by backend tests.

## Critical files
- `backend/src/negotiation/buyer-negotiation.controller.ts`
- `backend/src/negotiation/buyer-negotiation.service.ts`
- `backend/src/negotiation/negotiation.service.ts`
- `backend/src/gemini/gemini.service.ts`
- `frontend/src/pages/BuyerNegotiationPage.tsx`
- `frontend/src/api/negotiation.ts`
- `backend/test/negotiation/buyer-negotiation.spec.ts`

## Implementation plan

### Phase 1 — Backend contract and auth
1. Create `NegotiationBuyerReplyDto` with fields:
   - `negotiationId` (UUID)
   - `responseType` (`accept` | `reject` | `counter` | `opinion`)
   - `counterAmount` (optional number)
   - `comment` (optional string)
2. Add `GET /negotiations/:id/buyer` endpoint:
   - returns negotiation metadata, seller proposal, thread, and allowed actions
   - verifies buyer is the negotiation buyer
3. Add `POST /negotiations/:id/buyer/reply` endpoint:
   - accepts `NegotiationBuyerReplyDto`
   - validates current negotiation state
   - records buyer response and updates negotiation status
   - returns updated negotiation state
4. Add seller-facing endpoint `GET /negotiations/:id/seller`:
   - returns buyer reply history and seller proposal status
   - verifies seller ownership
5. Add service methods:
   - `getBuyerNegotiation(negotiationId, userId)`
   - `submitBuyerReply(negotiationId, userId, dto)`
   - `getSellerNegotiation(negotiationId, userId)`

### Phase 2 — Negotiation model & state
1. Extend `Negotiation` model with:
   - `buyerLastReply` text
   - `buyerDecision` enum (`ACCEPTED`, `REJECTED`, `COUNTERED`, `OPINION`)
   - `sellerProposal` numeric/current offer fields if missing
2. Add `NegotiationThread` or reuse `NegotiationEscalation` records for messages.
3. Ensure buyer reply updates the thread and preserves seller proposal history.
4. Add state transition rules in `NegotiationService`:
   - buyer accepts → `AGREED`
   - buyer rejects → `REJECTED` or `FAILED`
   - buyer counters → `COUNTER` and create next proposal draft
   - buyer opinion → `PENDING_SELLER_RESPONSE`

### Phase 3 — Gemini 4 processing
1. Add `GeminiService.processBuyerDecision(dto, negotiation)`:
   - formats a system prompt using current negotiation context
   - sends buyer decision and last seller proposal to Gemma 4
   - returns next message text / suggested next action
2. In `submitBuyerReply`, invoke Gemini only when:
   - the buyer submitted an opinion/comment
   - the buyer counters with a number and we need a formatted seller-facing message
3. Save Gemini output in negotiation thread as `aiResponse` or `nextMessage`.
4. If Gemma returns `null` / error, fallback to deterministic text:
   - `شكراً، استلمنا رأيك وسنوافيك برد البائع قريباً.`

### Phase 4 — Frontend buyer negotiation page
1. Create `BuyerNegotiationPage` with route `/negotiation/:id`.
2. Fetch `GET /negotiations/:id/buyer` on load.
3. Display:
   - seller proposal headline
   - negotiation status
   - thread of messages / decisions
   - action form for accept/reject/counter/opinion
4. Submit via `POST /negotiations/:id/buyer/reply`.
5. Show updated thread and latest status after submit.

### Phase 5 — Frontend seller view
1. Create or extend seller negotiation view to display buyer replies.
2. Show last buyer response, comment text, and current proposal status.
3. Allow seller to advance the negotiation from their side in a later phase.

### Phase 6 — Tests and verification
1. Add unit tests for buyer reply validation:
   - buyer cannot submit if not buyer
   - buyer cannot counter with missing amount
   - buyer cannot accept after negotiation already `AGREED`
2. Add integration tests for endpoints:
   - `GET /negotiations/:id/buyer` returns the correct thread
   - `POST /negotiations/:id/buyer/reply` accepts counter / opinion / accept
   - seller endpoint returns latest buyer reply
3. Add Gemini integration test stub:
   - mock `GeminiService.processBuyerDecision`
   - assert `submitBuyerReply` saves Gemini output
4. Add frontend smoke test in UI if available.

## Risks
- Buyer login/auth must be enforced per negotiation, not just per route.
- Gemma 4 output may be inconsistent; use deterministic fallback text.
- Seller view must not expose buyer-only fields to unauthorized users.

## Next step
Implement `backend/src/negotiation/buyer-negotiation.controller.ts` and the buyer reply DTO, then wire the page route in frontend.
