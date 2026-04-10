# Feature Specification: MVP WhatsApp Conversational Intake Flow

**Feature Branch**: `001-mvp-intake-flow`  
**Created**: 2026-03-27  
**Status**: Draft  
**Input**: User description: "Semsar AI MVP WhatsApp conversational intake flow for property buy/sell/rent"

## Clarifications

### Session 2026-03-27

- Q: When Gemini 1.5 Flash is unavailable (rate-limited, API outage, or low-confidence extraction), what should Semsar AI do? → A: Queue & retry — send a hold message ("ثانية واحدة..."), retry up to 3 times with exponential backoff, then fail gracefully with a user-friendly error if still down.
- Q: How long should an incomplete conversation remain active before expiry/cleanup? → A: 7-day TTL — conversations expire after 7 days of inactivity; user can resume within the week, after which state is purged.
- Q: How should the system verify incoming webhook requests are genuinely from WhatsApp? → A: Signature verification — validate the `X-Hub-Signature-256` HMAC header using the WhatsApp App Secret on every request; reject invalid or missing signatures.
- Q: How should the system track which specific field it is currently collecting within `AWAITING_SPECS`? → A: Separate `current_field` column — keep `AWAITING_SPECS` as one macro-state; add a `current_field` string column to `Conversation` (e.g., `"area"`, `"rooms"`, `"price"`) that tracks the micro-step.
- Q: When a returning user has an active mid-flow session, how should Semsar AI re-engage them? → A: Resume silently with a context reminder — send a welcome-back greeting and re-state the last pending question (e.g., "أهلاً تاني! كنا وقفنا عند المساحة — المساحة كام متر؟"). Do not reset the flow.

## User Scenarios & Testing *(mandatory)*

<!--
  User stories are prioritized as independent, testable user journeys.
  Each can be developed, tested, deployed, and demonstrated independently.
-->

### User Story 1 - Seller Lists an Apartment (Priority: P1)

A property seller opens a WhatsApp conversation with Semsar AI. The bot greets them in Egyptian Arabic (Ammiya), asks their intent (Buy/Sell/Rent), then sequentially collects apartment details—one question per message: Unit Type → Area → Rooms → Floor → Finishing → Location → Price. After all fields are gathered, the bot presents a Summary Card for the user to confirm or correct. Unspecified fields are marked "Pending" (no guessing). The bot encourages photo/video upload early in the flow.

**Why this priority**: The sell-apartment path is the most common real-estate listing scenario in Egypt and exercises the full end-to-end state machine, LLM extraction, and data persistence pipeline. Proving this path works validates the core architecture.

**Independent Test**: Can be fully tested by sending a sequence of WhatsApp messages (or simulated HTTP requests) and verifying that (a) each question appears one-at-a-time, (b) the extracted JSON in Supabase matches the input, and (c) the Summary Card is accurate.

**Acceptance Scenarios**:

1. **Given** a new user sends any message to the WhatsApp number, **When** the backend has no existing `flow_state` for their `whatsapp_id`, **Then** Semsar AI responds with the intent question ("عايز تبيع، تشتري، ولا تأجر؟") in Egyptian Arabic.
2. **Given** the user replies "بيع" (sell), **When** intent is recorded, **Then** Semsar AI asks for Unit Type and persists `intent = SELL` in Supabase.
3. **Given** `unit_type` is "Apartment" and all required fields (area, rooms, floor, finishing, location, price) have been collected, **When** the state machine reaches the confirmation step, **Then** Semsar AI displays a Summary Card listing every field with its value (or "Pending" for missing ones) and asks "ده صح ولا عايز تغير حاجة؟".
4. **Given** the user says "صح" (correct) to the Summary Card, **When** confirmed, **Then** the listing is marked as `CONFIRMED` in the database and the user receives an acknowledgement.
5. **Given** the user says they want to change a detail, **When** they specify which field, **Then** Semsar AI re-asks only that question and re-presents the updated Summary Card.

---

### User Story 2 - Buyer Submits a Search Request (Priority: P2)

A property buyer opens a WhatsApp conversation. After intent is identified as "Buy", the bot sequentially collects their preferences: Unit Type → desired Location → Budget range → minimum Area → minimum Rooms. The Summary Card is shown for confirmation.

