# Spec Negotiation 5 — Buyer Reply to Seller's Response

**Scope**: Buyer side of the negotiation page when the seller has acted (accept /
counter / reject) on a previously-escalated proposal.
**Trigger**: Buyer taps a `OFFER_ACCEPTED` / `OFFER_COUNTERED` / `OFFER_REJECTED`
notification (or types the deep link directly) and lands on
`/negotiation/<id>`.
**Builds on**: Specs 2 (buyer chat persona), 4 (notifications + seller-side
chat).
**Status**: Draft.
**Language**: Egyptian Arabic, polite (مهذبة).

---

## 1. Goal

Today, the buyer can:
- start a negotiation,
- propose a price,
- chat freely with the buyer-persona Gemma about the listing.

What's missing: when the **seller responds** (via the static seller-action
page or the seller-side chat), the buyer is notified — but on landing back
on the negotiation page, the seller's reply isn't surfaced as a clear,
actionable card, and the buyer has no first-class way to **reply back** to
that specific message. This spec closes that loop.

After this spec ships:
1. The buyer logs in (existing JWT flow) and clicks an `OFFER_*` notification
   from the bell or the WhatsApp deep link.
2. The negotiation page loads with a **Seller Reply panel** at the top of the
   chat showing the seller's latest decision (action + counter price + free
   comment if the seller used chat).
3. The buyer can react with one of four bounded actions, exactly mirroring
   the seller side:
   - **Accept** the counter → engine creates the deal + payment.
   - **Counter** with a new price → re-escalates if below the floor, or
     auto-accepts if back in band.
   - **Reject** the counter → negotiation ends as `FAILED`.
   - **Comment / chat** → free Arabic message back to the seller-persona
     Gemma; the buyer's text is logged and a notification fires to the seller.
4. Each action triggers the existing notification fan-out (Spec 4 §3.1) so
   the seller sees the buyer's reply in their bell + WhatsApp.

---

## 2. UX Flow

```
[notification bell]            [WhatsApp deep link]
         \                              /
          v                            v
    GET /notifications/:id  ──read──▶ /negotiation/:id?from=notif
                                                │
                                                v
              ┌──────────────── NegotiationPage ────────────────┐
              │  Header: property title · listing price · phase  │
              │  ─────────────────────────────────────────────── │
              │  ▼  Seller Reply panel (NEW)                     │
              │     - badge: "البائع وافق" / "عرض مضاد" / "رفض"  │
              │     - sellerCounter (if any) + comment           │
              │     - timestamp                                  │
              │  ─────────────────────────────────────────────── │
              │  Chat thread (existing)                          │
              │     - user/assistant turns                       │
              │     - latest seller message inserted as a        │
              │       system-style bubble                         │
              │  ─────────────────────────────────────────────── │
              │  Action bar (state-aware):                       │
              │    - Accept counter        [primary]             │
              │    - Counter with X        [opens price modal]   │
              │    - Reject and end        [danger]              │
              │    - Free reply composer   [bottom]              │
              └──────────────────────────────────────────────────┘
```

**State machine** for the Seller Reply panel (drives the action bar):

| seller's last action | panel badge | available buyer actions |
|---|---|---|
| `ACCEPT` | "البائع وافق على {price} ج.م" | Pay deposit (existing) · Comment |
| `COUNTER` | "عرض مضاد: {sellerCounter} ج.م" | Accept counter · Counter again · Reject · Comment |
| `REJECT` | "البائع رفض العرض" | Browse other listings · Comment (read-only seller) |
| (no seller action yet) | "في انتظار البائع" | Comment (no decision actions) |

Once the negotiation reaches `AGREED` or `FAILED`, the action bar collapses
into the existing payment / "browse other listings" CTA. The chat composer
stays visible for one more message but the seller doesn't get further
notifications after a terminal state.

---

## 3. Data — what we already have, what's missing

### Already in DB
- `Negotiation` (status, current_offer, round, min/max).
- `NegotiationEscalation` (the seller's decision lives here:
  `sellerAction`, `sellerCounter`, `status=RESOLVED`, `resolvedAt`).
- `aiLog` rows per chat turn.
- `Notification` rows (Spec 4) — `OFFER_ACCEPTED`, `OFFER_COUNTERED`,
  `OFFER_REJECTED`.

### What's missing
A clear **read-out endpoint** that returns "the seller's most recent reply
to this buyer for this negotiation", plus a structured `BuyerAction` enum
returned alongside the negotiation.

