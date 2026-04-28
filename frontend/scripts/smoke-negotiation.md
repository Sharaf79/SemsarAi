# Voice-Chat Negotiation — Smoke Test Checklist

Run this in the **canonical repo** (`/Users/sherif/Projects/SemsarAi`), not a worktree.

## Prerequisites (one-time)

```bash
cd backend
npx prisma migrate deploy        # applies 20260427000000_add_negotiation_voice_phase
# Add to backend/.env if not already present:
#   OLLAMA_BASE_URL=http://localhost:11434
#   GEMMA_MODEL=gemma3:27b
#   PUBLIC_FRONTEND_URL=http://localhost:5174
ollama pull gemma3:27b           # optional — falls back to canned Arabic if Ollama is down
ollama serve &
```

## Boot

```bash
npm --prefix backend run start:dev    # port 3000
npm --prefix frontend run dev         # port 5174
```

## Walk-through

### A. Set the negotiation band as owner
1. Log in as the **owner** account.
2. Open the property listing wizard. At Step 2 (Pricing), enter a price (e.g. `1000000`). Confirm "نطاق التفاوض" appears with auto-filled defaults `900000` / `1100000`. Override if you want.
3. Finish the wizard and submit. Verify in DB: `SELECT id, price, min_price, max_price FROM properties ORDER BY created_at DESC LIMIT 1;`

### B. Buyer flow — IN_BAND branch
1. Log out, log in as a **different** user (the buyer).
2. Navigate to `/negotiation/<propertyId>`.
3. Verify Gemma greeting bubble appears in Arabic (or canned fallback if Ollama is offline).
4. Click "اقترح سعر آخر" → enter a price inside the band (e.g. `1000000`) → submit.
5. Deposit modal appears: "ادفع 100 ج.م لفتح رقم المالك".
6. Click the dev-only "محاكاة الدفع" button (or POST manually: `curl -X POST http://localhost:3000/payments/callback/<paymentId> -H 'content-type: application/json' -d '{"amount":100}'`).
7. Owner phone reveals with `tel:` and WhatsApp links.

### C. Buyer flow — BELOW_MIN branch (seller escalation)
1. Repeat with a **second** property (or after rejecting/exiting the first negotiation).
2. Enter a price below `min_price` (e.g. `700000` against a `900000` floor).
3. Page transitions to "بنراجع مع البائع". Backend logs the WhatsApp send (mock mode prints to stdout).
4. Copy the `seller-action/<token>` URL from the backend log → open in a private tab.
5. Click each in turn (in fresh negotiations): قبول / رفض / عرض مضاد. Confirm the buyer page reacts within ~4 s of each:
   - **Accept** → deposit modal.
   - **Reject** → ended state.
   - **Counter** → assistant bubble narrating new price; loop back to choice chips.

### D. Phone-reveal gate
With **no** completed deposit:

```bash
curl -i http://localhost:3000/properties/<propertyId>/owner-contact \
  -H "authorization: Bearer <buyerJwt>"
```
Expect `403 Forbidden`.

### E. Voice input (Chrome / Safari)
1. Click the 🎤 button in the composer.
2. Speak Arabic ("عايز السعر يبقى تسعمية ألف"). Transcript appears live in input.
3. Click again to stop; submit.

### F. Audit log
```sql
SELECT action_type, message, created_at FROM ai_logs
 WHERE negotiation_id = '<negotiationId>'
 ORDER BY created_at;
```
Every chat turn, propose-price, escalation, and seller action should have a row.

## Pass criteria
- All six branches above complete end-to-end.
- DB row for the new property has non-null `min_price` / `max_price`.
- Phone reveal stays gated until the deposit `Payment.status = COMPLETED`.
