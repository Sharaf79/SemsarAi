# SemsarAI Chat — Feature Specification

**Status:** Finalized — ready for `tasks.md` breakdown
**Owner:** TBD
**Depends on:** Properties module, Prisma schema (existing)
**Introduces:** Python NLP sidecar service (new process)

---

## 1. Context & Motivation

The product already has a chat widget, but it is dedicated to the onboarding/negotiation state machines (Phase 1 + Phase 2). Users have no way to *ask natural-language questions* against the live catalog ("شقة 3 غرف في المعادي تحت مليون" / "2-bedroom apartment in Maadi under 1M").

We want a **separate conversational search surface** — branded "SemsarAI" — that:

- Understands free-form Arabic (+ English) queries
- Translates them to *structured database queries* against `properties`, `property_drafts`, `property_media`
- **Never invents data** — every result must come from MySQL via Prisma

The strict rule is the point of the feature: this is a grounded assistant, not an open-domain chatbot.

---

## 2. Scope

### In scope
- New header button "SemsarAI" visible on all pages
- New dedicated page at `/semsarai` with a ChatGPT-style conversation UI
- Backend endpoint `POST /semsarai/chat` that orchestrates the flow
- New Python NLP microservice exposing `POST /nlp/analyze` (intent + slot extraction)
- Strict DB-only answering: AI output constrains a Prisma query; results are the answer
- Voice input via the browser Web Speech API (graceful fallback to text)
- Arabic RTL UI, matching existing design tokens

### Language policy
- **User-facing AI output:** Standard Arabic (فصحى / MSA). No slang (عامية).
- **User-facing static UI copy (empty state, suggestions, errors):** same — Standard Arabic.
- **User input (typed or voice):** Accept colloquial Egyptian freely — the NLP model must handle it. Voice recognition locale is `ar-EG` to transcribe how real users actually speak.
- This rule supersedes the "عامية مهذبة" guidance in `CLAUDE.md` *for this feature*.

### Out of scope
- Replacing the existing `ChatWidget` (onboarding + negotiation stay as-is)
- Cross-property reasoning ("which is the best deal?") — we return matches, not opinions
- Image analysis of `property_media` (we search metadata, not pixels)
- Retraining DistilBERT — we use a pretrained multilingual checkpoint + a thin classification head fine-tuned on a small synthetic dataset (see §8)
- Persisting SemsarAI chat history across sessions (v1 is ephemeral, per-tab)

### Explicit non-goals (critical constraints from the request)
- DistilBERT output is **never** rendered to the user as content
- The Python service **never** calls an LLM, **never** fetches external data, **never** stores conversation
- If NLP can't confidently classify intent, backend returns a graceful "هل يمكنك التوضيح أكثر؟" clarification — **not** a guess

---

## 3. Architecture

```
┌─────────────────────┐     HTTPS       ┌──────────────────────┐
│ Frontend            │ ──────────────► │ NestJS backend       │
│ /semsarai (React)   │ ◄────────────── │ POST /semsarai/chat  │
└─────────────────────┘  JSON response  └─────────┬────────────┘
                                                  │ HTTP (internal)
                                                  ▼
                                        ┌──────────────────────┐
                                        │ Python FastAPI NLP   │
                                        │ POST /nlp/analyze    │
                                        │ (DistilBERT)         │
                                        └──────────────────────┘
                                                  │
                               (NLP returns intent+slots, NOT an answer)
                                                  │
                                                  ▼
                                        NestJS builds Prisma query
                                                  │
                                                  ▼
                                        ┌──────────────────────┐
                                        │ MySQL (Prisma)       │
                                        │ properties /         │
                                        │ property_drafts /    │
                                        │ property_media       │
                                        └──────────────────────┘
```

**Key property:** the NLP service is a *pure function* `text → {intent, slots, confidence}`. It has no DB access, no network egress, no memory. This enforces the "no hallucination" constraint by construction.

### 3.1 Non-hallucination guarantees (hard contract)

