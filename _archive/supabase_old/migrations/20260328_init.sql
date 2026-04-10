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

CREATE INDEX idx_listings_whatsapp_id ON listings (whatsapp_id);
CREATE INDEX idx_listings_intent_unit ON listings (intent, unit_type)
    WHERE status = 'CONFIRMED';


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

CREATE INDEX idx_conversations_whatsapp_id ON conversations (whatsapp_id);
CREATE INDEX idx_conversations_expires_at ON conversations (expires_at)
    WHERE flow_state != 'CONFIRMED';


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

CREATE INDEX idx_units_search ON units (intent, unit_type, is_active)
    WHERE is_active = true;

CREATE INDEX idx_units_location ON units (location)
    WHERE is_active = true;

CREATE INDEX idx_units_price ON units (price)
    WHERE is_active = true;

CREATE INDEX idx_units_whatsapp_id ON units (whatsapp_id);
