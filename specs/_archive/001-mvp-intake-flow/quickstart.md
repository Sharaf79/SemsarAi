# Quickstart: MVP WhatsApp Conversational Intake Flow

**Branch**: `001-mvp-intake-flow` | **Date**: 2026-03-27

## Prerequisites

- macOS with Apple Silicon (M4) — tested on Mac M4
- Conda installed (Miniforge or Miniconda)
- A Google AI Studio account (for Gemini API key)
- A Supabase project (free tier)
- A Meta Developer account with WhatsApp Cloud API access

## 1. Environment Setup

```bash
# Activate the Conda environment
conda activate pyt13

# Clone and enter the project
cd /Users/sherif/Projects/SemsarAi

# Install dependencies
pip install -r requirements.txt
```

### `requirements.txt`

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
google-genai>=1.0.0
supabase>=2.0.0
python-dotenv>=1.0.0
httpx>=0.27.0
pytest>=8.0.0
pytest-asyncio>=0.24.0
```

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```env
# .env
GEMINI_API_KEY=your-google-ai-studio-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
WHATSAPP_TOKEN=your-whatsapp-bearer-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_APP_SECRET=your-app-secret-for-hmac
WHATSAPP_VERIFY_TOKEN=your-custom-verify-token
```

## 3. Database Setup

Run the following SQL in your Supabase Dashboard → SQL Editor:

```sql
-- See data-model.md for full schema
-- Create conversations table
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_id     TEXT NOT NULL UNIQUE,
    flow_state      TEXT NOT NULL DEFAULT 'AWAITING_INTENT',
    current_field   TEXT,
    intent          TEXT,
    listing_id      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX idx_conversations_whatsapp_id ON conversations (whatsapp_id);
CREATE INDEX idx_conversations_expires_at ON conversations (expires_at)
    WHERE flow_state != 'CONFIRMED';

-- Create listings table
CREATE TABLE listings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_id     TEXT NOT NULL,
    intent          TEXT NOT NULL,
    unit_type       TEXT NOT NULL,
    specs           JSONB NOT NULL DEFAULT '{}',
    location        TEXT,
    price           NUMERIC,
    media_urls      TEXT[] DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_whatsapp_id ON listings (whatsapp_id);
CREATE INDEX idx_listings_intent_unit ON listings (intent, unit_type)
    WHERE status = 'CONFIRMED';

-- Add foreign key after both tables exist
ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_listing
    FOREIGN KEY (listing_id) REFERENCES listings(id);

-- Create units table (published searchable properties)
CREATE TABLE units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID NOT NULL UNIQUE REFERENCES listings(id),
    whatsapp_id     TEXT NOT NULL,
    intent          TEXT NOT NULL,
    unit_type       TEXT NOT NULL,
    specs           JSONB NOT NULL DEFAULT '{}',
    location        TEXT,
    price           NUMERIC,
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
```

## 4. Run the Server

```bash
# Development server with auto-reload
cd /Users/sherif/Projects/SemsarAi
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.

## 5. Expose Webhook (Local Dev)

Use ngrok or Cloudflare Tunnel to expose your local server to WhatsApp:

```bash
# Option A: ngrok
ngrok http 8000

# Option B: Cloudflare Tunnel (if installed)
cloudflared tunnel --url http://localhost:8000
```

Then configure the webhook URL in Meta Developer Portal:
- **Callback URL**: `https://your-tunnel-url/webhook`
- **Verify Token**: The value of `WHATSAPP_VERIFY_TOKEN` in your `.env`

## 6. Run Tests

```bash
# All tests
pytest

# Unit tests only
pytest tests/unit/ -v

# Integration tests (requires live Supabase)
pytest tests/integration/ -v

# Specific test
pytest tests/unit/test_state_machine.py -v
```

## 7. Test Manually (curl)

Simulate a WhatsApp webhook message (without signature verification):

```bash
curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "201234567890",
            "type": "text",
            "text": {"body": "عايز ابيع شقتي"}
          }]
        }
      }]
    }]
  }'
```

## 8. Offline Testing with Ollama (Optional)

For testing prompt logic without consuming Gemini quota:

```bash
# Install Ollama (if not already)
brew install ollama

# Pull Llama 3.1 8B
ollama pull llama3.1:8b

# Set env var to use Ollama instead of Gemini
export USE_OLLAMA=true
export OLLAMA_MODEL=llama3.1:8b
```

> ⚠️ Ollama's Arabic support is weaker than Gemini — use only for structural testing, not language quality validation.
