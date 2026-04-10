# Onboarding State Machine — Full Specification

**Created**: 2026-03-31
**Status**: Active
**Parent**: [Master Plan](./plan.md)
**Implements**: Phase 1 — Guided Data Collection Engine

---

## 1. Overview

The Onboarding State Machine collects property data from users through a **strict, linear sequence of steps**. There is no free chat. The backend enforces step order, validates every answer, and stores progress in `property_drafts.data` (JSON). AI is never involved in flow control.

### Core Invariants

1. **One active draft per user** — `WHERE userId = ? AND isCompleted = false`.
2. **One question per step** — no compound screens, no batching.
3. **No skipping** — `submitAnswer` rejects if `step ≠ draft.currentStep`.
4. **Progressive save** — every accepted answer is merged into `draft.data` immediately.
5. **Idempotent resume** — calling `startOrResumeDraft` always returns the same active draft.

---

## 2. Steps

| # | Step Enum | Input Type | Purpose |
|---|---|---|---|
| 0 | `PROPERTY_TYPE` | `multi_choice` | What kind of property? |
| 1 | `LISTING_TYPE` | `multi_choice` | Sell or rent? |
| 2 | `LOCATION` | `form` | Where is the property? |
| 3 | `DETAILS` | `form` | Bedrooms, bathrooms, area |
| 4 | `PRICE` | `number` | Expected price (EGP) |
| 5 | `MEDIA` | `file` | Photos/videos (optional) |
| 6 | `REVIEW` | `display` | Editable summary |
| 7 | `COMPLETED` | — | Terminal state (draft submitted) |

---

## 3. Question Definitions

Each step maps to exactly one question shown to the user.

### 3.1 PROPERTY_TYPE

```json
{
  "step": "PROPERTY_TYPE",
  "message": "حضرتك نوع العقار ايه؟",
  "inputType": "multi_choice",
  "options": ["شقة", "فيلا", "محل", "مكتب"]
}
```

**Arabic → Enum mapping**:

| User Input | Stored Value (`PropertyKind`) |
|---|---|
| شقة | `APARTMENT` |
| فيلا | `VILLA` |
| محل | `SHOP` |
| مكتب | `OFFICE` |

**Saved to `draft.data`**: `{ "property_type": "APARTMENT" }`

### 3.2 LISTING_TYPE

```json
{
  "step": "LISTING_TYPE",
  "message": "عايز تبيع ولا تأجر؟",
  "inputType": "multi_choice",
  "options": ["بيع", "إيجار"]
}
```

**Arabic → Enum mapping**:

| User Input | Stored Value |
|---|---|
| بيع | `SALE` |
| إيجار | `RENT` |

**Saved to `draft.data`**: `{ "listing_type": "SALE" }`

### 3.3 LOCATION

```json
{
  "step": "LOCATION",
  "message": "حدد الموقع من فضلك",
  "inputType": "form",
  "fields": [
    { "name": "governorate", "label": "المحافظة", "required": true },
    { "name": "city", "label": "المدينة", "required": false },
    { "name": "district", "label": "الحي", "required": false },
    { "name": "zone", "label": "المنطقة", "required": false },
    { "name": "nearest_landmark", "label": "أقرب معلم", "required": false }
  ]
}
```

**Saved to `draft.data`**:
```json
{
  "location": {
    "governorate": "القاهرة",
    "city": "مدينة نصر",
    "district": "الحي الثامن",
    "zone": null,
    "nearest_landmark": "سيتي ستارز"
  }
}
```

### 3.4 DETAILS

```json
{
  "step": "DETAILS",
  "message": "تفاصيل العقار",
  "inputType": "form",
  "fields": [
    { "name": "area_m2", "label": "المساحة (م²)", "required": true },
    { "name": "bedrooms", "label": "عدد الغرف", "required": false },
    { "name": "bathrooms", "label": "عدد الحمامات", "required": false }
  ]
}
```

**Saved to `draft.data`**:
```json
{
  "details": {
    "area_m2": 150,
    "bedrooms": 3,
    "bathrooms": 2
  }
}
```

### 3.5 PRICE

```json
{
  "step": "PRICE",
  "message": "السعر المتوقع كام؟",
  "inputType": "number"
}
```

