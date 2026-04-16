# Implementation Prompt: WhatsApp Production & OTP Verification

> **Purpose**: Self-contained prompt for an AI coding assistant to implement (or verify/continue) the WhatsApp production readiness feature for the Semsar AI platform.
> **Generated**: 2026-04-11
> **Status**: Phases 1–6 code-complete. Phase 0 (manual Meta setup) and Phase 7 (SMS fallback) remain.

---

## 1. Project Context

**Semsar AI (سمسار AI)** is a controlled real-estate platform for Egypt with guided property onboarding and algorithm-driven negotiation.

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11 (TypeScript), port 3000 |
| ORM | Prisma 6.x |
| Database | MySQL 8 |
| AI | Google Gemini 2.5 Flash |
| Frontend | React 18 + Vite + React Query + React Router, port 5173 |
| Chat (prod) | WhatsApp Cloud API v21.0 |
| Language | Egyptian Arabic (polite register — عامية مهذبة) for all user-facing text |

### Key Directories
```
backend/
  src/
    auth/           # JWT + OTP auth (auth.service.ts, auth.controller.ts)
    whatsapp/       # WhatsApp Cloud API integration
    config/         # env.validation.ts
    prisma/         # prisma.service.ts
    conversation-engine/  # Shared engine for WhatsApp + web chat
    common/         # Types (ParsedMessage, ConversationContext)
  prisma/
    schema.prisma   # MySQL schema with 15 tables
frontend/
  src/
    components/     # AuthModal.tsx, ChatWidget.tsx, etc.
    api/            # auth.ts (sendOtp, verifyOtp, updateProfile)
```

---

## 2. Problem Statement

The system has a fully built WhatsApp integration and OTP-via-WhatsApp auth flow, but **it cannot work in production** because:

1. **OTP is sent as plain text** — Meta **rejects** business-initiated messages outside the 24-hour session window. Template messages are required.
2. **All WhatsApp env vars are placeholders** — no real Meta credentials.
3. **Env validation mismatch** — vars marked `@IsOptional()` but service used `getOrThrow()` → silent crash.
4. **No graceful degradation** — if WhatsApp is unavailable, users are locked out.
5. **`devOtp` leaks in production** — the OTP code is returned in the API response.
6. **No delivery tracking** — no way to know if the OTP was actually delivered.
7. **CORS allows all origins** — insecure for production.

---

## 3. Target Architecture

### OTP Flow (Production-Ready)
```
User enters phone → POST /auth/send-otp
  → generate 6-digit OTP → store in DB
  → whatsapp.sendOtpTemplate(phone, code)
    → Uses pre-approved Meta template "otp_verification"
    → Returns messageId for tracking
  → Store whatsappMessageId + deliveryStatus='sent' on OTP record
  → Return { message: "OTP sent" }  (NEVER include code in production)

Meta Cloud API → POST /webhook (delivery status)
  → Parse statuses array from webhook payload
  → Find OTP record by whatsappMessageId
  → Update deliveryStatus (sent → delivered → read | failed)

User enters code → POST /auth/verify-otp → JWT returned (unchanged)
```

### Dev vs Production Behavior
| Concern | Development | Production |
|---------|-------------|------------|
| WhatsApp credentials | Optional (mock if missing) | Required (crash on boot if missing) |
| OTP in response body | `devOtp` field returned | **Never** returned |
| OTP delivery | Try WhatsApp; fallback to console.log | WhatsApp template; fail = error |
| CORS | Allow all origins | Restrict to app domain(s) |

---

## 4. What Has Been Implemented (Phases 1–6)

All code changes below are **already applied**. This section documents the current state so you can verify, debug, or extend.

### Phase 1: Environment Configuration ✅

