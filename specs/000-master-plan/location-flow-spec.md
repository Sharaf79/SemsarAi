# Location Flow Refactor — Specification

> **Date:** 2026-03-31
> **Status:** Draft
> **Scope:** Replace single LOCATION step with cascading GOVERNORATE → CITY → DISTRICT multi-choice steps

---

## 1. Problem Statement

The current onboarding has a single `LOCATION` step that renders a free-text form with 5 fields (governorate, city, district, zone, nearest_landmark). This is problematic because:

1. **Free text is error-prone** — users type "المعادي" / "المعادى" / "معادي" which can't be normalised
2. **No referential integrity** — city/district names aren't validated against real Egyptian geography
3. **Bad UX** — typing on mobile (especially WhatsApp) is slow; multi-choice buttons are faster
4. **No cascading dependency** — user can type any city regardless of governorate

The fix: three separate steps, each rendered as **multi-choice buttons** loaded from a `locations` reference table in the database.

---

## 2. New Step Flow

```
PROPERTY_TYPE → LISTING_TYPE → GOVERNORATE → CITY → DISTRICT → DETAILS → PRICE → MEDIA → REVIEW → COMPLETED
```

The old single `LOCATION` step is **removed** and replaced with three sequential steps:

| Step | Question (Egyptian Arabic) | Input Type | Data Source |
|------|---------------------------|------------|-------------|
| `GOVERNORATE` | "العقار في أنهي محافظة؟" | `multi-choice` | `GET /locations/governorates` |
| `CITY` | "في أنهي مدينة في {governorate_name}?" | `multi-choice` | `GET /locations/cities?governorateId={id}` |
| `DISTRICT` | "في أنهي حي/منطقة في {city_name}?" | `multi-choice` | `GET /locations/districts?cityId={id}` |

### 2.1 Transition Rules

- `LISTING_TYPE` → `GOVERNORATE` (always)
- `GOVERNORATE` → `CITY` (always)
- `CITY` → `DISTRICT` (always)
- `DISTRICT` → `DETAILS` (if property_type ≠ SHOP) **or** `PRICE` (if property_type = SHOP — existing skip rule)
- All other transitions unchanged

### 2.2 Dynamic Questions

The CITY and DISTRICT questions include the **name** of the parent selection in the Arabic text:
- If user picks governorate "القاهرة" → city question becomes "في أنهي مدينة في القاهرة؟"
- If user picks city "مدينة نصر" → district question becomes "في أنهي حي/منطقة في مدينة نصر؟"

---

## 3. Database Schema

### 3.1 New Table: `locations`

A single self-referencing table for all three levels. This is simpler than three separate tables and allows future expansion (zones, streets).

```sql
CREATE TABLE locations (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name_ar     VARCHAR(100) NOT NULL,          -- Arabic name (display)
  name_en     VARCHAR(100) DEFAULT NULL,       -- English name (optional, for admin)
  type        ENUM('GOVERNORATE','CITY','DISTRICT') NOT NULL,
  parent_id   INT UNSIGNED DEFAULT NULL,
  sort_order  INT UNSIGNED DEFAULT 0,          -- for consistent display ordering
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (parent_id) REFERENCES locations(id),
  INDEX idx_type_parent (type, parent_id),
  INDEX idx_parent_active (parent_id, is_active)
);
```

**Hierarchy:**
- `type=GOVERNORATE`, `parent_id=NULL` → top-level governorate
- `type=CITY`, `parent_id=<governorate_id>` → city within a governorate
- `type=DISTRICT`, `parent_id=<city_id>` → district within a city

### 3.2 Prisma Model

```prisma
model Location {
  id        Int            @id @default(autoincrement())
  nameAr    String         @map("name_ar") @db.VarChar(100)
  nameEn    String?        @map("name_en") @db.VarChar(100)
  type      LocationType
  parentId  Int?           @map("parent_id")
  sortOrder Int            @default(0) @map("sort_order")
  isActive  Boolean        @default(true) @map("is_active")
  createdAt DateTime       @default(now()) @map("created_at")

  parent    Location?      @relation("LocationHierarchy", fields: [parentId], references: [id])
  children  Location[]     @relation("LocationHierarchy")

  @@index([type, parentId])
  @@index([parentId, isActive])
  @@map("locations")
}

enum LocationType {
  GOVERNORATE
  CITY
  DISTRICT
}
```

