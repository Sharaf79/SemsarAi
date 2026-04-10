# Tasks: Semsar AI — 2-Phase Architecture

**Source**: [Plan](specs/000-master-plan/plan.md) · [Specification](/.claude/commands/speckit.specify.md) · [Constitution](/.claude/commands/speckit.constitution.md)
**Stack**: NestJS 11 · Prisma 6.x · MySQL · Gemini 2.5 Flash · FastAPI (Chat UI)
**Total Tasks**: 74 (T01–T48 Phase 1, T49–T74 Phase 2)

---

## Format

- `[ ]` Not started · `[~]` In progress · `[x]` Done
- `[P]` Can run in parallel (different files, no dependency)
- All file paths relative to `backend/` unless noted
- Each task = one commit

---

## Prior Work (Completed ✅)

| ID | Description | Status |
|---|---|---|
| NJ-001–NJ-033 | NestJS backend scaffold, Prisma 11 models, 205 unit + 7 e2e tests, all services ported | ✅ Done |
| CR-001–CR-015 | Code review fixes (typed casts, cron job, body limit, etc.) | ✅ Done |
| UI-001 | FastAPI Chat UI with multi-turn memory + option buttons | ✅ Done |
| UI-002 | Standard Arabic migration (prompts + HTML) | ✅ Done |
| GEM-001 | Gemini 2.5 Flash standardization across all codebases | ✅ Done |

**Baseline**: 205 unit tests + 7 e2e passing. `tsc --noEmit` = 0 errors. All existing work preserved.

---

## Phase 1: Guided Data Collection Engine

### Sprint 1.1 — Schema & Migration (3–4 days)

**Goal**: Add new Prisma models, enums, and relations. Run migration. Scaffold new modules.

- [x] T01 [P] Add `PropertyKind` enum to `prisma/schema.prisma` — values: `APARTMENT`, `VILLA`, `SHOP`, `OFFICE`
- [x] T02 [P] Add `OnboardingStep` enum to `prisma/schema.prisma` — values: `PROPERTY_TYPE`, `LISTING_TYPE`, `LOCATION`, `DETAILS`, `PRICE`, `MEDIA`, `REVIEW`, `COMPLETED`
- [x] T03 [P] Add `MediaType` enum to `prisma/schema.prisma` — values: `IMAGE`, `VIDEO`
- [x] T04 Add `propertyKind PropertyKind @map("property_kind")` field to `Property` model in `prisma/schema.prisma` — new column distinguishing APARTMENT/VILLA/SHOP/OFFICE separately from SALE/RENT type
- [x] T05 Create `PropertyDraft` model in `prisma/schema.prisma` — fields: `id` (UUID), `userId` (@map user_id, FK→User), `propertyId` (nullable FK→Property, set after submit), `currentStep` (OnboardingStep, default PROPERTY_TYPE), `data` (Json, default "{}"), `isCompleted` (Boolean, default false), `createdAt`, `updatedAt`. Indexes on userId and isCompleted. Map to `property_drafts`
- [x] T06 Create `PropertyMedia` model in `prisma/schema.prisma` — fields: `id` (UUID), `draftId` (nullable FK→PropertyDraft), `propertyId` (nullable FK→Property), `url` (String), `type` (MediaType), `createdAt`. Indexes on draftId and propertyId. Map to `property_media`
- [x] T07 Add relations: `User` → `drafts PropertyDraft[]`, `Property` → `media PropertyMedia[]` + `drafts PropertyDraft[]`, `PropertyDraft` → `media PropertyMedia[]`. Verify no circular dependency breaks
- [x] T08 Run `npx prisma migrate dev --name add-onboarding-models` — verify migration applies cleanly, no data loss on existing tables, generate updated Prisma client
- [x] T09 Scaffold `src/onboarding/` module — create directory with: `onboarding.module.ts`, `onboarding.controller.ts`, `onboarding.service.ts`, `dto/` directory, `constants/` directory. Register in `app.module.ts`
- [x] T10 Scaffold `src/negotiation/` module — create directory with: `negotiation.module.ts`, `negotiation.controller.ts`, `negotiation.service.ts`, `dto/` directory. Register in `app.module.ts`. Leave service/controller empty (Phase 2)