**File: `backend/src/config/env.validation.ts`**
```typescript
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EnvironmentVariables {
  // ─── Core (always required) ──────────────────────────────
  @IsString() @IsNotEmpty() DATABASE_URL!: string;
  @IsString() @IsNotEmpty() GEMINI_API_KEY!: string;
  @IsString() @IsNotEmpty() JWT_SECRET!: string;
  @IsString() @IsOptional() JWT_EXPIRES_IN?: string;

  // ─── WhatsApp Cloud API ──────────────────────────────────
  // Required in production, optional in development.
  @ValidateIf((o) => o.NODE_ENV === 'production')
  @IsString() @IsNotEmpty({ message: 'WHATSAPP_TOKEN is required in production' })
  WHATSAPP_TOKEN?: string;

  @ValidateIf((o) => o.NODE_ENV === 'production')
  @IsString() @IsNotEmpty({ message: 'WHATSAPP_PHONE_NUMBER_ID is required in production' })
  WHATSAPP_PHONE_NUMBER_ID?: string;

  @ValidateIf((o) => o.NODE_ENV === 'production')
  @IsString() @IsNotEmpty({ message: 'WHATSAPP_APP_SECRET is required in production' })
  WHATSAPP_APP_SECRET?: string;

  @ValidateIf((o) => o.NODE_ENV === 'production')
  @IsString() @IsNotEmpty({ message: 'WHATSAPP_VERIFY_TOKEN is required in production' })
  WHATSAPP_VERIFY_TOKEN?: string;

  // ─── WhatsApp OTP Template Config ────────────────────────
  @IsString() @IsOptional() WHATSAPP_OTP_TEMPLATE_NAME?: string;
  @IsString() @IsOptional() WHATSAPP_OTP_TEMPLATE_LANG?: string;
  @IsString() @IsOptional() WHATSAPP_BUSINESS_ACCOUNT_ID?: string;

  // ─── SMS Fallback (optional) ─────────────────────────────
  @IsBoolean() @IsOptional() @Type(() => Boolean) SMS_FALLBACK_ENABLED?: boolean;
  @IsString() @IsOptional() SMS_PROVIDER?: string;
  @IsString() @IsOptional() TWILIO_ACCOUNT_SID?: string;
  @IsString() @IsOptional() TWILIO_AUTH_TOKEN?: string;
  @IsString() @IsOptional() TWILIO_PHONE_NUMBER?: string;

  // ─── App ─────────────────────────────────────────────────
  @IsNumber() @IsOptional() @Type(() => Number) PORT?: number;
  @IsString() @IsOptional() NODE_ENV?: string;
  @IsString() @IsOptional() GEMINI_MODEL?: string;
  @IsString() @IsOptional() CORS_ORIGINS?: string;
}
```

**Key design decision**: `@ValidateIf((o) => o.NODE_ENV === 'production')` — WhatsApp vars are only validated when running in production. In dev, the app starts fine without them and enters mock mode.

---

### Phase 2: Template Message Support ✅

**File: `backend/src/whatsapp/whatsapp.service.ts`** (331 lines)

Key changes to this service:

1. **Constructor — Graceful config**:
   - In dev: uses `configService.get()` with fallback to empty string (never crashes)
   - In production: uses `configService.getOrThrow()` (crashes at bootstrap if missing)
   - Detects placeholder values (`your_whatsapp_token_here`) → marks as unconfigured

2. **`isConfigured(): boolean`** — returns whether real credentials are present

3. **`sendTemplateMessage(toNumber, templateName, languageCode, bodyParameters[])`**:
   - Builds Meta Cloud API template message payload
   - Returns `{ messageId }` for delivery tracking
   - In mock mode: returns `{ messageId: 'mock-{timestamp}' }` and logs

4. **`sendOtpTemplate(toNumber, otpCode)`** — convenience wrapper using configured template name/lang

5. **`parseDeliveryStatuses(payload): DeliveryStatus[]`** — parses delivery status webhook events

6. **Mock mode** — all send methods log to console instead of calling Meta API when unconfigured

7. **Exported interface**: `DeliveryStatus { id, status, timestamp, recipientId }`

