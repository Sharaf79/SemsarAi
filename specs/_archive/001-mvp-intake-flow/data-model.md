# Data Model: MVP WhatsApp Conversational Intake Flow

**Branch**: `001-mvp-intake-flow` | **Date**: 2026-03-27

## Supabase Schema

### Table: `conversations`

Tracks active user sessions and their position in the intake flow.

```sql
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_id     TEXT NOT NULL UNIQUE,
    flow_state      TEXT NOT NULL DEFAULT 'AWAITING_INTENT',
    current_field   TEXT,              -- NULL when not in AWAITING_SPECS
    intent          TEXT,              -- BUY | SELL | RENT | LEASE
    listing_id      UUID REFERENCES listings(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Index for fast lookup by WhatsApp ID (primary access pattern)
CREATE INDEX idx_conversations_whatsapp_id ON conversations (whatsapp_id);

-- Index for expiry cleanup queries
CREATE INDEX idx_conversations_expires_at ON conversations (expires_at)
    WHERE flow_state != 'CONFIRMED';
```

**FlowState values**: `AWAITING_INTENT` | `AWAITING_UNIT_TYPE` | `AWAITING_SPECS` | `AWAITING_MEDIA` | `AWAITING_CONFIRMATION` | `CONFIRMED`

**current_field values** (when `flow_state = 'AWAITING_SPECS'`):
- Apartment SELL: `area`, `rooms`, `floor`, `finishing`, `location`, `price`
- Land SELL: `total_area`, `legal_status`, `zoning`, `location`, `price`
- BUY: `location`, `budget`, `min_area`, `min_rooms`
- RENT: `location`, `monthly_budget`, `duration`, `rooms`

### Table: `listings`

Stores the property data collected during the intake flow.

```sql
CREATE TABLE listings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_id     TEXT NOT NULL,
    intent          TEXT NOT NULL,     -- BUY | SELL | RENT | LEASE
    unit_type       TEXT NOT NULL,     -- APARTMENT | LAND | VILLA | COMMERCIAL
    specs           JSONB NOT NULL DEFAULT '{}',
    location        TEXT,
    price           NUMERIC,          -- Total price (SELL/BUY) or monthly (RENT)
    media_urls      TEXT[] DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookups by user
CREATE INDEX idx_listings_whatsapp_id ON listings (whatsapp_id);

-- Index for future matching queries
CREATE INDEX idx_listings_intent_unit ON listings (intent, unit_type)
    WHERE status = 'CONFIRMED';
```

**status values**: `DRAFT` | `CONFIRMED`

### Table: `units`

The canonical store of published properties available for search/matching. A row is created when a SELL or RENT listing is CONFIRMED. Buyers search against this table.

```sql
CREATE TABLE units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL UNIQUE REFERENCES listings(id),
    whatsapp_id     TEXT NOT NULL,
    intent          TEXT NOT NULL,     -- SELL | RENT | LEASE
    unit_type       TEXT NOT NULL,     -- APARTMENT | LAND | VILLA | COMMERCIAL
    specs           JSONB NOT NULL DEFAULT '{}',
    location        TEXT,
    price           NUMERIC,           -- Total price (SELL) or monthly (RENT)
    media_urls      TEXT[] DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary search index: intent + unit_type + active status
CREATE INDEX idx_units_search ON units (intent, unit_type, is_active)
    WHERE is_active = true;

-- Location search (text pattern matching for MVP; upgrade to full-text/pgvector later)
CREATE INDEX idx_units_location ON units (location)
    WHERE is_active = true;

-- Price range queries
CREATE INDEX idx_units_price ON units (price)
    WHERE is_active = true;

-- Lookup by owner
CREATE INDEX idx_units_whatsapp_id ON units (whatsapp_id);
```

**is_active**: `true` = available for search; `false` = delisted/sold/rented. Soft-delete — never hard-delete units.

### JSONB `specs` Structure

The `specs` column stores unit-type-specific fields as flexible JSON:

**Apartment (SELL)**:
```json
{
    "area": 120,
    "rooms": 3,
    "floor": 5,
    "finishing": "سوبر لوكس",
    "location": "التجمع الخامس"
}
```

**Land (SELL)**:
```json
{
    "total_area": 500,
    "legal_status": "مسجل",
    "zoning": "سكني"
}
```

**Apartment (BUY)**:
```json
{
    "min_area": 100,
    "min_rooms": 2,
    "location": "المعادي",
    "budget": 2000000
}
```

**Rental**:
```json
{
    "rooms": 2,
    "location": "مدينة نصر",
    "monthly_budget": 8000,
    "duration": "سنة"
}
```

## Entity Relationships

```
conversations 1 ──── 1 listings 1 ──── 0..1 units
     │
     └── whatsapp_id (shared key for user identity)
```

- Each active conversation references at most one listing (via `listing_id`).
- The listing is created as `DRAFT` when `AWAITING_SPECS` begins.
- The listing transitions to `CONFIRMED` when the user approves the Summary Card.
- **On SELL/RENT confirmation**: a `units` row is created from the confirmed listing (copies intent, unit_type, specs, location, price, media_urls). This publishes the property for search.
- **On BUY confirmation**: the system searches the `units` table for matching properties and returns results to the buyer.
- On conversation expiry (7-day TTL), the conversation row is deleted; `DRAFT` listings associated with expired conversations may be garbage-collected. `units` rows are **never** auto-deleted by expiry — they persist as published inventory.

## Expiry Logic

```
On each incoming message:
  1. Load conversation by whatsapp_id
  2. If conversation.expires_at < now():
       - Delete conversation row
       - Optionally delete associated DRAFT listing
       - Treat as new user (AWAITING_INTENT)
  3. Else:
       - Update expires_at = now() + 7 days
       - Update updated_at = now()
       - Continue flow
```

## Search Logic

```
On BUY listing CONFIRMED:
  1. Extract search criteria from listing.specs:
     - unit_type, location (ILIKE pattern), budget (price ≤ budget)
     - Optional: min_area, min_rooms from specs JSONB
  2. Query units table:
     SELECT * FROM units
     WHERE is_active = true
       AND intent IN ('SELL')          -- buyers see sell listings
       AND unit_type = :unit_type
       AND location ILIKE '%' || :location || '%'
       AND price <= :budget
     ORDER BY created_at DESC
     LIMIT 5
  3. If results found:
     - Format top matches as a numbered list in Ammiya
     - Send via WhatsApp (no phone numbers — Privacy Firewall)
  4. If no results:
     - Tell user "مفيش حاجة مطابقة دلوقتي، هنبلغك لما يكون فيه"
     - Persist the BUY listing for future passive matching
```

## MVP Limitations

- **RENT search not implemented**: In MVP, the search flow only runs on BUY confirmation (`intent IN ('SELL')`). RENT listings published to `units` are not searchable by tenants. A tenant-side search flow (searching for landlord RENT listings) is deferred to a future iteration.
- **Media URL expiry**: WhatsApp Cloud API media download URLs are temporary (expire within hours). In MVP, `media_urls[]` stores these ephemeral URLs directly. A future improvement should download media to permanent storage (e.g., Supabase Storage) and store persistent URLs instead.

## Migration Notes

- Tables should be created via Supabase Dashboard SQL Editor or migration script.
- No RLS needed — all access is server-side via service role key.
- `units` table must be created after `listings` (foreign key dependency).
- `pgvector` extension reserved for future semantic matching (location similarity, NLP-based search). MVP uses SQL `ILIKE` + numeric range queries.