**Checkpoint**: `prisma migrate dev` succeeds. `tsc --noEmit` = 0. All 205+7 existing tests still pass. New modules registered.

---

### Sprint 1.2 — Onboarding Service Core (5–7 days)

**Goal**: Full state machine logic — start/resume draft, questions, answers, validation, review, submit.

- [x] T11 Create `src/onboarding/constants/questions.ts` — export `ONBOARDING_QUESTIONS` map: `Record<OnboardingStep, { question: string; inputType: 'multi-choice' | 'form' | 'number' | 'file'; options?: string[]; fields?: { name: string; label: string; required: boolean }[] }>`. Arabic text per constitution:
  - PROPERTY_TYPE: "حضرتك نوع العقار ايه؟" options: ["شقة", "فيلا", "محل", "مكتب"]
  - LISTING_TYPE: "عايز تبيع ولا تأجر؟" options: ["بيع", "إيجار"]
  - LOCATION: "حدد الموقع من فضلك" fields: governorate (req), city, district, zone, nearest_landmark
  - DETAILS: "تفاصيل العقار" fields: bedrooms, bathrooms, area_m2 (req)
  - PRICE: "السعر المتوقع كام؟" inputType: number
  - MEDIA: "تحب تضيف صور أو فيديوهات؟" inputType: file
  - REVIEW: "راجع البيانات وأكد" (no input — display only)
  - COMPLETED: (terminal state — no question)

- [x] T12 Implement `startOrResumeDraft(userId: string)` in `src/onboarding/onboarding.service.ts` — query `PropertyDraft` where userId + isCompleted=false. If found → return it. If not → create new draft with currentStep=PROPERTY_TYPE, data={}. Return draft

- [x] T13 Implement `getCurrentQuestion(userId: string)` in `src/onboarding/onboarding.service.ts` — load active draft → read currentStep → lookup in ONBOARDING_QUESTIONS → return `{ step, question, inputType, options?, fields? }`. Throw 404 if no active draft

- [x] T14 Implement step validation helpers in `src/onboarding/onboarding.service.ts`:
  - `validatePropertyType(answer)` → must be one of APARTMENT/VILLA/SHOP/OFFICE (map Arabic: شقة→APARTMENT, فيلا→VILLA, محل→SHOP, مكتب→OFFICE)
  - `validateListingType(answer)` → must be SALE/RENT (map Arabic: بيع→SALE, إيجار→RENT)
  - `validateLocation(answer)` → object with governorate (required), city, district, zone, nearest_landmark (optional)
  - `validateDetails(answer)` → object with area_m2 (required, > 0), bedrooms (optional, ≥ 0), bathrooms (optional, ≥ 0). For APARTMENT/VILLA: bedrooms + bathrooms also required
  - `validatePrice(answer)` → positive number > 0
  - `validateMedia(answer)` → "skip" or file reference (handled separately)

- [x] T15 Implement `submitAnswer(userId: string, step: OnboardingStep, answer: any)` in `src/onboarding/onboarding.service.ts`:
  1. Load active draft
  2. Verify `step === draft.currentStep` (else throw 400 "wrong step")
  3. Call appropriate validator for step
  4. Merge validated answer into `draft.data` JSON
  5. Advance `currentStep` to next step in sequence: PROPERTY_TYPE→LISTING_TYPE→LOCATION→DETAILS→PRICE→MEDIA→REVIEW
  6. Save draft → return updated draft

- [x] T16 Define step ordering constant in `src/onboarding/constants/questions.ts` — export `STEP_ORDER: OnboardingStep[]` = [PROPERTY_TYPE, LISTING_TYPE, LOCATION, DETAILS, PRICE, MEDIA, REVIEW, COMPLETED]. Export `getNextStep(current: OnboardingStep, data?: Record<string,unknown>): OnboardingStep` helper with SHOP skip rule (if next===DETAILS && property_type==='SHOP' → skip to PRICE)