### 3.3 OnboardingStep Enum Update

```prisma
enum OnboardingStep {
  PROPERTY_TYPE
  LISTING_TYPE
  GOVERNORATE    // NEW — replaces LOCATION
  CITY           // NEW
  DISTRICT       // NEW
  DETAILS
  PRICE
  MEDIA
  REVIEW
  COMPLETED
}
```

The old `LOCATION` value is **removed**. A migration must handle:
1. Create the new enum values
2. Update any existing drafts at `LOCATION` step → `GOVERNORATE`
3. Drop the `LOCATION` value

### 3.4 Draft Data Shape

The `PropertyDraft.data` JSON field stores IDs (not names):

```json
{
  "property_type": "APARTMENT",
  "listing_type": "SALE",
  "governorate_id": 1,
  "governorate_name": "القاهرة",
  "city_id": 12,
  "city_name": "مدينة نصر",
  "district_id": 45,
  "district_name": "الحي الثامن",
  "details": { "area_m2": 120, "bedrooms": 3, "bathrooms": 2 },
  "price": 2500000
}
```

Both `_id` (for referential lookup) and `_name` (for display in REVIEW/Property creation) are stored. This avoids a DB lookup when rendering the review screen.

---

## 4. Location APIs

All under a new `LocationsController` at prefix `/locations`.

### 4.1 GET /locations/governorates

Returns all active governorates, sorted by `sort_order`.

**Response:**
```json
{
  "governorates": [
    { "id": 1, "nameAr": "القاهرة", "nameEn": "Cairo" },
    { "id": 2, "nameAr": "الجيزة", "nameEn": "Giza" },
    ...
  ]
}
```

### 4.2 GET /locations/cities?governorateId={id}

Returns all active cities under the given governorate.

**Query params:** `governorateId` (required, integer)

**Response:**
```json
{
  "cities": [
    { "id": 12, "nameAr": "مدينة نصر", "nameEn": "Nasr City" },
    { "id": 13, "nameAr": "المعادي", "nameEn": "Maadi" },
    ...
  ]
}
```

**Errors:**
- `400` if governorateId missing or not a number
- `404` if governorate doesn't exist

### 4.3 GET /locations/districts?cityId={id}

Returns all active districts under the given city.

**Query params:** `cityId` (required, integer)

**Response:**
```json
{
  "districts": [
    { "id": 45, "nameAr": "الحي الثامن", "nameEn": "8th District" },
    { "id": 46, "nameAr": "الحي العاشر", "nameEn": "10th District" },
    ...
  ]
}
```

**Errors:**
- `400` if cityId missing or not a number
- `404` if city doesn't exist

### 4.4 FastAPI Proxy

Three new proxy routes in `app/main.py`:
- `GET /locations/governorates` → `GET http://localhost:3000/locations/governorates`
- `GET /locations/cities` → `GET http://localhost:3000/locations/cities`
- `GET /locations/districts` → `GET http://localhost:3000/locations/districts`

---

## 5. Onboarding Service Changes

### 5.1 questions.ts — Step Order & Definitions

```typescript
export const STEP_ORDER: OnboardingStep[] = [
  OnboardingStep.PROPERTY_TYPE,
  OnboardingStep.LISTING_TYPE,
  OnboardingStep.GOVERNORATE,  // was LOCATION
  OnboardingStep.CITY,          // new
  OnboardingStep.DISTRICT,      // new
  OnboardingStep.DETAILS,
  OnboardingStep.PRICE,
  OnboardingStep.MEDIA,
  OnboardingStep.REVIEW,
  OnboardingStep.COMPLETED,
];
```

Question definitions for the three new steps:

```typescript
[OnboardingStep.GOVERNORATE]: {
  question: 'العقار في أنهي محافظة؟',
  inputType: 'multi-choice',
  // options loaded dynamically from /locations/governorates
  optionsSource: 'governorates',
},
[OnboardingStep.CITY]: {
  question: 'في أنهي مدينة في {governorate_name}؟',
  inputType: 'multi-choice',
  // options loaded dynamically from /locations/cities?governorateId=X
  optionsSource: 'cities',
},
[OnboardingStep.DISTRICT]: {
  question: 'في أنهي حي/منطقة في {city_name}؟',
  inputType: 'multi-choice',
  // options loaded dynamically from /locations/districts?cityId=X
  optionsSource: 'districts',
},
```

### 5.2 QuestionDef Interface Extension

```typescript
export interface QuestionDef {
  question: string;
  inputType: 'multi-choice' | 'form' | 'number' | 'file' | 'display';
  options?: string[];            // static options (property_type, listing_type)
  optionsSource?: string;        // dynamic: 'governorates' | 'cities' | 'districts'
  fields?: FieldDef[];
}
```

### 5.3 getCurrentQuestion — Dynamic Options

When the step has `optionsSource` instead of static `options`, the service must:

1. Read `draft.data` for parent IDs
2. Query the `locations` table
3. Return the options array with `{ id, nameAr }` objects (not plain strings)

For `GOVERNORATE`: query all active governorates
For `CITY`: use `draft.data.governorate_id` to query cities
For `DISTRICT`: use `draft.data.city_id` to query districts

The response shape changes to include a structured options array:

```json
{
  "step": "CITY",
  "question": "في أنهي مدينة في القاهرة؟",
  "inputType": "multi-choice",
  "options": [
    { "id": 12, "label": "مدينة نصر" },
    { "id": 13, "label": "المعادي" },
    { "id": 14, "label": "مصر الجديدة" }
  ]
}
```

**Template substitution:** The `{governorate_name}` / `{city_name}` placeholders in the question text are replaced at runtime from `draft.data.governorate_name` / `draft.data.city_name`.

### 5.4 submitAnswer — Validation for Location Steps

#### GOVERNORATE answer

- **Input:** `{ id: number, label: string }` (the selected option object)
- **Validation:** Verify the ID exists in `locations` table with `type=GOVERNORATE` and `is_active=true`
- **Stored data:** `{ governorate_id: id, governorate_name: label }`

#### CITY answer

- **Input:** `{ id: number, label: string }`
- **Validation:** Verify ID exists with `type=CITY`, `parent_id=draft.data.governorate_id`, and `is_active=true`
- **Stored data:** `{ city_id: id, city_name: label }`

#### DISTRICT answer

- **Input:** `{ id: number, label: string }`
- **Validation:** Verify ID exists with `type=DISTRICT`, `parent_id=draft.data.city_id`, and `is_active=true`
- **Stored data:** `{ district_id: id, district_name: label }`

### 5.5 getNextStep — Updated Skip Rule

The SHOP skip rule stays the same, but the step ordering changes. SHOP skip is checked when transitioning out of DISTRICT:

```
DISTRICT → (SHOP?) → PRICE   // skip DETAILS
DISTRICT → (not SHOP) → DETAILS
```

### 5.6 finalSubmit — Updated Field Mapping

When creating the `Property`, map the location fields:

```typescript
governorate: data.governorate_name,
city: data.city_name,
district: data.district_name,
```

The `_id` fields are stored in draft data for validation but the Property table keeps the string names (matching the existing schema).

### 5.7 getReview — Updated Required Field Checks

Replace the check for `data.location.governorate` with:
- `data.governorate_id` and `data.governorate_name` exist
- `data.city_id` and `data.city_name` exist
- `data.district_id` and `data.district_name` exist

---

## 6. Chat UI Changes

### 6.1 Multi-Choice with Object Options

Currently the UI renders multi-choice options as plain string buttons. The new location steps send options as `{ id, label }` objects. The UI must:

1. **Detect object options** — if `options[0]` has `.id` and `.label`, render `label` on the button
2. **Send the full object back** as the answer: `{ id: 12, label: "مدينة نصر" }`
3. **Show the label** in the user's chat bubble

### 6.2 Flow

1. User picks governorate → buttons appear (القاهرة, الجيزة, الإسكندرية…)
2. User picks city → buttons load for that governorate
3. User picks district → buttons load for that city
4. Flow continues to DETAILS or PRICE