**Saved to `draft.data`**: `{ "price": 2500000 }`

### 3.6 MEDIA

```json
{
  "step": "MEDIA",
  "message": "تحب تضيف صور أو فيديوهات؟",
  "inputType": "file"
}
```

**Behavior**: User can upload files or skip. Media records are created in `property_media` table with `draft_id`. Skipping saves `{ "media_skipped": true }`.

### 3.7 REVIEW

```json
{
  "step": "REVIEW",
  "message": "راجع البيانات وأكد",
  "inputType": "display"
}
```

**Behavior**: Read-only summary of all `draft.data`. User can:
- **Edit any field** → calls `editField(userId, targetStep)` → step rewinds to that step.
- **Submit** → calls `finalSubmit(userId)` → creates `Property`.

### 3.8 COMPLETED

Terminal state. No question. Draft is `isCompleted = true`. No further mutations allowed.

---

## 4. Transitions

### 4.1 Default Linear Order

```
PROPERTY_TYPE → LISTING_TYPE → LOCATION → DETAILS → PRICE → MEDIA → REVIEW → COMPLETED
```

### 4.2 Dynamic Skip Rule

| Condition | Effect |
|---|---|
| `draft.data.property_type === "SHOP"` | Skip `DETAILS` → go from `LOCATION` directly to `PRICE` |

**Rationale**: Shops don't have bedrooms/bathrooms. `area_m2` is the only relevant detail for shops, and it will be made optional in this case (shops often don't list precise m² in the Egyptian market).

### 4.3 Transition Function

```typescript
function getNextStep(
  currentStep: OnboardingStep,
  data: Record<string, unknown>,
): OnboardingStep {
  const LINEAR: OnboardingStep[] = [
    'PROPERTY_TYPE',
    'LISTING_TYPE',
    'LOCATION',
    'DETAILS',
    'PRICE',
    'MEDIA',
    'REVIEW',
    'COMPLETED',
  ];

  const idx = LINEAR.indexOf(currentStep);
  if (idx === -1 || idx + 1 >= LINEAR.length) return 'COMPLETED';

  let next = LINEAR[idx + 1];

  // Dynamic skip: SHOP → skip DETAILS
  if (next === 'DETAILS' && data.property_type === 'SHOP') {
    next = 'PRICE';
  }

  return next;
}
```

### 4.4 Edit-from-Review Flow

When `editField(userId, targetStep)` is called:

1. `currentStep` is set back to `targetStep`.
2. User answers that one step.
3. `submitAnswer` advances to `getNextStep(targetStep, data)`.
4. If the next step already has data and isn't the REVIEW step, it continues advancing automatically until REVIEW is reached **OR** the system advances one step at a time and the user re-answers each subsequent step.

**Chosen approach**: Advance **one step at a time**. After re-answering the edited step, the draft advances forward normally. If intermediate steps already have data, the user can re-confirm or change them. This is simpler to implement and avoids silent data assumptions.

**Exception**: If the user only wanted to change one field, the UI can call `submitAnswer` for that step and then the backend will advance. The UI should check if `nextStep === 'REVIEW'` and if not, continue showing questions. The backend doesn't auto-skip — it always lands on the literal next step.

---

## 5. Validation Rules

### 5.1 Per-Step Validation

| Step | Rule | Error Message |
|---|---|---|
| `PROPERTY_TYPE` | Must be one of: `شقة`, `فيلا`, `محل`, `مكتب` | `اختيار غير صحيح. الاختيارات المتاحة: شقة، فيلا، محل، مكتب` |
| `LISTING_TYPE` | Must be one of: `بيع`, `إيجار` | `اختيار غير صحيح. الاختيارات المتاحة: بيع، إيجار` |
| `LOCATION` | Must be an object. `governorate` is a non-empty string. Other fields are optional strings or null. | `المحافظة مطلوبة` |
| `DETAILS` | Must be an object. `area_m2` > 0 (required). `bedrooms` ≥ 0 (optional integer). `bathrooms` ≥ 0 (optional integer). | `المساحة مطلوبة ولازم تكون رقم أكبر من صفر` |
| `PRICE` | Must be a positive number. | `السعر لازم يكون رقم أكبر من صفر` |
| `MEDIA` | No validation (optional). Skip = `{ media_skipped: true }`. | — |

