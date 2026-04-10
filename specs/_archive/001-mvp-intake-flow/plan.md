# Implementation Plan: MVP WhatsApp Conversational Intake Flow

**Branch**: `001-mvp-intake-flow` | **Date**: 2026-03-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-mvp-intake-flow/spec.md`

## Summary

Build a WhatsApp-integrated conversational intake system (the "Semsar Ai" engine) that collects property listings from Egyptian users via a sequential, one-question-per-message state machine. The backend is a FastAPI service running on Cloudflare Workers (Vercel as fallback), using Gemini 1.5 Flash for Egyptian Arabic NLU extraction, Supabase for conversation state and listing persistence, and the WhatsApp Cloud API for messaging. Confirmed SELL/RENT listings are published to a `units` table; confirmed BUY requests trigger a database search against `units` and return up to 5 matching properties. All user-facing interactions are in Egyptian Arabic (Ammiya).

## Technical Context

**Language/Version**: Python 3.13 (Conda `pyt13` environment on Mac M4 for dev)  
**Primary Dependencies**: FastAPI, Uvicorn, google-genai (Gemini SDK), supabase-py, python-dotenv, httpx  
**Storage**: Supabase (PostgreSQL) — free tier: 500MB / 50K MAU; pgvector reserved for future matching  
**Testing**: pytest + httpx (AsyncClient for endpoint tests), pytest-asyncio  
**Target Platform**: Cloudflare Workers (Python) or Vercel serverless — Mac M4 localhost for dev  
**Project Type**: Web service (API backend)  
**Performance Goals**: ≤3s p95 end-to-end latency; ≤15 RPM Gemini; ≤100K req/day compute  
**Constraints**: $0 operational cost (free tiers only); Egyptian Arabic only; WhatsApp-exclusive interface  
**Scale/Scope**: MVP — single-user sequential flows; Apartment + Land unit types; database-only search matching (SQL WHERE on `units` table); no commission

## Constitution Check

*GATE: Validated against Semsar AI Project Constitution (`.claude/commands/speckit.constitution.md`)*

| # | Constitution Principle | Status | Evidence |
|---|---|---|---|
| §1 | Identity & Persona — Egyptian Arabic (Ammiya) only | ✅ Pass | FR-007: all user messages in Ammiya; English only in logs |
| §2 | Privacy Firewall — never attribute info to a party | ✅ Pass | FR-008: privacy firewall enforced in prompt + validation |
| §2 | Strategic Patience — push for midpoint over 2-3 rounds | ⏳ Deferred | Not applicable to intake flow; applies to future negotiation feature |
| §3 | One-at-a-Time questioning | ✅ Pass | FR-002: exactly one question per message |
| §3 | Routing Gate — Buy/Sell vs Rent field differences | ✅ Pass | FR-001, FR-003: intent routing + unit-specific field sequences |
| §3 | Unit Specifics — Apartment vs Land fields | ✅ Pass | FR-003: Apartment (area, floor, rooms, finishing, location) vs Land (area, legal status, zoning) |
| §3 | Media First — encourage photo/video upload | ✅ Pass | FR-009: media encouragement after unit_type determined |
| §4 | Summary Block + Confirmation Loop | ✅ Pass | FR-004: Summary Card with confirm/correct cycle |
| §4 | No Hallucinations — mark missing fields as "Pending" | ✅ Pass | FR-005: unspecified fields marked Pending |
| §5 | No phone sharing until deal accepted | ✅ Pass | FR-010: PII masked until mutual acceptance |
| §5 | No Fusha — natural Egyptian street Arabic | ✅ Pass | FR-007: zero Fusha tolerance |
| §5 | Act like a broker, not a chatbot | ✅ Pass | Constitution injected as system prompt for Gemini persona |

**Gate result**: ✅ All applicable principles pass. 1 deferred (Strategic Patience — future negotiation feature).

## Project Structure

### Documentation (this feature)

```text
specs/001-mvp-intake-flow/
├── plan.md              # This file
├── research.md          # Phase 0: tech research & decisions
├── data-model.md        # Phase 1: Supabase schema design
├── quickstart.md        # Phase 1: dev setup & run guide
├── contracts/           # Phase 1: API contracts
│   └── webhook-api.md   # POST /webhook endpoint contract
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── main.py                  # FastAPI app factory, lifespan, CORS
├── config.py                # Settings (env vars: Gemini, Supabase, WhatsApp)
├── models/
│   ├── __init__.py
│   ├── conversation.py      # Conversation Pydantic model + FlowState enum
│   ├── listing.py           # Listing Pydantic model + UnitType/Intent enums
│   └── unit.py              # Unit Pydantic model (published searchable property)
├── services/
│   ├── __init__.py
│   ├── gemini_service.py    # Gemini 1.5 Flash wrapper (persona injection, extraction)
│   ├── supabase_service.py  # Supabase CRUD (conversations, listings)
│   ├── search_service.py    # Search units table by buyer criteria, format results
│   ├── state_machine.py     # Flow state transitions + field sequencing
│   └── whatsapp_service.py  # WhatsApp Cloud API send/receive + HMAC verification
├── api/
│   ├── __init__.py
│   └── webhook.py           # POST /webhook endpoint (WhatsApp webhook handler)
└── prompts/
    ├── system_prompt.py     # Constitution-based system prompt builder
    └── extraction_prompt.py # JSON extraction prompt templates per field

