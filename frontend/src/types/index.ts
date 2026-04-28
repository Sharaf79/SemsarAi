// ─── Property ────────────────────────────────────────────────────

export interface PropertyMedia {
  id: string;
  url: string;
  type: 'IMAGE' | 'VIDEO';
}

export type PropertyType = 'SALE' | 'RENT';
export type PropertyStatus = 'ACTIVE' | 'INACTIVE' | 'SOLD' | 'RENTED';
export type PropertyKind = 'APARTMENT' | 'VILLA' | 'SHOP' | 'OFFICE' | 'SUMMER_RESORT' | 'COMMERCIAL' | 'LAND_BUILDING';
export type SortOption = 'price_asc' | 'price_desc' | 'newest';

export interface Property {
  id: string;
  title: string;
  description: string | null;
  /** Prisma Decimal serialised as string */
  price: string;
  type: PropertyType;
  propertyKind: PropertyKind | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: string | null;
  
  // -- Extended Apartment Fields --
  apartmentType?: string | null;
  ownershipType?: string | null;
  amenities?: Record<string, boolean> | null;
  floorLevel?: string | null;
  isFurnished?: boolean | null;
  readiness?: string | null;
  deliveryDate?: string | null;
  finishingType?: string | null;
  paymentMethod?: string | null;
  isNegotiable?: boolean;
  rentRateType?: string | null;

  // -- Advertisement Fields --
  adTitle?: string | null;
  adDescription?: string | null;

  governorate: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  nearestLandmark: string | null;
  propertyStatus: PropertyStatus;
  createdAt: string;
  media: PropertyMedia[];
}

export interface PropertiesMeta {
  page: number;
  limit: number;
  total: number;
}

export interface PropertiesResponse {
  data: Property[];
  meta: PropertiesMeta;
}

export interface PropertyFilters {
  minPrice?: number;
  maxPrice?: number;
  governorate?: string;
  city?: string;
  district?: string;
  propertyType?: PropertyType;
  propertyKind?: PropertyKind;
  bedrooms?: number;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

// ─── Auth ────────────────────────────────────────────────────────

export interface User {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  dateOfBirth: string | null;
  sexType: string | null;
  notes: string | null;
  userType?: 'ADMIN' | 'USER';
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

// ─── Negotiation ─────────────────────────────────────────────────

export type NegotiationStatus = 'ACTIVE' | 'AGREED' | 'FAILED';
export type NegotiationAction = 'accept' | 'reject' | 'request_counter';

/** Mirrors backend NegotiationResult */
export interface NegotiationResult {
  negotiationId: string;
  propertyId: string;
  buyerId: string;
  sellerId: string;
  initialOffer: number;
  minPrice: number;
  maxPrice: number;
  roundNumber: number;
  status: NegotiationStatus;
  message: string;
}

/** Mirrors backend ActionResult */
export interface ActionResult {
  negotiationId: string;
  action: NegotiationAction;
  status: NegotiationStatus;
  roundNumber: number;
  currentOffer: number | null;
  dealId: string | null;
  autoAccepted: boolean;
  message: string;
  /** Set when status === AGREED — signals frontend to show payment UI */
  paymentRequired?: boolean;
  /** Final agreed price */
  finalPrice?: number;
  /** Service fee (0.25% of finalPrice) */
  fee?: number;
}

/** A single message in the negotiation chat */
export interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
  timestamp: Date;
}

// ─── Payment ─────────────────────────────────────────────────────

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface PaymentInfo {
  paymentId: string;
  /** Full property price */
  amount: number;
  /** Platform fee (0.25% of amount) */
  fee: number;
  currency: string;
  paymentUrl: string;
}

export interface PaymentDetail {
  id: string;
  dealId: string;
  amount: number;
  fee: number;
  currency: string;
  status: PaymentStatus;
  transactionId: string | null;
  createdAt: string;
}

// ─── Locations ───────────────────────────────────────────────────

export interface LocationItem {
  id: number;
  nameAr: string;
  nameEn: string | null;
}

// ─── Recommendations ─────────────────────────────────────────────

export type RecommendationStatus = 'UNSEEN' | 'SEEN' | 'DISMISSED' | 'NEGOTIATED';

export interface Recommendation {
  id: string;
  propertyId: string;
  buyerId: string;
  score: number;
  status: RecommendationStatus;
  createdAt: string;
  updatedAt: string;
  property: Property;
}

export interface RecommendationsResponse {
  items: Recommendation[];
  total: number;
  page: number;
  limit: number;
}
