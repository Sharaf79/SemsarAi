# Semsar AI (سمسار AI) — Complete System Context

> **Generated:** April 10, 2026 | **Purpose:** Single-file context for ChatGPT / external AI

---

## 1. What Is This?

**Semsar AI** is a controlled real-estate platform for Egypt (Cairo, Giza, Alexandria).

- **NOT** a free-chat bot — the backend enforces ALL business logic; AI (Gemini) is only the communication/formatting layer.
- All user-facing text is in **Egyptian Arabic (عامية مهذبة)** — polite colloquial register.
- **Two phases:**
  - **Phase 1** — Guided property listing wizard (strict state machine, one question per step)
  - **Phase 2** — Algorithm-driven buyer/seller negotiation (AI formats messages, never decides)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS 11 (TypeScript), port 3000 |
| **Frontend** | React 18 + Vite + TypeScript, port 5173 |
| **ORM** | Prisma 6.x |
| **Database** | MySQL 8 |
| **AI** | Google Gemini 2.5 Flash |
| **Auth** | JWT (phone-based OTP login) |
| **Prod Chat** | WhatsApp Cloud API |
| **State Mgmt** | React Context (Auth + Chat) + React Query |
| **HTTP Client** | Axios (frontend → backend via Vite `/api` proxy) |
| **Payments** | Paymob / Fawry (scaffolded) |

---

## 3. Architecture Diagram

```
React Frontend (port 5173)          WhatsApp Cloud API (prod)
        │                                    │
        │  Vite proxy /api → :3000           │
        └──────────────┬─────────────────────┘
                       ▼
              NestJS Backend (port 3000)
              ┌─────────────────────────────┐
              │  AuthModule         (JWT+OTP)│
              │  ChatModule         (web AI) │
              │  OnboardingModule   (Ph.1)   │
              │  NegotiationModule  (Ph.2)   │
              │  RecommendationsModule       │
              │  WhatsAppModule     (webhook)│
              │  GeminiModule       (AI)     │
              │  LocationsModule    (Egypt)  │
              │  PropertiesModule   (CRUD)   │
              │  PaymentsModule     (Paymob) │
              │  SearchModule       (match)  │
              │  ConversationModule (engine) │
              │  CleanupModule      (cron)   │
              │  ConversationsModule(legacy) │
              │  ListingsModule     (legacy) │
              └──────────┬──────────────────┘
                         │ Prisma ORM
                         ▼
                    MySQL 8 Database
                  (15 models, 18 enums)
```

---

## 4. Database Schema (Prisma — 15 Models, 18 Enums)

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `User` | Platform users (buyers & sellers) | id (UUID), name, phone (unique), email?, userType (ADMIN/USER), status, isPhoneVerified |
| `OtpCode` | Phone verification codes | phone, code (6-digit), expiresAt, attempts, usedAt? |
| `Property` | Live property listings | userId (FK), title, price, type (SALE/RENT), propertyKind (APARTMENT/VILLA/SHOP/OFFICE), bedrooms?, bathrooms?, areaM2?, governorate, city, district, propertyStatus |
| `PropertyDraft` | In-progress onboarding state | userId, currentStep (enum), data (JSON blob), isCompleted, propertyId? |
| `PropertyMedia` | Images/videos for draft or property | draftId?, propertyId?, url, type (IMAGE/VIDEO) |
| `Location` | Egypt location hierarchy (self-ref) | nameAr, nameEn?, type (GOVERNORATE/CITY/DISTRICT), parentId, sortOrder, isActive |
| `LowerOffice` | Real estate broker offices | officeName, lowerName, governorate, ratingScore, maxProperties |
| `Negotiation` | Active buyer↔seller negotiation | propertyId, buyerId, sellerId, status, currentOffer, minPrice, maxPrice, roundNumber |
| `Offer` | Individual offers within a negotiation | negotiationId, amount, round, createdBy |
| `Deal` | Agreed deal (locked) | negotiationId, buyerId, sellerId, lowerOfficeId?, finalPrice, status |
| `AiLog` | Audit trail of AI actions | negotiationId?, actionType, message?, data? |
| `Payment` | Payment records | userId, dealId, type, amount, fee, provider (MOCK/PAYMOB/FAWRY), status, transactionId?, externalId? |
| `Recommendation` | Property recommendations for buyers | propertyId, buyerId, score, status (UNSEEN/SEEN/DISMISSED/NEGOTIATED) |

