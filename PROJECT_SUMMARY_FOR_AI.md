# Semsar AI (سمسار AI) — Complete Project Summary
> Generated: April 3, 2026 | Purpose: AI analysis / external review

---

## 1. What Is This Project?

**Semsar AI** is a controlled real-estate platform for Egypt (Cairo, Giza, Alexandria).
- **NOT** a free-chat bot — all business logic is enforced by the backend, AI is only the communication layer.
- All user-facing text is in **Egyptian Arabic (عامية مهذبة)** — polite colloquial register.
- Two phases: **Phase 1** = guided property listing wizard, **Phase 2** = algorithm-driven buyer/seller negotiation.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11 (TypeScript) |
| ORM | Prisma 6.x |
| Database | MySQL 8 |
| AI | Google Gemini 2.5 Flash |
| Dev Chat UI | FastAPI (Python) — browser testing only |
| Prod Chat | WhatsApp Cloud API |

---

## 3. Architecture Overview

```
Browser (FastAPI UI, dev)       WhatsApp Cloud API (prod)
        │                               │
        └──────────────┬────────────────┘
                       ▼
              NestJS Backend (port 3000)
              ┌─────────────────────────┐
              │  Onboarding Module       │  ← Phase 1
              │  Negotiation Module      │  ← Phase 2
              │  WhatsApp Module         │  (webhook handling)
              │  Gemini Module           │  (AI formatting only)
              │  Locations Module        │  (Egypt hierarchy)
              │  Search Module           │  (buyer matching)
              │  State Machine Module    │  (legacy flow)
              │  Cleanup Module          │  (cron)
              └──────────┬──────────────┘
                         │ Prisma ORM
                         ▼
                    MySQL 8 Database
```

---

## 4. Database Schema (15 Models, 17 Enums)

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `User` | Platform users (buyers & sellers) | id, name, phone (unique), userType, status |
| `Property` | Live property listings | userId, price, type (SALE/RENT), propertyKind, bedrooms, bathrooms, areaM2, governorate, city, district |
| `PropertyDraft` | In-progress onboarding state | userId, currentStep, data (JSON), isCompleted |
| `PropertyMedia` | Images/videos for draft or property | draftId?, propertyId?, url, type (IMAGE/VIDEO) |
| `LowerOffice` | Real estate broker offices | officeName, governorate, ratingScore, maxProperties |
| `Negotiation` | Active buyer↔seller negotiation | propertyId, buyerId, sellerId, status, currentOffer, minPrice, maxPrice, roundNumber |
| `Offer` | Individual offers in a negotiation | negotiationId, amount, round, createdBy |
| `Deal` | Agreed deal (locked) | negotiationId, buyerId, sellerId, finalPrice, status |
| `AiLog` | Audit trail of AI actions | negotiationId, actionType (ASK/COUNTER/ACCEPT/REJECT) |
| `Payment` | Payment records | dealId, type, amount, provider (PAYMOB/FAWRY), status |
| `Location` | Egypt location hierarchy | name, type (GOVERNORATE/CITY/DISTRICT), parentId (self-ref) |

### Legacy WhatsApp Flow (deprecated, kept for compatibility)
`Conversation` → `Listing` → `Unit`

### Key Enums

| Enum | Values |
|------|--------|
| `OnboardingStep` | PROPERTY_TYPE → LISTING_TYPE → GOVERNORATE → CITY → DISTRICT → DETAILS → PRICE → MEDIA → REVIEW → COMPLETED |
| `PropertyKind` | APARTMENT, VILLA, SHOP, OFFICE |
| `PropertyType` | SALE, RENT |
| `PropertyStatus` | ACTIVE, INACTIVE, SOLD, RENTED |
| `NegotiationStatus` | ACTIVE, AGREED, FAILED |
| `DealStatus` | PENDING, CONFIRMED, CANCELLED |
| `PaymentStatus` | PENDING, COMPLETED, FAILED, REFUNDED |
| `AiActionType` | ASK, COUNTER, ACCEPT, REJECT |
| `FlowState` (legacy) | AWAITING_INTENT → AWAITING_UNIT_TYPE → AWAITING_SPECS → AWAITING_MEDIA → AWAITING_CONFIRMATION → CONFIRMED |

---

## 5. Phase 1 — Onboarding (Property Listing Wizard)

### Purpose
Collect structured property data via a strict step-by-step wizard (no free chat).

### Endpoints (`/onboarding/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/onboarding/start` | Start new `PropertyDraft` or resume existing incomplete one |
| GET | `/onboarding/question` | Get current step's Arabic question (with dynamic location options from DB) |
| POST | `/onboarding/answer` | Submit answer → validate → merge into draft.data JSON → advance step |
| GET | `/onboarding/review` | Get all collected data + missing fields check |
| POST | `/onboarding/submit` | Final submit → creates `Property` + transfers media (Prisma transaction) |
| POST | `/onboarding/upload-media` | Upload media URL linked to active draft |

### 10-Step Flow

