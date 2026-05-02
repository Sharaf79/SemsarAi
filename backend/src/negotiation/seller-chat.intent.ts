/**
 * Seller-chat intent classifier — deterministic Arabic keyword + number matcher.
 *
 * Spec ref: spec_negotiation_4.md §4.2 (step 4)
 *
 * Intent is classified from the SELLER's raw message, NOT from Gemma's reply.
 * This ensures the LLM cannot trigger decisions by itself.
 */

export type SellerIntent = 'accept' | 'reject' | 'counter' | 'comment';

export interface IntentResult {
  intent: SellerIntent;
  counterPrice?: number;
}

const ACCEPT_KEYWORDS = ['أوافق', 'قبلت', 'تمام', 'موافق', 'قبول'];
const REJECT_KEYWORDS = ['أرفض', 'مش موافق', 'مرفوض'];

/**
 * Check if a string contains a number ≥ 1000 (price-like).
 * Returns the first such number found, or undefined.
 */
function extractPrice(text: string): number | undefined {
  // Remove Arabic commas and spaces inside numbers (e.g. 1,700,000 or 1 700 000)
  const normalized = text.replace(/,/g, '').replace(/\s/g, ' ');
  const matches = normalized.match(/\d{4,14}/g);
  if (!matches) return undefined;
  const num = parseInt(matches[0], 10);
  return num >= 1000 ? num : undefined;
}

/**
 * Classify the seller's message into one of 4 intents.
 */
export function classifyIntent(userMessage: string): IntentResult {
  const text = userMessage.trim();

  // Check reject keywords FIRST — "مش موافق" contains "موافق"
  for (const kw of REJECT_KEYWORDS) {
    if (text.includes(kw)) {
      return { intent: 'reject' };
    }
  }

  // Check accept keywords
  for (const kw of ACCEPT_KEYWORDS) {
    if (text.includes(kw)) {
      return { intent: 'accept' };
    }
  }

  // Check for counter price
  const price = extractPrice(text);
  if (price !== undefined) {
    return { intent: 'counter', counterPrice: price };
  }

  // Default: comment
  return { intent: 'comment' };
}