### Legacy WhatsApp Flow (deprecated, kept for compatibility)

| Model | Purpose |
|-------|---------|
| `Conversation` | WhatsApp conversation state | whatsappId, flowState, intent, listingId |
| `Listing` | Draft property from WhatsApp | whatsappId, intent, unitType, specs (JSON), price |
| `Unit` | Published searchable unit | listingId, intent, unitType, specs, price, isActive |

### All Enums

| Enum | Values |
|------|--------|
| `UserStatus` | ACTIVE, INACTIVE, BANNED |
| `UserType` | ADMIN, USER |
| `PropertyType` | SALE, RENT |
| `PropertyKind` | APARTMENT, VILLA, SHOP, OFFICE |
| `PropertyStatus` | ACTIVE, INACTIVE, SOLD, RENTED |
| `OfficeStatus` | ACTIVE, INACTIVE |
| `NegotiationStatus` | ACTIVE, AGREED, FAILED |
| `DealStatus` | PENDING, CONFIRMED, CANCELLED |
| `PaymentType` | DEPOSIT, COMMISSION, INSURANCE |
| `PaymentProvider` | MOCK, PAYMOB, FAWRY |
| `PaymentStatus` | PENDING, COMPLETED, FAILED, REFUNDED |
| `AiActionType` | ASK, COUNTER, ACCEPT, REJECT |
| `RecommendationStatus` | UNSEEN, SEEN, DISMISSED, NEGOTIATED |
| `OnboardingStep` | PROPERTY_TYPE, LISTING_TYPE, GOVERNORATE, CITY, DISTRICT, DETAILS, PRICE, MEDIA, REVIEW, COMPLETED |
| `LocationType` | GOVERNORATE, CITY, DISTRICT |
| `MediaType` | IMAGE, VIDEO |
| `FlowState` (legacy) | AWAITING_INTENT, AWAITING_UNIT_TYPE, AWAITING_SPECS, AWAITING_MEDIA, AWAITING_CONFIRMATION, CONFIRMED |
| `Intent` (legacy) | BUY, SELL, RENT, LEASE |
| `UnitType` (legacy) | APARTMENT, LAND, VILLA, COMMERCIAL |
| `ListingStatus` (legacy) | DRAFT, CONFIRMED |

---

## 5. All Backend Endpoints

### Auth Module (`/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/send-otp` | ❌ | Generate 6-digit OTP (dev: auto-returns OTP in response) |
| POST | `/auth/verify-otp` | ❌ | Verify OTP → return JWT + isNewUser flag |
| PATCH | `/auth/profile` | ✅ JWT | Update user name/email |
| GET | `/auth/profile` | ✅ JWT | Get current user profile |

OTP rules: valid 5 min, max 3 attempts, rate limit 3/phone/10min.

### Chat Module (`/chat`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/chat/message` | Optional JWT | Send message to AI (authenticated or anonymous via userId) |

### Onboarding Module (`/onboarding`) — Phase 1

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/onboarding/start` | ✅ | Start/resume PropertyDraft |
| GET | `/onboarding/question` | ✅ | Get current step's Arabic question + options |
| POST | `/onboarding/answer` | ✅ | Submit answer → validate → advance step |
| GET | `/onboarding/review` | ✅ | Get all collected data for review |
| POST | `/onboarding/submit` | ✅ | Final submit → create Property (Prisma transaction) |
| POST | `/onboarding/upload-media` | ✅ | Upload media linked to active draft |

### Negotiation Module (`/negotiations`) — Phase 2

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/negotiations/start` | ✅ JWT | Start negotiation (buyer + property + max budget) |
| POST | `/negotiations/action` | ✅ JWT | Submit action: accept / reject / request_counter |
| GET | `/negotiations/:id` | ✅ JWT | Get negotiation state |
| GET | `/negotiations/:id/history` | ✅ JWT | Get offer history |

### Properties Module (`/properties`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/properties` | ❌ | List properties (filters: sort, page, limit) |
| GET | `/properties/:id/owner-contact` | ✅ JWT | Get owner contact info |