- [x] T17 Implement `getReview(userId: string)` in `src/onboarding/onboarding.service.ts`:
  1. Load active draft (must be at REVIEW step or later)
  2. Extract all fields from draft.data
  3. Check required fields: property_type, listing_type, location.governorate, details.area_m2, price
  4. Return `{ draft, data, isComplete: boolean, missingFields: string[] }`

- [x] T18 Implement `editField(userId: string, targetStep: OnboardingStep)` in `src/onboarding/onboarding.service.ts`:
  1. Load active draft (must be at REVIEW step)
  2. Set `draft.currentStep = targetStep`
  3. Save draft → return question for targetStep
  4. After re-answering, flow continues forward from targetStep back to REVIEW

- [x] T19 Implement `finalSubmit(userId: string)` in `src/onboarding/onboarding.service.ts`:
  1. Load active draft (must be at REVIEW step)
  2. Validate ALL required fields present in draft.data (skip details for SHOP)
  3. Create `Property` row: map property_type→propertyKind, listing_type→type, location fields, details fields, price. Set userId, propertyStatus=ACTIVE. For SHOP: bedrooms/bathrooms/area_m2 = null
  4. Update all `PropertyMedia` rows: set propertyId, clear draftId
  5. Set `draft.propertyId = property.id`, `draft.isCompleted = true`, `draft.currentStep = COMPLETED`
  6. Save all in transaction → return created Property

- [x] T20 Implement `uploadMedia(userId: string, url: string, mediaType: MediaType)` in `src/onboarding/onboarding.service.ts`:
  1. Load active draft (should be at MEDIA step, but allow from any step)
  2. Validate mediaType is IMAGE or VIDEO
  3. Create `PropertyMedia` row with draftId, url, type
  4. Return created PropertyMedia

**Checkpoint**: Full service logic implemented. All state transitions work. Validation catches bad input. finalSubmit creates Property atomically.

---

### Sprint 1.3 — Controller & DTOs (2–3 days)

**Goal**: Wire HTTP endpoints to service methods. Validate input with class-validator DTOs.

- [ ] T21 Create `src/onboarding/dto/start-onboarding.dto.ts` — `{ userId: string }` with `@IsUUID()`

- [ ] T22 Create `src/onboarding/dto/submit-answer.dto.ts` — `{ userId: string, step: OnboardingStep, answer: any }` with `@IsUUID()`, `@IsEnum(OnboardingStep)`, `@IsNotEmpty()`

- [ ] T23 Create `src/onboarding/dto/question-response.dto.ts` — interface: `{ step: OnboardingStep, question: string, inputType: string, options?: string[], fields?: FieldDef[] }`

- [ ] T24 Create `src/onboarding/dto/review-response.dto.ts` — interface: `{ draft: PropertyDraft, data: Record<string, any>, isComplete: boolean, missingFields: string[] }`

- [ ] T25 Implement `POST /onboarding/start` in `src/onboarding/onboarding.controller.ts` — body: StartOnboardingDto → call `startOrResumeDraft(userId)` → return draft (201)

- [ ] T26 Implement `GET /onboarding/question` in `src/onboarding/onboarding.controller.ts` — query param: `userId` → call `getCurrentQuestion(userId)` → return QuestionResponse (200)

- [ ] T27 Implement `POST /onboarding/answer` in `src/onboarding/onboarding.controller.ts` — body: SubmitAnswerDto → call `submitAnswer(userId, step, answer)` → return updated draft (200)

- [ ] T28 Implement `GET /onboarding/review` in `src/onboarding/onboarding.controller.ts` — query param: `userId` → call `getReview(userId)` → return ReviewResponse (200)

- [ ] T29 Implement `POST /onboarding/submit` in `src/onboarding/onboarding.controller.ts` — body: `{ userId }` → call `finalSubmit(userId)` → return Property (201)

- [ ] T30 Implement `POST /onboarding/upload-media` in `src/onboarding/onboarding.controller.ts` — body: `{ userId, url, type }` → call `uploadMedia(userId, url, type)` → return PropertyMedia (201)

