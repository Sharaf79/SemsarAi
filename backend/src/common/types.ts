/**
 * Shared TypeScript types & enums for Semsar AI.
 * These mirror the Prisma enums but are usable in pure business logic
 * without importing Prisma (important for unit testing).
 */

export enum FlowState {
  AWAITING_INTENT = 'AWAITING_INTENT',
  AWAITING_UNIT_TYPE = 'AWAITING_UNIT_TYPE',
  AWAITING_SPECS = 'AWAITING_SPECS',
  AWAITING_MEDIA = 'AWAITING_MEDIA',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
}

export enum Intent {
  BUY = 'BUY',
  SELL = 'SELL',
  RENT = 'RENT',
  LEASE = 'LEASE',
}

export enum UnitType {
  APARTMENT = 'APARTMENT',
  LAND = 'LAND',
  VILLA = 'VILLA',
  COMMERCIAL = 'COMMERCIAL',
}

export enum ListingStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
}

/** Lightweight DTO for the state machine — no DB coupling */
export interface ConversationDto {
  id?: string;
  whatsappId: string;
  flowState: FlowState;
  currentField: string | null;
  intent: Intent | null;
  listingId: string | null;
}

export interface ListingDto {
  id?: string;
  whatsappId: string;
  intent: Intent | null;
  unitType: UnitType | null;
  specs: Record<string, unknown>;
  location: string | null;
  price: number | null;
  mediaUrls: string[];
  status: ListingStatus;
}

export interface UnitDto {
  id?: string;
  listingId: string;
  whatsappId: string;
  intent: Intent;
  unitType: UnitType;
  specs: Record<string, unknown>;
  location: string | null;
  price: number | null;
  mediaUrls: string[];
  isActive: boolean;
}

export interface ParsedMessage {
  from: string;
  type: string;
  body: string | null;
  mediaId: string | null;
}

export interface TransitionResult {
  conversation: ConversationDto;
  listing: ListingDto;
  replyText: string;
}

/**
 * Describes the active conversational context for a user session,
 * shared across the onboarding and negotiation flows.
 */
export type ConversationChannel = 'app' | 'whatsapp';
export type ActiveFlow = 'onboarding' | 'negotiation';

export interface ConversationContext {
  /** The platform user ID */
  userId: string;
  /** Delivery channel — browser app or WhatsApp */
  channel: ConversationChannel;
  /** Which business flow is currently active */
  activeFlow: ActiveFlow;
  /** ID of the active entity: PropertyDraft ID or Negotiation ID */
  entityId: string;
  /** Optional flow-specific data (e.g. current step, round number) */
  metadata?: Record<string, unknown>;
}

/** Unified response returned by ConversationEngineService to any caller. */
export interface ConversationResponse {
  /** Arabic message to surface to the user */
  message: string;
  /** Machine-readable action/status tag (e.g. current step, negotiation status) */
  action?: string;
  /** Raw domain object for callers that need the full payload */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  /** Number of unseen property recommendations (populated by ChatService) */
  unseenRecommendations?: number;
}