### Locations Module (`/locations`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/locations/governorates` | All Egyptian governorates |
| GET | `/locations/cities` | Cities (filtered by governorate) |
| GET | `/locations/districts` | Districts (filtered by city) |

### Payments Module (`/payments`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/payments/initiate` | ✅ JWT | Start payment (Paymob/Fawry) |
| POST | `/payments/callback/:paymentId` | ❌ | Payment provider callback |

### WhatsApp Module (`/webhook`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/webhook` | Meta verification handshake |
| POST | `/webhook` | Receive messages (HMAC-SHA256 verified) |

### Recommendations Module

Property recommendation engine for buyers (scoring + status tracking).

---

## 6. Phase 1 — Onboarding (Property Listing Wizard)

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
| CITY | اختر المدينة | multi-choice (from DB, filtered) |
| DISTRICT | اختر الحي | multi-choice (from DB, filtered) |
| DETAILS | تفاصيل العقار | form: bedrooms, bathrooms, area_m2 |
| PRICE | السعر المتوقع كام؟ | number (positive, EGP) |
| MEDIA | تحب تضيف صور أو فيديوهات؟ | file upload or "تخطي" (skip) |
| REVIEW | راجع البيانات وأكد | display only |
| COMPLETED | — | terminal state |

### Validation Rules
- `area_m2` > 0 (required for APARTMENT, VILLA; optional for SHOP)
- `bedrooms` ≥ 0, required for APARTMENT + VILLA
- `price` > 0
- `governorate` required; city, district optional
- Wrong step submission → 400

### Final Submit (Prisma Transaction)
1. Validate all required fields in `draft.data`
2. Create `Property` row (map Arabic → DB enums)
3. Transfer all `PropertyMedia` (set propertyId, clear draftId)
4. Mark draft: `isCompleted = true`, `currentStep = COMPLETED`, set `propertyId`
5. Atomic — rollback on failure

---

## 7. Phase 2 — Negotiation Engine

### Core Principle
**Backend algorithm controls ALL decisions. Gemini only formats Arabic messages.**

### Algorithm

| Round | Concession Rate |
|-------|----------------|
| 1–2 | 5% of gap |
| 3–5 | 10% of gap |
| 6+ | 15% of gap |
| 7 | Auto-fail |

- **Initial offer:** `buyer_max_price × 0.85` (anchor strategy)
- **Counter formula:** `gap = maxPrice - minPrice; concession = gap × rate; counterOffer = currentOffer + concession; clamped to [minPrice, maxPrice]`
- **Auto-accept:** when `counterOffer ≥ minPrice` (listing price)

### 3 User Actions Only
- `accept` → creates `Deal` atomically, status = AGREED
- `reject` → status = FAILED
- `request_counter` → calculates next offer, increments round; round 7 → auto FAIL

### Arabic Messages (Gemini formats, never decides)
- Counter: `"بكل احترام، السعر الحالي هو {price} جنيه. هل يناسب حضرتك؟"`
- Accept: `"تم الاتفاق على {price} جنيه. برجاء استكمال الدفع."`
- Reject: `"نأسف، لم نتمكن من الوصول لاتفاق مناسب."`

---

## 8. Frontend Structure

### Routing
```
QueryClientProvider → AuthProvider → ChatProvider → BrowserRouter
  ├── /                        → HomePage (property grid + filters)
  ├── /negotiation/:id         → NegotiationPage
  ├── /payment/:paymentId      → MockPaymentPage
  └── *                        → HomePage (catch-all)
  └── <ChatWidget />           (floating AI chat, always visible)
```

### Pages & Components

| Component | Purpose |
|-----------|---------|
| `HomePage` | Property grid with search filters |
| `NegotiationPage` | Real-time negotiation view |
| `MockPaymentPage` | Dev payment testing page |
| `AuthModal` | Phone OTP login + profile creation (3 steps) |
| `ChatWidget` | Floating AI chat bubble (persists across pages) |
| `FilterSidebar` | Property search/filter controls |
| `Navbar` | Top navigation header |
| `PropertyCard` | Individual property listing card |
| `PropertyGrid` | Grid layout for property cards |
| `NegotiationModal` | Start a new negotiation dialog |

### API Modules (`frontend/src/api/`)