```ts
type BuyerSellerReplyView = {
  hasReply: boolean;
  sellerAction: 'ACCEPT' | 'COUNTER' | 'REJECT' | null;
  sellerCounter: number | null;
  sellerComment: string | null;       // last seller-chat aiLog entry, if any
  resolvedAt: string | null;          // ISO
  escalationId: string;
  buyerOfferAtTime: number;           // the buyer's price that triggered this
};
```

No new schema is needed — this view is composed from
`NegotiationEscalation` + the latest seller-side `aiLog`.

---

## 4. API Endpoints

### 4.1 New — buyer reply view

| Method | Path | Description |
|---|---|---|
| `GET` | `/negotiations/:id/seller-reply` | Returns the most recent **resolved** seller reply on this negotiation, plus a hint about which buyer actions are currently legal. |

Response:

```ts
{
  reply: BuyerSellerReplyView;
  allowedActions: Array<'accept_counter' | 'counter' | 'reject' | 'comment' | 'pay_deposit' | 'browse'>;
  negotiationStatus: 'ACTIVE' | 'AGREED' | 'FAILED';
}
```

Auth: JWT; only the buyer of the negotiation may read this.

### 4.2 New — buyer reply action

| Method | Path | Description |
|---|---|---|
| `POST` | `/negotiations/:id/buyer-reply` | Buyer's structured reply to the seller's last decision. |

Body:

```ts
{
  action: 'accept_counter' | 'counter' | 'reject';
  counterPrice?: number; // required when action='counter'
}
```

Behavior:
- **`accept_counter`** — sets `current_offer = sellerCounter`, calls the
  existing `proposePrice(sellerCounter)` path so the in-band check + Deal +
  Payment + `NEGOTIATION_AGREED` notifications all reuse current logic.
- **`counter`** — simply forwards to `proposePrice(counterPrice)`. If still
  below floor, a fresh `NegotiationEscalation` is opened (BUG-01 regression
  proves this works for a second escalation).
- **`reject`** — calls `handleAction(negotiationId, 'reject')`, which sets
  `status=FAILED` and triggers the `NEGOTIATION_FAILED` fan-out.

Response: `{ status, dealId?, paymentId?, message }`.

### 4.3 New — buyer free-form reply (chat)

The existing `POST /negotiations/chat` already covers the buyer-side
free-form reply with the Spec 2 prompt. **No new chat endpoint** — Spec 5
just adds: when the buyer sends a chat message **and** the latest
notification is `OFFER_*` (buyer "replying" to the seller), fire an
`OFFER_PROPOSED` notification to the seller with type
`OFFER_COMMENT` (new) so the seller's bell tells them "the buyer wrote to
you" without needing a price action.

Add a new value to `NotificationType`:

```prisma
enum NotificationType {
  OFFER_PROPOSED
  OFFER_ACCEPTED
  OFFER_REJECTED
  OFFER_COUNTERED
  OFFER_COMMENT          // NEW — buyer free-text reply
  NEGOTIATION_AGREED
  NEGOTIATION_FAILED
}
```

The fan-out for `OFFER_COMMENT` only goes to the **seller** (not the buyer),
and only when the negotiation is `ACTIVE`.

---

## 5. Service Layer

### 5.1 `NegotiationService.getSellerReplyForBuyer(negotiationId, buyerId)`

```ts
async getSellerReplyForBuyer(
  negotiationId: string,
  buyerId: string,
): Promise<{
  reply: BuyerSellerReplyView;
  allowedActions: BuyerReplyAction[];
  negotiationStatus: NegotiationStatus;
}>;
```

Implementation:
1. Load negotiation + assert `buyerId === negotiation.buyerId` (403 otherwise).
2. Fetch latest `NegotiationEscalation` for this negotiation (any status).
3. If none → `hasReply=false`, allowed actions: `['comment']` while ACTIVE.
4. If status `RESOLVED` → populate `sellerAction`, `sellerCounter`,
   `resolvedAt`, look up the most recent seller-side `aiLog` for the
   `sellerComment` (filter `data.role === 'seller'`).
5. Compute `allowedActions` per the table in §2.

### 5.2 `NegotiationService.buyerReply(negotiationId, buyerId, body)`

Thin orchestrator that:
- Asserts buyer ownership.
- Translates `accept_counter` → reuse `proposePrice(sellerCounter)`.
- Translates `counter` → reuse `proposePrice(counterPrice)`.
- Translates `reject` → reuse `handleAction(id, 'reject')`.
- All three already trigger the right fan-out per Spec 4 §3.1, so no new
  fan-out wiring is needed here.

Idempotency: if the latest escalation is already `RESOLVED` and the
negotiation is in a terminal state, return `409 ConflictException` with the
final state (mirrors the seller-chat resolved-escalation handling).

### 5.3 `NotificationsService.createForUser` for `OFFER_COMMENT`

