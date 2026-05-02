# Spec Negotiation 4 — Notification & Communication Flow (Gemma 4)

**Scope**: Post-offer notification pipeline + seller-side Gemma chat.
**Trigger**: Buyer accepts a proposed offer (or proposes a new price) on the negotiation page.
**Channels**: In-app notification center (web) + WhatsApp deep link.
**Model**: `gemma3:27b` ("Gemma 4-class") via Ollama, role-aware (buyer vs. seller/owner).
**Status**: Draft.
**Language**: Egyptian Arabic, polite register (مهذبة).

> Builds on top of the existing `NegotiationEscalation` table and `WhatsAppService`
> already wired in `backend/src/whatsapp/whatsapp.service.ts`. This spec generalizes
> the escalation message into a full notification center and adds a seller-side
> Gemma conversation.

---

## 1. Goal

When the buyer accepts the assistant's proposed offer (or sends a counter-price
that needs the seller's decision), Gemma must:

1. **Create a notification** for **both** buyer and seller in the platform's
   notification center.
2. **Send a WhatsApp message** to both parties — short, branded, with a
   deep-link `https://semsar.ai/n/{notificationId}` (or equivalent) opening the
   system at the right place.
3. **Seller WhatsApp body**: just a one-liner — "*المشتري قدّم عرض بسعر X جنيه على
   عقارك. ادخل النظام لمتابعة التفاوض: {link}*". No price negotiation in WhatsApp.
4. When the seller opens the link, the **notification center** shows the offer
   card. Clicking the card opens the **negotiation page in seller mode** with
   Gemma — there the seller can:
   - **Accept** the offer.
   - **Reject** the offer.
   - **Counter** with a new price.
   - **Comment / chat** freely (Gemma answers as the owner-side assistant).
5. After the seller's final decision, Gemma sends a follow-up notification +
   WhatsApp message to the buyer with the outcome and a deep link back to the
   negotiation page.

The price-decision algorithm (constitution rules: 6-round cap, concession schedule,
min/max bounds) **stays backend-enforced** — Gemma never decides on prices, only
formats messages and chats.

---

## 2. Database Schema

### 2.1 New model — `Notification`

```prisma
model Notification {
  id            String              @id @default(uuid())
  userId        String              @map("user_id")
  type          NotificationType
  title         String              // Egyptian Arabic
  body          String              @db.Text
  payload       Json                @default("{}") // { negotiationId, offer, role, ... }
  link          String              // deep link path (e.g. /negotiation/<id>?role=seller)
  isRead        Boolean             @default(false) @map("is_read")
  channel       NotificationChannel @default(IN_APP)
  whatsappSent  Boolean             @default(false) @map("whatsapp_sent")
  whatsappError String?             @map("whatsapp_error")
  createdAt     DateTime            @default(now()) @map("created_at")
  readAt        DateTime?           @map("read_at")

  user          User                @relation(fields: [userId], references: [id])

  @@index([userId, isRead])
  @@index([createdAt])
  @@map("notifications")
}

enum NotificationType {
  OFFER_PROPOSED            // buyer → seller, "buyer offered X"
  OFFER_ACCEPTED            // seller → buyer, "seller accepted"
  OFFER_REJECTED            // seller → buyer, "seller rejected"
  OFFER_COUNTERED           // seller → buyer, "seller counter-offered Y"
  NEGOTIATION_AGREED        // both, "deal reached, proceed to deposit"
  NEGOTIATION_FAILED        // both
}

enum NotificationChannel {
  IN_APP
  WHATSAPP
  BOTH
}
```

### 2.2 Existing models reused

- `Negotiation`, `NegotiationEscalation`, `Offer`, `Deal`, `Payment`, `AiLog`,
  `User` — unchanged.
- `NegotiationEscalation.token` continues to authenticate the seller-side
  decision callback; `Notification.link` includes that token in the URL when
  the type is `OFFER_PROPOSED`.

### 2.3 Why a new table (not just escalations)?

`NegotiationEscalation` is decision-only (PENDING → RESOLVED). The notification
center needs:
- read/unread state per recipient,
- both buyer and seller rows for the same event,
- types beyond seller-decision (accepted / rejected / agreed / failed).

So `Notification` is layered on top — escalations remain the source of truth for
the seller's bounded decision; notifications are the user-facing fan-out.

