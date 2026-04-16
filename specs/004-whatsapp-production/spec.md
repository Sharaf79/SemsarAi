# Spec 004: WhatsApp Production & OTP Verification

**Created**: 2026-04-11  
**Status**: Draft  
**Priority**: Critical (blocks production launch)

---

## 1. Problem Statement

The system currently has a fully built WhatsApp integration (`backend/src/whatsapp/`) and OTP-via-WhatsApp auth flow (`backend/src/auth/`), but **none of it works in production** because:

1. **All WhatsApp env vars are placeholders** (`your_whatsapp_token_here`) — no real Meta credentials
2. **OTP is sent as plain text** via `sendTextMessage()` — Meta **rejects** business-initiated messages outside the 24-hour session window. OTP messages to new users will always fail because there's no prior conversation
3. **No WhatsApp Message Templates** — Meta requires pre-approved templates for business-initiated messages (OTP, notifications)
4. **Env validation marks WhatsApp vars as `@IsOptional()`** but `WhatsAppService` uses `getOrThrow()` — the app crashes silently at module init if vars are missing
5. **No deployment webhook URL** — Meta needs a public HTTPS endpoint to deliver webhooks
6. **No graceful degradation** — if WhatsApp API fails in production, users are permanently locked out (no fallback)
7. **Dev mode leaks OTP in response** (`devOtp` field) — must be stripped in production
8. **No message delivery status tracking** — no way to know if OTP was actually delivered

---

## 2. Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | OTP delivery works reliably in production | 95%+ OTP delivery rate measured via WhatsApp delivery receipts |
| G2 | WhatsApp Message Templates approved by Meta | OTP template + welcome template approved and active |
| G3 | Graceful degradation | If WhatsApp fails, user sees clear error + optional SMS fallback |
| G4 | Webhook receives production traffic | Meta webhook verification passes on deployed URL |
| G5 | Security hardened | No OTP leaks, proper HMAC, rate limits enforced |
| G6 | Configuration is environment-aware | Dev mode works with mocks; production requires real credentials |

---

## 3. Architecture Overview

### Current Flow (Broken for Production)

```
User enters phone → POST /auth/send-otp
  → generate 6-digit OTP → store in DB
  → whatsapp.sendTextMessage(phone, "كود التحقق: 123456")  ← FAILS (no template)
  → in dev: returns devOtp in response body ← INSECURE
```

### Target Flow (Production-Ready)

```
User enters phone → POST /auth/send-otp
  → generate 6-digit OTP → store in DB
  → whatsapp.sendTemplateMessage(phone, "otp_verification", [code])
  → if WhatsApp fails → mark delivery_status = FAILED
  → return { message: "OTP sent" }  (never include code)

Meta Cloud API → delivery webhook → update delivery_status
  → on "delivered": no action
  → on "failed": optionally trigger SMS fallback

User enters code → POST /auth/verify-otp → (unchanged logic)
```

### Message Types

| Scenario | Message Type | Template Required? |
|----------|-------------|-------------------|
| OTP to new user (no prior conversation) | **Template** | ✅ Yes — `otp_verification` |
| OTP to returning user (within 24h window) | **Template** (safer) | ✅ Use template always for consistency |
| Reply to user's WhatsApp message | **Session message** | ❌ No — free-form text within 24h |
| Proactive notification (listing approved) | **Template** | ✅ Yes — `listing_approved` |
| Welcome message after registration | **Template** | ✅ Yes — `welcome_message` |

---

## 4. Meta WhatsApp Business Platform Setup

### 4.1 Prerequisites (Manual — Owner Must Complete)

