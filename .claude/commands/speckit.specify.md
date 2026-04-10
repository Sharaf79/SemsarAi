# Semsar AI: Technical Specification (v3.0)

**Based on**: Constitution — 2-Phase Architecture (Data Collection + Negotiation Engine)
**Created**: 2026-03-31
**Status**: Active
**Stack**: NestJS 11 · Prisma 6.x · MySQL · Gemini 2.5 Flash · FastAPI (Chat UI)

---

## 1. System Architecture Overview

Semsar AI is a **controlled real-estate platform** with two distinct phases:

| Phase | Name | Mode | AI Role |
|-------|------|------|---------|
| **Phase 1** | Guided Data Collection | Chat-based State Machine | Communication layer — asks questions, validates answers |
| **Phase 2** | Negotiation Engine | Algorithm-driven (no free chat) | Message formatter only — all decisions by algorithm |

### Core Principles
- **No free chat** — every interaction is structured (multi-choice / bounded input)
- **AI does NOT decide** — backend enforces all logic, AI only formats messages
- **State machine driven** — users cannot skip steps
- **One question per step** — sequential, never parallel
- **Data saved progressively** — draft JSON updated after every answer

### Technology Stack
- **Backend**: NestJS 11 + Prisma 6.x + MySQL
- **LLM**: Gemini 2.5 Flash (message formatting & extraction only)
- **Chat UI**: FastAPI + static HTML (development/demo)
- **Production Channel**: WhatsApp Cloud API (future)
- **Language**: Egyptian Arabic (polite register) — فصحى in UI, عامية مهذبة in chat

---

## 2. Database Schema

### 2.1 Existing Models (Keep As-Is)

The following models from the current Prisma schema remain unchanged:

- **User** — user accounts with phone, email, status, type
- **LowerOffice** — real estate offices/brokers
- **Deal** — finalized deals (created after successful negotiation)
- **Payment** — payment records (deposit, commission, insurance)
- **AiLog** — AI interaction audit trail

### 2.2 Models to Modify

#### Property (Enhanced)

Add `property_type` field and ensure alignment with constitution fields:

```prisma
model Property {
  id              String         @id @default(uuid())
  userId          String         @map("user_id")
  title           String
  description     String?        @db.Text
  price           Decimal        @db.Decimal(14, 2)
  type            PropertyType                        // SALE | RENT
  propertyKind    PropertyKind   @map("property_kind") // APARTMENT | VILLA | SHOP | OFFICE
  bedrooms        Int?
  bathrooms       Int?
  areaM2          Decimal?       @db.Decimal(10, 2) @map("area_m2")
  country         String         @default("Egypt")
  governorate     String?
  city            String?
  district        String?
  zone            String?
  street          String?
  nearestLandmark String?        @map("nearest_landmark")
  latitude        Decimal?       @db.Decimal(10, 8)
  longitude       Decimal?       @db.Decimal(11, 8)
  propertyStatus  PropertyStatus @default(ACTIVE) @map("property_status")
  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt @map("updated_at")

  user            User           @relation(fields: [userId], references: [id])
  media           PropertyMedia[]
  negotiations    Negotiation[]
  drafts          PropertyDraft[]
}
```

### 2.3 New Models (Add)

#### PropertyDraft

Tracks the onboarding state machine progress. One active draft per user at a time.

```prisma
model PropertyDraft {
  id          String          @id @default(uuid())
  userId      String          @map("user_id")
  propertyId  String?         @map("property_id")   // set after submit
  currentStep OnboardingStep  @default(PROPERTY_TYPE) @map("current_step")
  data        Json            @default("{}")          // accumulated answers
  isCompleted Boolean         @default(false) @map("is_completed")
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  user        User            @relation(fields: [userId], references: [id])
  property    Property?       @relation(fields: [propertyId], references: [id])
  media       PropertyMedia[]

  @@index([userId])
  @@index([isCompleted])
  @@map("property_drafts")
}
```

