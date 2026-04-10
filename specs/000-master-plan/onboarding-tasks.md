# Onboarding State Machine — Implementation Tasks

**Source**: [Spec](./onboarding-state-machine.md) · [Plan](./plan.md)
**Stack**: NestJS 11 · Prisma 6.x · MySQL · TypeScript strict
**Baseline**: Sprint 1.1 done (schema, migration, module scaffolds). Service code exists but has bugs.

---

## Status Key

- `[ ]` Not started · `[~]` In progress · `[x]` Done
- Each task = one focused change (≤30 min)

---

## Phase A — Fix Existing Code (compile errors)

The service file exists but does not compile. Fix before building on top.

- [ ] A1. **Fix double-comma syntax error** in `src/onboarding/onboarding.service.ts:113`
  - Current: `data: updatedData as InputJsonValue,,`
  - Fix: Remove trailing comma, import `Prisma` from `@prisma/client`, use `updatedData as Prisma.InputJsonValue`
  - File: `src/onboarding/onboarding.service.ts`
  - Verify: `npx tsc --noEmit` = 0 errors

- [ ] A2. **Update `getNextStep` signature** to accept `data` param for SHOP skip rule
  - Current: `getNextStep(current: OnboardingStep): OnboardingStep`
  - New: `getNextStep(current: OnboardingStep, data?: Record<string, unknown>): OnboardingStep`
  - Add logic: if `next === DETAILS && data?.property_type === 'SHOP'` → return `PRICE`
  - File: `src/onboarding/constants/questions.ts`
  - Verify: `npx tsc --noEmit` = 0

- [ ] A3. **Update `submitAnswer` to pass `data` to `getNextStep`**
  - Current: `const nextStep = getNextStep(step);`
  - New: `const nextStep = getNextStep(step, updatedData);`
  - File: `src/onboarding/onboarding.service.ts`
  - Verify: `npx tsc --noEmit` = 0

- [ ] A4. **Fix `finalSubmit` cross-validation for SHOP**
  - Current: always requires `details.area_m2` — breaks for shops
  - New: skip `details` requirement when `data.property_type === 'SHOP'`
  - File: `src/onboarding/onboarding.service.ts`
  - Verify: `npx tsc --noEmit` = 0

- [ ] A5. **Fix `finalSubmit` Property creation for SHOP** (no details)
  - Handle null `details` — `bedrooms: null`, `bathrooms: null`, `areaM2: null`
  - File: `src/onboarding/onboarding.service.ts`

- [ ] A6. **Run full test suite** — `npm test` + `npx tsc --noEmit`
  - Verify: 205+ unit tests pass, 0 type errors

**Checkpoint A**: Code compiles. SHOP skip rule works end-to-end.

---

## Phase B — DTOs (input validation)

Create class-validator DTOs for all controller endpoints.

- [ ] B1. **Create `StartOnboardingDto`** — `{ userId: string }`
  - Decorators: `@IsUUID()`, `@IsNotEmpty()`
  - File: `src/onboarding/dto/start-onboarding.dto.ts`

- [ ] B2. **Create `SubmitAnswerDto`** — `{ userId: string, step: OnboardingStep, answer: any }`
  - Decorators: `@IsUUID()` on userId, `@IsEnum(OnboardingStep)` on step, `@IsNotEmpty()` on answer
  - File: `src/onboarding/dto/submit-answer.dto.ts`

- [ ] B3. **Create `EditFieldDto`** — `{ userId: string, step: OnboardingStep }`
  - Decorators: `@IsUUID()` on userId, `@IsEnum(OnboardingStep)` on step
  - File: `src/onboarding/dto/edit-field.dto.ts`

- [ ] B4. **Create `UserIdQueryDto`** — `{ userId: string }`
  - Decorators: `@IsUUID()` — reused for GET /question and GET /review query params
  - File: `src/onboarding/dto/user-id-query.dto.ts`

- [ ] B5. **Create `UploadMediaDto`** — `{ userId: string, url: string, type: MediaType }`
  - Decorators: `@IsUUID()`, `@IsUrl()`, `@IsEnum(MediaType)`
  - File: `src/onboarding/dto/upload-media.dto.ts`

- [ ] B6. **Create response interfaces** — `QuestionResponseDto`, `ReviewResponseDto`
  - Pure interfaces (not class-validator, for type safety on response shape)
  - File: `src/onboarding/dto/responses.dto.ts`

- [ ] B7. **Update `dto/index.ts`** — barrel export all DTOs
  - File: `src/onboarding/dto/index.ts`

- [ ] B8. **Verify**: `npx tsc --noEmit` = 0

**Checkpoint B**: All DTOs compile. Barrel export clean.

---

## Phase C — Controller Endpoints