### 5.2 Cross-Step Validation (at `finalSubmit`)

Before creating the `Property`, validate the complete `draft.data`:

| Field | Required | Condition |
|---|---|---|
| `property_type` | ✅ Always | Must be valid `PropertyKind` enum value |
| `listing_type` | ✅ Always | Must be `SALE` or `RENT` |
| `location.governorate` | ✅ Always | Non-empty string |
| `details.area_m2` | ✅ Unless `property_type === 'SHOP'` | Positive number |
| `price` | ✅ Always | Positive number |
| `details` | ✅ Unless `property_type === 'SHOP'` | Object with at least `area_m2` |

### 5.3 Step-Order Guard

Every call to `submitAnswer(userId, step, answer)` checks:

```
if (draft.currentStep !== step) → 400 Bad Request
```

This prevents:
- Submitting out of order
- Re-submitting already-completed steps (except via `editField`)
- Submitting for `REVIEW` or `COMPLETED` (which have no answer)

---

## 6. Data Model

### 6.1 `property_drafts` Table

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | UUID | auto | Primary key |
| `user_id` | UUID | — | FK → `users.id` |
| `property_id` | UUID? | null | FK → `properties.id` (set on submit) |
| `current_step` | `OnboardingStep` | `PROPERTY_TYPE` | Current position in state machine |
| `data` | JSON | `{}` | Progressive data blob |
| `is_completed` | Boolean | `false` | Terminal flag |
| `created_at` | DateTime | now | — |
| `updated_at` | DateTime | auto | — |

### 6.2 `draft.data` Schema (Accumulated JSON)

After all steps are complete, `draft.data` looks like:

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
    "area_m2": 150,
    "bedrooms": 3,
    "bathrooms": 2
  },
  "price": 2500000,
  "media_skipped": false
}
```

For a SHOP (no details step):

```json
{
  "property_type": "SHOP",
  "listing_type": "RENT",
  "location": {
    "governorate": "الجيزة",
    "city": "الشيخ زايد",
    "district": null,
    "zone": null,
    "nearest_landmark": null
  },
  "price": 15000,
  "media_skipped": true
}
```

### 6.3 `property_media` Table

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `draft_id` | UUID? | FK → `property_drafts.id` (while in draft) |
| `property_id` | UUID? | FK → `properties.id` (after submit) |
| `url` | String | File URL |
| `type` | `MediaType` | `IMAGE` or `VIDEO` |
| `created_at` | DateTime | — |

**Transfer on submit**: `UPDATE property_media SET property_id = ?, draft_id = NULL WHERE draft_id = ?`

---

## 7. Service Contract

### 7.1 `startOrResumeDraft(userId: string)`

**Purpose**: Get or create the user's active draft.

**Logic**:
1. `SELECT * FROM property_drafts WHERE user_id = ? AND is_completed = false LIMIT 1`
2. If found → return it (resume).
3. If not found → `INSERT` new draft with `current_step = PROPERTY_TYPE`, `data = {}`, `is_completed = false`.
4. Return the draft.

**Response**:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "currentStep": "PROPERTY_TYPE",
  "data": {},
  "isCompleted": false,
  "createdAt": "2026-03-31T...",
  "updatedAt": "2026-03-31T..."
}
```

**Errors**:
- None (always succeeds).

---

### 7.2 `getCurrentQuestion(userId: string)`

**Purpose**: Return the question definition for the user's current step.

**Logic**:
1. Get active draft (404 if none).
2. Look up `ONBOARDING_QUESTIONS[draft.currentStep]`.
3. Return structured response.

**Response**:
```json
{
  "step": "LOCATION",
  "message": "حدد الموقع من فضلك",
  "inputType": "form",
  "options": null,
  "fields": [
    { "name": "governorate", "label": "المحافظة", "required": true },
    { "name": "city", "label": "المدينة", "required": false },
    { "name": "district", "label": "الحي", "required": false },
    { "name": "zone", "label": "المنطقة", "required": false },
    { "name": "nearest_landmark", "label": "أقرب معلم", "required": false }
  ]
}
```

**Errors**:
| Code | Condition |
|---|---|
| `404` | No active draft for this user |

