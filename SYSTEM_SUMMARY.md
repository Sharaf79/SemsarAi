# Semsar AI (سمسار AI) — Full System Summary

> **Generated:** April 3, 2026 | **Purpose:** Share with external AI for context

---

## 1. What Is This?

**Semsar AI** is a controlled real-estate platform for Egypt (Cairo, Giza, Alexandria).

- **NOT** a free-chat bot — backend enforces ALL business logic; AI (Gemini) is only the communication/formatting layer.
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

---

## 3. Architecture

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
```

---

## 4. Frontend Structure

### Dependencies
- `react` 18, `react-dom` 18, `react-router-dom` 6
- `@tanstack/react-query` 5 (server state)
- `axios` 1.7 (HTTP client)
- `vite` 5, `typescript` 5

### Routing
```
QueryClientProvider → AuthProvider → ChatProvider → BrowserRouter
  ├── /                    → HomePage (property grid + filters)
  ├── /negotiation/:id     → NegotiationPage
  └── *                    → HomePage (catch-all)
  └── <ChatWidget />       (floating AI chat, always visible)
```

### Pages
| Page | Route | Description |
|------|-------|-------------|
| `HomePage` | `/` | Property grid with search filters |
| `NegotiationPage` | `/negotiation/:id` | Real-time negotiation view |

### Components
| Component | Purpose |
|-----------|---------|
| `AuthModal` | Phone OTP login + profile creation (3 steps) |
| `ChatWidget` | Floating AI chat bubble (persists across pages) |
| `FilterSidebar` | Property search/filter controls |
| `Navbar` | Top navigation header |
| `PropertyCard` | Individual property listing card |
| `PropertyGrid` | Grid layout for property cards |
| `NegotiationModal` | Start a new negotiation dialog |

### API Modules (`src/api/`)
| File | Endpoints |
|------|-----------|
| `client.ts` | Axios instance with JWT interceptor + auto-logout on 401 |
| `auth.ts` | `POST /auth/send-otp`, `POST /auth/verify-otp`, `PATCH /auth/profile`, `GET /auth/profile` |
| `chat.ts` | `POST /chat/message` |
| `locations.ts` | `GET /locations/governorates`, cities, districts |
| `negotiations.ts` | `POST /negotiations/start`, action, `GET /:id`, history |
| `payments.ts` | `POST /payments/initiate`, callback |
| `properties.ts` | `GET /properties`, `GET /properties/:id/owner-contact` |

### State Management
| Store | Mechanism | Key State |
|-------|-----------|-----------|
| `AuthContext` | React Context + useReducer | `token`, `user`, `login()`, `logout()` |
| `ChatContext` | React Context | Chat messages, session |

### Vite Proxy
- `/api/*` → `http://localhost:3000` (strips `/api` prefix)
- Example: `GET /api/properties` → `GET http://localhost:3000/properties`

---

## 5. Backend Modules & Endpoints

### Auth Module (`/auth`)
Phone-based OTP authentication with JWT tokens.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/send-otp` | ❌ | Generate 6-digit OTP, send via WhatsApp (dev: auto-returns OTP) |
| POST | `/auth/verify-otp` | ❌ | Verify OTP → return JWT + create user if new |
| PATCH | `/auth/profile` | ✅ JWT | Update user name/email |
| GET | `/auth/profile` | ✅ JWT | Get current user profile |

- OTP valid for 5 minutes, max 3 attempts
- Rate limit: 3 OTPs per phone per 10 minutes
- Dev mode: OTP returned in response (`devOtp` field) + logged to console

### Chat Module (`/chat`)
Web-based AI chat for the frontend.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/chat/message` | Optional JWT | Send message (authenticated or anonymous via `userId`) |

### Onboarding Module (`/onboarding`) — Phase 1
Step-by-step property listing wizard.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/onboarding/start` | ✅ | Start/resume PropertyDraft |
| GET | `/onboarding/question` | ✅ | Get current step's Arabic question + options |
| POST | `/onboarding/answer` | ✅ | Submit answer → validate → advance step |
| GET | `/onboarding/review` | ✅ | Get all collected data for review |
| POST | `/onboarding/submit` | ✅ | Final submit → create Property (Prisma transaction) |
| POST | `/onboarding/upload-media` | ✅ | Upload media linked to active draft |

**10-Step Flow:**
```
PROPERTY_TYPE → LISTING_TYPE → GOVERNORATE → CITY → DISTRICT → DETAILS* → PRICE → MEDIA → REVIEW → COMPLETED
                                                                  (* skipped for SHOP)
```

### Negotiation Module (`/negotiations`) — Phase 2
Algorithm-driven buyer/seller negotiation.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/negotiations/start` | ✅ JWT | Start negotiation (buyer + property + budget) |
| POST | `/negotiations/action` | ✅ JWT | Submit action: accept / reject / request_counter |
| GET | `/negotiations/:id` | ✅ JWT | Get negotiation state |
| GET | `/negotiations/:id/history` | ✅ JWT | Get offer history |

**Algorithm:**
- Initial offer = `buyer_max_price × 0.85`
- Concession: Round 1-2 → 5%, Round 3-5 → 10%, Round 6+ → 15%
- Max 6 rounds, auto-fail on round 7
- Only 3 user actions: `accept`, `reject`, `request_counter`

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

### Other Modules
- **GeminiModule** — Gemini 2.5 Flash integration with 3× exponential backoff
- **SearchModule** — Buyer-matching: up to 5 active units by type/location/price
- **CleanupModule** — Cron: purge expired conversations every hour
- **ConversationsModule** — Legacy WhatsApp conversation CRUD
- **ListingsModule** — Legacy property listings CRUD

---

## 6. Database Schema

### Core Models (Prisma)

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `User` | Platform users | id (UUID), name, phone (unique), email?, userType, status, isPhoneVerified |
| `OtpCode` | Phone verification codes | phone, code (6-digit), expiresAt, attempts, usedAt? |
| `Property` | Live listings | userId (FK), title, price, type (SALE/RENT), propertyKind, bedrooms?, bathrooms?, areaM2?, location fields |
| `PropertyDraft` | Onboarding state | userId, currentStep (enum), data (JSON), isCompleted, propertyId? |
| `PropertyMedia` | Images/videos | draftId?, propertyId?, url, type (IMAGE/VIDEO) |
| `Negotiation` | Active negotiation | propertyId, buyerId, sellerId, status, currentOffer?, minPrice?, maxPrice?, roundNumber |
| `Offer` | Individual offers | negotiationId, amount, round, createdBy |
| `Deal` | Agreed deals | negotiationId, buyerId, sellerId, finalPrice, status |
| `AiLog` | AI action audit trail | negotiationId, actionType |
| `Payment` | Payment records | dealId, type, amount, provider (PAYMOB/FAWRY), status |
| `Location` | Egypt hierarchy | name, type (GOVERNORATE/CITY/DISTRICT), parentId (self-ref) |
| `LowerOffice` | Broker offices | officeName, governorate, ratingScore |

### Legacy Models (deprecated, kept for compatibility)
`Conversation` → `Listing` → `Unit`

### Key Enums
| Enum | Values |
|------|--------|
| `OnboardingStep` | PROPERTY_TYPE, LISTING_TYPE, GOVERNORATE, CITY, DISTRICT, DETAILS, PRICE, MEDIA, REVIEW, COMPLETED |
| `PropertyType` | SALE, RENT |
| `PropertyKind` | APARTMENT, VILLA, SHOP, OFFICE |
| `PropertyStatus` | ACTIVE, INACTIVE, SOLD, RENTED |
| `NegotiationStatus` | ACTIVE, AGREED, FAILED |
| `DealStatus` | PENDING, CONFIRMED, CANCELLED |
| `PaymentStatus` | PENDING, COMPLETED, FAILED, REFUNDED |
| `AiActionType` | ASK, COUNTER, ACCEPT, REJECT |
| `LocationType` | GOVERNORATE, CITY, DISTRICT |

---

## 7. Auth Flow (Current Implementation)

```
1. User enters phone number → POST /auth/send-otp
2. Backend generates 6-digit OTP → saves to DB → sends via WhatsApp
   (Dev mode: OTP returned in response + logged to terminal)
3. User enters OTP → POST /auth/verify-otp
4. Backend verifies OTP → returns JWT token + isNewUser flag
5. If new user → frontend shows profile form → PATCH /auth/profile
6. JWT stored in localStorage → sent as Bearer token on all requests
7. 401 responses → auto-logout (clear localStorage)
```

---

## 8. File Structure

```
SemsarAi/
├── backend/                          # NestJS 11 backend
│   ├── prisma/
│   │   ├── schema.prisma             # 15 models + 17 enums
│   │   ├── migrations/               # MySQL migrations
│   │   └── seeds/                    # Location seed data
│   ├── src/
│   │   ├── main.ts                   # Bootstrap (port 3000, CORS, validation)
│   │   ├── app.module.ts             # Root module (14 sub-modules)
│   │   ├── auth/                     # JWT + OTP auth
│   │   │   ├── auth.service.ts       # OTP generation, verification, JWT signing
│   │   │   ├── auth.controller.ts    # /auth/* endpoints
│   │   │   ├── guards/               # JwtAuthGuard, OptionalJwtAuthGuard
│   │   │   ├── decorators/           # @CurrentUser()
│   │   │   └── dto/                  # SendOtpDto, VerifyOtpDto, UpdateProfileDto
│   │   ├── chat/                     # Web chat (POST /chat/message)
│   │   ├── onboarding/               # Phase 1: Property wizard
│   │   ├── negotiation/              # Phase 2: Negotiation engine
│   │   ├── whatsapp/                 # WhatsApp Cloud API webhook
│   │   ├── gemini/                   # Gemini 2.5 Flash AI integration
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
│   │   ├── api/                      # Axios API modules (client, auth, chat, etc.)
│   │   ├── components/               # UI components (AuthModal, ChatWidget, etc.)
│   │   ├── pages/                    # HomePage, NegotiationPage
│   │   ├── store/                    # AuthContext, ChatContext
│   │   └── types/                    # TypeScript interfaces
│   └── vite.config.ts               # Proxy /api → localhost:3000
│
├── app/                              # FastAPI dev UI (Python, legacy)
├── specs/                            # Specifications & plans
│   └── 000-master-plan/
│       ├── plan.md
│       └── tasks.md                  # 74 tasks (T01–T74)
└── _archive/                         # Old Python MVP (reference only)
```

---

## 9. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | MySQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | ❌ | Token expiry (default: `7d`) |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `WHATSAPP_TOKEN` | ✅ | WhatsApp Cloud API access token |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Meta webhook verification token |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | WhatsApp phone number ID |
| `WHATSAPP_APP_SECRET` | ✅ | Facebook app secret (HMAC verification) |
| `NODE_ENV` | ❌ | `development` / `production` |

---

## 10. Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | State machine, not free chat | Structured data collection ensures quality |
| 2 | AI never decides in negotiations | Backend algorithm controls all offers; Gemini only formats Arabic |
| 3 | Max 6 negotiation rounds | Prevents endless loops |
| 4 | First offer = max_price × 0.85 | Anchor strategy |
| 5 | Concession schedule: 5%/10%/15% | Gradual escalation by round |
| 6 | Draft-first media handling | Upload to draft, transfer to property on submit |
| 7 | Egyptian Arabic (polite register) | All user-facing text in عامية مهذبة |
| 8 | Dev OTP fallback | When WhatsApp token is invalid, OTP is auto-filled in dev mode |
| 9 | Location data cached in memory | 1-hour TTL avoids repeated DB queries |
| 10 | Prisma transactions for submit | Property + media + draft completion are atomic |

---

## 11. Running the System

```bash
# Backend (NestJS)
cd backend && npm run start:dev     # → http://localhost:3000

# Frontend (React + Vite)
cd frontend && npm run dev          # → http://localhost:5173

# The frontend proxies /api/* to the backend automatically.
```

---

## 12. Current Status

| Area | Status |
|------|--------|
| Auth (OTP + JWT) | ✅ Working |
| Frontend (React) | ✅ Working (HomePage, AuthModal, ChatWidget, NegotiationPage) |
| Onboarding Service | ✅ Implemented |
| Onboarding Controller | ✅ Wired |
| Negotiation Service | ✅ Implemented |
| Negotiation Controller | ✅ Wired |
| Properties API | ✅ Working |
| Locations API | ✅ Working |
| Payments API | ✅ Scaffolded |
| WhatsApp Integration | ⚠️ Token expired (works in dev with fallback) |
| Tests | ✅ 205 unit + 7 e2e passing |
