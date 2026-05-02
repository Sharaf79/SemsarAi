# Tasks — Buyer Negotiation TSK1

Source plan: [buyer_negotiation-plan.md](./buyer_negotiation-plan.md)

Status legend: `[ ]` pending · `[x]` done · `[~]` partial · `[P]` parallelizable · `[M]` manual · `[LLM]` requires Gemma
Total: **23 tasks across 5 waves**.

---

## Wave 1 — Backend contract and auth (T01–T05)

### T01 — Buyer negotiation DTOs
- [ ] Create `NegotiationBuyerReplyDto` in `backend/src/negotiation/dto/` with:
  - `negotiationId` (UUID)
  - `responseType` (`accept` | `reject` | `counter` | `opinion`)
  - `counterAmount?` (number)
  - `comment?` (string)
- [ ] Create read DTOs for buyer/seller negotiation payloads if needed.

### T02 — Buyer endpoints
- [ ] Add `GET /negotiations/:id/buyer` to return negotiation metadata, seller proposal, thread, and allowed actions.
- [ ] Authorize buyer only; reject other users.
- [ ] Add `POST /negotiations/:id/buyer/reply` to accept buyer replies and return updated negotiation state.

### T03 — Seller endpoint
- [ ] Add `GET /negotiations/:id/seller` to return buyer reply history and current proposal status.
- [ ] Authorize seller only; reject other users.

### T04 — Service surface
- [ ] Add `getBuyerNegotiation(negotiationId, userId)` to `NegotiationService` or a new `BuyerNegotiationService`.
- [ ] Add `submitBuyerReply(negotiationId, userId, dto)` and `getSellerNegotiation(negotiationId, userId)`.
- [ ] Validate negotiation ownership and current state inside service methods.

### T05 — Gate
- [ ] `cd backend && npm test -- negotiation` or equivalent subset passes for the new route and service behavior.

---

## Wave 2 — Negotiation model and state (T06–T10)

### T06 — Model fields
- [ ] Extend `Negotiation` model with `buyerLastReply`, `buyerDecision` enum, and seller proposal fields if missing.
- [ ] Add or reuse a thread entity such as `NegotiationEscalation` for message history.
- [ ] Run Prisma schema validation / migration if needed.

### T07 — Buyer reply state transitions
- [ ] Implement state transitions in `NegotiationService`:
  - accept → `AGREED`
  - reject → `REJECTED` / `FAILED`
  - counter → `COUNTER`
  - opinion → `PENDING_SELLER_RESPONSE`
- [ ] Save the buyer reply text and decision metadata.

### T08 — Validation rules
- [ ] Buyer cannot counter without `counterAmount`.
- [ ] Buyer cannot reply if negotiation is already `AGREED` or `FAILED`.
- [ ] Buyer cannot access another negotiation.

### T09 — Thread preservation
- [ ] Persist seller proposals and buyer replies in the negotiation thread.
- [ ] Return the full threaded history in buyer/seller GET endpoints.

### T10 — Gate
- [ ] `cd backend && npm test -- negotiation.service` passes after state/rules changes.

---

## Wave 3 — Gemini 4 response processing (T11–T14)

### T11 — Gemini service hook
- [ ] Add `GeminiService.processBuyerDecision(dto, negotiation)`.
- [ ] Format a system prompt with negotiation context, buyer decision, and seller proposal.

### T12 — Trigger points
- [ ] Invoke Gemma for opinion/comment replies.
- [ ] Invoke Gemma for counter replies when generating the next seller-facing message.
- [ ] Do not invoke Gemma for simple accept/reject state changes unless required for formatting.

### T13 — Save AI output
- [ ] Persist Gemma output as `aiResponse` or `nextMessage` in the negotiation thread.
- [ ] Add a fallback message for `null`/error responses.

### T14 — Gate
- [ ] Unit tests mock `GeminiService.processBuyerDecision` and verify the returned output is saved.

---

## Wave 4 — Frontend buyer negotiation page (T15–T18)

### T15 — Page route and fetch
- [ ] Create `frontend/src/pages/BuyerNegotiationPage.tsx`.
- [ ] Load `/negotiations/:id/buyer` on page render.
- [ ] Display seller proposal, status, and threaded messages.

### T16 — Reply form
- [ ] Add UI controls for accept, reject, counter amount, and opinion text.
- [ ] Submit replies to `POST /negotiations/:id/buyer/reply`.

### T17 — Update view
- [ ] Refresh the thread and negotiation status after submitting a reply.
- [ ] Display any AI-formatted next message returned from Gemma.

### T18 — Gate
- [ ] Buyer page loads and submits successfully in the app environment.

---

## Wave 5 — Seller view and verification (T19–T23)

### T19 — Seller visibility
- [ ] Ensure seller can fetch buyer reply history via `GET /negotiations/:id/seller`.
- [ ] Display the latest buyer reply, comment, and status on the seller side.

### T20 — Security checks
- [ ] Buyer cannot access seller endpoint.
- [ ] Seller cannot access buyer endpoint for unrelated negotiations.

### T21 — End-to-end test coverage
- [ ] Add `backend/test/negotiation/buyer-negotiation.spec.ts`.
- [ ] Cover buyer GET, buyer POST, seller GET, authorization, and counter validation.

### T22 — Authorization gate
- [ ] `cd backend && npm test -- buyer-negotiation` or the equivalent test subset passes.

### T23 — Release readiness
- [ ] Document the new endpoints and expected request/response shapes in the plan file.
- [ ] Confirm the buyer negotiation flow is wired into the UI route map.
