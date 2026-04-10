# Research: MVP WhatsApp Conversational Intake Flow

**Branch**: `001-mvp-intake-flow` | **Date**: 2026-03-27

## 1. Gemini 1.5 Flash — LLM Engine

### SDK: `google-genai`
- The 2026 unified Google AI SDK (`google-genai`) replaces the older `google-generativeai` package.
- Supports **system instructions** (used to inject the Semsar AI Constitution as persona).
- Supports **structured output** / JSON mode — critical for extracting field values from free-text Arabic.
- Streaming available but not needed for MVP (single-turn extraction per message).

### Free Tier Limits
| Metric | Limit |
|---|---|
| Requests per minute (RPM) | 15 |
| Tokens per minute (TPM) | 1,000,000 |
| Requests per day (RPD) | 1,500 |

### Arabic (Ammiya) Performance
- Gemini 1.5 Flash handles Egyptian Arabic well for intent classification and entity extraction.
- Prompt engineering required: explicit instruction to respond only in Ammiya, with examples of colloquial phrasing.
- Extraction prompt should request JSON with specific field names to avoid ambiguity.

### Retry Strategy
- On 429 (rate limit) or 5xx: exponential backoff (1s, 2s, 4s) up to 3 retries.
- Send a hold message ("ثانية واحدة...") to user during retry.
- On persistent failure: graceful error message in Ammiya; conversation state preserved in Supabase.

---

## 2. WhatsApp Cloud API

### Integration Model
- **Webhook**: Meta sends incoming messages to our `POST /webhook` endpoint.
- **Outbound**: We send replies via `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`.
- **Auth**: Bearer token (permanent system user token or short-lived with refresh).

### Webhook Verification
- Initial setup: Meta sends a GET request with `hub.verify_token`; we respond with `hub.challenge`.
- Ongoing: Every POST includes `X-Hub-Signature-256` header — HMAC-SHA256 of payload using app secret.
- **Decision**: Validate signature on every request (FR-015). Reject HTTP 401 if invalid.

### Message Types Used
| Type | Direction | Use Case |
|---|---|---|
| Text | Inbound | User's free-text replies |
| Text | Outbound | Bot questions, Summary Card, error messages |
| Image/Video | Inbound | Media uploads (photos/videos of property) |
| Image/Video | Outbound | Not needed for MVP |

### Media Handling
- Inbound media arrives as a media ID; we call `GET /{media_id}` to get a download URL.
- Store the URL in `media_urls[]` on the Listing entity.
- No need to download/re-host media for MVP — WhatsApp CDN URLs suffice (they expire after ~30 days; acceptable for MVP).

---

## 3. Supabase (PostgreSQL)

### Client Library
- `supabase-py` (async) for all DB operations.
- Server-side only — no Row-Level Security (RLS) needed; use service role key.
- Connection via REST API (PostgREST), not direct PostgreSQL connection — works well with serverless.

### Free Tier Limits
| Metric | Limit |
|---|---|
| Database size | 500 MB |
| Monthly active users | 50,000 |
| API requests | Unlimited (REST) |
| Edge functions | 500K invocations/month |

### Conversation Expiry Implementation
- **Option A (chosen)**: Application-level check — on each incoming message, check `expires_at < now()`. If expired, delete conversation and start fresh.
- **Option B (future)**: Supabase cron extension (`pg_cron`) to run periodic cleanup. Not needed for MVP traffic.

---

## 4. State Machine Design

### Approach: Enum-Based FSM
- No external library needed. Python `Enum` for `FlowState` + a `current_field` string for sub-state within `AWAITING_SPECS`.
- Transition function: `(current_state, current_field, user_input) → (next_state, next_field, bot_response_type)`.

### Field Sequences by Unit Type

**Apartment (SELL)**:
`area → rooms → floor → finishing → location → price`

**Land (SELL)**:
`total_area → legal_status → zoning → location → price`

**Apartment/Land (BUY)**:
`unit_type → location → budget → min_area → min_rooms`

**Any (RENT)**:
`unit_type → location → monthly_budget → duration → rooms`

### State Transition Table