```typescript
// Constructor pattern:
const token = this.isProduction
  ? this.configService.getOrThrow<string>('WHATSAPP_TOKEN')
  : this.configService.get<string>('WHATSAPP_TOKEN') ?? '';

this._isConfigured = !!(token && phoneNumberId && appSecret && verifyToken)
  && token !== 'your_whatsapp_token_here';

// Template message payload structure:
{
  messaging_product: 'whatsapp',
  to: toNumber,
  type: 'template',
  template: {
    name: templateName,
    language: { code: languageCode },
    components: [{
      type: 'body',
      parameters: bodyParameters.map(text => ({ type: 'text', text })),
    }],
  },
}
```

---

### Phase 3: OTP Delivery Tracking ✅

**Schema change in `backend/prisma/schema.prisma`** — OtpCode model:
```prisma
model OtpCode {
  id                 String    @id @default(uuid())
  phone              String
  code               String
  attempts           Int       @default(0)
  expiresAt          DateTime  @map("expires_at")
  usedAt             DateTime? @map("used_at")
  createdAt          DateTime  @default(now()) @map("created_at")
  whatsappMessageId  String?   @map("whatsapp_message_id")
  deliveryStatus     String?   @map("delivery_status")     // sent | delivered | read | failed
  deliveryUpdatedAt  DateTime? @map("delivery_updated_at")

  @@index([phone, createdAt])
  @@map("otp_codes")
}
```

**File: `backend/src/auth/auth.service.ts`** — `sendOtp()` method:
```typescript
async sendOtp(phone: string): Promise<{ message: string; devOtp?: string }> {
  // ... rate limiting, OTP generation ...

  const otpRecord = await this.prisma.otpCode.create({
    data: { phone: normalised, code, expiresAt },
  });

  try {
    if (this.whatsapp.isConfigured()) {
      const { messageId } = await this.whatsapp.sendOtpTemplate(normalised, code);
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { whatsappMessageId: messageId, deliveryStatus: 'sent' },
      });
    } else {
      this.logger.warn(`[DEV] OTP for ${normalised}: ${code}`);
    }
  } catch (err) {
    if (isDev) {
      this.logger.warn(`[DEV] OTP for ${normalised}: ${code}`);
    } else {
      throw new BadRequestException('Failed to send OTP. Please try again later.');
    }
  }

  return {
    message: 'OTP sent successfully',
    ...(isDev ? { devOtp: code } : {}),  // NEVER include in production
  };
}
```

**File: `backend/src/whatsapp/whatsapp.controller.ts`**:
- `GET /webhook` — Meta verification handshake (unchanged)
- `GET /webhook/health` — returns `{ configured, lastWebhookReceived }`
- `POST /webhook` — now handles both messages AND delivery statuses:
  ```typescript
  // 1. Handle incoming messages
  const parsed = this.whatsapp.parseIncomingMessage(payload);
  if (parsed && (parsed.body || parsed.mediaId)) {
    this.orchestrator.processMessage(parsed).catch(...);
  }
  // 2. Handle delivery status updates
  const statuses = this.whatsapp.parseDeliveryStatuses(payload);
  if (statuses.length > 0) {
    this.orchestrator.handleDeliveryStatuses(statuses).catch(...);
  }
  ```

**File: `backend/src/whatsapp/whatsapp-orchestrator.service.ts`**:
- Added `handleDeliveryStatuses(statuses: DeliveryStatus[])`:
  - For each status: find OTP record by `whatsappMessageId`
  - Update `deliveryStatus` and `deliveryUpdatedAt`
  - Ignore unknown messageIds gracefully
  - Continue processing after errors on individual statuses

---

### Phase 4: Frontend Polish ✅

**File: `frontend/src/components/AuthModal.tsx`**:
- OTP step now says "تم إرسال كود التحقق على واتساب" (sent via WhatsApp)
- Phone step says "سنرسل لك كود التحقق على واتساب"
- "لم تستلم الكود على واتساب؟" for resend prompt
- Error mapping for Arabic messages:
  ```typescript
  const errorMap: Record<string, string> = {
    'Rate limit exceeded': 'لقد تجاوزت الحد المسموح. حاول بعد قليل.',
    'Failed to send OTP via WhatsApp': 'فشل إرسال الكود عبر واتساب. تأكد أن رقمك مسجل على واتساب.',
    'Too many OTP requests': 'طلبات كثيرة جداً. انتظر قليلاً ثم حاول مرة أخرى.',
  };
  ```