---

## 3. Notification Pipeline

### 3.1 Trigger points (inside `negotiation.service.ts`)

| Event | Created notifications | WhatsApp |
|---|---|---|
| Buyer proposes price → engine calls `escalateToSeller()` (offer below floor) | `OFFER_PROPOSED` to seller (with escalation token in link) | Seller only |
| Seller accepts via seller-action page | `OFFER_ACCEPTED` to buyer + `NEGOTIATION_AGREED` to both | Buyer |
| Seller rejects | `OFFER_REJECTED` to buyer | Buyer |
| Seller counters | `OFFER_COUNTERED` to buyer (with new price) | Buyer |
| Buyer accepts engine offer in-band → deal created | `NEGOTIATION_AGREED` to both | Both |
| Negotiation auto-fails (max rounds / explicit reject) | `NEGOTIATION_FAILED` to both | Both |

### 3.2 Service shape

```ts
@Injectable()
export class NotificationsService {
  async createForBoth(args: {
    negotiationId: string;
    buyerId: string;
    sellerId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
  }): Promise<{ buyerNotificationId: string; sellerNotificationId: string }>;

  async listForUser(userId: string, opts?: { unreadOnly?: boolean; limit?: number }):
    Promise<Notification[]>;

  async markRead(userId: string, notificationId: string): Promise<void>;

  async sendWhatsApp(notificationId: string): Promise<void>;
}
```

Templates (Egyptian Arabic) live in
`backend/src/notifications/constants/templates.ts`. Gemma is **not** used to
generate notification copy — copy is deterministic. Gemma is only used in the
seller-side chat (§4).

### 3.3 WhatsApp body templates

| Type | Body |
|---|---|
| `OFFER_PROPOSED` | "السلام عليكم، المشتري قدّم عرض بسعر **{price} ج.م** على عقارك «{title}». ادخل النظام للمتابعة: {link}" |
| `OFFER_ACCEPTED` | "تم قبول عرضك على «{title}». ادخل النظام لإكمال الخطوات: {link}" |
| `OFFER_REJECTED` | "البائع رفض العرض على «{title}». ادخل النظام لمراجعة الخيارات: {link}" |
| `OFFER_COUNTERED` | "البائع قدّم عرض مضاد بسعر **{price} ج.م** على «{title}». ادخل النظام للمتابعة: {link}" |
| `NEGOTIATION_AGREED` | "اتفقتوا على **{price} ج.م** للعقار «{title}» 🎉. ادخل النظام لإكمال الدفع: {link}" |
| `NEGOTIATION_FAILED` | "تم إنهاء التفاوض على «{title}». ادخل النظام لاستعراض التفاصيل: {link}" |

Each WhatsApp body **must** end with the deep link. No prices are negotiated
inside WhatsApp.

### 3.4 Deep links

| Audience | Link template |
|---|---|
| Seller (offer-proposed) | `https://semsar.ai/seller-action/{escalationToken}` (existing) — also reachable via `/notifications/{id}` |
| Seller (other) | `/notifications/{notificationId}` → opens notification center → click → `/negotiation/{id}?role=seller` |
| Buyer | `/negotiation/{id}` (existing) |

The notification center (`/notifications`) is the unified entry; tapping a row
navigates to the correct contextual page.

---

## 4. Seller-Side Gemma Chat

### 4.1 Why a separate prompt?

The existing `chatWithGemma()` system prompt (Spec 2) is buyer-facing —
"the assistant explains the listing." For the seller, the assistant must
behave as **the owner's representative**: brief, decision-oriented, and
authorized to relay accept / counter / reject / free comment back to Gemma.

### 4.2 New endpoint

| Method | Path | Body | Auth |
|---|---|---|---|
| `POST` | `/negotiations/:id/seller-chat` | `{ history, userMessage }` | Seller JWT (must own the property) |

Flow:
1. Loads the negotiation + property + latest escalation.
2. Builds a seller-side system prompt (§4.3).
3. Calls `GemmaClient.chat()` with prompt + history + user message.
4. Detects intent in the seller's message — `accept` / `reject` / `counter <price>`
   / `comment` — using the existing `InvoiceExtractorService.containsPriceOffer`
   pattern + a small keyword classifier.