Wire HTTP endpoints to service methods.

- [ ] C1. **POST `/onboarding/start`** — body: `StartOnboardingDto` → `startOrResumeDraft(userId)` → return draft (201)
  - File: `src/onboarding/onboarding.controller.ts`

- [ ] C2. **GET `/onboarding/question`** — query: `UserIdQueryDto` → `getCurrentQuestion(userId)` → return `QuestionResponseDto` (200)
  - File: `src/onboarding/onboarding.controller.ts`

- [ ] C3. **POST `/onboarding/answer`** — body: `SubmitAnswerDto` → `submitAnswer(userId, step, answer)` → return draft (200)
  - File: `src/onboarding/onboarding.controller.ts`

- [ ] C4. **GET `/onboarding/review`** — query: `UserIdQueryDto` → `getReview(userId)` → return `ReviewResponseDto` (200)
  - File: `src/onboarding/onboarding.controller.ts`

- [ ] C5. **POST `/onboarding/edit`** — body: `EditFieldDto` → `editField(userId, step)` → return question (200)
  - File: `src/onboarding/onboarding.controller.ts`

- [ ] C6. **POST `/onboarding/submit`** — body: `StartOnboardingDto` (just userId) → `finalSubmit(userId)` → return Property (201)
  - File: `src/onboarding/onboarding.controller.ts`

- [ ] C7. **POST `/onboarding/upload-media`** — body: `UploadMediaDto` → `uploadMedia(userId, url, type)` → return PropertyMedia (201)
  - File: `src/onboarding/onboarding.controller.ts`

- [ ] C8. **Smoke test with curl** — hit each endpoint, verify 201/200/400/404 responses
  - Requires: MySQL running, `npx prisma migrate dev` applied

**Checkpoint C**: All 7 endpoints respond. `ValidationPipe` rejects bad input. 404 on missing drafts.

---

## Phase D — Unit Tests (Service)

Test each service method in isolation with mocked PrismaService.

- [ ] D1. **Scaffold test file** — `src/onboarding/onboarding.service.spec.ts`
  - Setup: `Test.createTestingModule` with mocked `PrismaService`
  - Mock: `prisma.propertyDraft.findFirst`, `.create`, `.update`, `prisma.property.create`, `prisma.propertyMedia.updateMany`, `prisma.propertyMedia.create`, `prisma.$transaction`

- [ ] D2. **Test `startOrResumeDraft`** — 3 cases:
  - New user → `findFirst` returns null → `create` called → returns new draft
  - Existing incomplete draft → `findFirst` returns draft → returns it (no create)
  - User with completed draft → `findFirst` returns null (completed drafts filtered) → `create` new

- [ ] D3. **Test `getCurrentQuestion`** — 3 cases:
  - Active draft at PROPERTY_TYPE → returns Arabic text + options
  - Active draft at LOCATION → returns form fields
  - No active draft → throws NotFoundException

- [ ] D4. **Test `submitAnswer` valid** — 6 cases (one per answerable step):
  - PROPERTY_TYPE + "شقة" → data.property_type = "APARTMENT", nextStep = LISTING_TYPE
  - LISTING_TYPE + "بيع" → data.listing_type = "SALE", nextStep = LOCATION
  - LOCATION + {governorate:"القاهرة"} → data.location set, nextStep = DETAILS
  - DETAILS + {area_m2:150, bedrooms:3} → data.details set, nextStep = PRICE
  - PRICE + 2500000 → data.price set, nextStep = MEDIA
  - MEDIA + null → data.media_skipped = true, nextStep = REVIEW

- [ ] D5. **Test `submitAnswer` invalid** — 5 cases:
  - Wrong step (submit PRICE when at LOCATION) → 400
  - Invalid property type "سكن" → 400
  - Missing governorate → 400
  - Price = -100 → 400
  - area_m2 = 0 → 400

- [ ] D6. **Test `submitAnswer` SHOP skip** — 1 case:
  - At LOCATION with data.property_type = "SHOP" → nextStep skips DETAILS → goes to PRICE

- [ ] D7. **Test `getReview`** — 3 cases:
  - Complete data → isComplete = true, missingFields = []
  - Missing price → isComplete = false, missingFields includes "price"
  - Empty data → isComplete = false, all required fields missing

- [ ] D8. **Test `editField`** — 3 cases:
  - At REVIEW, target = LOCATION → currentStep set to LOCATION, returns question
  - Not at REVIEW → 400
  - Target = COMPLETED → 400

- [ ] D9. **Test `finalSubmit`** — 4 cases:
  - All fields present → Property created, media transferred, draft completed
  - Missing required field → 400
  - Not at REVIEW → 400
  - SHOP without details → Property created (details null)