#### PropertyMedia

Media files linked first to draft, then transferred to property on submit.

```prisma
model PropertyMedia {
  id         String    @id @default(uuid())
  draftId    String?   @map("draft_id")
  propertyId String?   @map("property_id")
  url        String
  type       MediaType                      // IMAGE | VIDEO
  createdAt  DateTime  @default(now()) @map("created_at")

  draft      PropertyDraft? @relation(fields: [draftId], references: [id])
  property   Property?      @relation(fields: [propertyId], references: [id])

  @@index([draftId])
  @@index([propertyId])
  @@map("property_media")
}
```

### 2.4 New Enums

```prisma
enum OnboardingStep {
  PROPERTY_TYPE    // "حضرتك نوع العقار ايه؟"
  LISTING_TYPE     // "عايز تبيع ولا تأجر؟"
  LOCATION         // governorate, city, district, zone, nearest_landmark
  DETAILS          // bedrooms, bathrooms, area
  PRICE            // "السعر المتوقع كام؟"
  MEDIA            // "تحب تضيف صور أو فيديوهات؟"
  REVIEW           // editable summary form
  COMPLETED        // final state
}

enum PropertyKind {
  APARTMENT
  VILLA
  SHOP
  OFFICE
}

enum MediaType {
  IMAGE
  VIDEO
}
```

### 2.5 Negotiation Models (Already Exist — Verify)

The current schema already has `Negotiation` and `Offer` models. Verify they match the constitution:

| Field | Constitution | Current Schema | Status |
|-------|-------------|----------------|--------|
| `min_price` | ✅ seller's minimum | ✅ exists | ✔ Match |
| `max_price` | ✅ buyer's maximum | ✅ exists | ✔ Match |
| `current_offer` | ✅ | ✅ exists | ✔ Match |
| `round_number` | ✅ | ✅ exists | ✔ Match |
| `status` | active/agreed/failed | ACTIVE/AGREED/FAILED | ✔ Match |
| `offers.created_by` | AI | default "AI" | ✔ Match |

**No changes needed** to Negotiation/Offer models.

---

## 3. Phase 1: Guided Data Collection Engine

### 3.1 State Machine Flow

```
PROPERTY_TYPE → LISTING_TYPE → LOCATION → DETAILS → PRICE → MEDIA → REVIEW → COMPLETED
     ↑                                                                  │
     └──────────────────── (user edits from review) ────────────────────┘
```

**Rules:**
- Each step = exactly one question
- User cannot skip forward
- User CAN go back from REVIEW to any previous step
- Answers stored progressively in `PropertyDraft.data` (JSON)
- After REVIEW confirmation → create Property + attach media → mark draft COMPLETED

### 3.2 Question Definitions

| Step | Question (Arabic) | Input Type | Options / Fields |
|------|-------------------|------------|------------------|
| `PROPERTY_TYPE` | "حضرتك نوع العقار ايه؟" | Multi-choice | شقة · فيلا · محل · مكتب |
| `LISTING_TYPE` | "عايز تبيع ولا تأجر؟" | Multi-choice | بيع · إيجار |
| `LOCATION` | "حدد الموقع من فضلك" | Structured form | governorate, city, district, zone, nearest_landmark |
| `DETAILS` | "تفاصيل العقار" | Structured form | bedrooms, bathrooms, area_m2 |
| `PRICE` | "السعر المتوقع كام؟" | Numeric input | Free number (EGP) |
| `MEDIA` | "تحب تضيف صور أو فيديوهات؟" | File upload + skip | Upload or "تخطي" |
| `REVIEW` | "راجع البيانات وأكد" | Editable summary | All fields displayed, each editable |

### 3.3 Onboarding Service