---

### Phase 5: Graceful Degradation ✅

**Design decision**: Instead of creating a separate `WhatsAppMockService` class (as originally specced), the mock behavior was built directly into `WhatsAppService` via `isConfigured()` checks. This is simpler and avoids DI complexity.

- All send methods check `this._isConfigured` and log to console if false
- `sendTemplateMessage` returns `{ messageId: 'mock-{timestamp}' }` in mock mode
- Health endpoint at `GET /webhook/health`

---

### Phase 6: Production Deployment Config ✅

**File: `backend/src/main.ts`** — CORS:
```typescript
const corsOrigins = process.env['CORS_ORIGINS'];
app.enableCors(
  corsOrigins
    ? { origin: corsOrigins.split(',').map((o) => o.trim()), credentials: true }
    : undefined,
);
```

**File: `backend/src/whatsapp/index.ts`** — Barrel exports:
```typescript
export { WhatsAppModule } from './whatsapp.module';
export { WhatsAppService } from './whatsapp.service';
export type { DeliveryStatus } from './whatsapp.service';
export { WhatsAppController } from './whatsapp.controller';
export { WhatsAppOrchestratorService } from './whatsapp-orchestrator.service';
```

---

### Tests ✅ (47 WhatsApp tests, all passing)

**`whatsapp.service.spec.ts`** (26 tests):
- HMAC verification (4 tests)
- Message parsing (5 tests)
- `isConfigured()` (4 tests) — configured, empty token, placeholder token, missing phone ID
- `parseDeliveryStatuses()` (4 tests) — single, multiple, empty, malformed
- Mock mode (4 tests) — sendTextMessage, sendTemplateMessage, sendOtpTemplate, getMediaUrl

**`whatsapp-orchestrator.service.spec.ts`** (15 tests):
- User resolution (2 tests)
- Flow detection (3 tests)
- Engine delegation (3 tests)
- Error handling (2 tests)
- `handleDeliveryStatuses` (5 tests) — matching record, unknown ID, multiple, empty, error recovery

**`whatsapp.controller.spec.ts`** (11 tests):
- GET verification (6 tests)
- POST receive (5 tests) — HMAC, rawBody, valid message, no body/mediaId, null parse

---

## 5. Environment Variables

**File: `backend/.env.example`**:
```env
# ─── Database ──────────────────────────────────────────────────
DATABASE_URL="mysql://semsar:semsar_pass@localhost:3306/semsar_ai"

# ─── Gemini AI ─────────────────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here

# ─── WhatsApp Cloud API ───────────────────────────────────────
# Required in production. Get from Meta Developer Portal.
WHATSAPP_TOKEN=your_whatsapp_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_APP_SECRET=your_app_secret_here
WHATSAPP_VERIFY_TOKEN=your_verify_token_here

# ─── WhatsApp OTP Template ────────────────────────────────────
WHATSAPP_OTP_TEMPLATE_NAME=otp_verification
WHATSAPP_OTP_TEMPLATE_LANG=ar

# ─── JWT Auth ──────────────────────────────────────────────────
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# ─── App ───────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
# CORS_ORIGINS=https://semsar-ai.com,https://www.semsar-ai.com

# ─── SMS Fallback (optional) ──────────────────────────────────
# SMS_FALLBACK_ENABLED=false
# SMS_PROVIDER=twilio
# TWILIO_ACCOUNT_SID=ACxxxxxxx
# TWILIO_AUTH_TOKEN=xxxxxxx
# TWILIO_PHONE_NUMBER=+20xxxxxxxxx
```

---

## 6. What Still Needs to Be Done

### Phase 0: Meta Business Account Setup (Manual — Project Owner)

These are **manual steps** in the Meta Business Dashboard. No code changes.

