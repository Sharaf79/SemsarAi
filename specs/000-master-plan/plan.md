# Master Implementation Plan: Semsar AI (سمسار AI)

**Created**: 2026-03-31
**Status**: Active
**Source**: [Constitution](/.claude/commands/speckit.constitution.md) · [Specification](/.claude/commands/speckit.specify.md)

---

## Summary

Semsar AI is a **controlled real-estate platform** — NOT a free-chat bot. Two distinct phases: **Phase 1** collects property data via a strict state machine (one question per step, no skipping). **Phase 2** negotiates between buyer and seller via an algorithm-driven engine (AI only formats messages, never decides).

**Market**: Egypt (Cairo, Giza, Alexandria)
**Language**: Egyptian Arabic — polite register (عامية مهذبة)
**Core Principle**: Backend enforces ALL logic. AI is the communication layer only.

---

## Progress & Current State

### Completed ✅

| Deliverable | Evidence |
|---|---|
| **NestJS Backend (foundation)** | `backend/` — NestJS 11 + Prisma 6.x + MySQL |
| **Prisma schema (11 models)** | `backend/prisma/schema.prisma` — User, Property, LowerOffice, Negotiation, Offer, Deal, Payment, AiLog, Conversation, Listing, Unit |
| **205 unit tests + 7 e2e tests** | All passing |
| **TypeScript zero errors** | `tsc --noEmit` = 0 |
| **Python MVP (reference)** | `src/` — 18 files, 874 lines (state machine, Gemini, WhatsApp, Supabase) |
| **Python test suite (reference)** | `tests/` — 252 tests across 11 files |
| **FastAPI Chat UI** | `app/` — in-memory sessions, multi-turn history, option buttons |
| **Gemini 2.5 Flash integration** | Standardized across all codebases |
| **Code review fixes (#1–#15)** | All 15 issues resolved (except #8 deferred) |
| **Standard Arabic UI** | Prompts + chat HTML updated to فصحى |

### What Needs To Be Built

| Component | Phase | Status |
|---|---|---|
| `PropertyDraft` model + migration | Phase 1 | 🔴 Not started |
| `PropertyMedia` model + migration | Phase 1 | 🔴 Not started |
| `OnboardingStep` enum | Phase 1 | 🔴 Not started |
| `PropertyKind` enum | Phase 1 | 🔴 Not started |
| `OnboardingModule` (NestJS) | Phase 1 | 🔴 Not started |
| `OnboardingService` (state machine) | Phase 1 | 🔴 Not started |
| `OnboardingController` (6 endpoints) | Phase 1 | 🔴 Not started |
| Chat UI update (structured input) | Phase 1 | 🔴 Not started |
| `NegotiationModule` (NestJS) | Phase 2 | 🔴 Not started |
| `NegotiationService` (algorithm) | Phase 2 | 🔴 Not started |
| `NegotiationController` (3 endpoints) | Phase 2 | 🔴 Not started |

---

## Technical Architecture

### Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend | **NestJS 11** | Modular architecture, `backend/` |
| ORM | **Prisma 6.x** | Type-safe, migrations, MySQL |
| Database | **MySQL 8+** | Existing, running via constitution |
| AI | **Gemini 2.5 Flash** | Message formatting + Arabic extraction only |
| Chat UI (dev) | **FastAPI** | `app/` — HTML chat for testing |
| Chat UI (prod) | **WhatsApp Cloud API** | Future — webhook already scaffolded |

### Architecture Diagram

```
User (Chat UI / WhatsApp)
        │
        ▼
   NestJS API ──── Validation + Auth
        │
        ├──→ OnboardingModule (Phase 1)
        │         │
        │    State Machine ──→ PropertyDraft (DB)
        │         │
        │    On submit ──→ Property + PropertyMedia (DB)
        │
        └──→ NegotiationModule (Phase 2)
                  │
             Algorithm Engine ──→ Negotiation + Offers (DB)
                  │
             On agree ──→ Deal (DB)
                  │
             AI formats messages only (Gemini)
```

### Database Models (Current + New)

```
── EXISTING (keep) ─────────────────────
users
properties ──────────── (add property_kind)
lower_offices
negotiations
offers
deals
payments
ai_logs
conversations ──────── (deprecated, keep for compat)
listings ───────────── (deprecated, keep for compat)
units ──────────────── (deprecated, keep for compat)

── NEW (Phase 1) ───────────────────────
property_drafts ────── state machine progress
property_media ─────── images/videos per draft/property

── NEW ENUMS ───────────────────────────
OnboardingStep ─────── PROPERTY_TYPE → ... → COMPLETED
PropertyKind ──────── APARTMENT | VILLA | SHOP | OFFICE
MediaType ─────────── IMAGE | VIDEO
```

---

## Phase 1: Guided Data Collection Engine

### Goal

Collect property data from users via a **strict state machine** — NOT free chat. One question per step, structured answers (multi-choice / bounded input), progressive saving to draft, editable review before final submit.

### Duration: 2–3 weeks

### Sprint 1.1 — Schema & Module Setup (3–4 days)

| # | Task | Description |
|---|---|---|
| T1 | Add `PropertyKind` enum | APARTMENT, VILLA, SHOP, OFFICE |
| T2 | Add `OnboardingStep` enum | PROPERTY_TYPE, LISTING_TYPE, LOCATION, DETAILS, PRICE, MEDIA, REVIEW, COMPLETED |
| T3 | Add `MediaType` enum | IMAGE, VIDEO |
| T4 | Add `property_kind` to Property | New field mapping property kind separately from sale/rent type |
| T5 | Create `PropertyDraft` model | id, user_id, property_id?, current_step, data (JSON), is_completed, timestamps |
| T6 | Create `PropertyMedia` model | id, draft_id?, property_id?, url, type (MediaType), created_at |
| T7 | Add relations | User→PropertyDraft, PropertyDraft→PropertyMedia, Property→PropertyMedia, Property→PropertyDraft |
| T8 | Run `prisma migrate dev` | Generate and apply migration |
| T9 | Scaffold `OnboardingModule` | Module, Controller, Service, DTOs directory |
| T10 | Scaffold `NegotiationModule` | Module, Controller, Service, DTOs directory (empty for now) |

### Sprint 1.2 — Onboarding Service (5–7 days)

| # | Task | Description |
|---|---|---|
| T11 | `startOrResumeDraft(userId)` | Find active (incomplete) draft or create new one. Return draft with current_step |
| T12 | `getCurrentQuestion(userId)` | Read current_step → return question text (Arabic), input type, options/fields |
| T13 | Questions constant file | Arabic text + options for each step. Map: `OnboardingStep → { question, inputType, options?, fields? }` |
| T14 | `submitAnswer(userId, step, answer)` | Validate step matches current_step. Validate answer per step rules. Merge into draft.data JSON. Advance to next step |
| T15 | Step validation logic | PROPERTY_TYPE: one of 4 options. LISTING_TYPE: SALE/RENT. LOCATION: governorate required. DETAILS: area required, beds/baths for APARTMENT/VILLA. PRICE: positive number. MEDIA: optional skip |
| T16 | `getReview(userId)` | Return full draft.data formatted for review. Flag missing required fields |
| T17 | `editField(userId, step)` | Set current_step back to specified step. Return that question again |
| T18 | `finalSubmit(userId)` | Validate all required fields. Create Property from draft.data. Transfer PropertyMedia from draft_id to property_id. Mark draft is_completed=true, current_step=COMPLETED |
| T19 | `uploadMedia(userId, file)` | Validate file type (jpg, png, mp4) + size (≤10MB). Store URL. Create PropertyMedia with draft_id |

### Sprint 1.3 — Controller & DTOs (2–3 days)

| # | Task | Description |
|---|---|---|
| T20 | `StartOnboardingDto` | userId (UUID, required) |
| T21 | `SubmitAnswerDto` | userId, step (OnboardingStep enum), answer (any — validated in service) |
| T22 | `QuestionResponseDto` | step, question (Arabic text), inputType (multi-choice/form/number/file), options?, fields? |
| T23 | `ReviewResponseDto` | draft, data, isComplete, missingFields[] |
| T24 | POST `/onboarding/start` | Call startOrResumeDraft → return draft |
| T25 | GET `/onboarding/question` | Query: userId → call getCurrentQuestion → return QuestionResponse |
| T26 | POST `/onboarding/answer` | Body: SubmitAnswerDto → call submitAnswer → return updated draft |
| T27 | GET `/onboarding/review` | Query: userId → call getReview → return ReviewResponse |
| T28 | POST `/onboarding/submit` | Body: { userId } → call finalSubmit → return Property |
| T29 | POST `/onboarding/upload-media` | Multipart: userId + file → call uploadMedia → return PropertyMedia |

### Sprint 1.4 — Tests (3–4 days)

| # | Task | Description |
|---|---|---|
| T30 | Unit: `startOrResumeDraft` | New user → creates draft. Existing incomplete draft → resumes. Completed draft → creates new |
| T31 | Unit: `getCurrentQuestion` | Each of 8 steps returns correct Arabic text and input type |
| T32 | Unit: `submitAnswer` | Valid answer → advances step. Wrong step → rejects. Invalid answer → rejects |
| T33 | Unit: step validation | Each step's validation rules (type checks, required fields, bounds) |
| T34 | Unit: `getReview` | Returns all data. Flags missing fields correctly |
| T35 | Unit: `editField` | Resets current_step. Returns correct question |
| T36 | Unit: `finalSubmit` | Creates Property with correct fields. Transfers media. Marks draft complete. Rejects if fields missing |
| T37 | Unit: `uploadMedia` | Valid file type accepted. Invalid rejected. Size limit enforced |
| T38 | Unit: Controller | Each endpoint with valid/invalid input. 400 on bad DTO. 404 on missing user |
| T39 | E2E: Full onboarding flow | Start → answer all 7 steps → review → submit → verify Property in DB |
| T40 | E2E: Resume interrupted flow | Start → 3 answers → new session → resume from step 4 |
| T41 | E2E: Edit from review | Complete to review → edit location → re-answer → re-review → submit |

### Sprint 1.5 — Chat UI Integration (2–3 days)

| # | Task | Description |
|---|---|---|
| T42 | Multi-choice buttons | PROPERTY_TYPE + LISTING_TYPE steps render clickable option pills |
| T43 | Form mode | LOCATION + DETAILS steps render as inline form with labeled fields |
| T44 | Numeric input | PRICE step shows number-only input |
| T45 | File upload widget | MEDIA step shows upload button + skip option |
| T46 | Review screen | Display all collected data with edit buttons per field |
| T47 | Disable free text | When step expects structured input, lock the text input |
| T48 | Wire to `/onboarding/*` | Replace direct `/chat` calls with new onboarding endpoints |

### Phase 1 Exit Criteria

- [ ] `PropertyDraft` state machine enforces strict step order
- [ ] All 8 steps work with correct Arabic questions + proper input types
- [ ] Review step shows all data and allows editing any field
- [ ] Final submit creates `Property` with all fields populated
- [ ] Media uploaded to draft transfers to property on submit
- [ ] All existing tests (205 unit + 7 e2e) continue passing
- [ ] New onboarding tests pass (unit + e2e)

---

## Phase 2: Negotiation Engine

### Goal

Algorithm-driven negotiation between buyer and seller. AI does NOT decide — it only formats messages. All logic is in the backend. Max 6 rounds. Bounded user actions only (accept/reject/request_counter).

### Duration: 2–3 weeks

### Dependency: Phase 1 (properties exist in DB to negotiate on)

### Sprint 2.1 — Negotiation Service (5–7 days)

| # | Task | Description |
|---|---|---|
| T49 | `startNegotiation(propertyId, buyerId)` | Look up property + seller. Buyer provides max_price (budget). Seller's listing price = proxy for min_price. Create Negotiation row. Calculate initial offer = `max_price × 0.85`. Create first Offer row. Return negotiation + AI message |
| T50 | `getConcessionRate(round)` | Round 1–2 → 5%. Round 3–5 → 10%. Round 6+ → 15% |
| T51 | `calculateCounterOffer(negotiation)` | `gap = max_price - min_price`. `counter = current_offer + (gap × concessionRate)`. Clamp between min_price and max_price |
| T52 | `nextStep(negotiationId, action)` | `accept` → status=AGREED, create Deal. `reject` → status=FAILED. `request_counter` → if round ≤ 6 calculate counter, create Offer, increment round; if round > 6 → FAILED |
| T53 | `getStatus(negotiationId)` | Return negotiation + all offers + current round + max rounds |
| T54 | `formatMessage(action, offer?)` | Counter: "بكل احترام، السعر الحالي هو {price} جنيه. هل يناسب حضرتك؟". Accept: "تم الاتفاق على {price} جنيه. برجاء استكمال الدفع.". Reject: "نأسف، لم نتمكن من الوصول لاتفاق مناسب." |
| T55 | Deal creation on accept | Create Deal row with final_price = agreed offer. Link buyer, seller, negotiation. Log in ai_logs |

### Sprint 2.2 — Controller & DTOs (2–3 days)

| # | Task | Description |
|---|---|---|
| T56 | `StartNegotiationDto` | propertyId (UUID), buyerId (UUID) |
| T57 | `NextStepDto` | negotiationId (UUID), action (accept/reject/request_counter) |
| T58 | `NegotiationStepResultDto` | negotiation, action, message (Arabic), offer?, isComplete |
| T59 | `NegotiationStatusDto` | negotiation, offers[], currentRound, maxRounds (6) |
| T60 | POST `/negotiation/start` | Start negotiation → return initial state + first offer message |
| T61 | POST `/negotiation/next-step` | Body: NextStepDto → execute step → return result |
| T62 | GET `/negotiation/status` | Query: negotiationId → return full status |

### Sprint 2.3 — Tests (3–4 days)

| # | Task | Description |
|---|---|---|
| T63 | Unit: `startNegotiation` | Creates negotiation. Initial offer = max_price × 0.85. First offer row created |
| T64 | Unit: `getConcessionRate` | Round 1→5%, round 3→10%, round 6→15% |
| T65 | Unit: `calculateCounterOffer` | Correct formula. Clamped within bounds |
| T66 | Unit: `nextStep` — accept | Status→AGREED. Deal created. Correct final_price |
| T67 | Unit: `nextStep` — reject | Status→FAILED. No deal created |
| T68 | Unit: `nextStep` — counter | Round incremented. New offer created. Correct amount |
| T69 | Unit: `nextStep` — max rounds | Round 7 → auto FAILED |
| T70 | Unit: `formatMessage` | Correct Arabic text for each action. Price formatted correctly |
| T71 | Unit: Controller | Each endpoint valid/invalid. 404 on missing negotiation. 400 on bad action |
| T72 | E2E: Full negotiation → agree | Start → 3 counter rounds → accept → verify Deal in DB |
| T73 | E2E: Full negotiation → fail | Start → 6 counter rounds → round 7 auto-fail → verify status=FAILED |
| T74 | E2E: Immediate accept | Start → buyer accepts first offer → Deal created at initial price |

---

## Phase Dependencies

```
Phase 1 (Data Collection)
    │
    │  properties exist in DB
    │
    ▼
Phase 2 (Negotiation Engine)
    │
    │  deals + payments tables ready
    │
    ▼
Future: Payment Integration (when needed)
```

### Critical Path

**Phase 1 → Phase 2 → Deploy**

Phase 1 is **blocking** — without properties in the DB, there's nothing to negotiate on. Phase 2 can only start after Phase 1 is functional.

---

## Decision Log

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Free chat or state machine? | **State machine** | Constitution mandates structured data collection. No free text for property input |
| 2 | AI decides negotiations? | **No — algorithm only** | Constitution: AI is communication layer. Backend algorithm controls all offers |
| 3 | Max negotiation rounds? | **6** | Constitution spec. Enough for convergence, prevents endless loops |
| 4 | First offer formula? | **max_price × 0.85** | Constitution anchor strategy |
| 5 | Concession schedule? | **5%/10%/15%** | Constitution: gradual escalation by round bracket |
| 6 | Keep old intake models? | **Yes, deprecated** | Conversation/Listing/Unit stay for backward compat, not used in new flows |
| 7 | Gemini model? | **2.5 Flash** | Standardized across all codebases |
| 8 | Chat language? | **Egyptian Arabic (polite)** | Constitution mandates Arabic; UI already migrated |
| 9 | Media handling? | **Draft-first** | Upload to draft during onboarding, transfer to property on submit |
| 10 | Location sub-fields? | **Governorate required, rest optional** | Spec: only governorate is mandatory for MVP |

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Schema migration breaks existing tests | 205 tests fail | Run full test suite after each migration. Additive changes only (no drops) |
| Onboarding too rigid (users want flexibility) | Bad UX | Review step allows editing any field. Future: conditional steps by property kind |
| Negotiation algorithm too predictable | Gaming by users | Concession rates configurable. Add noise/jitter in future version |
| Media upload storage | Cost at scale | Use S3/R2 with signed URLs. Limit per draft (max 10 files) |
| Gemini rate limits | Blocks users | Gemini only formats messages — most logic is pure algorithm, no LLM needed |

---

## Estimated Timeline

| Sprint | Duration | Cumulative | Deliverables |
|---|---|---|---|
| **1.1** Schema + Module | 3–4 days | Day 4 | New models, migration, module scaffolds |
| **1.2** Onboarding Service | 5–7 days | Day 11 | Full state machine logic, all 8 steps |
| **1.3** Controller + DTOs | 2–3 days | Day 14 | 6 endpoints, validated DTOs |
| **1.4** Tests | 3–4 days | Day 18 | Unit + E2E tests for onboarding |
| **1.5** Chat UI | 2–3 days | Day 21 | Structured input in browser UI |
| **2.1** Negotiation Service | 5–7 days | Day 28 | Algorithm, offers, deal creation |
| **2.2** Controller + DTOs | 2–3 days | Day 31 | 3 endpoints, validated DTOs |
| **2.3** Tests | 3–4 days | Day 35 | Unit + E2E tests for negotiation |

**Total: ~5 weeks** (single developer)

---

## Next Steps (Immediate)

1. **Start Sprint 1.1** — Add new enums + models to Prisma schema
2. Run `prisma migrate dev` — verify clean migration
3. Scaffold `OnboardingModule` in `backend/src/onboarding/`
4. Scaffold `NegotiationModule` in `backend/src/negotiation/` (empty)
5. Run existing test suite — confirm 205 unit + 7 e2e still pass
6. Begin T11: `startOrResumeDraft()` implementation