**Checkpoint**: All 6 endpoints callable via curl/Postman. Validation rejects bad input with 400. 404 on missing drafts.

---

### Sprint 1.4 — Unit & E2E Tests (3–4 days)

**Goal**: Full test coverage for onboarding service and controller.

- [ ] T31 Unit test: `startOrResumeDraft` in `src/onboarding/onboarding.service.spec.ts` — 3 cases: new user creates draft, existing incomplete draft resumes, completed draft creates new one

- [ ] T32 Unit test: `getCurrentQuestion` — 8 cases: each OnboardingStep returns correct Arabic text, inputType, options/fields matching ONBOARDING_QUESTIONS constant

- [ ] T33 Unit test: `submitAnswer` valid flows — 7 cases: one per answerable step (PROPERTY_TYPE through MEDIA). Verify answer merged into data, currentStep advanced

- [ ] T34 Unit test: `submitAnswer` invalid flows — 6+ cases: wrong step (400), invalid property_type, invalid listing_type, missing governorate, negative price, bad area. Each throws appropriate error

- [ ] T35 Unit test: step validation helpers — individual tests for each validator: validatePropertyType (4 valid Arabic + invalid), validateListingType (2 valid + invalid), validateLocation (with/without governorate), validateDetails (with/without required fields per property kind), validatePrice (positive, zero, negative, NaN)

- [ ] T36 Unit test: `getReview` — 3 cases: complete data → isComplete=true, missing price → isComplete=false + missingFields=["price"], empty data → all fields missing

- [ ] T37 Unit test: `editField` — 3 cases: from REVIEW → set to LOCATION → verify currentStep changed, from non-REVIEW → reject (400), edit to COMPLETED → reject (400)

- [ ] T38 Unit test: `finalSubmit` — 4 cases: all fields present → Property created + media transferred + draft completed, missing required field → reject (400), draft not at REVIEW → reject (400), verify Prisma transaction used

- [ ] T39 Unit test: `uploadMedia` — 3 cases: valid IMAGE → created, valid VIDEO → created, invalid type → reject

- [ ] T40 Unit test: Controller — 6 endpoint tests: each returns correct status code, validation pipe catches bad DTOs (missing userId, bad step enum), 404 on no active draft

- [ ] T41 E2E test: Full onboarding flow in `test/onboarding.e2e-spec.ts` — POST /start → GET /question (PROPERTY_TYPE) → POST /answer (شقة) → GET /question (LISTING_TYPE) → POST /answer (بيع) → ... through all steps → GET /review → POST /submit → verify Property exists in DB with correct fields

- [ ] T42 E2E test: Resume interrupted flow — POST /start → answer 3 steps → new POST /start (same userId) → verify resumes at step 4, not step 1

- [ ] T43 E2E test: Edit from review — complete all steps to REVIEW → POST /answer with targetStep=LOCATION (via editField endpoint or re-answer) → verify flow returns to LOCATION → re-answer → auto-advance back to REVIEW → POST /submit

**Checkpoint**: All new tests pass. All 205+7 existing tests still pass. `tsc --noEmit` = 0.

---

### Sprint 1.5 — Chat UI Integration (2–3 days)

**Goal**: Update FastAPI Chat UI (`app/static/chat.html`) to use structured onboarding flow.

- [ ] T44 Update `app/static/chat.html` — render multi-choice buttons for PROPERTY_TYPE and LISTING_TYPE steps. Clicking a button sends the selected option as the answer (already partially implemented with option pills)

- [ ] T45 Add form mode to `app/static/chat.html` — for LOCATION and DETAILS steps, render inline form with labeled input fields (governorate, city, district, etc.). Submit button sends all fields as structured object

- [ ] T46 Add numeric input mode to `app/static/chat.html` — for PRICE step, show number-only input field with "جنيه" (EGP) label. Validate positive number client-side before sending

- [ ] T47 Add file upload widget to `app/static/chat.html` — for MEDIA step, show upload button + "تخطي" (skip) button. Upload sends to `/onboarding/upload-media`. Skip advances to REVIEW