| Current State | Input | Next State | Notes |
|---|---|---|---|
| `AWAITING_INTENT` | valid intent | `AWAITING_UNIT_TYPE` | Persist intent |
| `AWAITING_UNIT_TYPE` | valid type | `AWAITING_SPECS` | Set `current_field` to first field for type |
| `AWAITING_SPECS` | valid field value | `AWAITING_SPECS` | Advance `current_field` |
| `AWAITING_SPECS` | last field answered | `AWAITING_MEDIA` | All specs collected |
| `AWAITING_MEDIA` | media or skip | `AWAITING_CONFIRMATION` | Store URLs or skip |
| `AWAITING_CONFIRMATION` | "صح" (confirm) | `CONFIRMED` | Mark listing confirmed |
| `AWAITING_CONFIRMATION` | correction request | `AWAITING_SPECS` | Set `current_field` to target field |
| Any state | unrecognizable | Same state | Re-ask same question politely |

---

## 5. Deployment Strategy

### Development (Phase 1)
- Mac M4, Conda `pyt13` env, Uvicorn on `localhost:8000`.
- ngrok or Cloudflare Tunnel for WhatsApp webhook during local dev.
- Ollama (Llama 3.1 8B) as optional offline Gemini substitute for testing prompt logic.

### Production (Phase 2)
- **Primary**: Vercel Python runtime (free tier: 100K requests/day, 10s function timeout).
  - FastAPI works natively with Vercel via `api/index.py` adapter.
- **Alternative**: Cloudflare Workers (Python beta) if Vercel latency is insufficient.
- Supabase stays as managed PostgreSQL (no self-hosting needed).

### Environment Variables
```
GEMINI_API_KEY=           # Google AI Studio API key
SUPABASE_URL=             # Supabase project URL
SUPABASE_KEY=             # Supabase service role key
WHATSAPP_TOKEN=           # WhatsApp Cloud API bearer token
WHATSAPP_PHONE_NUMBER_ID= # Business phone number ID
WHATSAPP_APP_SECRET=      # For webhook HMAC verification
WHATSAPP_VERIFY_TOKEN=    # For initial webhook verification handshake
```

---

## 6. Search Strategy — Units Table

### Why a Separate `units` Table?
- **`listings`** stores raw intake data for both buyers and sellers (including DRAFT rows).
- **`units`** stores only confirmed, published SELL/RENT properties — the searchable inventory.
- Separation keeps search queries fast (no filtering out DRAFTs, BUY rows, or expired conversations).
- `units` rows have `is_active` for soft-delete — never auto-purged by conversation expiry.

### Search Approach: SQL WHERE (MVP)
- **Pattern**: `WHERE intent='SELL' AND unit_type=:type AND location ILIKE '%:loc%' AND price <= :budget`
- Advantages: Zero additional infrastructure, works with Supabase free tier, no extensions needed.
- Limitations: Location matching is string-based ("المعادي" won't match "Maadi" or "المعادى"). Acceptable for MVP.

### Future: pgvector Semantic Search
- Store location/description embeddings in a `vector` column on `units`.
- Use cosine similarity for fuzzy location matching and Arabic dialect variance.
- Requires `pgvector` extension (available on Supabase, not activated for MVP).

### Search Results Formatting
- Return up to 5 matches, ordered by `created_at DESC` (newest first).
- Format in Ammiya as a numbered list with unit_type, location, price, area.
- **Privacy Firewall**: NO phone numbers or seller identity in results.
- If no matches: "مفيش حاجة مطابقة دلوقتي، هنبلغك لما يكون فيه".

---

## 7. Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| LangChain / LangGraph | Overkill for a linear intake flow; adds dependency complexity for no benefit |
| Twilio for WhatsApp | Additional cost layer; WhatsApp Cloud API is free and direct |
| Firebase/Firestore | Supabase chosen for PostgreSQL compatibility and pgvector future use |
| WebSocket for real-time | WhatsApp is webhook-based; no WebSocket needed |
| Separate NLU service | Gemini handles both conversation and extraction; no need for a separate NLU pipeline |
| Redis for session state | Supabase serves dual purpose (state + data); Redis adds operational overhead for MVP |
| pgvector for MVP search | Adds embedding generation overhead (extra Gemini call per listing); SQL WHERE is sufficient for structured field matching |
| Elasticsearch / Meilisearch | Overkill for MVP; adds infra cost; Supabase SQL handles the query patterns needed |
