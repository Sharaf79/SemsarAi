import { NegotiationStatus } from '@prisma/client';

// User actions — the ONLY 3 things a user can do
export type NegotiationAction = 'accept' | 'reject' | 'request_counter';

// What startNegotiation returns
export interface NegotiationResult {
  negotiationId: string;
  propertyId: string;
  buyerId: string;
  sellerId: string;
  initialOffer: number;
  /** Listing price — the floor used for auto-accept */
  minPrice: number;
  maxPrice: number;
  roundNumber: number;
  status: NegotiationStatus;
  message: string;
}

/** Commission rate charged by Semsar AI (0.25%) */
export const COMMISSION_RATE = 0.0025;

// What handleAction returns
export interface ActionResult {
  negotiationId: string;
  action: NegotiationAction;
  status: NegotiationStatus;
  roundNumber: number;
  currentOffer: number | null;
  dealId: string | null;       // set when status === AGREED
  /** True when the counter offer reached minPrice and triggered automatic acceptance */
  autoAccepted: boolean;
  message: string;
  /** Set when status === AGREED — signals frontend to show payment UI */
  paymentRequired?: boolean;
  /** Final agreed price — set when status === AGREED */
  finalPrice?: number;
  /** Service fee (0.25% of finalPrice) — set when status === AGREED */
  fee?: number;
}
