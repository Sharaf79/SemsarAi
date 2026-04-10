# API Contract: WhatsApp Webhook Endpoint

**Branch**: `001-mvp-intake-flow` | **Date**: 2026-03-27

## `GET /webhook` — Verification Handshake

Called once by Meta during webhook setup to verify ownership.

### Request

```
GET /webhook?hub.mode=subscribe&hub.verify_token={WHATSAPP_VERIFY_TOKEN}&hub.challenge={challenge_string}
```

| Query Parameter | Type | Description |
|---|---|---|
| `hub.mode` | string | Always `"subscribe"` |
| `hub.verify_token` | string | Must match our `WHATSAPP_VERIFY_TOKEN` env var |
| `hub.challenge` | string | Random string from Meta to echo back |

### Response

**200 OK** — Returns the `hub.challenge` value as plain text.

**403 Forbidden** — If `hub.verify_token` doesn't match.

---

## `POST /webhook` — Incoming Message Handler

Receives all WhatsApp events (messages, status updates, errors).

### Headers

| Header | Type | Required | Description |
|---|---|---|---|
| `Content-Type` | string | Yes | `application/json` |
| `X-Hub-Signature-256` | string | Yes | `sha256={HMAC-SHA256 of body using APP_SECRET}` |

### Security

1. Extract `X-Hub-Signature-256` header.
2. Compute HMAC-SHA256 of raw request body using `WHATSAPP_APP_SECRET`.
3. Compare using constant-time comparison (`hmac.compare_digest`).
4. If invalid → return **401 Unauthorized** immediately. Do NOT process the message.

### Request Body

```json
{
    "object": "whatsapp_business_account",
    "entry": [
        {
            "id": "BUSINESS_ACCOUNT_ID",
            "changes": [
                {
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "display_phone_number": "15551234567",
                            "phone_number_id": "PHONE_NUMBER_ID"
                        },
                        "contacts": [
                            {
                                "profile": { "name": "Ahmed" },
                                "wa_id": "201234567890"
                            }
                        ],
                        "messages": [
                            {
                                "from": "201234567890",
                                "id": "wamid.ABCdef123...",
                                "timestamp": "1677234000",
                                "type": "text",
                                "text": {
                                    "body": "عايز ابيع شقتي"
                                }
                            }
                        ]
                    },
                    "field": "messages"
                }
            ]
        }
    ]
}
```

### Media Message Variant

When `type` is `"image"` or `"video"`:

```json
{
    "type": "image",
    "image": {
        "id": "MEDIA_ID",
        "mime_type": "image/jpeg",
        "sha256": "abc123...",
        "caption": "صور الشقة"
    }
}
```

### Processing Logic

```
1. Validate HMAC signature
2. Extract messages from entry[0].changes[0].value.messages
3. For each message:
   a. Get whatsapp_id from message.from
   b. Load or create conversation from Supabase
   c. Check conversation expiry (7-day TTL)
   d. Run state machine transition
   e. If extraction needed: call Gemini 1.5 Flash
   f. Update conversation + listing in Supabase
   g. On SELL/RENT CONFIRMED: publish listing → insert into units table
   h. On BUY CONFIRMED: search units table → format results in Ammiya → send matches
   i. Send reply via WhatsApp Cloud API
4. Return 200 OK (always, per Meta requirements)
```

### Response

**Always return 200 OK** regardless of processing outcome. Meta will retry on non-200 responses, which would cause duplicate processing.

```json
{
    "status": "ok"
}
```

---

## Outbound: Send Message via WhatsApp Cloud API

**Not a webhook endpoint** — called by our service to send replies.

### Request

```
POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_TOKEN}
Content-Type: application/json
```

### Text Message Body

```json
{
    "messaging_product": "whatsapp",
    "to": "201234567890",
    "type": "text",
    "text": {
        "body": "أهلاً! أنا سمسار، وسيط العقارات بتاعك. عايز تبيع، تشتري، ولا تأجر؟"
    }
}
```

### Response

```json
{
    "messaging_product": "whatsapp",
    "contacts": [{ "input": "201234567890", "wa_id": "201234567890" }],
    "messages": [{ "id": "wamid.XYZ789..." }]
}
```

---

## Error Handling Summary

| Scenario | Action | User Impact |
|---|---|---|
| Invalid HMAC signature | Return 401; log alert | None (attacker blocked) |
| Gemini 429 (rate limit) | Retry 3x with backoff; send hold message | "ثانية واحدة..." then normal response |
| Gemini 5xx | Retry 3x; if persistent, apologize | "في مشكلة تقنية، جرب تاني كمان شوية" |
| Supabase unreachable | Return 200 (prevent Meta retry); log error | No response sent; user can retry |
| Unrecognizable input | Re-ask current question politely | Seamless re-prompt |
| Expired conversation | Delete + restart as new user | Welcome message (fresh start) |
| No search results (BUY confirmed) | Inform buyer; retain listing for future matching | "مفيش حاجة مطابقة دلوقتي" |
| Units table query timeout | Return results found so far or apologize | Graceful degradation; user can retry |

---

## Rate Limits & Throttling

| Service | Limit | Mitigation |
|---|---|---|
| Gemini 1.5 Flash | 15 RPM | Queue if >15 concurrent; backoff on 429 |
| WhatsApp Cloud API | 80 messages/second (Tier 1) | Not a concern for MVP volume |
| Supabase REST API | No hard limit on free tier | Connection pooling via supabase-py |
