# Semsar AI (سمسار AI) — Project Overview

**What it is:** A controlled real-estate platform for Egypt — NOT a free-chat bot.  
**Market:** Egypt (Cairo, Giza, Alexandria)  
**Language:** Egyptian Arabic — polite register (عامية مهذبة)  
**Core Principle:** Backend enforces ALL logic. AI is the communication layer only.

---

## Architecture: 2 Phases

| Phase | Purpose | Status |
|-------|---------|--------|
| **Phase 1** — Guided Data Collection | Strict state machine collects property data (one question per step, no skipping) | ✅ Service done, Controller/Tests in progress |
| **Phase 2** — Negotiation Engine | Algorithm-driven buyer/seller negotiation (AI only formats messages, never decides) | 🔴 Not started |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS 11 (TypeScript) |
| **ORM** | Prisma 6.x |
| **Database** | MySQL 8 |
| **AI** | Google Gemini 2.5 Flash |
| **Chat UI (dev)** | FastAPI (Python) — browser testing |
| **Chat UI (prod)** | WhatsApp Cloud API |

---

## Database (MySQL — 15 Tables)

### Core Platform Tables

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    users      │────<│  properties   │────<│ property_media│
│               │     │               │     └──────────────┘
│ id (UUID)     │     │ id (UUID)     │
│ name          │     │ user_id (FK)  │     ┌──────────────┐
│ phone (unique)│     │ title         │────<│property_drafts│
│ email?        │     │ description?  │     │ (onboarding)  │
│ status        │     │ price         │     └──────┬───────┘
│ user_type     │     │ type (SALE/   │            │
│ is_phone_     │     │       RENT)   │     ┌──────┴───────┐
│   verified    │     │ property_kind?│     │ property_media│
│ is_email_     │     │ bedrooms?     │     └──────────────┘
│   verified    │     │ bathrooms?    │
└──────┬───────┘     │ area_m2?      │
       │              │ country       │
       │              │ governorate?  │
       │              │ city?         │
       │              │ district?     │
       │              │ zone?         │
       │              │ street?       │
       │              │ nearest_      │
       │              │   landmark?   │
       │              │ latitude?     │
       │              │ longitude?    │
       │              │ property_     │
       │              │   status      │
       │              └───────┬───────┘
       │                      │
       │              ┌───────┴───────┐
       ├─────────────<│ negotiations  │
       │              │               │
       │              │ property_id   │
       │              │ buyer_id (FK) │
       │              │ seller_id(FK) │
       │              │ status        │
       │              │ current_offer?│
       │              │ min_price?    │
       │              │ max_price?    │
       │              │ round_number  │
       │              └──┬─────┬──┬──┘
       │                 │     │  │
       │          ┌──────┘  ┌──┘  └──────┐
       │          │         │            │
       │   ┌──────┴──┐ ┌───┴────┐ ┌─────┴──┐
       │   │ offers   │ │ deals  │ │ai_logs │
       │   │          │ │        │ └────────┘
       │   │ amount   │ │ final_ │
       │   │ round    │ │  price │
       │   │ created_ │ │ status │
       │   │   by     │ │ lower_ │
       │   └──────────┘ │ office_│
       │                │   id?  │
       │                └───┬────┘
       │                    │
       │             ┌──────┴──────┐
       ├────────────<│  payments   │
       │             │             │
       │             │ type        │
       │             │ amount      │
       │             │ provider    │
       │             │ status      │
       │             │ transaction_│
       │             │   id?       │
       │             └─────────────┘
       │
       │  ┌───────────────┐
       └─<│lower_offices  │───< deals
          │               │
          │ office_name   │
          │ lower_name    │
          │ governorate?  │
          │ rating_score? │
          │ max_properties│
          └───────────────┘