- [ ] T48 Add review screen to `app/static/chat.html` — call GET `/onboarding/review`, display all collected data as editable summary card. Each field has an "edit" button that triggers `editField` for that step. "Submit" button calls POST `/onboarding/submit`

**Checkpoint**: Full onboarding flow works in browser at `/ui`. Structured input for each step type. Review + edit + submit functional.

---

## Phase 2: Negotiation Engine

### Sprint 2.1 — Negotiation Service (5–7 days)

**Goal**: Algorithm-driven negotiation — start, counter offers, accept/reject, deal creation.

**Dependency**: Phase 1 complete (properties exist in DB)

- [ ] T49 Implement `startNegotiation(propertyId: string, buyerId: string, maxPrice: number)` in `src/negotiation/negotiation.service.ts`:
  1. Load Property → get seller userId + listing price (min_price proxy)
  2. Validate buyer ≠ seller
  3. Create `Negotiation` row: propertyId, buyerId, sellerId, minPrice=listing price, maxPrice=buyer budget, status=ACTIVE, roundNumber=1
  4. Calculate initial offer: `maxPrice × 0.85`
  5. Set `currentOffer = initialOffer`
  6. Create first `Offer` row: amount=initialOffer, createdBy="AI", round=1
  7. Format Arabic message: "بكل احترام، السعر الحالي هو {initialOffer} جنيه. هل يناسب حضرتك؟"
  8. Return `{ negotiation, offer, message }`

- [ ] T50 Implement `getConcessionRate(round: number): number` in `src/negotiation/negotiation.service.ts`:
  - round 1–2 → 0.05 (5%)
  - round 3–5 → 0.10 (10%)
  - round 6+  → 0.15 (15%)

- [ ] T51 Implement `calculateCounterOffer(negotiation: Negotiation): Decimal` in `src/negotiation/negotiation.service.ts`:
  1. `gap = maxPrice - minPrice`
  2. `concessionRate = getConcessionRate(negotiation.roundNumber)`
  3. `counter = currentOffer + (gap × concessionRate)`
  4. Clamp: `Math.min(counter, maxPrice)` and `Math.max(counter, minPrice)`
  5. Return counter

- [ ] T52 Implement `nextStep(negotiationId: string, action: 'accept' | 'reject' | 'request_counter')` in `src/negotiation/negotiation.service.ts`:
  - **accept**:
    1. Set `status = AGREED`
    2. Create `Deal` row: negotiationId, buyerId, sellerId, finalPrice=currentOffer, status=PENDING
    3. Log in `AiLog`: actionType=ACCEPT
    4. Format message: "تم الاتفاق على {price} جنيه. برجاء استكمال الدفع."
    5. Return `{ negotiation, action: 'accept', message, isComplete: true }`
  - **reject**:
    1. Set `status = FAILED`
    2. Log in `AiLog`: actionType=REJECT
    3. Format message: "نأسف، لم نتمكن من الوصول لاتفاق مناسب."
    4. Return `{ negotiation, action: 'reject', message, isComplete: true }`
  - **request_counter**:
    1. If `roundNumber > 6` → auto FAIL (same as reject)
    2. Calculate counter offer via `calculateCounterOffer()`
    3. Increment `roundNumber`
    4. Set `currentOffer = counterOffer`
    5. Create `Offer` row: amount=counterOffer, round=roundNumber
    6. Log in `AiLog`: actionType=COUNTER
    7. If `counterOffer >= minPrice` → auto ACCEPT (deal reached)
    8. Format message: "بكل احترام، السعر الحالي هو {counterOffer} جنيه. هل يناسب حضرتك؟"
    9. Return `{ negotiation, action: 'counter', message, offer: counterOffer, isComplete: false }`

- [ ] T53 Implement `getStatus(negotiationId: string)` in `src/negotiation/negotiation.service.ts`:
  1. Load Negotiation with all Offers (ordered by round)
  2. Return `{ negotiation, offers, currentRound: roundNumber, maxRounds: 6 }`

