# Feature Specification: Comprehensive Unit Test Coverage

**Feature**: `002-unit-tests`  
**Created**: 2026-03-29  
**Status**: Active  
**Source**: Full audit of `src/` codebase  

---

## Summary

Remove all existing test stubs and write comprehensive unit tests from scratch covering every module in `src/`. Tests must be pure unit tests — no live API calls, no real databases, no network I/O. All external dependencies are mocked.

---

## Modules Under Test

### 1. `src/config.py` — Settings

| Function/Class | Test Cases |
|---|---|
| `Settings.__init__` | All 7 env vars loaded correctly |
| `Settings.__init__` | Missing env var raises `ValueError` |
| `Settings._get_required` | Returns value when present |
| `Settings._get_required` | Raises `ValueError` when missing |
| `get_settings` | Returns singleton instance |
| `get_settings` | Second call returns same object (singleton) |

### 2. `src/models/conversation.py` — Conversation Model

| Unit | Test Cases |
|---|---|
| `FlowState` enum | All 6 states exist and have correct string values |
| `Conversation` defaults | New conversation has `AWAITING_INTENT`, null fields |
| `Conversation` full | All fields populated correctly |
| `Conversation` | `intent` accepts valid `Intent` enum values |

### 3. `src/models/listing.py` — Listing Model & Enums

| Unit | Test Cases |
|---|---|
| `Intent` enum | BUY, SELL, RENT, LEASE exist |
| `UnitType` enum | APARTMENT, LAND, VILLA, COMMERCIAL exist |
| `ListingStatus` enum | DRAFT, CONFIRMED exist |
| `Listing` defaults | New listing has DRAFT status, empty specs/media |
| `Listing` full | All fields populated correctly |

### 4. `src/models/unit.py` — Unit Model

| Unit | Test Cases |
|---|---|
| `Unit` defaults | `is_active=True`, empty specs/media |
| `Unit` full | All fields populated including listing_id |

### 5. `src/models/__init__.py` — Exports

| Unit | Test Cases |
|---|---|
| Module exports | All 7 symbols importable from `src.models` |

### 6. `src/services/state_machine.py` — State Machine

| Function | Test Cases |
|---|---|
| `FIELD_SEQUENCES` | 6 sequences defined for all intent+unit_type combos |
| `get_next_field` | Returns first field when current is None |
| `get_next_field` | Returns next field in sequence |
| `get_next_field` | Returns None when at end of sequence |
| `get_next_field` | Returns first field when current_field not in sequence |
| `get_next_field` | Returns None for unsupported combo |
| `generate_question` | Returns Ammiya question for each of 16 known fields |
| `generate_question` | Returns fallback for unknown field |
| `format_summary_card` | SELL APARTMENT with all fields filled |
| `format_summary_card` | Missing fields show "معلق" |
| `format_summary_card` | BUY APARTMENT summary |
| `format_summary_card` | RENT APARTMENT summary |
| `format_summary_card` | SELL LAND summary |
| `generate_welcome_back` | Returns greeting with embedded question |
| `transition` AWAITING_INTENT | Valid SELL → moves to AWAITING_UNIT_TYPE |
| `transition` AWAITING_INTENT | Valid BUY → moves to AWAITING_UNIT_TYPE |
| `transition` AWAITING_INTENT | Valid RENT → moves to AWAITING_UNIT_TYPE |
| `transition` AWAITING_INTENT | UNKNOWN intent → stays, re-asks |
| `transition` AWAITING_INTENT | Empty extracted → stays, re-asks |
| `transition` AWAITING_UNIT_TYPE | Valid APARTMENT → moves to AWAITING_SPECS |
| `transition` AWAITING_UNIT_TYPE | Valid LAND → moves to AWAITING_SPECS |
| `transition` AWAITING_UNIT_TYPE | UNKNOWN type → stays, re-asks |
| `transition` AWAITING_UNIT_TYPE | Unsupported combo → error message |
| `transition` AWAITING_SPECS | Valid field → stores in specs, advances |
| `transition` AWAITING_SPECS | Location field → stores in listing.location |
| `transition` AWAITING_SPECS | Price field → stores in listing.price |
| `transition` AWAITING_SPECS | Last field (SELL) → AWAITING_MEDIA |
| `transition` AWAITING_SPECS | Last field (BUY) → AWAITING_CONFIRMATION (skip media) |
| `transition` AWAITING_SPECS | No extracted value → re-asks same field |
| `transition` AWAITING_MEDIA | Skip text ("مش دلوقتي") → AWAITING_CONFIRMATION |
| `transition` AWAITING_MEDIA | Skip text ("لا") → AWAITING_CONFIRMATION |
| `transition` AWAITING_MEDIA | Media received → AWAITING_CONFIRMATION |
| `transition` AWAITING_CONFIRMATION | is_correct=True → CONFIRMED |
| `transition` AWAITING_CONFIRMATION | correction_field → back to AWAITING_SPECS |
| `transition` AWAITING_CONFIRMATION | No data → re-asks confirmation |

### 7. `src/services/gemini_service.py` — Gemini LLM Service

| Method | Test Cases |
|---|---|
| `__init__` | Client initialized with API key |
| `send_message` | Successful JSON extraction returned |
| `send_message` | JSON with schema constraint |
| `send_message` | Empty response returns `{}` |
| `send_message` | Retry on 429 (rate limit) — succeeds on 2nd try |
| `send_message` | Retry on 500 — succeeds on 3rd try |
| `send_message` | All retries exhausted → raises |
| `send_message` | Non-retryable error (400) → raises immediately |
| `send_message` | Invalid JSON response → raises `ValueError` |