```
PROPERTY_TYPE → LISTING_TYPE → GOVERNORATE → CITY → DISTRICT → DETAILS* → PRICE → MEDIA → REVIEW → COMPLETED
                                                                   ↑
                                               *DETAILS step skipped for SHOP (no bedrooms/bathrooms)
```

### Arabic Questions per Step

| Step | Arabic Question | Input Type |
|------|----------------|-----------|
| PROPERTY_TYPE | حضرتك نوع العقار ايه؟ | multi-choice: شقة / فيلا / محل / مكتب |
| LISTING_TYPE | عايز تبيع ولا تأجر؟ | multi-choice: بيع / إيجار |
| GOVERNORATE | اختر المحافظة | multi-choice (from DB) |
| CITY | اختر المدينة | multi-choice (from DB, filtered by governorate) |
| DISTRICT | اختر الحي | multi-choice (from DB, filtered by city) |
| DETAILS | تفاصيل العقار | form: bedrooms, bathrooms, area_m2 (required) |
| PRICE | السعر المتوقع كام؟ | number (positive, EGP) |
| MEDIA | تحب تضيف صور أو فيديوهات؟ | file upload or "تخطي" (skip) |
| REVIEW | راجع البيانات وأكد | display only — no input |
| COMPLETED | — | terminal state |

### Validation Rules
- `area_m2` > 0 (required for APARTMENT, VILLA; optional for SHOP)
- `bedrooms` ≥ 0, required for APARTMENT + VILLA, N/A for SHOP
- `price` > 0
- `governorate` required; city, district, zone, nearest_landmark optional
- Wrong step submission throws 400

### Final Submit Logic (Prisma Transaction)
1. Validate all required fields in `draft.data`
2. Create `Property` row — map Arabic answers to DB enums
3. Transfer all `PropertyMedia` rows (set `propertyId`, clear `draftId`)
4. Mark draft: `isCompleted = true`, `currentStep = COMPLETED`, set `propertyId`
5. All atomic — rollback on failure

---

## 6. Phase 2 — Negotiation Engine

### Core Principle
**Backend algorithm controls ALL decisions. Gemini only formats Arabic messages.**

### Algorithm (Constitution)

| Round | Concession Rate |
|-------|----------------|
| 1–2 | 5% of gap |
| 3–5 | 10% of gap |
| 6+ | 15% of gap |
| 7 | Auto-fail |

**Initial offer formula:** `buyer_max_price × 0.85` (anchor strategy)

**Counter offer formula:**
```
gap = maxPrice - minPrice
concession = gap × concessionRate(round)
counterOffer = currentOffer + concession
counterOffer = clamp(counterOffer, minPrice, maxPrice)
```

**Auto-accept condition:** When `counterOffer ≥ minPrice` (listing price) → deal reached automatically.

### 3 User Actions Only
- `accept` → creates `Deal` atomically (Prisma transaction), status = AGREED
- `reject` → status = FAILED, no Deal
- `request_counter` → calculates next offer, increments round; round 7 → auto FAIL

### Endpoints (`/negotiation/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/negotiation/start` | Start negotiation (buyer + property + max budget) |
| POST | `/negotiation/next-step` | Submit action: accept / reject / request_counter |
| GET | `/negotiation/status` | Get full negotiation state + all offers history |

### Arabic Messages (Gemini formats, never decides)
- Counter: `"بكل احترام، السعر الحالي هو {price} جنيه. هل يناسب حضرتك؟"`
- Accept: `"تم الاتفاق على {price} جنيه. برجاء استكمال الدفع."`
- Reject: `"نأسف، لم نتمكن من الوصول لاتفاق مناسب."`

---

## 7. Other Backend Modules

### Gemini Module
- `extractFromMessage(prompt)` → calls Gemini 2.5 Flash, returns parsed JSON
- 3× exponential backoff (1s / 2s / 4s) on 429/5xx errors
- Used ONLY for: Arabic message formatting, field extraction from free text

### Locations Module
- Hierarchical Egypt reference data: Governorate → City → District
- In-memory cache with 1-hour TTL
- Endpoints: `GET /locations/governorates`, `GET /locations/cities/:govId`, `GET /locations/districts/:cityId`

### WhatsApp Module (original flow)
- `GET /whatsapp/webhook` — Meta verification handshake
- `POST /whatsapp/webhook` — Receive messages with HMAC-SHA256 verification
- Orchestrator: message in → Gemini extraction → state machine → persist → reply

### Search Module
- Finds up to 5 active SALE units matching buyer criteria (type, location, max price)
- Results formatted in Egyptian Arabic

### Cleanup Module
- Cron job — runs every hour
- Purges expired non-confirmed conversations (>7 days)

---

## 8. FastAPI Chat UI (Development Only)

- Runs at `http://localhost:8000/ui`
- Browser-based testing interface (not production)
- In-memory session history (max 40 turns)
- Proxies all `/onboarding/*` and `/locations/*` calls to NestJS (port 3000)
- Renders multi-choice buttons, inline forms, file upload, review screen

---

## 9. Test Coverage

| Category | Count | Status |
|----------|-------|--------|
| NestJS Unit Tests | 205 | ✅ All passing |
| NestJS E2E Tests | 7 | ✅ All passing |
| TypeScript (`tsc --noEmit`) | 0 errors | ✅ Clean |

