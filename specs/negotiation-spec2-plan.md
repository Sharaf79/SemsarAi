# Plan — Negotiation Spec 2 (Smart-Assistant Chat)

Source spec: [negotiation-spec2.md](./negotiation-spec2.md).

## Context
The negotiation-page chat (POST `/negotiations/chat`, served by `chatWithGemma()` in
`backend/src/negotiation/negotiation.service.ts`) currently uses a "friendly companion"
prompt. Spec 2 tightens that into a **smart personal assistant** with explicit
intent-to-response rules: greetings, listed-price answer from the ad, ordered
negotiation steps, availability confirmation, area features grounded in the listing's
location fields, and natural responses to anything else real-estate-related — while
keeping the two non-negotiable safety rules (no owner phone, no seller minimum).

Outcome: a single-file change to the system prompt literal. No DB, controller, DTO,
or frontend diff.

## Scope
- Replace the `systemPrompt` string in `chatWithGemma()` with the prompt in
  `negotiation-spec2.md` §3, keeping the existing property-context block (title,
  price, governorate/city/district, areaM2) appended at the end.
- Replace the network-failure fallback line with the friendlier one in §3.
- Out of scope: `proposePrice`, escalations, seller-side flows, the 6-round cap,
  algorithmic offer logic, and any frontend change.

## Critical Files
- **Edit**: `backend/src/negotiation/negotiation.service.ts` — `chatWithGemma()`,
  the `systemPrompt` literal and the `??` fallback.
- **Read-only (verify untouched)**:
  - `backend/src/negotiation/gemma.client.ts`
  - `backend/src/negotiation/negotiation.controller.ts`
  - `frontend/src/pages/NegotiationPage.tsx`
  - `frontend/src/api/negotiations.ts`

## Reused Pieces (no new code paths)
- `GemmaClient.chat(systemPrompt, history, userMessage)` — unchanged.
- POST `/negotiations/chat` controller wiring — unchanged.
- `aiLog` write inside `chatWithGemma()` — unchanged; one row per turn.
- Property context block composition — kept verbatim.

## Implementation Steps
1. Open `backend/src/negotiation/negotiation.service.ts`, locate `chatWithGemma()`.
2. Replace the `systemPrompt` body with the Egyptian-Arabic block from
   `negotiation-spec2.md` §3, preserving the four interpolated property fields:
   `${property.title}`, the formatted `price`, `${governorate-city-district}`, and
   `${property.areaM2}`.
3. Replace the existing fallback string with:
   `'أهلاً بحضرتك! اتفضل اسألني في أي حاجة عن العقار أو المنطقة أو خطوات التفاوض، وأنا تحت أمرك.'`.
4. No other lines should change in this file.

## Verification
1. `cd backend && npm run build` — TypeScript compiles cleanly.
2. `cd backend && npm test -- negotiation.service` — all 78 unit tests stay green
   (prompt is a literal; no behavior assertion regresses).
3. Restart backend on port 3000:
   `NODE_OPTIONS='--experimental-global-webcrypto' node --enable-source-maps dist/src/main`.
4. Run the 10 manual acceptance tests from `negotiation-spec2.md` §5:
   greeting · listed-price · ordered negotiation steps · availability ·
   area features · property features · owner-phone refusal ·
   min-price probe refusal · off-topic redirect · Ollama-down fallback.
5. Confirm `aiLog` rows are written for each turn (`actionType = ASK`).

## Risks & Mitigations
- **Prompt drift**: Gemma may still answer price questions with a discount.
  Mitigation: explicit rule in §3 to quote the ad's price and never quote a floor.
- **Fact hallucination on area features**: Mitigation: prompt requires grounding
  in the location fields and forbids inventing facts; if data is missing, say so.
- **Safety regressions**: Manual probes #7 and #8 in the verification list are
  the gate — refusal must hold across paraphrased attempts.

## Success Criteria
- [ ] Single-file diff in `negotiation.service.ts`; no other file modified.
- [ ] Build passes, all 78 negotiation unit tests green.
- [ ] All 10 acceptance probes return the expected behavior.
- [ ] No leak of owner phone or seller minimum across all probes.