| Step | Action | Where |
|------|--------|-------|
| 1 | Create Meta Business Account | [business.facebook.com](https://business.facebook.com) |
| 2 | Create WhatsApp Business App | [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App → Business → WhatsApp |
| 3 | Add WhatsApp product to app | App Dashboard → Add Products → WhatsApp |
| 4 | Register a phone number | WhatsApp → Getting Started → Add phone number (must not have existing WhatsApp) |
| 5 | Complete Business Verification | Settings → Business Verification → submit documents |
| 6 | Generate permanent System User token | Business Settings → System Users → Generate token with `whatsapp_business_messaging` + `whatsapp_business_management` permissions |
| 7 | Set webhook URL | WhatsApp → Configuration → Webhook URL = `https://your-domain.com/webhook` |
| 8 | Subscribe to webhook fields | Subscribe to: `messages`, `message_template_status_update` |

### 4.2 Message Templates to Create

Templates are created in Meta Business Manager → WhatsApp Manager → Message Templates.

#### Template 1: `otp_verification` (Authentication Category)

```
Category: AUTHENTICATION
Language: ar (Arabic)
Header: None
Body: كود التحقق الخاص بك في سمسار AI: {{1}}
      الكود صالح لمدة 5 دقائق. لا تشاركه مع أي شخص.
Footer: None
Buttons: None
```

> **Note**: Meta has a special "Authentication" template category with built-in OTP button. Consider using it — Meta auto-generates the message body and the OTP autofill button.

#### Template 2: `welcome_message` (Marketing Category)

```
Category: MARKETING  
Language: ar (Arabic)
Header: None
Body: أهلاً بك في سمسار AI 👋
      منصتك الذكية للعقارات في مصر.
      تقدر تضيف عقارك أو تدور على عقار يناسبك من خلال التطبيق.
Footer: سمسار AI — مساعدك العقاري الذكي
Buttons: [URL] افتح التطبيق → {{1}}
```

#### Template 3: `listing_approved` (Utility Category)

```
Category: UTILITY
Language: ar (Arabic)
Header: None
Body: ✅ تم نشر عقارك بنجاح!
      {{1}}
      يمكنك متابعة عقارك من التطبيق.
Footer: None
Buttons: None
```

### 4.3 Required Environment Variables

```env
# ─── WhatsApp Cloud API (REQUIRED in production) ───────────────
WHATSAPP_TOKEN=EAAxxxxxxx          # System User permanent token
WHATSAPP_PHONE_NUMBER_ID=1234567   # Registered phone number ID
WHATSAPP_APP_SECRET=abcdef123456   # App Secret for HMAC verification
WHATSAPP_VERIFY_TOKEN=my-hook-pwd  # Custom string for webhook handshake
WHATSAPP_BUSINESS_ACCOUNT_ID=9876  # WABA ID (for template management API)

# ─── OTP Template ──────────────────────────────────────────────
WHATSAPP_OTP_TEMPLATE_NAME=otp_verification
WHATSAPP_OTP_TEMPLATE_LANG=ar

# ─── Optional: SMS Fallback ───────────────────────────────────
SMS_FALLBACK_ENABLED=false
SMS_PROVIDER=twilio              # twilio | vonage
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxx
TWILIO_PHONE_NUMBER=+20xxxxxxxxx
```

---

## 5. Code Changes Required

### 5.1 WhatsApp Service — Add Template Message Support

**File**: `backend/src/whatsapp/whatsapp.service.ts`

Add `sendTemplateMessage()` method alongside existing `sendTextMessage()`:

```typescript
async sendTemplateMessage(
  toNumber: string,
  templateName: string,
  languageCode: string,
  parameters: string[],
): Promise<{ messageId: string }> {
  const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: parameters.length > 0
          ? [{
              type: 'body',
              parameters: parameters.map((p) => ({
                type: 'text',
                text: p,
              })),
            }]
          : [],
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp Template API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return { messageId: data.messages?.[0]?.id ?? 'unknown' };
}
```

### 5.2 Auth Service — Use Template for OTP

**File**: `backend/src/auth/auth.service.ts`

Replace the plain text `sendTextMessage()` call with `sendTemplateMessage()`:

```typescript
// Before (broken in production):
await this.whatsapp.sendTextMessage(
  normalised,
  `كود التحقق الخاص بك في سمسار: ${code}\nالكود صالح لمدة 5 دقائق.`,
);

// After (production-ready):
const templateName = this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME') ?? 'otp_verification';
const templateLang = this.config.get<string>('WHATSAPP_OTP_TEMPLATE_LANG') ?? 'ar';

const { messageId } = await this.whatsapp.sendTemplateMessage(
  normalised,
  templateName,
  templateLang,
  [code],
);

// Track delivery
await this.prisma.otpCode.update({
  where: { id: otpRecord.id },
  data: { whatsappMessageId: messageId },
});
```

### 5.3 Environment Validation — Production Requirements

**File**: `backend/src/config/env.validation.ts`

Add conditional validation: WhatsApp vars must be required when `NODE_ENV=production`.

### 5.4 Delivery Status Webhook

**File**: `backend/src/whatsapp/whatsapp.controller.ts`

The existing `POST /webhook` already receives all webhook events. Add handling for `statuses` events (delivery receipts):

```typescript
// Inside the existing POST /webhook handler, after message parsing:
const statuses = value?.['statuses'] as StatusUpdate[];
if (statuses?.length) {
  for (const status of statuses) {
    await this.handleDeliveryStatus(status);
  }
}
```

### 5.5 OTP Delivery Tracking — Schema Change

**File**: `backend/prisma/schema.prisma`

Add fields to `OtpCode` model:

```prisma
model OtpCode {
  // ... existing fields ...
  whatsappMessageId  String?    // Meta message ID for delivery tracking
  deliveryStatus     String?    // sent | delivered | read | failed
  deliveryUpdatedAt  DateTime?  // Last status update timestamp
}
```

### 5.6 Dev/Prod Mode Separation

| Concern | Development | Production |
|---------|-------------|------------|
| WhatsApp credentials | Optional (mock if missing) | Required (crash on boot if missing) |
| OTP in response body | `devOtp` field returned | **Never** returned |
| OTP delivery | Try WhatsApp, fallback to console.log | WhatsApp template, fail = error |
| Webhook signature | Warn but allow (for local testing) | Strict HMAC — reject if invalid |
| CORS | Allow all origins | Restrict to app domain |

### 5.7 SMS Fallback (Optional Phase)

If WhatsApp delivery fails (status = `failed`), optionally send OTP via SMS using Twilio/Vonage:

```typescript
if (deliveryStatus === 'failed' && smsEnabled) {
  await this.smsFallback.sendOtp(phone, code);
}
```

---

## 6. Frontend Changes

### 6.1 Auth Modal — Remove devOtp Auto-fill in Production

**File**: `frontend/src/components/AuthModal.tsx`

The auto-fill logic (`if (res.devOtp) setOtp(res.devOtp.split(''))`) is fine — the backend simply won't return `devOtp` in production. No frontend change needed, but ensure the backend strips it.

### 6.2 OTP Delivery Status Indicator

Show the user whether the OTP was sent successfully:

```
📱 تم إرسال الكود على واتساب
   +20101234****
   [إعادة الإرسال بعد 60 ثانية]
```

If delivery fails:
```
⚠️ لم نتمكن من إرسال الكود. تأكد من رقم الهاتف أو حاول مرة أخرى.
```

### 6.3 WhatsApp Number Validation

The current regex `/^(\+20|0)?1[0125]\d{8}$/` validates Egyptian mobile numbers correctly. No change needed.

---

## 7. Security Considerations

| Concern | Current State | Required Action |
|---------|--------------|-----------------|
| OTP in API response | `devOtp` returned in dev mode | Strip in production (backend check) |
| HMAC webhook verification | ✅ Implemented correctly | No change |
| OTP rate limiting | 3 per 10min per phone | ✅ Adequate |
| OTP max attempts | 3 wrong tries | ✅ Adequate |
| OTP expiry | 5 minutes | ✅ Adequate |
| JWT secret | Placeholder in `.env` | Generate strong secret for production |
| CORS | Allow all origins | Restrict to app domain in production |
| WhatsApp token storage | `.env` file | Use environment variables / secrets manager |
| Template message injection | N/A (params are sanitized by Meta) | ✅ Safe |

---

## 8. Deployment Requirements

### 8.1 Public Webhook URL

Meta requires a publicly accessible HTTPS URL for webhook delivery:

```
https://api.semsar-ai.com/webhook
```

Options:
- **Railway / Render / Fly.io** — auto-HTTPS, custom domains
- **VPS + Nginx + Let's Encrypt** — manual but full control
- **ngrok** — for testing only (not production)

### 8.2 Webhook Verification Flow

When you set the webhook URL in Meta Dashboard:
1. Meta sends `GET /webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE`
2. Backend responds with the `challenge` value (already implemented in `WhatsAppController.verify()`)
3. Meta confirms subscription

### 8.3 Health Check

Add a `/health` endpoint that verifies:
- Database connection ✅
- WhatsApp API connectivity (ping Meta API)
- Gemini API connectivity

---

## 9. Testing Strategy

### 9.1 Unit Tests

| Test | Description |
|------|-------------|
| `sendTemplateMessage` formats payload correctly | Verify JSON body structure matches Meta API spec |
| `sendTemplateMessage` handles API errors | 4xx/5xx → throws with message |
| Auth service uses template in production | When `NODE_ENV=production`, calls `sendTemplateMessage` |
| Auth service uses text in dev | When `NODE_ENV=development`, calls `sendTextMessage` |
| `devOtp` stripped in production | Response object never includes `devOtp` when `NODE_ENV=production` |
| Delivery status webhook parsed correctly | Status updates update OTP record |

### 9.2 Integration Tests

| Test | Description |
|------|-------------|
| Full OTP flow with mocked WhatsApp | send-otp → verify-otp → JWT returned |
| Webhook HMAC verification | Valid signature → 200. Invalid → 401 |
| Delivery status updates OTP record | Receive status webhook → DB updated |

### 9.3 Manual Testing Checklist

- [ ] Register real phone number in Meta Dashboard
- [ ] Create and submit OTP template for approval
- [ ] Wait for template approval (24-48 hours)
- [ ] Send test OTP to real phone number
- [ ] Verify OTP received on WhatsApp
- [ ] Enter code in app → successfully logged in
- [ ] Test rate limiting (4th request blocked)
- [ ] Test expired OTP (wait 5 min)
- [ ] Test webhook delivery status updates

---

## 10. Rollout Plan

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 0**: Meta account setup | 1-2 days | Business account, app, phone number |
| **Phase 1**: Template creation & approval | 2-5 days | OTP template approved by Meta |
| **Phase 2**: Backend code changes | 2-3 days | Template sending, env validation, delivery tracking |
| **Phase 3**: Schema migration | 1 day | OTP delivery tracking fields |
| **Phase 4**: Frontend polish | 1 day | Delivery status UI, error messages |
| **Phase 5**: Deployment & webhook | 1-2 days | Public URL, webhook verified, production env vars |
| **Phase 6**: SMS fallback (optional) | 2-3 days | Twilio integration as backup |
| **Phase 7**: Monitoring & alerts | 1 day | Delivery rate dashboard, failure alerts |

**Total**: ~2 weeks (Phase 1 has a waiting period for Meta template approval)

---

## 11. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Meta template rejection | Blocks OTP delivery entirely | Follow Meta guidelines exactly; use AUTHENTICATION category for OTP |
| Meta Business Verification delays | Can't send to non-test numbers | Start verification early; use test numbers during dev |
| WhatsApp API rate limits (1000 msg/day for unverified business) | OTP blocked at scale | Complete business verification for higher limits |
| Phone number already has WhatsApp | Can't register for business | Use a new SIM/number dedicated to the business |
| Template approval takes 5+ days | Delays production launch | Submit templates ASAP, before code is ready |

---

## 12. Out of Scope

- ❌ Multi-country phone number support (Egypt only for MVP)
- ❌ WhatsApp interactive messages (buttons, lists) — future enhancement
- ❌ WhatsApp media messages (images in chat) — session messages only for now
- ❌ WhatsApp catalog integration
- ❌ Multiple WhatsApp business numbers
- ❌ End-to-end encryption for stored messages