**E2E test files:** `buy-flow.e2e-spec.ts`, `sell-flow.e2e-spec.ts`, `onboarding-location.e2e-spec.ts`

---

## 10. Project Progress

| Sprint | Tasks | Status |
|--------|-------|--------|
| **1.1** Schema & Migration (T01–T10) | Add enums, models, run migration, scaffold modules | ✅ Done |
| **1.2** Onboarding Service (T11–T20) | Full state machine logic, validations, submit | ✅ Done |
| **1.3** Controller & DTOs (T21–T30) | Wire HTTP endpoints, class-validator DTOs | 🔴 Not started |
| **1.4** Unit & E2E Tests (T31–T43) | Full test coverage for onboarding | 🔴 Not started |
| **1.5** Chat UI Integration (T44–T48) | Update FastAPI UI for structured flow | 🔴 Not started |
| **2.1** Negotiation Service (T49–T55) | Algorithm implementation | 🔴 Not started |
| **2.2** Negotiation Controller (T56–T61) | Wire negotiation endpoints | 🔴 Not started |
| **2.3** Negotiation Tests (T62–T74) | Full test coverage for negotiation | 🔴 Not started |

**Completed:** 20 / 74 tasks · **Remaining:** ~3.5 weeks of work

---

## 11. Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | State machine, not free chat | Structured data collection ensures quality |
| 2 | AI never decides in negotiations | Algorithm controls offers; Gemini only formats Arabic |
| 3 | Max 6 negotiation rounds | Prevents endless loops, enough for convergence |
| 4 | First offer = max_price × 0.85 | Anchor strategy |
| 5 | Concession schedule: 5%/10%/15% | Gradual escalation by round bracket |
| 6 | Draft-first media handling | Upload to draft, transfer to property on submit |
| 7 | Egyptian Arabic (polite register) | All user-facing text in عامية مهذبة |
| 8 | Old intake models kept | conversations/listings/units deprecated but not removed |
| 9 | Location data cached in memory | 1-hour TTL avoids repeated DB queries for reference data |
| 10 | Prisma transactions for final submit | Property + media + draft completion are atomic |

---

## 12. File Structure

```
SemsarAi/
├── backend/                          # NestJS 11 backend (main codebase)
│   ├── prisma/
│   │   ├── schema.prisma             # 15 models + 17 enums
│   │   ├── migrations/               # MySQL migrations
│   │   └── seeds/                    # Seed data (locations, etc.)
│   ├── src/
│   │   ├── main.ts                   # Bootstrap (port 3000)
│   │   ├── app.module.ts             # Root module (12 sub-modules)
│   │   ├── onboarding/               # Phase 1: Property wizard ✅
│   │   │   ├── onboarding.service.ts
│   │   │   ├── onboarding.controller.ts  (stub — T21–T30 pending)
│   │   │   └── constants/questions.ts    (ONBOARDING_QUESTIONS map)
│   │   ├── negotiation/              # Phase 2: Negotiation engine 🔴
│   │   │   ├── negotiation.service.ts    (stub)
│   │   │   └── negotiation.controller.ts (stub)
│   │   ├── gemini/                   # Gemini 2.5 Flash + retry logic
│   │   ├── locations/                # Egypt location hierarchy + cache
│   │   ├── whatsapp/                 # WhatsApp webhook + orchestrator
│   │   ├── conversations/            # WhatsApp conversation CRUD
│   │   ├── listings/                 # Property listings CRUD (legacy)
│   │   ├── search/                   # Buyer-matching search
│   │   ├── state-machine/            # Pure-function flow engine (legacy)
│   │   ├── cleanup/                  # Cron: expire old conversations
│   │   ├── prompts/                  # Arabic system + extraction prompts
│   │   ├── config/                   # Environment validation
│   │   ├── common/                   # Shared types/interfaces
│   │   └── prisma/                   # Prisma ORM module
│   └── test/                         # E2E test suite
├── app/                              # FastAPI dev UI (Python)
│   ├── main.py                       # FastAPI server (port 8000)
│   └── static/chat.html              # Browser chat interface
├── specs/000-master-plan/
│   ├── plan.md                       # Master implementation plan
│   └── tasks.md                      # 74 tasks (T01–T74) with status
└── _archive/                         # Old Python MVP (reference only)
```

---

## 13. Environment Variables (Required)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `GEMINI_API_KEY` | Google Gemini API key |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API access token |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID |

---

## 14. Current Blockers / Next Steps

1. **T21–T30 (Controller & DTOs)** — the onboarding service is fully implemented but has no HTTP endpoints wired yet. This is the immediate next sprint.
2. **T31–T43 (Tests)** — no unit/E2E tests for the new onboarding service yet.
3. **T44–T48 (Chat UI)** — FastAPI UI still uses old free-chat mode, not the new structured wizard.
4. **Phase 2 (T49–T74)** — Negotiation engine is scaffolded but entirely empty.
5. The existing 212 tests (205 unit + 7 e2e) all pass and must not regress.