These three guarantees are enforced by **architecture**, not by prompting or conventions. Any PR that weakens one of them must be rejected in review:

- **(a) NLP output is structured only.** The Python service returns exclusively `{intent, slots, confidence}`. It never returns user-facing text, free-form strings, summaries, or explanations.
- **(b) User-facing text is template-only.** The `message` field in every `/semsarai/chat` response is built in NestJS from the fixed set of Arabic templates in §7. No template branching is driven by model output beyond slot substitution.
- **(c) The NLP process is physically incapable of hallucinating property data.** It ships with no database driver, no outbound HTTP client, and no persistent memory. Even a compromised model cannot fabricate a listing because it has no channel to deliver one.

---

## 4. Frontend

### 4.1 New files
| Path | Purpose |
|---|---|
| `frontend/src/pages/SemsarAIPage.tsx` | Full-page chat UI (new route) |
| `frontend/src/pages/SemsarAIPage.css` | Scoped styles (follows `PropertyPage.css` pattern) |
| `frontend/src/api/semsarai.ts` | Typed client for `POST /semsarai/chat` |
| `frontend/src/components/semsarai/MessageBubble.tsx` | User/AI message rendering |
| `frontend/src/components/semsarai/PropertyResultCard.tsx` | Inline property card (compact variant of `PropertyCard`) |
| `frontend/src/components/semsarai/ChatComposer.tsx` | Input box + voice button + send |
| `frontend/src/components/semsarai/TypingIndicator.tsx` | 3-dot animation (reuse existing CSS from `ChatWidget`) |
| `frontend/src/hooks/useSpeechRecognition.ts` | Web Speech API wrapper (`webkitSpeechRecognition`, lang=`ar-EG`) |

### 4.2 Modified files
| Path | Change |
|---|---|
| `frontend/src/App.tsx` | Add `<Route path="/semsarai" element={<SemsarAIPage />} />` |
| `frontend/src/components/Header.tsx` | Insert `<Link to="/semsarai">` button labeled "SemsarAI 🤖" next to the "اضافة عقار" button |

### 4.3 UI requirements
- **Layout:** Fixed header (reuses `<Header>`), chat transcript scrolls, composer pinned to bottom. Max content width ~780px, centered.
- **Message bubbles:**
  - User: right-aligned (RTL), primary green `var(--primary)`, white text
  - AI: left-aligned, `var(--surface-2)` background, dark text, small "SemsarAI" label above
  - Property results render as a horizontal scroll of `PropertyResultCard` beneath the AI bubble
- **Composer:**
  - Textarea (auto-grow, max 4 rows), send button, microphone button
  - Enter sends, Shift+Enter newline
  - Disabled while `isLoading`
- **Voice input:** clicking the mic toggles `SpeechRecognition` (lang `ar-EG`, `interimResults=true`). Live transcript fills the textarea. If unsupported, mic button is hidden.
- **Typing indicator:** shown in the transcript (as a bubble) while backend request in-flight.
- **Empty state:** suggested prompts (3 Arabic examples) as clickable chips when transcript is empty.
- **Responsive:** single column below 640px; composer sits above keyboard on mobile.
- **Accessibility:** `aria-live="polite"` on transcript; keyboard-only send; mic button has text fallback.

### 4.4 Client state
- Local React state only (v1). No context/persistence.
- Shape: `{ messages: Message[], isLoading: boolean, error: string | null }`
- `Message = { id, role: 'user'|'ai', text: string, results?: SemsarAIResults, timestamp }`

---

## 5. Backend (NestJS)

### 5.1 New module
`backend/src/semsarai/`
- `semsarai.module.ts`
- `semsarai.controller.ts` — `POST /semsarai/chat`
- `semsarai.service.ts` — orchestration
- `nlp-client.service.ts` — typed HTTP client for the Python service
- `query-builder.service.ts` — maps `{intent, slots}` → Prisma `where` clauses
- `dto/chat.dto.ts` — request/response validation
- `semsarai.types.ts` — `Intent`, `Slots`, `SemsarAIResponse`