**Why this priority**: The buy flow is the demand side of the marketplace. Without buyers, listings have no audience. The flow shares most of the state machine and extraction logic with the sell flow, so incremental effort is low.

**Independent Test**: Send simulated buy-intent messages and verify the correct sequence of questions appears, data is persisted with `intent = BUY`, and the Summary Card reflects preferences accurately.

**Acceptance Scenarios**:

1. **Given** a new user sends a message, **When** they respond with "شراء" (buy), **Then** `intent = BUY` is persisted and Semsar AI asks for Unit Type.
2. **Given** all buy-preference fields collected, **When** the confirmation step is reached, **Then** a Summary Card lists preferences (or "Pending") and asks for confirmation.
3. **Given** the buyer confirms their preferences, **When** the system searches the `units` table, **Then** up to 5 matching properties are returned in Ammiya without phone numbers (Privacy Firewall).
4. **Given** the buyer confirms but no units match, **When** the search returns empty, **Then** the system tells the user no matches exist yet and retains the listing for future matching.

---

### User Story 3 - Renter Posts or Searches for a Rental (Priority: P3)

A user indicates they want to rent. The bot collects: Unit Type → Location → Monthly Budget → Duration → Rooms. The flow focuses on monthly cash-flow details rather than total asset value (per Constitution §3 Routing Gate).

**Why this priority**: Rentals are a high-volume, lower-ticket segment in Egypt. Separate routing logic validates the Routing Gate branching and ensures the rent-specific fields (duration, monthly budget) are handled distinctly from buy/sell.

**Independent Test**: Send simulated rent-intent messages. Verify questions focus on monthly amount and duration, not total price. Confirm Summary Card and persistence.

**Acceptance Scenarios**:

1. **Given** a user replies "إيجار" (rent), **When** intent is set, **Then** subsequent questions ask for monthly budget and duration rather than total price.
2. **Given** all rental fields collected, **When** confirmed, **Then** listing is persisted with `intent = RENT` and correct monthly figures.

---

### User Story 4 - Seller Lists Land (Priority: P3)

A seller indicates they are selling land. The bot collects land-specific fields: Total Area → Legal Status → Zoning (Residential/Industrial) → Location → Price (per Constitution §3 Unit Specifics for Land).

**Why this priority**: Validates unit-type branching—land has different required fields than apartments (no rooms, floor, or finishing; adds legal status and zoning).

**Independent Test**: Send messages indicating sell + land. Verify land-specific questions appear instead of apartment-specific ones.

**Acceptance Scenarios**:

1. **Given** user selects `intent = SELL` and `unit_type = LAND`, **When** the state machine advances, **Then** questions ask for Total Area, Legal Status, Zoning, Location, Price—**not** Rooms, Floor, or Finishing.

---

### User Story 5 - Media Upload Encouragement (Priority: P2)

At an appropriate point during the sell or rent listing flow (after unit type is determined), the bot encourages the user to upload photos/videos: "الصور بتبيع الشقة — ابعتلي صور أو فيديو لو عندك." Uploaded media URLs are stored in the `media_urls` array.

**Why this priority**: Per Constitution §3, "media sells the unit." Early media capture increases listing quality and is a key differentiator for Semsar AI.

**Independent Test**: Trigger a sell flow; verify the media prompt appears. Send an image; verify its URL is persisted in `media_urls`.

**Acceptance Scenarios**:

1. **Given** a seller has specified `unit_type`, **When** the next state triggers, **Then** Semsar AI sends a media encouragement message in Ammiya.
2. **Given** the user uploads a photo, **When** the media is received, **Then** the URL is appended to `media_urls[]` and the flow continues to the next question.
3. **Given** the user skips media ("مش دلوقتي"), **When** acknowledged, **Then** `media_urls` remains empty and the flow advances normally.

---

### Edge Cases