```typescript
// src/onboarding/onboarding.service.ts

class OnboardingService {
  // Start a new draft or resume existing incomplete one
  async startOrResumeDraft(userId: string): Promise<PropertyDraft>

  // Get the current question for the user's active draft
  async getCurrentQuestion(userId: string): Promise<QuestionResponse>

  // Submit an answer for the current step, validate, advance
  async submitAnswer(userId: string, step: OnboardingStep, answer: any): Promise<PropertyDraft>

  // Get all collected data for review
  async getReview(userId: string): Promise<ReviewResponse>

  // Edit a specific field from review (go back to that step)
  async editField(userId: string, step: OnboardingStep): Promise<QuestionResponse>

  // Final submit: create Property, transfer media, mark complete
  async finalSubmit(userId: string): Promise<Property>

  // Upload media file to draft
  async uploadMedia(userId: string, file: UploadedFile): Promise<PropertyMedia>
}
```

### 3.4 Step Validation Rules

| Step | Validation |
|------|-----------|
| `PROPERTY_TYPE` | Must be one of: APARTMENT, VILLA, SHOP, OFFICE |
| `LISTING_TYPE` | Must be one of: SALE, RENT |
| `LOCATION` | `governorate` required, others optional |
| `DETAILS` | `area_m2` required, `bedrooms`/`bathrooms` required for APARTMENT/VILLA |
| `PRICE` | Positive number, > 0 |
| `MEDIA` | Optional — user can skip |
| `REVIEW` | All required fields must be present |

### 3.5 Draft Data JSON Structure

```json
{
  "property_type": "APARTMENT",
  "listing_type": "SALE",
  "location": {
    "governorate": "القاهرة",
    "city": "مدينة نصر",
    "district": "الحي الثامن",
    "zone": null,
    "nearest_landmark": "سيتي ستارز"
  },
  "details": {
    "bedrooms": 3,
    "bathrooms": 2,
    "area_m2": 150
  },
  "price": 2500000
}
```

---

## 4. Phase 2: Negotiation Engine

### 4.1 Flow

```
1. Property listed (from Phase 1)
2. Buyer expresses interest → sets max_price (budget)
3. Seller has already set listing price → system extracts min_price
4. Engine starts negotiation
5. Engine calculates offers algorithmically (NO AI decisions)
6. AI formats messages in Arabic
7. Max 6 rounds → AGREED or FAILED
```

### 4.2 Algorithm Specification

#### First Offer (Anchor)
```
initial_offer = max_price × 0.85
```

#### Concession Formula
```
gap = max_price − min_price

concession_rate:
  round 1-2  → 5%
  round 3-5  → 10%
  round 6+   → 15%

counter_offer = current_offer + (gap × concession_rate)
```

#### Decision Logic
```
function nextStep(negotiation):
  if current_offer >= min_price → ACCEPT (status = AGREED)
  if round_number > 6          → FAIL   (status = FAILED)
  else                         → COUNTER (new offer)
```

### 4.3 Negotiation Service

```typescript
// src/negotiation/negotiation.service.ts

class NegotiationService {
  // Start negotiation between buyer and seller for a property
  async startNegotiation(propertyId: string, buyerId: string): Promise<Negotiation>

  // Calculate and apply next step (counter/accept/fail)
  async nextStep(negotiationId: string): Promise<NegotiationStepResult>

  // Get current negotiation status
  async getStatus(negotiationId: string): Promise<NegotiationStatus>

  // Internal: calculate counter offer
  private calculateCounterOffer(negotiation: Negotiation): Decimal

  // Internal: determine concession rate by round
  private getConcessionRate(round: number): number

  // Internal: format AI message for the step
  private formatMessage(action: 'counter' | 'accept' | 'reject', offer?: Decimal): string
}
```

### 4.4 User Actions (Bounded — No Free Text)

| Action | Description | Allowed When |
|--------|------------|--------------|
| `accept` | Accept current offer | Any active round |
| `reject` | Reject and end negotiation | Any active round |
| `request_counter` | Ask engine for next counter | Active + rounds remaining |

### 4.5 AI Message Templates (Egyptian Arabic)