| Step | Action | Output |
|------|--------|--------|
| 0.1 | Create Meta Business Account at business.facebook.com | Business Account ID |
| 0.2 | Create WhatsApp Business App at developers.facebook.com | App ID + App Secret |
| 0.3 | Register a business phone number (must NOT have existing WhatsApp) | Phone Number ID |
| 0.4 | Generate permanent System User token with `whatsapp_business_messaging` + `whatsapp_business_management` permissions | Access Token |
| 0.5 | Create OTP template: Category=AUTHENTICATION, Name=`otp_verification`, Language=ar, Body=`كود التحقق الخاص بك في سمسار AI: {{1}}\nالكود صالح لمدة 5 دقائق. لا تشاركه مع أي شخص.` | Approved template |
| 0.6 | Start Business Verification (3-7 business days) | Verified badge → higher messaging limits |
| 0.7 | Set webhook URL to `https://your-domain.com/webhook` and subscribe to `messages` + `message_template_status_update` fields | Webhook verified ✓ |

**After Meta setup, set these production env vars:**
```
NODE_ENV=production
WHATSAPP_TOKEN=EAAxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=1234567
WHATSAPP_APP_SECRET=abcdef123456
WHATSAPP_VERIFY_TOKEN=<chosen webhook password>
WHATSAPP_OTP_TEMPLATE_NAME=otp_verification
WHATSAPP_OTP_TEMPLATE_LANG=ar
JWT_SECRET=<strong random 64+ char string>
CORS_ORIGINS=https://semsar-ai.com,https://www.semsar-ai.com
```

---

### Phase 7: SMS Fallback (Optional — Future Enhancement)

If WhatsApp delivery fails, fall back to SMS via Twilio.

**New files to create:**
```
backend/src/sms/
  sms.module.ts
  sms.service.ts
  sms.service.spec.ts
```