- **Unknown intent**: User says something that doesn't map to Buy/Sell/Rent (e.g., "مش عارف"). Bot re-asks politely without advancing the state.
- **Out-of-range values**: User provides a price of 0 or negative. Bot flags the value and re-asks.
- **Session resumption**: User abandons mid-flow and returns later (within 7-day TTL). Bot sends a welcome-back greeting in Ammiya and re-states the last pending question (e.g., "أهلاً تاني! كنا وقفنا عند المساحة — المساحة كام متر؟"). No state is reset; the user continues from where they left off.
- **Concurrent messages**: User sends multiple messages rapidly before bot responds. System processes them in order and doesn't skip states.
- **Language mixing**: User mixes English and Arabic. Gemini extraction still parses the intended value.
- **Unsupported unit type**: User mentions "Villa" or "Commercial" (defined in schema but not yet fully specified). Bot acknowledges and collects generic fields or notifies that full support is coming soon.
- **Gemini API failure**: If Gemini 1.5 Flash is rate-limited or unavailable, system sends a hold message ("ثانية واحدة..."), retries up to 3 times with exponential backoff, then tells the user "عندنا مشكلة تقنية، جرب تاني كمان شوية" and halts the flow without losing state.
- **Expired conversation**: User returns after 7+ days of inactivity. The old incomplete conversation has been purged; Semsar AI greets them as a new user and starts fresh.
- **Spoofed webhook**: An HTTP request arrives at the webhook endpoint with an invalid or missing `X-Hub-Signature-256` header. System rejects the request with HTTP 401 and does not process the payload.
- **No search results**: A buyer confirms their preferences but no matching units exist in the database. System responds in Ammiya ("مفيش حاجة مطابقة دلوقتي") and retains the buyer's listing for future passive matching.
- **Search returns stale units**: A previously published unit has been sold/rented but `is_active` was not flipped. The system may surface it — acceptable for MVP; future improvement to add seller-side deactivation flow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST route the conversation based on user intent: BUY, SELL, RENT, or LEASE. In the MVP, LEASE MUST be treated as an alias for RENT (identical field sequence and routing).
- **FR-002**: System MUST ask exactly ONE question per message to keep the user focused (Constitution §3).
- **FR-003**: System MUST collect unit-specific fields based on `unit_type` and `intent`, including common fields (Location, Price/Budget):
  - Apartment SELL: Area, Rooms, Floor, Finishing, Location, Price.
  - Land SELL: Total Area, Legal Status, Zoning, Location, Price.
  - Apartment BUY: Location, Budget, Min Area, Min Rooms.
  - Apartment RENT: Location, Monthly Budget, Duration, Rooms.
- **FR-004**: System MUST present a Summary Card after all fields are collected and enter a Confirmation Loop (Constitution §4).
- **FR-005**: System MUST mark unspecified fields as "Pending"—never hallucinate or guess values (Constitution §4).
- **FR-006**: System MUST persist conversation state (`flow_state`) in Supabase so sessions can be resumed.
- **FR-007**: System MUST use Egyptian Arabic (Ammiya) for ALL user-facing messages (Constitution §1).
- **FR-008**: System MUST use the Privacy Firewall—never attribute information to a specific party (Constitution §2).
- **FR-009**: System MUST encourage photo/video upload after unit type is determined (Constitution §3).
- **FR-010**: System MUST NOT share phone numbers until both parties accept a deal (Constitution §5).
- **FR-011**: System MUST extract structured JSON from free-text Arabic input using Gemini 1.5 Flash.
- **FR-012**: System MUST handle corrections—allow the user to change a specific field after seeing the Summary Card and re-present the updated summary.
- **FR-013**: System MUST retry Gemini API calls up to 3 times with exponential backoff on failure/rate-limit; send a hold message to the user during retry; fail gracefully without losing conversation state if all retries are exhausted.
- **FR-014**: System MUST expire and purge incomplete conversations after 7 days of inactivity; returning users after expiry start a fresh session.
- **FR-015**: System MUST validate the `X-Hub-Signature-256` HMAC header on every incoming WhatsApp webhook request using the App Secret; requests with invalid or missing signatures MUST be rejected (HTTP 401).
- **FR-016**: System MUST track the specific field being collected within `AWAITING_SPECS` using a `current_field` column; the field sequence is determined by `unit_type` (e.g., Apartment: area → rooms → floor → finishing → location → price). On each answer, `current_field` advances to the next required field or transitions `flow_state` to `AWAITING_MEDIA` when all fields are collected.
- **FR-017**: When a returning user sends a message and an active (non-expired) mid-flow conversation exists, the system MUST send a welcome-back greeting in Ammiya and re-state the last pending question based on `flow_state` and `current_field`; the flow MUST NOT reset.
- **FR-018**: When a SELL or RENT listing is CONFIRMED, the system MUST publish the listing to the `units` table as a searchable property entry (copies intent, unit_type, specs, location, price, media_urls with `is_active = true`). The `units` table is the canonical source for property search — the `listings` table stores raw intake data only.
- **FR-019**: When a BUY listing is CONFIRMED, the system MUST search the `units` table for matching active properties using the buyer's criteria (unit_type, location pattern, budget ceiling) and return up to 5 results formatted in Ammiya. Phone numbers MUST NOT be included in search results (Privacy Firewall). If no matches are found, the system MUST inform the buyer and retain their listing for future passive matching.