No free-text input is shown for any of the three location steps. The locked input bar ("اختر من الأزرار أعلاه ☝️") is displayed throughout.

---

## 7. Seed Data

Initial seed with Egypt's major governorates and their key cities/districts. The seed migration should include at minimum:

**Governorates (7 major ones to start):**
- القاهرة (Cairo)
- الجيزة (Giza)
- الإسكندرية (Alexandria)
- القليوبية (Qalyubia)
- الشرقية (Sharqia)
- الدقهلية (Dakahlia)
- البحر الأحمر (Red Sea)

**Cities per governorate (3-10 each):**
- القاهرة: مدينة نصر, المعادي, مصر الجديدة, التجمع الخامس, المقطم, شبرا, حلوان, 15 مايو, عين شمس, الزيتون
- الجيزة: 6 أكتوبر, الشيخ زايد, الهرم, فيصل, الدقي, العجوزة, إمبابة, حدائق الأهرام, أبو رواش
- الإسكندرية: سيدي جابر, المنتزه, سموحة, ستانلي, جليم, كليوباترا, العصافرة, محرم بك, بحري

**Districts per city (2-5 each for top cities):**
- مدينة نصر: الحي الأول, الحي السابع, الحي الثامن, الحي العاشر, المنطقة التاسعة
- التجمع الخامس: النرجس, اللوتس, الياسمين, البنفسج, الأندلس
- 6 أكتوبر: الحي الأول, الحي الثاني, الحي السادس, الحي الحادي عشر, المحور المركزي

Full seed data file: `prisma/seeds/locations.sql`

---

## 8. Migration Plan

### Step 1: Create locations table
```
prisma migrate dev --name add_locations_table
```

### Step 2: Seed location data
```
prisma db execute --file prisma/seeds/locations.sql
```

### Step 3: Update OnboardingStep enum
- Add `GOVERNORATE`, `CITY`, `DISTRICT`
- Remove `LOCATION`
- Migrate any existing drafts at `LOCATION` step to `GOVERNORATE`
```
prisma migrate dev --name update_onboarding_steps
```

### Step 4: Deploy code changes
1. Update `questions.ts` (step order, definitions)
2. Create `LocationsModule` + `LocationsController` + `LocationsService`
3. Update `OnboardingService` (validation, getCurrentQuestion, finalSubmit, getReview)
4. Update `app/main.py` (proxy routes)
5. Update `chat.html` (object option rendering)

---

## 9. NestJS Module Structure

```
backend/src/locations/
├── locations.module.ts      # imports PrismaModule
├── locations.controller.ts  # GET governorates/cities/districts
└── locations.service.ts     # DB queries with caching
```

Register in `AppModule` imports.

### 9.1 Caching

Location data rarely changes. The `LocationsService` should cache results in memory:
- Cache governorates list (refresh every 1 hour)
- Cache cities per governorate (refresh every 1 hour)
- Cache districts per city (refresh every 1 hour)

Use a simple `Map<string, { data, expiry }>` — no external cache needed.

---

## 10. Error Scenarios

| Scenario | Handling |
|----------|----------|
| User submits governorate ID that doesn't exist | `400 Bad Request: Invalid governorate` |
| User submits city ID not under their chosen governorate | `400 Bad Request: City does not belong to governorate` |
| User submits district ID not under their chosen city | `400 Bad Request: District does not belong to city` |
| Locations table is empty (no seed data) | `getCurrentQuestion` returns empty options array; UI shows error message |
| Draft has `governorate_id` but governorate was deactivated since | Still valid — deactivation only affects future selections |

---

## 11. Backward Compatibility

- Any existing drafts with `currentStep = LOCATION` must be migrated to `GOVERNORATE`
- Any existing drafts with `data.location` object must have their data restructured to flat `governorate_name`, `city_name`, `district_name` fields (or discarded if incomplete)
- The `Property` table schema does NOT change — it still stores `governorate`, `city`, `district` as strings

---

## 12. Out of Scope

- Zone / street / nearest_landmark — dropped from onboarding flow (can be added later as optional post-submit fields)
- Latitude / longitude — not collected during onboarding
- Location search / autocomplete — not needed, using multi-choice only
- Admin UI for managing locations — seed via SQL; admin CRUD later