- [ ] T54 Implement `formatMessage(action: string, price?: number): string` in `src/negotiation/negotiation.service.ts`:
  - `counter` → "بكل احترام، السعر الحالي هو {price} جنيه. هل يناسب حضرتك؟"
  - `accept` → "تم الاتفاق على {price} جنيه. برجاء استكمال الدفع."
  - `reject` → "نأسف، لم نتمكن من الوصول لاتفاق مناسب."
  - Format price with Arabic numeral grouping (e.g., 2,500,000)

- [ ] T55 Deal creation helper: ensure `finalSubmit` in nextStep(accept) uses a Prisma transaction — create Deal + update Negotiation status + create AiLog atomically. On failure → rollback all

**Checkpoint**: Full negotiation algorithm works. Offers calculated correctly per constitution formula. Deal created on accept. Max 6 rounds enforced.

---

### Sprint 2.2 — Controller & DTOs (2–3 days)

**Goal**: Wire HTTP endpoints for negotiation.

- [ ] T56 Create `src/negotiation/dto/start-negotiation.dto.ts` — `{ propertyId: string, buyerId: string, maxPrice: number }` with `@IsUUID()` for IDs, `@IsPositive()` for maxPrice

- [ ] T57 Create `src/negotiation/dto/next-step.dto.ts` — `{ negotiationId: string, action: string }` with `@IsUUID()`, `@IsIn(['accept', 'reject', 'request_counter'])`

- [ ] T58 Create `src/negotiation/dto/negotiation-response.dto.ts` — interfaces for `NegotiationStepResult` and `NegotiationStatusResponse`

- [ ] T59 Implement `POST /negotiation/start` in `src/negotiation/negotiation.controller.ts` — body: StartNegotiationDto → call startNegotiation → return result (201)

- [ ] T60 Implement `POST /negotiation/next-step` in `src/negotiation/negotiation.controller.ts` — body: NextStepDto → call nextStep → return NegotiationStepResult (200)

- [ ] T61 Implement `GET /negotiation/status` in `src/negotiation/negotiation.controller.ts` — query: negotiationId → call getStatus → return NegotiationStatusResponse (200)

**Checkpoint**: All 3 endpoints callable. Validation works. 400 on bad input, 404 on missing negotiation.

---

### Sprint 2.3 — Unit & E2E Tests (3–4 days)

**Goal**: Full test coverage for negotiation service and controller.

- [ ] T62 Unit test: `startNegotiation` in `src/negotiation/negotiation.service.spec.ts` — 4 cases: valid start (negotiation + offer created, initial offer = maxPrice×0.85), buyer = seller → reject (400), property not found → 404, correct Arabic message returned

- [ ] T63 Unit test: `getConcessionRate` — 6 cases: round 1→0.05, round 2→0.05, round 3→0.10, round 4→0.10, round 5→0.10, round 6→0.15

- [ ] T64 Unit test: `calculateCounterOffer` — 4 cases: round 1 with known gap → expected counter, round 5 → higher concession, counter clamped to maxPrice if exceeded, counter ≥ minPrice always

- [ ] T65 Unit test: `nextStep(accept)` — 3 cases: status→AGREED, Deal created with correct finalPrice, AiLog created with ACCEPT, Arabic accept message returned

- [ ] T66 Unit test: `nextStep(reject)` — 3 cases: status→FAILED, no Deal created, AiLog with REJECT, Arabic reject message

- [ ] T67 Unit test: `nextStep(request_counter)` — 4 cases: round incremented, new Offer created with correct amount, currentOffer updated, counter message returned

- [ ] T68 Unit test: `nextStep` max rounds — 2 cases: round 7 request_counter → auto FAILED, round 6 still allowed

- [ ] T69 Unit test: `nextStep` auto-accept — when counterOffer ≥ minPrice → status=AGREED automatically, Deal created

- [ ] T70 Unit test: `formatMessage` — 3 cases: counter with price, accept with price, reject without price. Verify Arabic text exact match

- [ ] T71 Unit test: Controller — 3 endpoint tests per endpoint: valid input (200/201), bad DTO (400), missing entity (404)

- [ ] T72 E2E test: Full negotiation → agree in `test/negotiation.e2e-spec.ts` — create Property first → POST /negotiation/start → POST /next-step (request_counter) ×3 → POST /next-step (accept) → verify Deal in DB with correct finalPrice