### Key Entities

- **Conversation**: Represents a user session — `whatsapp_id` (unique), `flow_state` (current macro-step), `current_field` (specific field being collected within `AWAITING_SPECS`, e.g., `"area"`, `"rooms"`, `"price"`; null when not in specs-collection), `intent`, `created_at`, `updated_at`, `expires_at` (auto-set to `updated_at + 7 days`; purged on expiry).
- **Listing**: The property data — `id` (UUID), `unit_type`, `specs` (JSONB: rooms, floor, area, zoning, etc.), `location`, `price`, `media_urls[]`, `status` (DRAFT → CONFIRMED).
- **Unit**: A published, searchable property — created from a CONFIRMED SELL/RENT listing. Fields: `id` (UUID), `listing_id` (FK), `whatsapp_id`, `intent`, `unit_type`, `specs` (JSONB), `location`, `price`, `media_urls[]`, `is_active` (boolean, soft-delete). Buyers search this table.
- **FlowState Enum**: AWAITING_INTENT → AWAITING_UNIT_TYPE → AWAITING_SPECS → AWAITING_MEDIA → AWAITING_CONFIRMATION → CONFIRMED. BUY intent MUST skip AWAITING_MEDIA (buyers don't upload media) and transition directly from AWAITING_SPECS to AWAITING_CONFIRMATION.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seller can complete a full apartment listing (intent → confirmation) in ≤ 8 messages.
- **SC-002**: Gemini 1.5 Flash correctly extracts structured data from Egyptian Arabic free-text with ≥ 90% field-level accuracy.
- **SC-003**: End-to-end response latency (user message → bot reply) is ≤ 3 seconds at the 95th percentile under free-tier quotas.
- **SC-004**: Session resumption: a user who abandons and returns within 7 days picks up exactly where they left off with 100% state accuracy; conversations inactive for >7 days are purged.
- **SC-005**: All user-facing messages are in Egyptian Arabic with zero instances of Modern Standard Arabic (Fusha) or English leaking into responses.
- **SC-006**: The system operates within the zero-cost tier limits: ≤ 15 RPM to Gemini, ≤ 100K requests/day to Cloudflare Workers, ≤ 500MB Supabase storage.
- **SC-007**: When a confirmed SELL listing exists in the `units` table that matches a buyer's criteria, the buyer receives it in search results within the same confirmation flow (≤5s total search + format + send).

## Assumptions

- Users interact exclusively via WhatsApp (no web or app interface for MVP).
- WhatsApp Cloud API is available and configured; the bot has a verified WhatsApp Business number.
- Gemini 1.5 Flash free-tier quotas (15 RPM / 1M TPM) are sufficient for MVP traffic.
- Supabase free-tier (500MB / 50K MAU) is sufficient for MVP data storage.
- Only Apartment and Land unit types are fully supported in MVP; Villa and Commercial are acknowledged but deferred.
- Cloudflare Workers (or Vercel) is used for backend compute; the choice does not affect spec-level requirements.
- Local development uses Ollama (Llama 3.1 8B on Mac M4) for offline testing; production uses Gemini 1.5 Flash.
- The LEASE intent follows the same flow as RENT for MVP (no differentiation yet).
- Media files are stored externally (e.g., WhatsApp CDN or Supabase Storage); only URLs are persisted in the database.
- No payment or commission system in MVP—the focus is data collection and matching only.