5. If intent is `accept` / `reject` / `counter`, the service forwards to the
   existing `submitSellerAction(token, action, counterPrice?)` to keep all
   decisions on one backend path. Gemma never decides — it only parses & relays.
6. Returns `{ reply, intent, action?, counterPrice? }`.

### 4.3 Seller system prompt (Egyptian Arabic)

```
إنت مساعد البائع/المالك على منصة سمسار AI. بتتكلم باسم صاحب العقار، وبتتعامل
مع عرض جديد قدّمه مشتري على عقاره.

دورك:
- اعرض العرض الحالي بوضوح: السعر، اسم العقار، تاريخ الطلب.
- ساعد البائع يقرر: قبول، رفض، أو عرض مضاد. تقدر تقترح سعر مضاد منطقي بناءً
  على السعر المعلن، لكن القرار النهائي للبائع.
- لو البائع كتب «أوافق» / «قبلت» / «تمام» → نفّذ القبول.
- لو كتب «أرفض» / «مش موافق» → نفّذ الرفض.
- لو كتب رقم أو «عرض مضاد X» → سجّل العرض المضاد بالسعر اللي قاله.
- غير كده، رد عليه طبيعي وودود وساعده يحسم القرار.

قواعد أمان:
1. ممنوع تفصح عن رقم هاتف المشتري.
2. ممنوع تخترع تفاصيل عن المشتري.
3. لو معندكش معلومة، قول ده بصراحة.

اللغة: عربية مصرية مهذبة. الردود قصيرة ومركّزة.

بيانات العرض:
- العقار: {{title}}
- السعر المعلن: {{listingPrice}} ج.م
- عرض المشتري الحالي: {{buyerOffer}} ج.م
- الجولة: {{round}} من 6
```

### 4.4 Network-failure fallback

> "اعتذر عن أي تأخير. تقدر حضرتك تختار: قبول، رفض، أو تكتب سعر العرض المضاد، وأنا هتولّى الباقي."

---

## 5. API Endpoints

### 5.1 Notifications

| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | List notifications for the logged-in user (newest first). Query: `?unreadOnly=true&limit=50`. |
| `GET` | `/notifications/:id` | Get one notification (owner check). |
| `POST` | `/notifications/:id/read` | Mark as read. |
| `POST` | `/notifications/read-all` | Mark all unread as read. |
| `GET` | `/notifications/unread-count` | `{ count }` — drives the bell badge. |

### 5.2 Seller-side chat & actions

| Method | Path | Description |
|---|---|---|
| `POST` | `/negotiations/:id/seller-chat` | Free chat with the seller-side Gemma persona; intent-based action relay. |
| `POST` | `/negotiations/seller-action/:token` | Existing endpoint — kept as the deterministic decision path used by both the seller-action page and the seller-chat intent relay. |

### 5.3 DTOs

```ts
class CreateNotificationDto { /* internal — no public POST endpoint */ }

class ListNotificationsQuery {
  @IsOptional() @IsBooleanString() unreadOnly?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}

class SellerChatDto {
  @IsArray() history: ChatHistoryItem[];
  @IsString() @MaxLength(2000) userMessage: string;
}

interface SellerChatResponse {
  reply: string;
  intent: 'accept' | 'reject' | 'counter' | 'comment';
  action?: 'ACCEPT' | 'REJECT' | 'COUNTER';
  counterPrice?: number;
  notificationsCreated?: { buyerId: string; sellerId: string };
}
```

---

## 6. Module / File Layout

```
backend/src/
├── notifications/
│   ├── notifications.module.ts
│   ├── notifications.controller.ts
│   ├── notifications.service.ts          // CRUD + WhatsApp dispatch
│   ├── constants/
│   │   └── templates.ts                  // Arabic copy, deep-link builder
│   ├── dto/
│   │   ├── list-notifications.query.ts
│   │   └── notification.dto.ts
│   └── notifications.service.spec.ts
├── negotiation/
│   ├── negotiation.service.ts            // emits notifications at trigger points
│   ├── seller-chat.controller.ts         // NEW — POST /negotiations/:id/seller-chat
│   ├── seller-chat.service.ts            // NEW — seller-side Gemma + intent relay
│   ├── prompts/
│   │   └── seller-chat.prompt.ts         // §4.3 prompt template
│   └── ...                                // (existing files unchanged)
└── whatsapp/                              // existing — reused
```