Register in `app.module.ts`. Uses existing `PrismaModule`. Adds `HttpModule` (from `@nestjs/axios`) with `NLP_SERVICE_URL` from config.

### 5.2 Endpoint contract

**`POST /semsarai/chat`** (public; optionally authenticated via existing JWT guard in passthrough mode)

Request:
```json
{ "message": "string (1..500 chars)", "userId": "string | null" }
```

Response (always this shape; arrays may be empty):
```json
{
  "message": "وجدتُ لك 3 شقق في المعادي بسعر أقل من مليون جنيه.",
  "properties": [ /* Property[] (public shape) */ ],
  "drafts":     [ /* PropertyDraft[] — only for the requesting user */ ],
  "media":      [ /* PropertyMedia[] */ ]
}
```

Error responses use the existing NestJS exception filter (400 validation, 502 when NLP service is down, 503 when DB is down).

### 5.3 Orchestration flow (`SemsarAIService.handleChat`)
1. Validate input (class-validator DTO, max 500 chars, strip HTML)
2. Call `NlpClientService.analyze(message)` with 2s timeout, 1 retry
3. If `confidence < 0.55` → return `{ message: "هل يمكنك توضيح طلبك أكثر؟", properties: [], drafts: [], media: [] }` (no DB hit)
4. `QueryBuilderService.build(intent, slots)` → returns one of:
   - `{ table: 'properties', where: Prisma.PropertyWhereInput, orderBy, take }`
   - `{ table: 'property_drafts', where: ..., take }` (always filtered by `userId` from JWT — never leak other users' drafts)
   - `{ table: 'property_media', where: ..., take }` (filtered by joined property's visibility)
5. Run Prisma query via `PrismaService`
6. Compose `message` — a deterministic Arabic sentence built from *the count + slots used*, not from the LLM. Example templates in §7.
7. Return the response

### 5.4 Safety rails
- **SQL injection:** not possible — we only pass values through Prisma's typed `where`. Raw queries are forbidden in this module (enforce via lint rule or code review checklist).
- **Cross-user leakage (MUST):** every `property_drafts` query and any draft-media query **MUST** include `where: { userId: requester.id }`. There is no code path that reads drafts without this filter. Anonymous users always receive `drafts: []`; if the intent was `search_drafts`, the response `message` is set to the "login prompt" template (see §7) instead of 401-ing mid-chat. A dedicated test (`semsarai.service.spec.ts › drafts are scoped to userId`) asserts user A never sees user B's drafts — this test is non-negotiable and must stay green.
- **Property visibility:** `properties` queries always include `propertyStatus: 'ACTIVE'` unless the requester is the owner.
- **Rate limit:** reuse existing Throttler (if configured) — 20 req/min per IP for `/semsarai/chat`.
- **No free-form AI output:** the `message` field is always generated from a finite set of Arabic templates. The NLP service can **never** produce the user-facing message.

---

## 6. Python NLP Service

### 6.1 Location & stack
- New directory: `nlp-service/` at repo root (sibling of `backend/`, `frontend/`)
- Python 3.11, FastAPI, Uvicorn
- Hugging Face Transformers with `distilbert-base-multilingual-cased` as the base (real Arabic support)
  - **Rationale:** the English-only `distilbert-base-uncased` has no Arabic-script vocabulary and would fail on both MSA and عامية input. The multilingual-cased variant keeps case (useful for mixed-language queries like "for sale in Maadi") and covers the Arabic subword space needed for reliable intent classification.
- PyTorch CPU build (sufficient for classification)

### 6.2 Files
```
nlp-service/
├── app/
│   ├── main.py            # FastAPI app, POST /nlp/analyze
│   ├── model.py           # loads fine-tuned DistilBERT + tokenizer on boot
│   ├── schemas.py         # Pydantic request/response
│   ├── slot_extractor.py  # rule-based + NER for slots (city, beds, price)
│   └── health.py          # GET /health
├── training/
│   ├── dataset.jsonl      # seed labeled examples (Arabic + English)
│   ├── train.py           # fine-tuning script (one-shot, re-runnable)
│   └── README.md
├── requirements.txt
├── Dockerfile
└── .env.example
```

### 6.3 Endpoint: `POST /nlp/analyze`
Request:
```json
{ "text": "عايز شقة 3 غرف في المعادي تحت مليون" }
```

Response:
```json
{
  "intent": "search_properties",
  "confidence": 0.91,
  "slots": {
    "propertyType": "SALE",
    "propertyKind": "APARTMENT",
    "bedrooms": 3,
    "city": "المعادي",
    "maxPrice": 1000000
  }
}
```

### 6.4 Intent labels (closed set — v1)
- `search_properties` — the overwhelming majority of queries
- `search_drafts` — "إعلاناتي اللي لسه مش متنشرة" etc.
- `search_media` — "صور للعقار ده"
- `unclear` — low-confidence fallback (NestJS treats same as `confidence < 0.55`)

### 6.5 Slot extraction
DistilBERT outputs the intent; slots come from a lightweight hybrid:
- **Numeric:** regex for bedrooms ("3 غرف", "٣ غرف", "2br") and price ("تحت مليون", "أقل من 500 ألف", "1.5M")
- **Enums:** keyword maps for `propertyType` (بيع/إيجار/sale/rent) and `propertyKind` (شقة/فيلا/محل/…)
- **Location:** fuzzy match against the `locations` table — **scoped to Egyptian cities, governorates, and districts only**. Non-Egyptian locations (e.g. Dubai, Riyadh, Beirut) are not in the match table; queries mentioning them fall through to the `unclear` intent rather than returning empty Egyptian results. The `locations` snapshot is loaded once at startup via a small JSON export committed to the repo, or fetched from backend on boot.

This hybrid approach is deliberate — token-level NER for Arabic is fragile, and we don't need it given the closed Egyptian-real-estate domain. Pure token-level Arabic NER is **out of scope for v1** — the ROI is poor versus the hybrid approach above.

### 6.6 Hard constraints (enforced in code + documented)
- No outbound HTTP (model runs locally; `requirements.txt` pins exact versions)
- No filesystem writes outside `/tmp`
- No database driver installed
- Stateless: no per-request memory, no logging of input text beyond ephemeral debug logs (gated by `DEBUG=false` in prod)

---

## 7. Response message templates (deterministic, Arabic)

All user-facing text is built by `QueryBuilderService` or `SemsarAIService` from these templates — **not** by the NLP service:

| Situation | Template |
|---|---|
| N properties found, filters applied | `وجدتُ لك {N} {kind_ar} في {city} {price_clause}.` |
| Zero properties | `للأسف، لا توجد نتائج مطابقة. حاول توسيع نطاق البحث.` |
| Drafts requested (authenticated) | `لديك {N} إعلان لم يُنشر بعد.` |
| Drafts requested (anonymous) | `يرجى تسجيل الدخول لعرض إعلاناتك.` |
| Media requested | `وجدتُ {N} صورة/فيديو للعقار.` |
| Low confidence | `هل يمكنك توضيح طلبك أكثر؟` |
| NLP service down | `الخدمة غير متاحة مؤقتاً. يرجى المحاولة مرة أخرى بعد قليل.` |

Each template has a single Arabic string + parameterized slots. No branching for "creativity".

---

## 8. Training data (NLP model)

v1 ships with `nlp-service/training/dataset.jsonl` — ~300 hand-labeled Arabic + English examples covering:
- Sale vs rent phrasing ("للبيع", "للإيجار", "for sale")
- Property kinds (شقة، فيلا، دوبلكس، محل، مكتب، أرض)
- **Egyptian cities/districts only** (Cairo, Giza, Alexandria, Maadi, Zamalek, Nasr City, 6th of October, Sheikh Zayed, …). Non-Egyptian locations are intentionally excluded — the product catalog is Egypt-scoped, so the model must not learn to emit Gulf/Levant cities as slot values.
- Price ranges with Arabic numerals & units (ألف، مليون، k, M)
- Bedroom counts in Arabic-Indic and Western digits
- Draft/media variants

Fine-tuning: `python training/train.py` — 3 epochs, batch 16, CPU OK. Produces `model/` directory loaded at service startup.

**Out of scope for v1:** Active learning loop, production retraining pipeline, prompt leakage monitoring.

---

## 9. Config & deployment

### New environment variables
**Backend (`backend/.env`):**
```
NLP_SERVICE_URL=http://localhost:8001
NLP_REQUEST_TIMEOUT_MS=2000
SEMSARAI_CONFIDENCE_THRESHOLD=0.55
```

**NLP service (`nlp-service/.env`):**
```
MODEL_PATH=./model
PORT=8001
LOG_LEVEL=INFO
```

### Local dev
- `nlp-service/Dockerfile` + a root `docker-compose.yml` entry so `docker compose up` boots backend + MySQL + NLP service together
- Backend has `.env.example` updated accordingly

### Production
- Deploy NLP service as a separate container (ECS/Cloud Run/whatever the backend uses). Keep internal-only — not exposed publicly.
- Health check: `GET /health` returns `{ status: "ok", modelLoaded: true }`

---

## 10. Database

**No schema changes required.** The feature reads existing tables:

- `properties` — filtered on `propertyStatus=ACTIVE`, all public fields
- `property_drafts` — filtered on `userId=requester.id`, `isCompleted=false`
- `property_media` — filtered by join to visible property or requester's own draft

Existing indexes are sufficient (see `backend/prisma/schema.prisma`):
- `Property`: `(type, propertyStatus)`, `(governorate, city, district)`, `userId`
- `PropertyDraft`: `userId`, `isCompleted`
- `PropertyMedia`: implicit via FK

If query performance degrades, add a covering index after real usage data — **not** speculatively.

---

## 11. Testing strategy

### Backend
- `semsarai.service.spec.ts` — mocks `NlpClientService` and `PrismaService`; covers:
  - Happy path (search_properties with slots → correct `where`)
  - Low confidence short-circuit (no DB hit)
  - Drafts are scoped to `userId` (asserts no cross-user leak)
  - NLP timeout → 502 with template message
- `query-builder.service.spec.ts` — table-driven: 20+ `(intent, slots) → prisma where` cases

### Frontend
- `SemsarAIPage` renders composer + empty state
- Sending a message shows typing indicator then AI bubble
- Property results render as cards with correct link to `/property/:id`
- Voice button hidden when `SpeechRecognition` unavailable (mock `window`)

### NLP service
- `pytest`:
  - Intent classification accuracy ≥ 85% on held-out set
  - Slot extraction precision on numeric/enum slots
  - Cold-start latency < 2s, warm latency < 150ms p95 (CPU)

### End-to-end (manual for v1)
- 10-item Arabic query checklist run against local stack, recorded in the PR

---

## 12. Rollout plan

1. **Phase A — Plumbing (no model):** Python service returns a stub classifier built from **regex + keyword maps only — zero ML, no DistilBERT load**. Intent is derived from keyword heuristics (e.g. "إعلاناتي" → `search_drafts`, "صور" → `search_media`, else `search_properties`); slots reuse the hybrid extractor from §6.5. Ship backend + frontend end-to-end against this stub. Verify the full chain works on real data before any training cost is spent.
2. **Phase B — Model:** Train DistilBERT on the seed dataset, replace the stub, measure accuracy.
3. **Phase C — Feedback loop:** Add a thumbs-up/down on AI responses (storage deferred to v2). Collect misclassifications for the next training cycle.

Feature flag: `SEMSARAI_ENABLED` (env) gates the header button and route in the frontend, and returns 404 from the endpoint when off.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Arabic NLP is harder than English; accuracy may be mediocre | Closed intent set + hybrid slot extraction; threshold to fall back to clarification |
| Adding a Python process complicates ops | Single Docker container, stateless, behind a health check; no persistent state means crash-and-restart is free |
| Users expect "ChatGPT" — open-ended answers | Copy on the empty state explicitly says "بحث ذكي في العقارات" — sets expectations |
| Voice input on non-Chrome browsers | Progressive enhancement only; mic button hidden if unsupported |
| Draft leakage across users | Single test explicitly asserts `userId` filter; code review checklist item |
| Cost of running DistilBERT on CPU at scale | Model is ~250MB, <100ms inference on modest CPU; scale horizontally via container replicas if needed |

---

## 14. File paths — quick index (for implementers, later)

**Create:**
- `frontend/src/pages/SemsarAIPage.tsx`, `.css`
- `frontend/src/api/semsarai.ts`
- `frontend/src/components/semsarai/{MessageBubble,PropertyResultCard,ChatComposer,TypingIndicator}.tsx`
- `frontend/src/hooks/useSpeechRecognition.ts`
- `backend/src/semsarai/{semsarai.module,semsarai.controller,semsarai.service,nlp-client.service,query-builder.service,semsarai.types}.ts`
- `backend/src/semsarai/dto/chat.dto.ts`
- `backend/src/semsarai/semsarai.service.spec.ts`, `query-builder.service.spec.ts`
- `nlp-service/` (entire new directory)
- `docker-compose.yml` updates

**Modify:**
- `frontend/src/App.tsx` — add route
- `frontend/src/components/Header.tsx` — add button
- `backend/src/app.module.ts` — register SemsarAIModule
- `backend/.env.example` — add `NLP_SERVICE_URL`, etc.
- `backend/src/config/env.validation.ts` — validate the new env vars

---

## 15. Resolved decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Anonymous drafts:** return `drafts: []` with a polite login-prompt `message` (`يرجى تسجيل الدخول لعرض إعلاناتك.`). No modal, no redirect. | Consistent with existing product patterns (favorites, negotiation). A blocking modal mid-chat would break the ChatGPT-style flow we want. Copy is informative, not punitive. |
| 2 | **Voice recognition locale:** hardcode `ar-EG`. | This is an Egyptian-Arabic product; the rest of the UI is already RTL Arabic-only. Auto-detecting `navigator.language` would silently switch expat users to English recognition and surprise them. Revisit only if usage data shows real demand for English voice. |
| 3 | **Surface:** SemsarAI lives **only** at `/semsarai` in v1. The existing floating `ChatWidget` stays dedicated to onboarding + negotiation. | The widget is a 950-line state machine. Mixing a free-form search flow into it would tangle three unrelated responsibilities and make both surfaces worse. Clean separation also gives us a clear URL to link to from marketing/help content. |
| 4 | **Training dataset ownership:** engineering writes the JSONL schema and ~30 bootstrap examples so Phase A can ship. Product/content team expands to ~300 labeled examples before Phase B (real model). | Unblocks Phase A (stub classifier) immediately. Labeling Arabic intent/slot data is domain work, not engineering work — product owns the content quality loop long-term. |
| 5 | **Python service stays Python (FastAPI) for v1.** Do not port to ONNX-in-Node. | A Node runtime for DistilBERT exists (ONNX/transformers.js) but is a rewrite, not a refactor, and the Hugging Face ecosystem iterates faster in Python. One extra container is a small ops cost; revisit only if that cost proves real. |

---

## 16. Verification (once built)

A reviewer should be able to:
1. `docker compose up` → all three services boot
2. Open `http://localhost:5173/semsarai` → empty state with Arabic suggestions
3. Type `شقة غرفتين في المعادي تحت 2 مليون` → see typing indicator → see an AI message with the count + property cards below
4. Inspect network tab: one call to `/semsarai/chat` → backend logs show one call to `/nlp/analyze` → response is deterministic template
5. Type `asdfghjkl` → low-confidence fallback message, no DB call (verify in backend logs)
6. As user A, type `إعلاناتي` → see only user A's drafts; confirm via direct DB query that user B's drafts exist but are not returned