```

### Location Reference Table

```
locations (self-referencing hierarchy)
├── Governorate (e.g. القاهرة)
│   ├── City (e.g. مدينة نصر)
│   │   ├── District (e.g. الحي الثامن)
│   │   └── District ...
│   └── City ...
└── Governorate ...
```

### Legacy WhatsApp Flow Tables (deprecated, kept for compatibility)

```
conversations ──> listings ──< units
```

### Enums (17 total)

| Enum | Values |
|------|--------|
| UserStatus | ACTIVE, INACTIVE, BANNED |
| UserType | ADMIN, USER |
| PropertyType | SALE, RENT |
| PropertyStatus | ACTIVE, INACTIVE, SOLD, RENTED |
| PropertyKind | APARTMENT, VILLA, SHOP, OFFICE |
| OfficeStatus | ACTIVE, INACTIVE |
| NegotiationStatus | ACTIVE, AGREED, FAILED |
| DealStatus | PENDING, CONFIRMED, CANCELLED |
| PaymentType | DEPOSIT, COMMISSION, INSURANCE |
| PaymentProvider | PAYMOB, FAWRY |
| PaymentStatus | PENDING, COMPLETED, FAILED, REFUNDED |
| AiActionType | ASK, COUNTER, ACCEPT, REJECT |
| FlowState | AWAITING_INTENT → AWAITING_UNIT_TYPE → AWAITING_SPECS → AWAITING_MEDIA → AWAITING_CONFIRMATION → CONFIRMED |
| Intent | BUY, SELL, RENT, LEASE |
| UnitType | APARTMENT, LAND, VILLA, COMMERCIAL |
| ListingStatus | DRAFT, CONFIRMED |
| OnboardingStep | PROPERTY_TYPE → LISTING_TYPE → GOVERNORATE → CITY → DISTRICT → DETAILS → PRICE → MEDIA → REVIEW → COMPLETED |
| LocationType | GOVERNORATE, CITY, DISTRICT |
| MediaType | IMAGE, VIDEO |

---

## Backend Modules (NestJS)

### 1. WhatsApp Module (`backend/src/whatsapp/`)
The original WhatsApp Cloud API integration.

- **Controller:** `GET /whatsapp/webhook` (Meta verification handshake), `POST /whatsapp/webhook` (receive messages with HMAC-SHA256 verification)
- **Service:** Parse incoming payloads, verify signatures
- **Orchestrator:** The main brain — loads/creates conversation → sends hold message → calls Gemini extraction → runs state machine → persists state → post-confirmation actions (publish unit or search) → sends reply

### 2. Onboarding Module (`backend/src/onboarding/`) — Phase 1 ✅
Step-by-step property listing creation wizard (new structured flow replacing free chat).

**Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/onboarding/start` | POST | Start new `PropertyDraft` or resume existing incomplete one |
| `/onboarding/question` | GET | Get current question for user's active draft (with dynamic location options from DB) |
| `/onboarding/answer` | POST | Submit answer → validate → merge into draft → advance step |
| `/onboarding/review` | GET | Get all collected data + missing fields check |
| `/onboarding/submit` | POST | Final submit → creates `Property` + transfers media (Prisma transaction) |
| `/onboarding/upload-media` | POST | Upload media file linked to draft |

**Onboarding Flow (10 steps):**
```
PROPERTY_TYPE → LISTING_TYPE → GOVERNORATE → CITY → DISTRICT → DETAILS* → PRICE → MEDIA → REVIEW → COMPLETED
                                                                  ↑
                                                    *Skipped for SHOP
```

Each step has:
- Arabic question text (e.g., "حضرتك نوع العقار ايه؟")
- Input type: multi-choice / form / number / file
- Validation rules (e.g., governorate required, area_m2 > 0, positive price)

### 3. Negotiation Module (`backend/src/negotiation/`) — Phase 2 🔴
Algorithm-driven buyer/seller negotiation (scaffolded, not yet implemented).

**Planned Algorithm:**
- Initial offer = `buyer_max_price × 0.85` (anchor strategy)
- Concession rates: Round 1–2 → 5%, Round 3–5 → 10%, Round 6+ → 15%
- Max 6 rounds — auto-fail on round 7
- 3 user actions only: `accept`, `reject`, `request_counter`
- Accept → creates `Deal` atomically
- AI formats all messages in Arabic — never decides

### 4. Gemini Module (`backend/src/gemini/`)
Google Gemini 2.5 Flash integration.

- `extractFromMessage(prompt)` — sends to Gemini, returns parsed JSON
- 3× exponential backoff (1s/2s/4s) on 429/5xx errors
- Used only for message formatting + Arabic field extraction — logic stays in backend

### 5. Locations Module (`backend/src/locations/`)
Hierarchical Egypt location reference data with in-memory cache (1-hour TTL).

| Endpoint | Description |
|----------|-------------|
| `GET /locations/governorates` | All active governorates |
| `GET /locations/cities/:governorateId` | Cities under a governorate |
| `GET /locations/districts/:cityId` | Districts under a city |

### 6. Conversations Module (`backend/src/conversations/`)
CRUD for WhatsApp conversation state tracking.
- Find/upsert by phone number (7-day expiry)
- Purge expired non-confirmed conversations

### 7. Listings Module (`backend/src/listings/`)
CRUD for property listings (old WhatsApp flow).
- `publishUnit()` — promotes confirmed SELL/RENT listing into `units` table (searchable inventory)

### 8. Search Module (`backend/src/search/`)
Buyer-matching search against the `units` table.
- Finds up to 5 active SELL units matching criteria (type, location, max price)
- Formats results in Egyptian Arabic

### 9. State Machine (`backend/src/state-machine/`)
Pure-function conversational state machine (zero DB coupling) — drives the old WhatsApp flow.

Flow: `AWAITING_INTENT → AWAITING_UNIT_TYPE → AWAITING_SPECS → AWAITING_MEDIA → AWAITING_CONFIRMATION → CONFIRMED`

Field sequences vary by intent + unit type (e.g., SELL_APARTMENT: area→rooms→floor→finishing→location→price).

### 10. Cleanup Module (`backend/src/cleanup/`)
Cron job — runs every hour to purge expired non-confirmed conversations.

---

## FastAPI Chat UI (`app/`)