Frontend (high-level — separate spec for UI):

- **Notification bell + drawer** in the global header (unread badge from
  `/notifications/unread-count`, list from `/notifications`).
- **Seller-mode negotiation page** reusing `NegotiationPage.tsx` with a
  `?role=seller` query param that swaps the action bar (Accept / Reject /
  Counter modal) and points the chat composer at `/negotiations/:id/seller-chat`.

---

## 7. Security & Validation

| Concern | Implementation |
|---|---|
| Notification ownership | All reads/writes filter by `userId` from JWT. |
| Seller-chat ownership | Endpoint asserts the JWT user `=== negotiation.sellerId`. |
| Decision integrity | All accept/reject/counter persist via `submitSellerAction(token, …)` — Gemma never writes a decision directly. |
| WhatsApp opt-in | If `User.whatsappOptOut` is true (new flag, default false), skip WhatsApp; in-app notification still created. |
| Deep-link tampering | Notification IDs are UUIDs; escalation tokens are JWT-signed (existing). |
| Buyer phone leakage | Seller prompt §4.3 forbids it; same for seller phone in buyer prompt. |
| Idempotency | `Notification` rows are created inside the same transaction that mutates the negotiation, so retries don't fan out duplicates. |

---

## 8. Acceptance Tests (manual)

Run on a freshly-built backend with seeded buyer + seller + property.

1. **Below-floor proposal** — buyer proposes a price below the floor →
   - Two notifications created: one for the seller (`OFFER_PROPOSED`) and one
     for the buyer (`OFFER_PROPOSED` mirror with `payload.role = 'buyer'`).
   - Seller WhatsApp body matches §3.3 and ends with the deep link.
   - Tapping the link opens the notification center; clicking the row opens
     the negotiation page in seller mode.

2. **Seller accept via chat** — in seller-mode chat, seller types "أوافق" →
   - `seller-chat` returns `intent='accept'`, `action='ACCEPT'`.
   - Negotiation status flips to `AGREED`, deal created.
   - Buyer gets `OFFER_ACCEPTED` + `NEGOTIATION_AGREED` notifications and a
     WhatsApp summary with the deep link.

3. **Seller counter via chat** — seller types "عرضي 1700000" →
   - `seller-chat` returns `intent='counter'`, `counterPrice=1700000`.
   - Buyer gets `OFFER_COUNTERED` notification and WhatsApp.

4. **Seller reject via chat** — seller types "أرفض" → `OFFER_REJECTED` to buyer.

5. **Comment turn** — seller asks "إيه السعر اللي تنصحني بيه؟" → Gemma replies
   conversationally, **no decision relayed**, no notifications created.

6. **Unread badge** — `/notifications/unread-count` increments and decrements
   correctly across these flows.

7. **WhatsApp failure** — simulate provider 5xx → `Notification.whatsappSent`
   stays `false`, `whatsappError` is populated, in-app notification still
   visible. UI surfaces a small "WhatsApp delivery failed" hint.

8. **Safety** — across all turns, no buyer phone or other PII leaks in
   seller-chat replies, and no seller min-price ever leaks to the buyer side.

For each scenario verify corresponding `ai_logs` entries (chat turns) and
`notifications` rows.

---

## 9. Out of Scope

- Push notifications (browser / mobile) — IN_APP + WhatsApp only for v1.
- Email channel.
- Persisting Gemma's owner persona across negotiations (each negotiation gets a
  fresh seller-chat thread).
- Admin/back-office views for the notification table.

---

## 10. Success Criteria

- [ ] `Notification` table + enums migrated.
- [ ] `NotificationsService` with CRUD + WhatsApp dispatch and 6 templates.
- [ ] Trigger points in `negotiation.service.ts` fan out the right notification
  set for each event in §3.1 — wrapped in the existing transaction.
- [ ] `POST /negotiations/:id/seller-chat` returns `{ reply, intent, action? }`
  and never persists a decision outside `submitSellerAction(token, …)`.
- [ ] Seller-side prompt (§4.3) used; buyer-side prompt unchanged.
- [ ] WhatsApp messages contain only the short note + deep link (no prices
  beyond the headline number).
- [ ] All 8 acceptance tests in §8 pass.
- [ ] Existing 78 negotiation.service unit tests stay green; new tests cover
  notifications and seller-chat intent parsing.