**Implementation:**
1. `SmsService` — wraps Twilio SDK (`npm install twilio`)
   - `sendOtp(phone: string, code: string): Promise<void>`
   - Message text: `كود التحقق: ${code} - سمسار AI`
   - Reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` from env

2. **Integrate into `AuthService.sendOtp()`** — after WhatsApp OTP send fails:
   - Check if `SMS_FALLBACK_ENABLED=true`
   - Call `smsService.sendOtp(phone, code)`
   - Update `deliveryStatus` to `'sms_sent'`
   - If SMS also fails: throw error to user

3. **Frontend indicator** — if backend response includes `channel: 'sms'`, show "تم إرسال الكود برسالة SMS" with different icon

**Env vars needed:**
```env
SMS_FALLBACK_ENABLED=true
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxx
TWILIO_PHONE_NUMBER=+20xxxxxxxxx
```

---

## 7. Verification Checklist

### Automated (already passing):
- [x] Backend TypeScript compiles clean (`npx tsc --noEmit` → exit 0)
- [x] 47 WhatsApp tests pass (service: 26, orchestrator: 15, controller: 11)
- [x] 338/340 total backend tests pass (2 pre-existing onboarding step-order failures)
- [x] Prisma client regenerated with new OtpCode fields
- [x] Database schema in sync (`npx prisma db push` → "already in sync")

### Manual (after Meta setup):
- [ ] App starts with all production env vars
- [ ] `POST /auth/send-otp` → OTP template sent on WhatsApp
- [ ] OTP received on real phone
- [ ] `POST /auth/verify-otp` → JWT returned
- [ ] No `devOtp` in production response
- [ ] WhatsApp delivery status webhook received and OTP record updated
- [ ] Incoming WhatsApp messages processed correctly
- [ ] `GET /webhook/health` → `{ configured: true, lastWebhookReceived: ... }`
- [ ] CORS blocks unauthorized origins

---

## 8. Key Design Decisions

1. **Inline mock mode vs separate mock service**: We chose to build mock behavior directly into `WhatsAppService` via `isConfigured()` checks instead of creating a separate `WhatsAppMockService`. This avoids DI complexity and keeps the codebase simpler.

2. **Template messages for ALL OTPs**: Even for returning users within the 24h session window, we use template messages for consistency. This avoids edge cases where a user's session expired between OTP request and delivery.

3. **`@ValidateIf` for conditional validation**: WhatsApp env vars use `@ValidateIf((o) => o.NODE_ENV === 'production')` from class-validator, so dev mode never fails validation for missing WhatsApp credentials.

4. **Delivery status is fire-and-forget**: The webhook POST handler returns 200 immediately, then processes delivery statuses asynchronously. Errors in status processing never affect the webhook response.

5. **Placeholder detection**: The service checks `token !== 'your_whatsapp_token_here'` to detect .env.example placeholder values that were accidentally left in place.

---

## 9. File Reference (Complete Current State)

All source files that were created or modified for this feature:

| File | Status | Description |
|------|--------|-------------|
| `backend/src/config/env.validation.ts` | Modified | `@ValidateIf` for production WhatsApp vars, SMS fallback vars, CORS |
| `backend/.env` | Modified | Added template config, CORS, SMS placeholders |
| `backend/.env.example` | Modified | Full documentation of all env vars |
| `backend/src/whatsapp/whatsapp.service.ts` | Major rewrite | Template sending, mock mode, delivery parsing, `isConfigured()` |
| `backend/src/whatsapp/whatsapp.controller.ts` | Modified | Health endpoint, delivery status processing |
| `backend/src/whatsapp/whatsapp-orchestrator.service.ts` | Modified | `handleDeliveryStatuses()` method |
| `backend/src/whatsapp/index.ts` | Modified | Export `DeliveryStatus` type |
| `backend/src/whatsapp/whatsapp.module.ts` | Unchanged | No changes needed |
| `backend/prisma/schema.prisma` | Modified | 3 new fields on OtpCode model |
| `backend/src/auth/auth.service.ts` | Modified | Template OTP, delivery tracking, devOtp guard |
| `backend/src/main.ts` | Modified | Production CORS via `CORS_ORIGINS` env var |
| `frontend/src/components/AuthModal.tsx` | Modified | WhatsApp messaging, Arabic error mapping |
| `backend/src/whatsapp/whatsapp.service.spec.ts` | Modified | 26 tests (added isConfigured, delivery, mock mode) |
| `backend/src/whatsapp/whatsapp-orchestrator.service.spec.ts` | Modified | 15 tests (added handleDeliveryStatuses) |
| `backend/src/whatsapp/whatsapp.controller.spec.ts` | Modified | Updated mocks for new methods |

---

## 10. Running the Project

```bash
# Backend
cd backend
cp .env.example .env  # Then fill in real values
npm install
npx prisma generate
npx prisma db push
npm run start:dev      # Runs on port 3000

# Frontend
cd frontend
npm install
npm run dev            # Runs on port 5173

# Tests
cd backend
npx jest src/whatsapp/ --verbose  # 47 tests
npx jest --verbose                # Full suite (340 tests)

# Type check
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

---

## 11. Meta WhatsApp Template Reference

### OTP Template (`otp_verification`)
```
Category: AUTHENTICATION
Language: ar (Arabic)
Body: كود التحقق الخاص بك في سمسار AI: {{1}}
      الكود صالح لمدة 5 دقائق. لا تشاركه مع أي شخص.
```

### API Payload (what our code sends)
```json
{
  "messaging_product": "whatsapp",
  "to": "201012345678",
  "type": "template",
  "template": {
    "name": "otp_verification",
    "language": { "code": "ar" },
    "components": [{
      "type": "body",
      "parameters": [{ "type": "text", "text": "123456" }]
    }]
  }
}
```

### Delivery Status Webhook (what we receive from Meta)
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "statuses": [{
          "id": "wamid.HBgNMjAxMDEyMzQ1Njc4FQIAERg...",
          "status": "delivered",
          "timestamp": "1720000000",
          "recipient_id": "201012345678"
        }]
      }
    }]
  }]
}
```