tests/
├── conftest.py              # Shared fixtures (mock Supabase, mock Gemini)
├── unit/
│   ├── test_state_machine.py
│   ├── test_gemini_service.py
│   └── test_models.py
├── integration/
│   ├── test_webhook_flow.py # Full sell-apartment flow via TestClient
│   └── test_supabase.py     # Live Supabase integration (optional, CI-gated)
└── contract/
    └── test_whatsapp_hmac.py # Webhook signature verification tests

.env.example                 # Template for required env vars
requirements.txt             # Python dependencies
```

**Structure Decision**: Single-project web service. No frontend (WhatsApp IS the UI). The `src/` directory contains all backend code with clear separation: `models/` for data structures, `services/` for business logic, `api/` for HTTP handlers, `prompts/` for LLM prompt management. Tests mirror the src structure with unit/integration/contract tiers.

## Phase 0: Research Summary

Key technical decisions documented in [research.md](research.md):

1. **Gemini SDK**: Use `google-genai` (2026 unified SDK) — supports system instructions, structured JSON output mode, and streaming.
2. **WhatsApp Integration**: WhatsApp Cloud API via Meta Graph API v21.0. Webhook receives messages; outbound via `POST /{phone-number-id}/messages`.
3. **State Machine**: Pure Python enum-based FSM in `state_machine.py` — no external library needed for the linear intake flow.
4. **Supabase Client**: `supabase-py` async client for all DB operations; Row-Level Security (RLS) not needed for server-side-only access.
5. **Deployment**: Start with localhost (Uvicorn), then Vercel Python runtime (simplest free deployment for FastAPI).

## Phase 1: Architecture & Design

### Data Flow

```
WhatsApp User
    │
    ▼
WhatsApp Cloud API (Meta)
    │ webhook POST /webhook
    ▼
┌─────────────────────────────────┐
│  FastAPI (webhook.py)           │
│  1. Verify X-Hub-Signature-256  │
│  2. Parse incoming message      │
│  3. Load conversation state     │
│  4. Run state_machine.next()    │
│  5. Call Gemini for extraction   │
│  6. Persist updated state       │
│  7. Send reply via WhatsApp API │
└─────────────────────────────────┘
    │                    │
    ▼                    ▼
Supabase (PostgreSQL)   Gemini 1.5 Flash
- conversations table   - System prompt (Constitution)
- listings table        - JSON extraction per field
- units table (search)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| LLM for extraction | Gemini 1.5 Flash | Free tier (15 RPM), fast, good Arabic support |
| State tracking | `flow_state` enum + `current_field` string | Simple, explicit; avoids JSONB complexity for linear flows |
| Conversation expiry | `expires_at = updated_at + 7 days` | Supabase cron or application-level check on each request |
| Webhook security | HMAC-SHA256 signature validation | Standard WhatsApp Cloud API mechanism; zero cost |
| Retry strategy | 3x exponential backoff for Gemini | Handles rate limits without losing user state |
| Session resumption | Welcome-back + re-state last question | Natural broker UX; no state reset |
| Search strategy | SQL WHERE on `units` table (ILIKE + numeric range) | Simple, zero-cost; pgvector upgrade path for semantic search later |
| Units vs Listings | Separate `units` table for published properties | Clean separation: `listings` = intake data, `units` = searchable inventory |

### Contracts

Detailed API contracts in [contracts/webhook-api.md](contracts/webhook-api.md).

### Data Model

Full schema in [data-model.md](data-model.md).

### Developer Quickstart

Setup and run instructions in [quickstart.md](quickstart.md).