---

### 7.3 `submitAnswer(userId: string, step: OnboardingStep, answer: unknown)`

**Purpose**: Validate and save the user's answer, advance to next step.

**Logic**:
1. Get active draft (404 if none).
2. Guard: `draft.currentStep === step` (400 if mismatch).
3. Guard: `step ≠ REVIEW` and `step ≠ COMPLETED` (400).
4. Validate answer per step rules (see §5.1).
5. Merge validated data into `draft.data`.
6. Compute `nextStep = getNextStep(step, draft.data)`.
7. `UPDATE property_drafts SET current_step = nextStep, data = mergedData WHERE id = draft.id`.
8. Return updated draft.

**Response**:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "currentStep": "DETAILS",
  "data": {
    "property_type": "APARTMENT",
    "listing_type": "SALE",
    "location": { "governorate": "القاهرة", ... }
  },
  "isCompleted": false
}
```

**Errors**:
| Code | Condition |
|---|---|
| `400` | Step mismatch (`expected X, got Y`) |
| `400` | Invalid answer (fails validation) |
| `400` | Step is `REVIEW` or `COMPLETED` |
| `404` | No active draft |

---

### 7.4 `getNextStep(currentStep: OnboardingStep, data: Record<string, unknown>)`

**Purpose**: Pure function. Determine the next step given current step and accumulated data.

**Logic**:
```
LINEAR = [PROPERTY_TYPE, LISTING_TYPE, LOCATION, DETAILS, PRICE, MEDIA, REVIEW, COMPLETED]
idx = LINEAR.indexOf(currentStep)
next = LINEAR[idx + 1]

if (next === DETAILS && data.property_type === 'SHOP'):
    next = PRICE

return next
```

**This is NOT an endpoint** — it's an internal helper called by `submitAnswer`.

---

### 7.5 `getReview(userId: string)`

**Purpose**: Return all collected data for the user to review before submission.

**Logic**:
1. Get active draft (404 if none).
2. Read `draft.data`.
3. Check required fields are present:
   - `property_type` — always required
   - `listing_type` — always required
   - `location.governorate` — always required
   - `details.area_m2` — required unless `property_type === 'SHOP'`
   - `price` — always required
4. Return data + completeness status + list of missing fields.

**Response** (complete):
```json
{
  "draft": { "id": "uuid", "currentStep": "REVIEW", ... },
  "data": {
    "property_type": "APARTMENT",
    "listing_type": "SALE",
    "location": { "governorate": "القاهرة", "city": "مدينة نصر", ... },
    "details": { "area_m2": 150, "bedrooms": 3, "bathrooms": 2 },
    "price": 2500000,
    "media_skipped": false
  },
  "isComplete": true,
  "missingFields": []
}
```

**Response** (incomplete):
```json
{
  "draft": { ... },
  "data": { "property_type": "APARTMENT", "listing_type": "SALE" },
  "isComplete": false,
  "missingFields": ["location.governorate", "details.area_m2", "price"]
}
```

**Errors**:
| Code | Condition |
|---|---|
| `404` | No active draft |

---

### 7.6 `editField(userId: string, targetStep: OnboardingStep)`

**Purpose**: Rewind to a previous step from REVIEW so the user can change their answer.

**Logic**:
1. Get active draft (404 if none).
2. Guard: `draft.currentStep === REVIEW` (400 if not at review).
3. Guard: `targetStep ∉ {REVIEW, COMPLETED}` (400 — can't "edit" these).
4. `UPDATE property_drafts SET current_step = targetStep WHERE id = draft.id`.
5. Return the question definition for `targetStep`.

**Response**:
```json
{
  "draft": { "id": "uuid", "currentStep": "LOCATION", ... },
  "step": "LOCATION",
  "message": "حدد الموقع من فضلك",
  "inputType": "form",
  "fields": [...]
}
```

**Errors**:
| Code | Condition |
|---|---|
| `400` | Not at REVIEW step |
| `400` | Target step is REVIEW or COMPLETED |
| `404` | No active draft |

---

### 7.7 `finalSubmit(userId: string)`

**Purpose**: Create a `Property` from the completed draft. Transfer media. Mark draft as done.

**Logic** (single Prisma transaction):
1. Get active draft (404 if none).
2. Guard: `draft.currentStep === REVIEW` (400 if not).
3. Run cross-step validation (§5.2). Reject if any required field missing.
4. **Create Property**:
   ```sql
   INSERT INTO properties (
     user_id, title, price, type, property_kind,
     bedrooms, bathrooms, area_m2,
     governorate, city, district, zone, nearest_landmark
   ) VALUES (...)
   ```
   - `title` = auto-generated: `"{PropertyKind} for {type}"` (e.g., `"APARTMENT for sale"`)
   - `price` = `draft.data.price`
   - `type` = `SALE` or `RENT` from `draft.data.listing_type`
   - `propertyKind` = `draft.data.property_type` as `PropertyKind`
   - Location fields from `draft.data.location.*`
   - Detail fields from `draft.data.details.*` (null for shops)
5. **Transfer media**: `UPDATE property_media SET property_id = ?, draft_id = NULL WHERE draft_id = ?`
6. **Mark draft complete**: `UPDATE property_drafts SET property_id = ?, current_step = 'COMPLETED', is_completed = true`
7. Return the created `Property`.

**Response**:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "title": "APARTMENT for sale",
  "price": 2500000,
  "type": "SALE",
  "propertyKind": "APARTMENT",
  "bedrooms": 3,
  "bathrooms": 2,
  "areaM2": 150,
  "governorate": "القاهرة",
  "city": "مدينة نصر",
  "district": "الحي الثامن",
  "propertyStatus": "ACTIVE",
  "createdAt": "2026-03-31T..."
}
```