- [ ] T73 E2E test: Full negotiation → fail — POST /start → POST /next-step (request_counter) ×6 → POST /next-step (request_counter) → verify status=FAILED, no Deal

- [ ] T74 E2E test: Immediate accept — POST /start → POST /next-step (accept) → verify Deal created at initial offer price (maxPrice × 0.85)

**Checkpoint**: All negotiation tests pass. All existing tests (205 unit + 7 e2e + Phase 1 tests) still pass. `tsc --noEmit` = 0.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Sprint 1.1 (Schema) ──── BLOCKS everything
     │
     ├──→ Sprint 1.2 (Service) ──→ Sprint 1.3 (Controller) ──→ Sprint 1.4 (Tests)
     │                                                              │
     │                                                              └──→ Sprint 1.5 (Chat UI)
     │
     └──→ Sprint 2.1 can start after T08 (migration) if Property exists
           but SHOULD wait until Phase 1 complete for full integration
```

### Within-Sprint Parallelism

| Sprint | Parallel Tasks |
|---|---|
| 1.1 | T01+T02+T03 (enums), T05+T06 (models — different tables) |
| 1.2 | T12+T13 (service + constants), T14 standalone |
| 1.3 | T21+T22+T23+T24 (DTOs — different files) |
| 1.4 | T31+T32+T33+T34+T35 (unit tests — independent cases) |
| 2.1 | T50+T54 (helpers — no dependencies on each other) |
| 2.3 | T62+T63+T64 (unit tests — independent cases) |

### Critical Path

```
T01–T08 (schema) → T12–T20 (service) → T25–T30 (controller) → T41–T43 (e2e) → PHASE 1 DONE
                                                                      │
                                                          T49–T55 (neg service) → T59–T61 (neg controller) → T72–T74 (neg e2e) → PHASE 2 DONE
```

---

## Parallel Team Strategy (2 developers)

| Developer A | Developer B |
|---|---|
| T01–T08 (schema + migration) | — (waits or works on T09–T10 scaffold) |
| T11–T20 (onboarding service) | T21–T24 (DTOs — can start once enums exist) |
| T25–T30 (controller wiring) | T31–T43 (tests — starts as service lands) |
| T44–T48 (chat UI) | T49–T55 (negotiation service) |
| — | T56–T61 (negotiation controller) |
| — | T62–T74 (negotiation tests) |

---

## Task Summary

| Sprint | Tasks | Count | Duration |
|---|---|---|---|
| 1.1 Schema & Migration | T01–T10 | 10 | 3–4 days |
| 1.2 Onboarding Service | T11–T20 | 10 | 5–7 days |
| 1.3 Controller & DTOs | T21–T30 | 10 | 2–3 days |
| 1.4 Tests | T31–T43 | 13 | 3–4 days |
| 1.5 Chat UI | T44–T48 | 5 | 2–3 days |
| 2.1 Negotiation Service | T49–T55 | 7 | 5–7 days |
| 2.2 Negotiation Controller | T56–T61 | 6 | 2–3 days |
| 2.3 Negotiation Tests | T62–T74 | 13 | 3–4 days |
| **TOTAL** | **T01–T74** | **74** | **~5 weeks** |

---

## Exit Criteria (Full Project)

- [ ] PropertyDraft state machine enforces strict step order (no skipping)
- [ ] All 8 onboarding steps work with correct Arabic questions
- [ ] Review step shows all data and allows editing any field
- [ ] Final submit creates Property with all fields + transfers media
- [ ] Negotiation anchor at max_price × 0.85
- [ ] Concession rates: 5%/10%/15% per round bracket
- [ ] Max 6 rounds enforced — auto-fail on round 7
- [ ] Accept creates Deal atomically
- [ ] AI only formats messages — never decides
- [ ] All existing tests (205 unit + 7 e2e) still pass
- [ ] All new tests pass (onboarding unit + e2e, negotiation unit + e2e)
- [ ] `tsc --noEmit` = 0 errors