| File | Endpoints Used |
|------|----------------|
| `client.ts` | Axios instance with JWT interceptor + auto-logout on 401 |
| `auth.ts` | send-otp, verify-otp, profile CRUD |
| `chat.ts` | POST /chat/message |
| `locations.ts` | governorates, cities, districts |
| `negotiations.ts` | start, action, get status, history |
| `payments.ts` | initiate, callback |
| `properties.ts` | list properties, get owner contact |

### State Management

| Store | Mechanism | Key State |
|-------|-----------|-----------|
| `AuthContext` | React Context + useReducer | token, user, login(), logout() |
| `ChatContext` | React Context | Chat messages, session |

### Vite Proxy
`/api/*` → `http://localhost:3000` (strips `/api` prefix)

---

## 9. Auth Flow

```
1. User enters phone → POST /auth/send-otp
2. Backend generates 6-digit OTP → saves to DB → sends via WhatsApp
   (Dev mode: OTP returned in response + logged to console)
3. User enters OTP → POST /auth/verify-otp
4. Backend verifies → returns JWT token + isNewUser flag
5. If new user → profile form → PATCH /auth/profile
6. JWT stored in localStorage → Bearer token on all requests
7. 401 → auto-logout (clear localStorage)
```

---

## 10. Other Backend Modules

### Gemini Module
- `extractFromMessage(prompt)` → Gemini 2.5 Flash, returns parsed JSON
- 3× exponential backoff (1s/2s/4s) on 429/5xx
- Used ONLY for: Arabic message formatting, field extraction from free text

### Locations Module
- Hierarchical Egypt reference: Governorate → City → District
- In-memory cache, 1-hour TTL
- Seeded from DB

### WhatsApp Module (original flow)
- GET `/webhook` — Meta verification handshake
- POST `/webhook` — Receive messages (HMAC-SHA256)
- Orchestrator: message → Gemini extraction → state machine → persist → reply

### Search Module
- Up to 5 active SALE units matching buyer criteria (type, location, max price)
- Results formatted in Egyptian Arabic

### Cleanup Module
- Cron: runs every hour, purges expired non-confirmed conversations (>7 days)

### Conversation Engine Module
- Core conversation management for web chat

### Recommendations Module
- Property recommendation scoring for buyers
- Status tracking: UNSEEN → SEEN → DISMISSED / NEGOTIATED

---

## 11. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | MySQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | ❌ | Token expiry (default: 7d) |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `WHATSAPP_TOKEN` | ✅ | WhatsApp Cloud API access token |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Meta webhook verification token |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | WhatsApp phone number ID |
| `WHATSAPP_APP_SECRET` | ✅ | Facebook app secret (HMAC) |
| `NODE_ENV` | ❌ | development / production |

---

## 12. File Structure

```
SemsarAi/
├── backend/                          # NestJS 11 backend (main codebase)
│   ├── prisma/
│   │   ├── schema.prisma             # 15 models + 18 enums
│   │   ├── migrations/               # MySQL migrations
│   │   └── seeds/                    # Location seed data
│   ├── src/
│   │   ├── main.ts                   # Bootstrap (port 3000, CORS, validation)
│   │   ├── app.module.ts             # Root module (16 sub-modules)
│   │   ├── auth/                     # JWT + OTP auth
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── guards/               # JwtAuthGuard, OptionalJwtAuthGuard
│   │   │   ├── decorators/           # @CurrentUser()
│   │   │   └── dto/                  # SendOtpDto, VerifyOtpDto, UpdateProfileDto
│   │   ├── chat/                     # Web chat (POST /chat/message)
│   │   ├── onboarding/               # Phase 1: Property wizard
│   │   │   ├── onboarding.service.ts
│   │   │   ├── onboarding.controller.ts
│   │   │   └── constants/questions.ts
│   │   ├── negotiation/              # Phase 2: Negotiation engine
│   │   │   ├── negotiation.service.ts
│   │   │   └── negotiation.controller.ts
│   │   ├── recommendations/          # Property recommendations
│   │   ├── whatsapp/                 # WhatsApp webhook + orchestrator
│   │   ├── gemini/                   # Gemini 2.5 Flash + retry logic
│   │   ├── locations/                # Egypt location hierarchy + cache
│   │   ├── properties/               # Property listing CRUD
│   │   ├── payments/                 # Paymob/Fawry payments
│   │   ├── search/                   # Buyer-matching search
│   │   ├── conversation-engine/      # Conversation engine
│   │   ├── conversations/            # Legacy WhatsApp conversations
│   │   ├── listings/                 # Legacy listings
│   │   ├── state-machine/            # Legacy flow engine
│   │   ├── cleanup/                  # Cron: expire old data
│   │   ├── prompts/                  # Arabic system prompts
│   │   ├── config/                   # Env variable validation
│   │   ├── common/                   # Shared types/interfaces
│   │   └── prisma/                   # Prisma ORM module
│   └── test/                         # E2E tests
│
├── frontend/                         # React 18 + Vite + TypeScript
│   ├── src/
│   │   ├── App.tsx                   # Root: providers + router
│   │   ├── main.tsx                  # Entry point
│   │   ├── api/                      # Axios API modules
│   │   ├── components/               # UI components
│   │   ├── pages/                    # HomePage, NegotiationPage, MockPaymentPage
│   │   ├── store/                    # AuthContext, ChatContext
│   │   └── types/                    # TypeScript interfaces
│   └── vite.config.ts               # Proxy /api → localhost:3000
│
├── app/                              # FastAPI dev UI (Python, legacy)
├── specs/000-master-plan/            # Specifications & task tracking
│   ├── plan.md
│   └── tasks.md                      # 74 tasks (T01–T74)
└── _archive/                         # Old Python MVP (reference only)
```