**Errors**:
| Code | Condition |
|---|---|
| `400` | Not at REVIEW step |
| `400` | Missing required fields |
| `404` | No active draft |

---

### 7.8 `uploadMedia(userId: string, url: string, mediaType: MediaType)`

**Purpose**: Attach a media file to the user's active draft.

**Logic**:
1. Get active draft (404 if none).
2. Validate `url` is a non-empty string.
3. Validate `mediaType` is `IMAGE` or `VIDEO`.
4. `INSERT INTO property_media (draft_id, url, type)`.
5. Return the created media record.

**Response**:
```json
{
  "id": "uuid",
  "draftId": "uuid",
  "propertyId": null,
  "url": "https://storage.example.com/photo1.jpg",
  "type": "IMAGE",
  "createdAt": "2026-03-31T..."
}
```

**Errors**:
| Code | Condition |
|---|---|
| `400` | Missing or invalid URL |
| `400` | Invalid media type |
| `404` | No active draft |

---

## 8. API Endpoints

All endpoints are under `/onboarding`.

| Method | Path | Body / Query | Service Method | Returns |
|---|---|---|---|---|
| `POST` | `/onboarding/start` | `{ userId }` | `startOrResumeDraft` | Draft |
| `GET` | `/onboarding/question?userId=` | query: `userId` | `getCurrentQuestion` | QuestionResponse |
| `POST` | `/onboarding/answer` | `{ userId, step, answer }` | `submitAnswer` | Draft |
| `GET` | `/onboarding/review?userId=` | query: `userId` | `getReview` | ReviewResponse |
| `POST` | `/onboarding/edit` | `{ userId, step }` | `editField` | QuestionResponse |
| `POST` | `/onboarding/submit` | `{ userId }` | `finalSubmit` | Property |
| `POST` | `/onboarding/upload-media` | multipart: `userId`, `file` | `uploadMedia` | PropertyMedia |

### 8.1 DTOs

**StartOnboardingDto**:
```typescript
{
  userId: string;  // @IsUUID()
}
```

**SubmitAnswerDto**:
```typescript
{
  userId: string;  // @IsUUID()
  step: OnboardingStep;  // @IsEnum(OnboardingStep)
  answer: any;  // validated in service layer per step
}
```

**EditFieldDto**:
```typescript
{
  userId: string;  // @IsUUID()
  step: OnboardingStep;  // @IsEnum(OnboardingStep)
}
```

**QuestionResponseDto**:
```typescript
{
  step: OnboardingStep;
  message: string;
  inputType: 'multi_choice' | 'form' | 'number' | 'file' | 'display';
  options?: string[];
  fields?: { name: string; label: string; required: boolean }[];
}
```

