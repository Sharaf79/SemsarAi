# 004 — WhatsApp Production & OTP Verification: Tasks

**Spec**: [spec.md](./spec.md)  
**Created**: 2026-04-11

---

## Phase 0: Meta Business Account Setup (Manual — Owner)

> ⚠️ These are **manual steps** the project owner must complete in the Meta Business Dashboard.
> No code changes. Start this FIRST because template approval takes 2-5 days.

### Task 0.1 — Create Meta Business Account & WhatsApp App
- **Action**: Manual
- **Steps**:
  1. Go to [business.facebook.com](https://business.facebook.com) → Create Business Account
  2. Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App
  3. Select "Business" type → name it "Semsar AI"
  4. Add "WhatsApp" product to the app
  5. Note down the **App ID** and **App Secret**
- **Output**: App ID, App Secret

### Task 0.2 — Register a Business Phone Number
- **Action**: Manual
- **Steps**:
  1. In Meta Developer Portal → WhatsApp → Getting Started
  2. Add a phone number (must NOT have an existing WhatsApp account)
  3. Verify via SMS/voice call
  4. Note down the **Phone Number ID**
- **Output**: Phone Number ID, Display Phone Number

### Task 0.3 — Generate Permanent System User Token
- **Action**: Manual
- **Steps**:
  1. Business Settings → System Users → Create system user (Admin role)
  2. Add Assets → select WhatsApp app → Full Control
  3. Generate Token with permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
  4. Copy and securely store the token
- **Output**: Permanent access token (never expires)

### Task 0.4 — Create OTP Message Template
- **Action**: Manual
- **Steps**:
  1. Go to WhatsApp Manager → Message Templates → Create Template
  2. **Category**: Authentication
  3. **Name**: `otp_verification`
  4. **Language**: Arabic (ar)
  5. **Body**: `كود التحقق الخاص بك في سمسار AI: {{1}}\nالكود صالح لمدة 5 دقائق. لا تشاركه مع أي شخص.`
  6. Submit for approval
  7. Wait for approval (typically 24-48 hours, up to 5 business days)
- **Output**: Approved template named `otp_verification`
- **Verification**: Template status = APPROVED in Meta Dashboard

### Task 0.5 — (Optional) Create Welcome & Notification Templates
- **Action**: Manual
- **Templates**:
  - `welcome_message` (Marketing) — sent after first registration
  - `listing_approved` (Utility) — sent when property is published
- **Note**: Not blocking for MVP; can be added later

### Task 0.6 — Start Business Verification
- **Action**: Manual
- **Steps**:
  1. Business Settings → Business Verification
  2. Submit required documents (business registration, address, etc.)
  3. Wait for Meta review (3-7 business days)
- **Why**: Without verification, limited to 250 unique recipients/day. After verification: 1K→10K→100K/day
- **Output**: Verified business badge

---

## Phase 1: Environment Configuration & Validation

> Make WhatsApp vars required in production, add new config vars for templates.

### Task 1.1 — Update Environment Validation
- **File**: `backend/src/config/env.validation.ts`
- **Changes**:
  - Add custom validator: if `NODE_ENV === 'production'`, WhatsApp vars become `@IsNotEmpty()`
  - Add new optional vars: `WHATSAPP_OTP_TEMPLATE_NAME`, `WHATSAPP_OTP_TEMPLATE_LANG`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
  - Add SMS fallback vars (all optional): `SMS_FALLBACK_ENABLED`, `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- **Acceptance**:
  - `NODE_ENV=development` + missing WhatsApp vars → app starts OK
  - `NODE_ENV=production` + missing WhatsApp vars → app crashes with clear error message
  - All new vars are validated when present

### Task 1.2 — Update .env and .env.example
- **Files**: `backend/.env`, `backend/.env.example`
- **Changes**:
  - Add template vars with placeholder values
  - Add comments explaining each variable
  - Add SMS fallback vars (commented out)
- **Acceptance**: `.env.example` documents every possible env var

### Task 1.3 — Add Production Config Guard to WhatsAppService
- **File**: `backend/src/whatsapp/whatsapp.service.ts`
- **Changes**:
  - In constructor: if `NODE_ENV !== 'production'` and vars are missing, log warning but don't crash
  - Create a `isConfigured()` method that returns whether WhatsApp is properly configured
  - Expose `isProduction` flag for conditional behavior
- **Acceptance**:
  - Dev mode without WhatsApp vars → service initializes with mock mode
  - Production without WhatsApp vars → fails fast at bootstrap

---

## Phase 2: WhatsApp Template Message Support

> Add the ability to send template messages (required for business-initiated conversations like OTP).

### Task 2.1 — Add `sendTemplateMessage()` to WhatsAppService
- **File**: `backend/src/whatsapp/whatsapp.service.ts`
- **Method signature**:
  ```typescript
  async sendTemplateMessage(
    toNumber: string,
    templateName: string,
    languageCode: string,
    bodyParameters: string[],
  ): Promise<{ messageId: string }>
  ```
- **Changes**:
  - Build Meta Cloud API template message payload
  - POST to `/{phoneNumberId}/messages` with `type: "template"`
  - Parse response to extract `messages[0].id` (WhatsApp message ID)
  - Return `{ messageId }` for delivery tracking
  - On error: throw with status code and error body
- **Acceptance**:
  - Correctly formatted API payload per [Meta Cloud API docs](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates)
  - Returns `messageId` on success
  - Throws descriptive error on failure

### Task 2.2 — Add `sendOtpTemplate()` convenience method
- **File**: `backend/src/whatsapp/whatsapp.service.ts`
- **Method**:
  ```typescript
  async sendOtpTemplate(toNumber: string, otpCode: string): Promise<{ messageId: string }>
  ```
- **Changes**:
  - Reads `WHATSAPP_OTP_TEMPLATE_NAME` and `WHATSAPP_OTP_TEMPLATE_LANG` from config
  - Calls `sendTemplateMessage()` with the OTP code as body parameter
- **Acceptance**:
  - Uses configured template name/language
  - Falls back to defaults if not configured (`otp_verification` / `ar`)

### Task 2.3 — Unit Tests for Template Messaging
- **File**: `backend/src/whatsapp/whatsapp.service.spec.ts`
- **Tests**:
  - `sendTemplateMessage` builds correct Meta API payload
  - `sendTemplateMessage` parses messageId from response
  - `sendTemplateMessage` throws on 4xx/5xx response
  - `sendOtpTemplate` reads config and delegates correctly
- **Count**: 4+ tests

---

## Phase 3: OTP Delivery Tracking (Schema + Backend)

> Track whether OTP was actually delivered to the user's WhatsApp.

### Task 3.1 — Prisma Schema Migration
- **File**: `backend/prisma/schema.prisma`
- **Changes to `OtpCode` model**:
  ```prisma
  whatsappMessageId  String?      @map("whatsapp_message_id")
  deliveryStatus     String?      @map("delivery_status")    // sent | delivered | read | failed
  deliveryUpdatedAt  DateTime?    @map("delivery_updated_at")
  ```
- **Run**: `npx prisma db push` (or `prisma migrate dev` if permissions allow)
- **Acceptance**:
  - Fields added to DB
  - Prisma client regenerated
  - Existing OTP records unaffected (all new fields nullable)

### Task 3.2 — Update Auth Service to Track Delivery
- **File**: `backend/src/auth/auth.service.ts`
- **Changes**:
  - After sending OTP (template or text), save `whatsappMessageId` and `deliveryStatus: 'sent'`
  - In production: use `sendOtpTemplate()` instead of `sendTextMessage()`
  - In dev: keep `sendTextMessage()` as fallback, log OTP to console if WhatsApp is not configured
  - **Remove `devOtp` from production responses**: Only include when `NODE_ENV !== 'production'`
- **Acceptance**:
  - Production: OTP sent via template, messageId tracked, no devOtp in response
  - Dev: OTP sent via text (or logged to console), devOtp returned in response
  - OTP record has `whatsappMessageId` and `deliveryStatus` after send

### Task 3.3 — Delivery Status Webhook Handler
- **File**: `backend/src/whatsapp/whatsapp.controller.ts` + `backend/src/whatsapp/whatsapp-orchestrator.service.ts`
- **Changes**:
  - In `POST /webhook` handler, after parsing messages, also parse `statuses` array from payload
  - `statuses` payload structure:
    ```json
    {
      "statuses": [{
        "id": "wamid.xxx",
        "status": "delivered",  // sent | delivered | read | failed
        "timestamp": "1234567890",
        "recipient_id": "20101234567"
      }]
    }
    ```
  - Add `handleDeliveryStatus(status)` method to orchestrator:
    - Find OTP record by `whatsappMessageId`
    - Update `deliveryStatus` and `deliveryUpdatedAt`
  - Add `parseDeliveryStatuses()` to WhatsAppService for payload parsing
- **Acceptance**:
  - Delivery status webhooks update OTP records in DB
  - Unknown messageIds are ignored gracefully
  - No impact on existing message processing

### Task 3.4 — Unit Tests for Delivery Tracking
- **File**: `backend/src/whatsapp/whatsapp-orchestrator.service.spec.ts`
- **Tests**:
  - Delivery status `delivered` → updates OTP record
  - Delivery status `failed` → updates OTP record
  - Unknown message ID → no error, no DB change
  - Auth service uses template in production mode
  - Auth service uses text in dev mode
  - `devOtp` not in production response
- **Count**: 6+ tests

---

## Phase 4: Frontend — Delivery Feedback & Error Handling

> Show users clear feedback about OTP delivery status.

### Task 4.1 — Enhanced OTP Sending Feedback
- **File**: `frontend/src/components/AuthModal.tsx`
- **Changes**:
  - After `sendOtp()` returns:
    - Show "تم إرسال الكود على واتساب" with a WhatsApp icon
    - If error (WhatsApp failed): show "لم نتمكن من إرسال الكود. تأكد أن الرقم مسجل على واتساب."
  - Add "لم يصلك الكود؟" link that:
    - Shows troubleshooting tips: "تأكد أن الرقم مسجل على واتساب" / "تحقق من اتصال الإنترنت"
    - Offers resend button (respects rate limit timer)
- **Acceptance**:
  - User sees WhatsApp-specific messaging (not generic "SMS sent")
  - Error states are clear and actionable

### Task 4.2 — WhatsApp-Specific Error Messages (Arabic)
- **File**: `frontend/src/components/AuthModal.tsx`
- **Error mapping**:
  | Backend Error | Arabic Message |
  |--------------|----------------|
  | `Too many OTP requests` | `لقد تجاوزت الحد الأقصى لطلبات الكود. انتظر 10 دقائق.` |
  | `Failed to send OTP` | `لم نتمكن من إرسال الكود. تأكد من رقم الهاتف وحاول مرة أخرى.` |
  | `OTP has expired` | `انتهت صلاحية الكود. اطلب كود جديد.` |
  | `Invalid OTP code` | `الكود غير صحيح. حاول مرة أخرى.` |
  | `Too many failed attempts` | `تجاوزت عدد المحاولات. اطلب كود جديد.` |
- **Acceptance**: All error states show Arabic messages

### Task 4.3 — Remove devOtp Auto-fill Guard
- **File**: `frontend/src/components/AuthModal.tsx`
- **Changes**:
  - The existing `if (res.devOtp)` logic is fine — backend won't return it in production
  - Add a comment clarifying this is dev-only behavior
  - Optionally: check `import.meta.env.DEV` before auto-filling
- **Acceptance**: No behavior change; code is clearly documented

---

## Phase 5: WhatsApp Service — Graceful Degradation

> Handle WhatsApp being unavailable without breaking the app.

### Task 5.1 — Mock WhatsApp Service for Dev Mode
- **File**: `backend/src/whatsapp/whatsapp-mock.service.ts` (NEW)
- **Changes**:
  - Create a `WhatsAppMockService` that implements the same interface
  - `sendTextMessage()` → logs to console, returns void
  - `sendTemplateMessage()` → logs to console, returns mock `{ messageId: 'mock-xxx' }`
  - `sendOtpTemplate()` → logs OTP to console
  - All other methods return safe defaults
- **Acceptance**:
  - Mock service works without any WhatsApp credentials
  - All OTPs are logged to console in dev mode

### Task 5.2 — Conditional WhatsApp Module Loading
- **File**: `backend/src/whatsapp/whatsapp.module.ts`
- **Changes**:
  - Use factory provider to inject either `WhatsAppService` or `WhatsAppMockService`
  - Decision based on `NODE_ENV` and whether WhatsApp vars are configured
  - Both implement same interface so consumers don't need to change
- **Acceptance**:
  - `NODE_ENV=development` + no WhatsApp vars → mock service injected
  - `NODE_ENV=development` + WhatsApp vars present → real service injected
  - `NODE_ENV=production` + WhatsApp vars present → real service injected
  - `NODE_ENV=production` + no WhatsApp vars → app fails to start

### Task 5.3 — WhatsApp Health Check Endpoint
- **File**: `backend/src/whatsapp/whatsapp.controller.ts`
- **Endpoint**: `GET /webhook/health`
- **Returns**:
  ```json
  {
    "configured": true,
    "mode": "production",
    "phoneNumberId": "12345...",
    "templateConfigured": true,
    "lastWebhookReceived": "2026-04-11T10:00:00Z"
  }
  ```
- **Acceptance**: Non-authenticated health check (for monitoring)

### Task 5.4 — Tests for Graceful Degradation
- **Tests**:
  - Mock service logs to console, doesn't call Meta API
  - Module uses real service when configured
  - Module uses mock service when not configured in dev
  - Health endpoint returns correct status
- **Count**: 4+ tests

---

## Phase 6: Production Deployment Config

> Configure the deployed backend for production WhatsApp.

### Task 6.1 — Set Production Environment Variables
- **Action**: Manual (on deployment platform)
- **Variables to set**:
  ```
  NODE_ENV=production
  WHATSAPP_TOKEN=<real token from Task 0.3>
  WHATSAPP_PHONE_NUMBER_ID=<real ID from Task 0.2>
  WHATSAPP_APP_SECRET=<real secret from Task 0.1>
  WHATSAPP_VERIFY_TOKEN=<chosen webhook password>
  WHATSAPP_OTP_TEMPLATE_NAME=otp_verification
  WHATSAPP_OTP_TEMPLATE_LANG=ar
  JWT_SECRET=<strong random 64+ char string>
  ```
- **Acceptance**: App starts without config errors

### Task 6.2 — Configure Webhook URL in Meta Dashboard
- **Action**: Manual
- **Steps**:
  1. Deploy backend to production URL (e.g., `https://api.semsar-ai.com`)
  2. In Meta Developer Portal → WhatsApp → Configuration
  3. Set Callback URL: `https://api.semsar-ai.com/webhook`
  4. Set Verify Token: same as `WHATSAPP_VERIFY_TOKEN` env var
  5. Subscribe to fields: `messages`, `message_template_status_update`
  6. Click "Verify and Save"
- **Acceptance**: Meta shows "Webhook verified ✓"

### Task 6.3 — CORS Configuration for Production
- **File**: `backend/src/main.ts`
- **Changes**:
  - In production: restrict CORS to app domain(s) only
  - Read allowed origins from env var `CORS_ORIGINS`
  ```typescript
  const corsOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGINS ?? '').split(',')
    : true;
  app.enableCors({ origin: corsOrigins });
  ```
- **Acceptance**: Production rejects requests from unauthorized origins

### Task 6.4 — Production Smoke Test
- **Action**: Manual
- **Checklist**:
  - [ ] App starts with all env vars
  - [ ] `GET /webhook?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=test` → returns "test"
  - [ ] `POST /auth/send-otp` → OTP template sent on WhatsApp
  - [ ] OTP received on real phone
  - [ ] `POST /auth/verify-otp` → JWT returned
  - [ ] WhatsApp delivery status webhook received
  - [ ] Incoming WhatsApp message processed correctly
  - [ ] No `devOtp` in response

---

## Phase 7: SMS Fallback (Optional / Future)

> If WhatsApp delivery fails, fall back to SMS via Twilio.

### Task 7.1 — Twilio SMS Module
- **Files**: `backend/src/sms/sms.module.ts`, `backend/src/sms/sms.service.ts` (NEW)
- **Changes**:
  - Create `SmsService` with `sendOtp(phone: string, code: string)` method
  - Use Twilio SDK: `npm install twilio`
  - Read config from env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
  - Message text: `كود التحقق: ${code} - سمسار AI`
- **Acceptance**: SMS sent to phone number via Twilio

### Task 7.2 — Integrate SMS Fallback into Auth Service
- **File**: `backend/src/auth/auth.service.ts`
- **Changes**:
  - After WhatsApp OTP send fails:
    1. Check if `SMS_FALLBACK_ENABLED=true`
    2. If yes: call `smsService.sendOtp(phone, code)`
    3. Update `deliveryStatus` to `'sms_sent'`
    4. If SMS also fails: throw error to user
- **Acceptance**: User receives OTP via SMS when WhatsApp fails

### Task 7.3 — Frontend — SMS Fallback Indicator
- **File**: `frontend/src/components/AuthModal.tsx`
- **Changes**:
  - If backend response includes `{ channel: 'sms' }`, show "تم إرسال الكود برسالة SMS"
  - Different icon for SMS vs WhatsApp
- **Acceptance**: User knows which channel received the OTP

---

## Summary Table

| Phase | Tasks | Effort | Blocking |
|-------|-------|--------|----------|
| **Phase 0**: Meta Account Setup | 0.1–0.6 | 1-2 days (manual) | Start ASAP — template approval takes days |
| **Phase 1**: Env Config | 1.1–1.3 | 0.5 day | - |
| **Phase 2**: Template Messages | 2.1–2.3 | 1 day | Depends on Phase 0.4 (template name) |
| **Phase 3**: Delivery Tracking | 3.1–3.4 | 1.5 days | - |
| **Phase 4**: Frontend Polish | 4.1–4.3 | 0.5 day | - |
| **Phase 5**: Graceful Degradation | 5.1–5.4 | 1 day | - |
| **Phase 6**: Deployment | 6.1–6.4 | 1 day (manual) | Depends on Phase 0 completion |
| **Phase 7**: SMS Fallback | 7.1–7.3 | 1.5 days | Optional |

**Critical Path**: Phase 0 → Phase 2 → Phase 3 → Phase 6  
**Parallel Work**: Phase 1, Phase 4, Phase 5 can be done while waiting for Phase 0 template approval  
**Total Effort**: ~7-8 days coding + 2-5 days waiting for Meta approvals

---

## Exit Criteria

- [ ] OTP message arrives on real WhatsApp phone in production
- [ ] User can register and login end-to-end
- [ ] `devOtp` never leaks in production responses
- [ ] Webhook receives and processes incoming WhatsApp messages
- [ ] Delivery status is tracked for every OTP sent
- [ ] App starts cleanly in both dev (no creds) and production (with creds)
- [ ] All existing tests still pass
- [ ] New tests pass (template messaging, delivery tracking, mock service)