| Action | Message |
|--------|---------|
| Counter | "بكل احترام، السعر الحالي هو {price} جنيه. هل يناسب حضرتك؟" |
| Accept | "تم الاتفاق على {price} جنيه. برجاء استكمال الدفع." |
| Reject | "نأسف، لم نتمكن من الوصول لاتفاق مناسب." |

---

## 5. API Endpoints

### 5.1 Phase 1 — Onboarding

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `POST` | `/onboarding/start` | Start or resume draft | `{ userId }` | `PropertyDraft` |
| `GET` | `/onboarding/question` | Get current question | Query: `userId` | `QuestionResponse` |
| `POST` | `/onboarding/answer` | Submit answer | `{ userId, step, answer }` | `PropertyDraft` |
| `GET` | `/onboarding/review` | Get review summary | Query: `userId` | `ReviewResponse` |
| `POST` | `/onboarding/submit` | Final submit | `{ userId }` | `Property` |
| `POST` | `/onboarding/upload-media` | Upload file | `{ userId, file }` multipart | `PropertyMedia` |

### 5.2 Phase 2 — Negotiation

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `POST` | `/negotiation/start` | Start negotiation | `{ propertyId, buyerId }` | `Negotiation` |
| `POST` | `/negotiation/next-step` | Execute next step | `{ negotiationId, action }` | `NegotiationStepResult` |
| `GET` | `/negotiation/status` | Get negotiation status | Query: `negotiationId` | `NegotiationStatusResponse` |

### 5.3 DTOs

```typescript
// ── Onboarding DTOs ──

class StartOnboardingDto {
  @IsUUID() userId: string;
}

class SubmitAnswerDto {
  @IsUUID() userId: string;
  @IsEnum(OnboardingStep) step: OnboardingStep;
  @IsNotEmpty() answer: any; // validated per step
}

class QuestionResponse {
  step: OnboardingStep;
  question: string;        // Arabic text
  inputType: 'multi-choice' | 'form' | 'number' | 'file';
  options?: string[];      // for multi-choice
  fields?: FieldDef[];     // for form-type
}

class ReviewResponse {
  draft: PropertyDraft;
  data: Record<string, any>;
  isComplete: boolean;
  missingFields: string[];
}

// ── Negotiation DTOs ──

class StartNegotiationDto {
  @IsUUID() propertyId: string;
  @IsUUID() buyerId: string;
}

class NextStepDto {
  @IsUUID() negotiationId: string;
  @IsEnum(['accept', 'reject', 'request_counter']) action: string;
}

class NegotiationStepResult {
  negotiation: Negotiation;
  action: 'counter' | 'accept' | 'reject';
  message: string;         // Arabic AI-formatted message
  offer?: Decimal;
  isComplete: boolean;
}

class NegotiationStatusResponse {
  negotiation: Negotiation;
  offers: Offer[];
  currentRound: number;
  maxRounds: number;       // always 6
}
```

---

## 6. NestJS Module Structure

```
backend/src/
├── onboarding/
│   ├── onboarding.module.ts
│   ├── onboarding.controller.ts
│   ├── onboarding.service.ts
│   ├── dto/
│   │   ├── start-onboarding.dto.ts
│   │   ├── submit-answer.dto.ts
│   │   └── question-response.dto.ts
│   └── constants/
│       └── questions.ts          # Arabic question text + options
├── negotiation/
│   ├── negotiation.module.ts
│   ├── negotiation.controller.ts
│   ├── negotiation.service.ts
│   └── dto/
│       ├── start-negotiation.dto.ts
│       ├── next-step.dto.ts
│       └── negotiation-response.dto.ts
├── property/                      # (existing, may need updates)
├── prisma/                        # (existing PrismaService)
├── gemini/                        # (existing GeminiService)
└── ...
```

---

## 7. Chat UI Integration (FastAPI)