Browser-based testing interface at `http://localhost:8000/ui`.

| Endpoint | Description |
|----------|-------------|
| `GET /ui` | Serves HTML chat interface |
| `POST /chat` | In-memory session history (max 40 turns), calls Gemini, extracts quick-reply options |
| `DELETE /chat` | Clear conversation |
| `POST /onboarding/start` | Proxy → NestJS |
| `GET /onboarding/question` | Proxy → NestJS |
| `POST /onboarding/answer` | Proxy → NestJS |
| `GET /locations/*` | Proxy → NestJS |

---

## Two Parallel User Flows

### Flow 1: WhatsApp (Original — free-form Arabic chat)
```
User message → WhatsApp Cloud API → NestJS webhook
  → Gemini extraction → State machine transition
  → Persist conversation + listing → Reply via WhatsApp
```

### Flow 2: Onboarding (New — structured wizard)
```
Browser/App → FastAPI proxy → NestJS /onboarding/*
  → PropertyDraft state machine → Step-by-step Q&A
  → Final submit → Property created in DB
```

---

## Test Suite

| Category | Count | Status |
|----------|-------|--------|
| Unit tests (NestJS) | 205 | ✅ All passing |
| E2E tests (NestJS) | 7 | ✅ All passing |
| TypeScript errors | 0 | ✅ `tsc --noEmit` clean |

---

## Project Progress (74 Tasks Total)

| Sprint | Tasks | Status |
|--------|-------|--------|
| **1.1** Schema & Migration | T01–T10 | ✅ Done |
| **1.2** Onboarding Service | T11–T20 | ✅ Done |
| **1.3** Controller & DTOs | T21–T30 | 🔴 Not started |
| **1.4** Unit & E2E Tests | T31–T43 | 🔴 Not started |
| **1.5** Chat UI Integration | T44–T48 | 🔴 Not started |
| **2.1** Negotiation Service | T49–T55 | 🔴 Not started |
| **2.2** Negotiation Controller | T56–T61 | 🔴 Not started |
| **2.3** Negotiation Tests | T62–T74 | 🔴 Not started |

**Completed:** 20/74 tasks (Sprint 1.1 + 1.2) + all prior NestJS scaffold work  
**Remaining:** ~3.5 weeks of work

---

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **State machine, not free chat** | Structured data collection ensures data quality |
| 2 | **AI never decides in negotiations** | Backend algorithm controls all offers; Gemini only formats Arabic messages |
| 3 | **Max 6 negotiation rounds** | Prevents endless loops, enough for convergence |
| 4 | **First offer = max_price × 0.85** | Anchor strategy per constitution |
| 5 | **Concession schedule: 5%/10%/15%** | Gradual escalation by round bracket |
| 6 | **Draft-first media handling** | Upload to draft during onboarding, transfer to property on submit |
| 7 | **Egyptian Arabic (polite register)** | All user-facing text in عامية مهذبة |
| 8 | **Old intake models kept** | conversations/listings/units deprecated but not removed for backward compatibility |
| 9 | **Location data cached in memory** | 1-hour TTL avoids repeated DB queries for reference data |
| 10 | **Prisma transactions for final submit** | Property + media transfer + draft completion are atomic |

---

## File Structure

```
SemsarAi/
├── backend/                     # NestJS 11 backend (main codebase)
│   ├── prisma/
│   │   ├── schema.prisma        # 15 models + 17 enums
│   │   ├── migrations/          # MySQL migrations
│   │   └── seeds/               # Seed data
│   ├── src/
│   │   ├── main.ts              # App bootstrap (port 3000)
│   │   ├── app.module.ts        # Root module (12 sub-modules)
│   │   ├── whatsapp/            # WhatsApp Cloud API integration
│   │   ├── onboarding/          # Phase 1: Property draft wizard
│   │   ├── negotiation/         # Phase 2: Negotiation engine (stub)
│   │   ├── gemini/              # Gemini 2.5 Flash AI
│   │   ├── locations/           # Egypt location hierarchy
│   │   ├── conversations/       # WhatsApp conversation CRUD
│   │   ├── listings/            # Property listings CRUD
│   │   ├── search/              # Buyer-matching search
│   │   ├── state-machine/       # Pure-function flow engine
│   │   ├── cleanup/             # Cron: expire old conversations
│   │   ├── prompts/             # Arabic system + extraction prompts
│   │   ├── config/              # Environment validation
│   │   ├── common/              # Shared types/interfaces
│   │   └── prisma/              # Prisma ORM module
│   └── test/                    # E2E tests
├── app/                         # FastAPI chat UI (dev/testing)
│   ├── main.py                  # FastAPI server (port 8000)
│   └── static/chat.html         # Browser chat interface
├── specs/                       # Specifications & plans
│   └── 000-master-plan/
│       ├── plan.md              # Master implementation plan
│       └── tasks.md             # 74 tasks (T01–T74)
├── _archive/                    # Old Python MVP (reference only)
└── claude.md                    # AI assistant context file
```