Reuse `createForUser({ userId: sellerId, type: 'OFFER_COMMENT', … })` from
Spec 4. New Arabic templates:

| Lang | Title | Body | WhatsApp |
|---|---|---|---|
| ar | "ردّ من المشتري" | "المشتري بعتلك رسالة على عقار «{title}». ادخل لمتابعة المحادثة: {link}" | same |

---

## 6. Frontend

### 6.1 `NegotiationPage.tsx` enhancements
- New `<SellerReplyPanel>` rendered above the chat when
  `GET /negotiations/:id/seller-reply` returns `hasReply=true`.
- Action bar updates per §2 state machine.
- When the user opens the page from a notification (`?from=notif=:id`),
  the page also calls `POST /notifications/:id/read` so the badge clears.

### 6.2 `<SellerReplyPanel>` (new component)
- Props: `{ reply: BuyerSellerReplyView; allowedActions: …; onAccept(); onCounter(); onReject(); }`.
- Visual: pill badge (color per action) + counter price + comment + "ردّ من البائع · {timeAgo}".

### 6.3 API client
- `frontend/src/api/negotiations.ts` adds:
  - `getSellerReply(negotiationId)` → `GET /negotiations/:id/seller-reply`
  - `buyerReply(negotiationId, body)` → `POST /negotiations/:id/buyer-reply`

No store / context changes required.

---

## 7. Security

| Concern | Implementation |
|---|---|
| Owner check on read | service asserts `buyerId === jwt.sub`. |
| Owner check on write | same; plus the `proposePrice`/`handleAction` paths already validate. |
| Race with seller action | the existing `submitSellerAction` is idempotent on `RESOLVED`; the buyer-reply path catches the same `ConflictException` and surfaces a polite "تم حسم الموقف من البائع" reply. |
| Buyer cannot leak seller's `minPrice` | only `currentOffer` and `sellerCounter` are returned — `minPrice` is never in the response. |
| Notification deep-link tampering | `notificationId` is a UUID; the `/seller-reply` endpoint reads from the negotiation, not from the notification, so a forged notification id can't unlock another buyer's data. |

---

## 8. Acceptance Tests

1. **Happy counter → accept**: seller counters with X. Buyer's bell shows
   `OFFER_COUNTERED`. Click → `/negotiation/:id` → Seller Reply panel
   reads "عرض مضاد X". Click "أوافق على العرض المضاد" → status `AGREED`,
   deposit modal appears. Notification panel for buyer shows
   `NEGOTIATION_AGREED`; seller bell also shows `NEGOTIATION_AGREED`.
2. **Counter → counter again (BELOW_MIN)**: buyer counters with a still-below-
   floor price; new escalation row created, seller bell shows fresh
   `OFFER_PROPOSED`.
3. **Counter → reject**: buyer clicks "أرفض"; status `FAILED`; both bells
   show `NEGOTIATION_FAILED`.
4. **Comment without action**: buyer sends `"ممكن تشرحلي ليه السعر ده؟"`
   in the composer; an `OFFER_COMMENT` notification fires to the seller.
   Negotiation status unchanged.
5. **Page resilient if seller hasn't replied yet**: open
   `/negotiation/:id/seller-reply` → `hasReply=false`,
   `allowedActions=['comment']`; action bar collapses to the composer only.
6. **Owner check**: a different buyer's JWT calls
   `GET /negotiations/:id/seller-reply` → 403.
7. **Idempotency**: after `AGREED`, calling `POST /buyer-reply` with any
   action returns 409.
8. **Read-on-open**: navigating from a notification clears the badge once
   the page loads.

---

## 9. Out of Scope

- Multi-message threading on the seller side (each notification still
  represents the latest decision; the new `OFFER_COMMENT` is the only
  buyer→seller message type).
- Real-time push (Web Push / WebSocket) — bell still polls every 20 s.
- Email / SMS channels.

---

## 10. Success Criteria

- [ ] `GET /negotiations/:id/seller-reply` returns the right
  `BuyerSellerReplyView` and `allowedActions` for ACTIVE / AGREED / FAILED
  states.
- [ ] `POST /negotiations/:id/buyer-reply` reuses the existing
  `proposePrice` / `handleAction` paths (no new decision logic).
- [ ] `OFFER_COMMENT` enum + Arabic template land in
  `notifications/constants/templates.ts`; fan-out fires only to the seller.
- [ ] `<SellerReplyPanel>` renders correctly for each `sellerAction`.
- [ ] All 8 acceptance tests in §8 pass.
- [ ] All existing tests stay green (currently 27 suites · 422 tests).
- [ ] No leak of seller's `minPrice` in any new endpoint or notification.