The existing FastAPI chat UI (`app/static/chat.html`) will be updated to work with the new structured onboarding flow:

### Current → New Behavior

| Aspect | Old (Free Chat) | New (State Machine) |
|--------|-----------------|---------------------|
| Input | Free text always | Multi-choice buttons / structured forms |
| Flow | AI decides next question | Backend state machine controls flow |
| Storage | In-memory sessions | PropertyDraft in DB |
| Skip | User could skip questions | Impossible — strict order |
| Review | No review step | Full editable review before submit |

### UI Changes Required
- Render multi-choice options as clickable buttons (already implemented)
- Add form-mode for LOCATION and DETAILS steps (new)
- Add file upload widget for MEDIA step (new)
- Add review/edit screen for REVIEW step (new)
- Disable free text input when current step expects structured answer

---

## 8. Migration from Old Schema

### Models to Deprecate (Phase Out)

The following old intake models should be kept for backward compatibility but are **superseded** by the new onboarding flow:

| Old Model | Replaced By | Action |
|-----------|-------------|--------|
| `Conversation` | `PropertyDraft` (state machine) | Keep but stop using in new flows |
| `Listing` | `Property` (enhanced) | Keep but stop creating new ones |
| `Unit` | `Property` (direct) | Keep but stop creating new ones |

### Migration Steps

1. Add new models (`PropertyDraft`, `PropertyMedia`) and enums to Prisma schema
2. Add `propertyKind` field to `Property` model
3. Run `prisma migrate dev`
4. Create `OnboardingModule` and `NegotiationModule`
5. Update Chat UI to call new `/onboarding/*` endpoints
6. Old WhatsApp webhook flow continues working (no breaking changes)

---

## 9. Security & Validation

| Concern | Implementation |
|---------|---------------|
| Step order enforcement | Service validates `currentStep` matches submitted step |
| Input validation | DTOs with class-validator decorators |
| User isolation | All queries filtered by `userId` |
| Media upload | File type whitelist (jpg, png, mp4), size limit (10MB) |
| Negotiation integrity | Users cannot modify offers — engine-only |
| API keys | All in environment variables (Gemini, DB) |
| Body size limit | Already configured in main.ts |

---

## 10. Testing Strategy

### Unit Tests

| Module | Tests |
|--------|-------|
| `OnboardingService` | startOrResumeDraft, getCurrentQuestion (each step), submitAnswer (valid/invalid), finalSubmit, step order enforcement |
| `NegotiationService` | startNegotiation, calculateCounterOffer (each round), getConcessionRate, nextStep (counter/accept/fail), max rounds |
| `OnboardingController` | Each endpoint with valid/invalid input |
| `NegotiationController` | Each endpoint with valid/invalid input |

### Integration Tests (E2E)

1. **Full onboarding flow**: Start → answer all steps → review → submit → verify Property created
2. **Onboarding resume**: Start → answer 3 steps → close → resume → verify correct step
3. **Review edit**: Complete to review → edit field → verify goes back to correct step
4. **Full negotiation**: Start → 3 rounds of counter → accept → verify Deal created
5. **Negotiation failure**: Start → 6 rounds → fail → verify status FAILED
6. **Media upload**: Upload during MEDIA step → submit → verify attached to Property

---

## 11. Success Criteria

- [ ] `PropertyDraft` state machine enforces strict step order
- [ ] All 8 onboarding steps work with correct Arabic questions
- [ ] Review step shows all data and allows editing
- [ ] Final submit creates `Property` with all fields populated
- [ ] Media uploaded to draft is transferred to property on submit
- [ ] Negotiation engine calculates correct offers per formula
- [ ] First offer anchors at `max_price × 0.85`
- [ ] Concession rates match spec (5%/10%/15% by round bracket)
- [ ] Max 6 rounds enforced
- [ ] AI only formats messages — never decides
- [ ] All existing tests (205 unit + 7 e2e) continue passing
- [ ] New modules have full test coverage
