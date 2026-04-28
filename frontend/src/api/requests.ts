import { apiClient } from './client';

export type RequestIntent   = 'SALE' | 'RENT';
export type RequestStatus   = 'ACTIVE' | 'PAUSED' | 'MATCHED' | 'CLOSED' | 'EXPIRED';
export type RequestUrgency  = 'LOW' | 'MEDIUM' | 'HIGH';
export type MatchStatus     = 'NEW' | 'VIEWED' | 'CONTACTED' | 'DISMISSED' | 'CONVERTED' | 'CLOSED';

export interface PropertyRequest {
  id: string;
  intent: RequestIntent;
  propertyKind: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  minAreaM2: string | null;
  maxAreaM2: string | null;
  urgency: RequestUrgency;
  status: RequestStatus;
  notes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  locations?: Array<{
    id: string;
    locationId: number;
    location: {
      id: number;
      nameAr: string;
      nameEn: string;
      type: string;
      parent?: {
        id: number;
        nameAr: string;
        nameEn: string | null;
        type: string;
        parent?: {
          id: number;
          nameAr: string;
          nameEn: string | null;
          type: string;
        } | null;
      } | null;
    };
  }>;
}

export interface CreateRequestPayload {
  intent: RequestIntent;
  propertyKind?: string;
  minPrice?: string;
  maxPrice?: string;
  minBedrooms?: number;
  maxBedrooms?: number;
  minAreaM2?: string;
  maxAreaM2?: string;
  urgency?: RequestUrgency;
  notes?: string;
  locationIds?: number[];
  expiresAt?: string;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export interface ListRequestsResponse {
  data: PropertyRequest[];
  meta: { total: number; page: number; limit: number };
}

export interface PropertyMatch {
  id: string;
  requestId: string;
  propertyId: string;
  score: number;
  reasons: { matched: string[]; missed: string[] } | null;
  status: MatchStatus;
  lastComputedAt: string;
  property: {
    id: string;
    title: string;
    price: string;
    type: string;
    propertyKind: string;
    bedrooms: number | null;
    areaM2: string | null;
    governorate: string | null;
    city: string | null;
    district: string | null;
    media?: Array<{ url: string }>;
  };
}

export interface ListMatchesResponse {
  data: PropertyMatch[];
  meta: { total: number; page: number; limit: number };
}

export interface CreateRequestResponse {
  data: PropertyRequest;
  matches: PropertyMatch[];
  matchedCount: number;
}

export async function listRequests(params?: {
  status?: RequestStatus;
  page?: number;
  limit?: number;
}): Promise<ListRequestsResponse> {
  const { data } = await apiClient.get<{
    items: PropertyRequest[];
    total: number;
    page: number;
    limit: number;
  }>('/requests', { params });
  // Map backend { items, total, page, limit } → frontend { data, meta }
  return {
    data: data.items,
    meta: { total: data.total, page: data.page, limit: data.limit },
  };
}

export async function createRequest(payload: CreateRequestPayload): Promise<CreateRequestResponse> {
  const { data } = await apiClient.post<{
    request: PropertyRequest;
    matches: PropertyMatch[];
    matchedCount: number;
  }>('/requests', payload);
  // Map backend { request, matches, matchedCount } → frontend { data, matches, matchedCount }
  return {
    data: data.request,
    matches: data.matches,
    matchedCount: data.matchedCount,
  };
}

export async function getRequest(id: string): Promise<{ data: PropertyRequest }> {
  const { data } = await apiClient.get<PropertyRequest>(`/requests/${id}`);
  // Backend returns the request object directly
  return { data };
}

export async function pauseRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/pause`);
  return data;
}

export async function resumeRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/resume`);
  return data;
}

export async function deleteRequest(id: string) {
  const { data } = await apiClient.delete(`/requests/${id}`);
  return data;
}

export async function getMatches(requestId: string, params?: { status?: MatchStatus; page?: number }): Promise<ListMatchesResponse> {
  const { data } = await apiClient.get<{
    items: PropertyMatch[];
    total: number;
    page: number;
    limit: number;
  }>(`/requests/${requestId}/matches`, { params });
  // Map backend { items, total, page, limit } → frontend { data, meta }
  return {
    data: data.items,
    meta: { total: data.total, page: data.page, limit: data.limit },
  };
}

export async function updateMatch(matchId: string, status: MatchStatus) {
  const { data } = await apiClient.patch(`/matches/${matchId}`, { status });
  return data;
}

export async function recomputeRequest(id: string) {
  const { data } = await apiClient.post(`/requests/${id}/recompute`);
  return data;
}
