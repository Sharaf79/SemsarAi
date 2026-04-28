import { apiClient } from './client';

// ─── Types ────────────────────────────────────────────────────────

export type OnboardingStep =
  | 'PROPERTY_TYPE'
  | 'LISTING_TYPE'
  | 'GOVERNORATE'
  | 'CITY'
  | 'DISTRICT'
  | 'DETAILS'
  | 'PRICE'
  | 'MEDIA'
  | 'REVIEW'
  | 'COMPLETED';

export interface DraftData {
  property_type?: string;
  listing_type?: 'SALE' | 'RENT';
  governorate_id?: number;
  governorate_name?: string;
  city_id?: number;
  city_name?: string;
  district_id?: number;
  district_name?: string;
  price?: number | null;
  details?: {
    area_m2: number;
    bedrooms?: number | null;
    bathrooms?: number | null;
    apartmentType?: string | null;
    rentRateType?: string | null;
    ownershipType?: string | null;
    readiness?: string | null;
    deliveryDate?: string | null;
    finishingType?: string | null;
    floorLevel?: string | null;
    isFurnished?: boolean | null;
    isNegotiable?: boolean | null;
    adTitle?: string | null;
    adDescription?: string | null;
    amenities?: { parsed?: string } | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  media_skipped?: boolean;
  [key: string]: unknown;
}

export interface PropertyDraft {
  id: string;
  userId: string;
  currentStep: OnboardingStep;
  data: DraftData;
  isCompleted: boolean;
}

export interface ReviewResponse {
  draft: PropertyDraft;
  data: DraftData;
  isComplete: boolean;
  missingFields: string[];
}

// ─── API calls ────────────────────────────────────────────────────

export async function startOrResumeDraft(
  userId: string,
  restart = false,
): Promise<PropertyDraft> {
  const { data } = await apiClient.post<{ success: boolean; data: { draft: PropertyDraft } }>(
    '/onboarding/start',
    { userId, restart },
  );
  return data.data.draft;
}

export async function submitAnswer(
  userId: string,
  step: OnboardingStep,
  answer: unknown,
): Promise<PropertyDraft> {
  const { data } = await apiClient.post<{ success: boolean; data: { draft: PropertyDraft } }>(
    '/onboarding/answer',
    { userId, step, answer },
  );
  return data.data.draft;
}

export async function getReview(userId: string): Promise<ReviewResponse> {
  const { data } = await apiClient.get<{ success: boolean; data: ReviewResponse }>(
    '/onboarding/review',
    { params: { userId } },
  );
  return data.data;
}

export async function editField(
  userId: string,
  step: OnboardingStep,
): Promise<PropertyDraft> {
  const { data } = await apiClient.post<{ success: boolean; data: { draft: PropertyDraft } }>(
    '/onboarding/edit',
    { userId, step },
  );
  return data.data.draft;
}

export async function finalSubmit(userId: string): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ success: boolean; data: { id: string } }>(
    '/onboarding/submit',
    { userId },
  );
  return data.data;
}

export async function uploadFile(
  file: File,
): Promise<{ url: string; filename: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ success: boolean; data: { url: string; filename: string; size: number } }>(
    '/onboarding/upload-file',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function attachMedia(
  userId: string,
  url: string,
  type: 'IMAGE' | 'VIDEO',
): Promise<{ id: string; url: string; type: 'IMAGE' | 'VIDEO' }> {
  const { data } = await apiClient.post<{ success: boolean; data: { id: string; url: string; type: 'IMAGE' | 'VIDEO' } }>(
    '/onboarding/upload-media',
    { userId, url, type },
  );
  return data.data;
}