**ReviewResponseDto**:
```typescript
{
  draft: PropertyDraft;
  data: Record<string, unknown>;
  isComplete: boolean;
  missingFields: string[];
}
```

---

## 9. State Diagram

```
                    ┌──────────────┐
         ┌─────────│ PROPERTY_TYPE │
         │         └──────┬───────┘
         │                │ submitAnswer("شقة"|"فيلا"|"محل"|"مكتب")
         │                ▼
         │         ┌──────────────┐
         │         │ LISTING_TYPE │
         │         └──────┬───────┘
         │                │ submitAnswer("بيع"|"إيجار")
         │                ▼
         │         ┌──────────┐
         │         │ LOCATION │
         │         └──────┬───┘
         │                │ submitAnswer({ governorate, ... })
         │                │
         │         ┌──────┴──────────────────────┐
         │         │                             │
         │         ▼ (property_type ≠ SHOP)      ▼ (property_type = SHOP)
         │  ┌──────────┐                         │
         │  │ DETAILS  │                         │
         │  └────┬─────┘                         │
         │       │ submitAnswer({ area_m2, .. }) │
         │       ▼                               │
         │  ┌─────────┐                          │
         │  │  PRICE  │◄─────────────────────────┘
         │  └────┬────┘
         │       │ submitAnswer(2500000)
         │       ▼
         │  ┌─────────┐
         │  │  MEDIA  │
         │  └────┬────┘
         │       │ submitAnswer(skip) or uploadMedia(...)
         │       ▼
  edit   │  ┌──────────┐
  ◄──────┤  │  REVIEW  │──── finalSubmit() ───►┌───────────┐
         │  └──────────┘                       │ COMPLETED │
         │       │                             └───────────┘
         │       │ editField(targetStep)
         └───────┘ (rewind to targetStep)
```

---

## 10. Example Flow: Full Happy Path

### Apartment for Sale in Cairo

```
Client                          Server
  │                               │
  ├── POST /onboarding/start ────►│  → creates draft (step=PROPERTY_TYPE)
  │◄── { draft }                  │
  │                               │
  ├── GET /onboarding/question ──►│  → returns "حضرتك نوع العقار ايه؟"
  │◄── { step: PROPERTY_TYPE,     │
  │      options: [شقة,فيلا,...] } │
  │                               │
  ├── POST /onboarding/answer ───►│  → validates "شقة" → data.property_type=APARTMENT
  │    { step: PROPERTY_TYPE,     │     step advances to LISTING_TYPE
  │      answer: "شقة" }          │
  │◄── { draft, step=LISTING_TYPE}│
  │                               │
  ├── GET /onboarding/question ──►│  → returns "عايز تبيع ولا تأجر؟"
  │◄── { step: LISTING_TYPE,      │
  │      options: [بيع,إيجار] }   │
  │                               │
  ├── POST /onboarding/answer ───►│  → validates "بيع" → data.listing_type=SALE
  │    { step: LISTING_TYPE,      │     step advances to LOCATION
  │      answer: "بيع" }          │
  │◄── { draft, step=LOCATION }   │
  │                               │
  ├── GET /onboarding/question ──►│  → returns form fields
  │◄── { step: LOCATION,          │
  │      fields: [governorate...] }│
  │                               │
  ├── POST /onboarding/answer ───►│  → validates governorate present
  │    { step: LOCATION,          │     data.location={...}
  │      answer: {                │     step advances to DETAILS
  │        governorate: "القاهرة", │
  │        city: "مدينة نصر"      │
  │      }                        │
  │    }                          │
  │◄── { draft, step=DETAILS }    │
  │                               │
  ├── POST /onboarding/answer ───►│  → validates area_m2 > 0
  │    { step: DETAILS,           │     data.details={...}
  │      answer: {                │     step advances to PRICE
  │        area_m2: 150,          │
  │        bedrooms: 3,           │
  │        bathrooms: 2           │
  │      }                        │
  │    }                          │
  │◄── { draft, step=PRICE }      │
  │                               │
  ├── POST /onboarding/answer ───►│  → validates price > 0
  │    { step: PRICE,             │     data.price=2500000
  │      answer: 2500000 }        │     step advances to MEDIA
  │◄── { draft, step=MEDIA }      │
  │                               │
  ├── POST /onboarding/answer ───►│  → media optional, skip
  │    { step: MEDIA,             │     data.media_skipped=true
  │      answer: null }           │     step advances to REVIEW
  │◄── { draft, step=REVIEW }     │
  │                               │
  ├── GET /onboarding/review ────►│  → checks all required fields
  │◄── { data: {...},             │
  │      isComplete: true,        │
  │      missingFields: [] }      │
  │                               │
  ├── POST /onboarding/submit ───►│  → creates Property (transaction)
  │                               │     transfers media
  │                               │     marks draft completed
  │◄── { property }               │
```