- [ ] D10. **Test `uploadMedia`** — 2 cases:
  - Valid URL + IMAGE → PropertyMedia created with draftId
  - Empty URL → 400

- [ ] D11. **Verify all pass**: `npm test -- --testPathPattern=onboarding.service`

**Checkpoint D**: All service unit tests pass. No regressions in existing 205 tests.

---

## Phase E — Unit Tests (Controller)

- [ ] E1. **Scaffold test file** — `src/onboarding/onboarding.controller.spec.ts`
  - Setup: `Test.createTestingModule` with mocked `OnboardingService`

- [ ] E2. **Test POST /start** — valid userId → 201 + draft, invalid body → 400

- [ ] E3. **Test GET /question** — valid userId → 200 + question, missing userId → 400

- [ ] E4. **Test POST /answer** — valid → 200 + draft, bad step enum → 400

- [ ] E5. **Test GET /review** — valid → 200, no draft → 404

- [ ] E6. **Test POST /edit** — valid → 200, bad step → 400

- [ ] E7. **Test POST /submit** — valid → 201 + property, not at review → 400

- [ ] E8. **Test POST /upload-media** — valid → 201, bad type → 400

- [ ] E9. **Verify all pass**: `npm test -- --testPathPattern=onboarding.controller`

**Checkpoint E**: Controller tests pass. Full test suite still green.

---

## Phase F — E2E Tests

- [ ] F1. **Scaffold E2E test** — `test/onboarding.e2e-spec.ts`
  - Setup: `@nestjs/testing` with real database (test DB), `supertest`

- [ ] F2. **E2E: Full happy path** — start → answer all 6 steps (PROPERTY_TYPE through MEDIA) → review → submit → verify Property in DB

- [ ] F3. **E2E: SHOP skip path** — start → "محل" → "إيجار" → location → (DETAILS skipped) → price → media → review → submit

- [ ] F4. **E2E: Resume interrupted flow** — start → answer 3 steps → new start (same userId) → verify resumes at step 4

- [ ] F5. **E2E: Edit from review** — complete to review → edit LOCATION → re-answer → verify back at next step → advance to REVIEW → submit

- [ ] F6. **Verify all pass**: `npm run test:e2e -- --testPathPattern=onboarding`

**Checkpoint F**: All E2E tests green. Existing 7 e2e tests unaffected.

---

## Phase G — Chat UI Integration

- [ ] G1. **Add onboarding state to chat.html** — JS state: `{ draftId, currentStep }`. On page load call `POST /onboarding/start`, then `GET /onboarding/question`

- [ ] G2. **Multi-choice renderer** — for `inputType: "multi_choice"`, render clickable option pills. Clicking sends `POST /onboarding/answer` with the selected Arabic text

- [ ] G3. **Form renderer** — for `inputType: "form"`, render labeled input fields (Arabic labels from `fields[]`). Submit button collects all fields into an object and sends `POST /onboarding/answer`

- [ ] G4. **Number input renderer** — for `inputType: "number"`, render number input with "جنيه" label. Validate positive number client-side. Submit sends `POST /onboarding/answer`

- [ ] G5. **File upload / skip** — for `inputType: "file"`, render upload button + "تخطي" (skip) button. Upload calls `POST /onboarding/upload-media`. Skip sends `POST /onboarding/answer` with null

- [ ] G6. **Review screen** — when step = REVIEW, call `GET /onboarding/review`, render all data as a summary card. Each field has an "تعديل" (edit) button → calls `POST /onboarding/edit`

- [ ] G7. **Submit button** — on review screen, "تأكيد" (confirm) button calls `POST /onboarding/submit`. Show success message with Property details

- [ ] G8. **Disable free text input** — when onboarding is active, lock the text input box. Only structured inputs allowed

- [ ] G9. **Wire NestJS backend URL** — chat.html currently calls FastAPI `/chat`. Add toggle or detect: if onboarding active → call NestJS `/onboarding/*` endpoints. Requires CORS config on NestJS side (already enabled in main.ts)

**Checkpoint G**: Full onboarding works in browser. Structured input per step. Review + edit + submit functional.

---

## Execution Order

```
A1 → A2 → A3 → A4 → A5 → A6  (fix existing code, ~1 hour)
     ↓
B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8  (DTOs, ~1 hour)
     ↓
C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8  (controller, ~2 hours)
     ↓
D1 → D2..D11  (service tests, ~3 hours)
     ↓
E1 → E2..E9   (controller tests, ~2 hours)
     ↓
F1 → F2..F6   (E2E tests, ~2 hours)
     ↓
G1 → G2..G9   (Chat UI, ~4 hours)
```

**Total**: ~43 tasks, ~15 hours estimated (single developer)