---

## 13. Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | State machine, not free chat | Structured data collection ensures quality |
| 2 | AI never decides in negotiations | Backend algorithm controls all offers; Gemini only formats Arabic |
| 3 | Max 6 negotiation rounds | Prevents endless loops, enough for convergence |
| 4 | First offer = max_price × 0.85 | Anchor strategy |
| 5 | Concession schedule: 5%/10%/15% | Gradual escalation by round bracket |
| 6 | Draft-first media handling | Upload to draft, transfer to property on submit |
| 7 | Egyptian Arabic (polite register) | All user-facing text in عامية مهذبة |
| 8 | Dev OTP fallback | When WhatsApp token is invalid, OTP auto-fills in dev |
| 9 | Location data cached in memory | 1-hour TTL avoids repeated DB queries |
| 10 | Prisma transactions for submit | Property + media + draft completion are atomic |
| 11 | Old intake models kept | conversations/listings/units deprecated but not removed |

---

## 14. Current Status

| Area | Status |
|------|--------|
| Auth (OTP + JWT) | ✅ Working |
| Frontend (React) | ✅ Working (HomePage, AuthModal, ChatWidget, NegotiationPage, MockPaymentPage) |
| Onboarding Service | ✅ Implemented |
| Onboarding Controller | ✅ Wired |
| Negotiation Service | ✅ Implemented |
| Negotiation Controller | ✅ Wired |
| Recommendations | ✅ Working |
| Properties API | ✅ Working |
| Locations API | ✅ Working |
| Payments API | ✅ Scaffolded (Mock provider works) |
| WhatsApp Integration | ⚠️ Token expired (dev fallback works) |
| Tests | ✅ 205 unit + 7 e2e passing |
| TypeScript | ✅ `tsc --noEmit` clean |

---

## 15. Running the System

```bash
# Backend (NestJS)
cd backend && npm run start:dev     # → http://localhost:3000

# Frontend (React + Vite)
cd frontend && npm run dev          # → http://localhost:5173

# Frontend proxies /api/* → backend automatically
```

---

## 16. Two Parallel User Flows

### Flow A: Web App (React Frontend)
```
User → React UI (port 5173) → Vite proxy /api → NestJS (port 3000)
  → Auth (OTP login) → Browse properties → Start negotiation
  → AI Chat (ChatWidget) → Payments
```

### Flow B: WhatsApp (Original)
```
User message → WhatsApp Cloud API → NestJS /webhook
  → HMAC verify → Gemini extraction → State machine
  → Persist conversation + listing → Reply via WhatsApp
```

### Flow C: Onboarding (Structured Wizard)
```
Any client → POST /onboarding/start → GET /onboarding/question
  → POST /onboarding/answer (loop per step)
  → GET /onboarding/review → POST /onboarding/submit
  → Property created atomically in DB
```