### Shop for Rent (DETAILS skipped)

```
  ├── answer PROPERTY_TYPE: "محل" → property_type=SHOP
  ├── answer LISTING_TYPE: "إيجار" → listing_type=RENT
  ├── answer LOCATION: { governorate: "الجيزة" }
  │   → getNextStep(LOCATION, {property_type: "SHOP"}) = PRICE  ← skip DETAILS
  ├── answer PRICE: 15000
  ├── answer MEDIA: skip
  ├── review → isComplete: true (no details required for SHOP)
  ├── submit → Property created without bedrooms/bathrooms/area_m2
```

---

## 11. Error Scenarios

| Scenario | HTTP | Response |
|---|---|---|
| No active draft, call `getCurrentQuestion` | 404 | `{ "message": "No active draft found for user {userId}" }` |
| Submit answer for wrong step | 400 | `{ "message": "Wrong step: expected LOCATION, got PRICE" }` |
| Submit answer for REVIEW or COMPLETED | 400 | `{ "message": "Cannot submit answer for step REVIEW" }` |
| Invalid property type (e.g., "سكن") | 400 | `{ "message": "Invalid property type. Valid options: شقة, فيلا, محل, مكتب" }` |
| Missing governorate in location | 400 | `{ "message": "governorate is required" }` |
| Negative or zero price | 400 | `{ "message": "Price must be a positive number" }` |
| `area_m2` = 0 or missing | 400 | `{ "message": "area_m2 must be a positive number" }` |
| `finalSubmit` not at REVIEW | 400 | `{ "message": "Draft must be at REVIEW step" }` |
| `finalSubmit` with missing fields | 400 | `{ "message": "Missing required fields" }` |
| `editField` not from REVIEW | 400 | `{ "message": "Can only edit fields from REVIEW step" }` |
| `editField` target = COMPLETED | 400 | `{ "message": "Cannot edit step COMPLETED" }` |

---

## 12. Implementation Checklist

This spec maps to the following implementation artifacts:

| File | Purpose |
|---|---|
| `backend/prisma/schema.prisma` | `PropertyDraft`, `PropertyMedia`, enums — ✅ Done |
| `backend/src/onboarding/constants/questions.ts` | `ONBOARDING_QUESTIONS`, `STEP_ORDER`, `getNextStep`, maps — ⚠️ Needs `getNextStep` update for SHOP skip |
| `backend/src/onboarding/onboarding.service.ts` | All 7 service methods — ⚠️ Needs `getNextStep(step, data)` signature update |
| `backend/src/onboarding/onboarding.controller.ts` | 7 endpoints — 🔴 Not built |
| `backend/src/onboarding/dto/*.ts` | 5 DTOs — 🔴 Not built |
| `app/static/chat.html` | Structured UI (buttons, forms, file upload) — 🔴 Not built |

### Code Changes Required

1. **`getNextStep`** must accept `data` parameter and implement SHOP skip rule.
2. **`submitAnswer`** must pass `draft.data` to `getNextStep`.
3. **`validateDetails`** should be skipped when `property_type === 'SHOP'` (handled by step never being reached).
4. **`finalSubmit`** cross-validation must relax `details` requirement for SHOP.

---

## 13. Appendix: Valid Governorates (MVP)

The MVP targets three governorates. Validation does NOT restrict to this list (users may enter any Egyptian governorate), but the UI may suggest these:

| Arabic | English |
|---|---|
| القاهرة | Cairo |
| الجيزة | Giza |
| الإسكندرية | Alexandria |