### 8. `src/services/whatsapp_service.py` — WhatsApp Service

| Method | Test Cases |
|---|---|
| `verify_webhook_signature` | Valid signature → True |
| `verify_webhook_signature` | Invalid signature → False |
| `verify_webhook_signature` | Missing header → False |
| `verify_webhook_signature` | Malformed header (no sha256= prefix) → False |
| `parse_incoming_message` | Text message parsed correctly |
| `parse_incoming_message` | Image message parsed with media_id |
| `parse_incoming_message` | Video message parsed with media_id |
| `parse_incoming_message` | No messages in payload → None |
| `parse_incoming_message` | Malformed payload → None |
| `parse_incoming_message` | Empty entry → None |
| `send_text_message` | Correct POST to Graph API |
| `send_text_message` | HTTP error raises |
| `get_media_url` | 200 response returns URL |
| `get_media_url` | Non-200 response returns None |

### 9. `src/services/supabase_service.py` — Supabase CRUD

| Method | Test Cases |
|---|---|
| `get_conversation_by_whatsapp_id` | Found → returns Conversation |
| `get_conversation_by_whatsapp_id` | Not found → returns None |
| `get_listing_by_id` | Found → returns Listing |
| `get_listing_by_id` | Not found → returns None |
| `get_latest_listing_by_whatsapp_id` | Returns most recent listing |
| `get_latest_listing_by_whatsapp_id` | No listings → None |
| `upsert_conversation` | New conversation inserted |
| `upsert_conversation` | Existing conversation updated |
| `upsert_conversation` | Sets updated_at and expires_at |
| `create_listing` | Inserts and returns listing with ID |
| `update_listing` | Updates existing listing |
| `update_listing` | No ID → raises ValueError |
| `publish_unit` | Inserts correct data into units table |
| `delete_expired_conversations` | Deletes expired non-confirmed conversations |

### 10. `src/services/search_service.py` — Search Service

| Function | Test Cases |
|---|---|
| `search_units_for_buyer` | Returns matching units |
| `search_units_for_buyer` | Filters by unit_type |
| `search_units_for_buyer` | Filters by location (ILIKE) |
| `search_units_for_buyer` | Filters by budget (price ≤ budget) |
| `search_units_for_buyer` | No matches → empty list |
| `format_search_results` | Formats multiple units in Ammiya |
| `format_search_results` | Empty list → "مفيش حاجة مطابقة" message |
| `format_search_results` | Unit with missing location → "مكان غير محدد" |
| `format_search_results` | Unit with area in specs |

### 11. `src/prompts/system_prompt.py` — System Prompt

| Function | Test Cases |
|---|---|
| `build_system_prompt` | Returns non-empty string |
| `build_system_prompt` | Contains "Semsar AI" |
| `build_system_prompt` | Contains privacy firewall instruction |
| `build_system_prompt` | Contains one-at-a-time instruction |
| `build_system_prompt` | Contains no-hallucination instruction |

### 12. `src/prompts/extraction_prompt.py` — Extraction Prompts

| Function | Test Cases |
|---|---|
| `build_extraction_prompt` | Returns (schema, prompt) tuple |
| `build_extraction_prompt` | Intent field → correct schema with enum |
| `build_extraction_prompt` | Unit type field → correct schema with enum |
| `build_extraction_prompt` | Area field → number schema |
| `build_extraction_prompt` | Rooms field → integer schema |
| `build_extraction_prompt` | Location field → string schema |
| `build_extraction_prompt` | is_correct field → boolean + correction_field schema |
| `build_extraction_prompt` | AWAITING_CONFIRMATION → uses is_correct config |
| `build_extraction_prompt` | Unknown field → fallback schema |
| `build_extraction_prompt` | Prompt includes user message |
| `build_extraction_prompt` | All 17 known fields have defined configs |

### 13. `src/main.py` — FastAPI App

| Unit | Test Cases |
|---|---|
| `health_check` | GET / returns 200 with status "healthy" |
| App | Webhook router is included |

---

## Test Infrastructure

### conftest.py — Shared Fixtures

- `mock_settings` — Patched Settings with test env vars
- `mock_supabase_client` — Mock Supabase client with chainable query builder
- `mock_httpx` — Mock httpx for WhatsApp API calls
- `mock_gemini_client` — Mock google.genai client
- `sample_conversation` — Factory for Conversation objects
- `sample_listing` — Factory for Listing objects
- `sample_unit` — Factory for Unit objects

### Directory Structure

```
tests/
├── conftest.py                     # Shared fixtures + mock factories
├── unit/
│   ├── __init__.py
│   ├── test_config.py              # Settings + get_settings
│   ├── test_models.py              # Conversation, Listing, Unit, enums
│   ├── test_state_machine.py       # FIELD_SEQUENCES, transitions, questions
│   ├── test_gemini_service.py      # LLM service with mocked client
│   ├── test_whatsapp_service.py    # Signature, parse, send, media
│   ├── test_supabase_service.py    # CRUD with mocked client
│   ├── test_search_service.py      # Search + format results
│   ├── test_system_prompt.py       # System prompt builder
│   ├── test_extraction_prompt.py   # Extraction prompt builder
│   └── test_main.py               # Health check + app factory
```

---

## Acceptance Criteria

1. **All old test code removed** — clean slate
2. **Every public function/method has ≥1 test**
3. **Every branch/edge case has a test** per table above
4. **Zero external calls** — all mocked (Gemini, Supabase, WhatsApp, httpx)
5. **`pytest tests/unit/ -v` passes 100%**
6. **Total test count ≥ 100**
