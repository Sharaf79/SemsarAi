import { apiClient } from './client';

export type OnboardingStep =
  | 'GOVERNORATE'
  | 'CITY'
  | 'DISTRICT'
  | 'PROPERTY_TYPE'
  | 'LISTING_TYPE'
  | 'DETAILS'
  | 'PRICE'
  | 'MEDIA'
  | 'REVIEW'
  | 'COMPLETED';

export type InputType =
  | 'multi-choice'
  | 'form'
  | 'number'
  | 'file'
  | 'display'
  | 'map'
  | 'textarea'
  | 'optional-textarea';

export interface LocationOption {
  id: number;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  required: boolean;
}

export interface QuestionEnvelope {
  step: OnboardingStep;
  question: string;
  inputType: InputType;
  options?: string[] | LocationOption[];
  fields?: FieldDef[];
}

export interface Draft {
  id: string;
  userId: string;
  currentStep: OnboardingStep;
  data: Record<string, unknown>;
  status: string;
}

export interface StartResponse {
  draft: Draft;
  question: QuestionEnvelope;
}

export interface AnswerResponse {
  draft: Draft;
  question: QuestionEnvelope | null;
}

export interface ReviewResponse {
  draft: Draft;
  data: Record<string, unknown>;
  isComplete: boolean;
  missingFields: string[];
}

export interface UploadFileResponse {
  url: string;
  filename: string;
  size: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export async function startDraft(userId: string, restart = false): Promise<StartResponse> {
  const { data } = await apiClient.post<Envelope<StartResponse>>('/onboarding/start', {
    userId,
    restart,
  });
  return data.data;
}

export async function getQuestion(userId: string): Promise<QuestionEnvelope> {
  const { data } = await apiClient.get<Envelope<QuestionEnvelope>>('/onboarding/question', {
    params: { userId },
  });
  return data.data;
}

export async function submitAnswer(
  userId: string,
  step: OnboardingStep,
  answer: unknown,
): Promise<AnswerResponse> {
  const { data } = await apiClient.post<Envelope<AnswerResponse>>('/onboarding/answer', {
    userId,
    step,
    answer,
  });
  return data.data;
}

export async function getReview(userId: string): Promise<ReviewResponse> {
  const { data } = await apiClient.get<Envelope<ReviewResponse>>('/onboarding/review', {
    params: { userId },
  });
  return data.data;
}

export async function editField(userId: string, step: OnboardingStep): Promise<QuestionEnvelope> {
  const { data } = await apiClient.post<Envelope<QuestionEnvelope & { draft: Draft }>>(
    '/onboarding/edit',
    { userId, step },
  );
  return data.data;
}

export async function finalSubmit(userId: string): Promise<{ id: string }> {
  const { data } = await apiClient.post<Envelope<{ id: string }>>('/onboarding/submit', {
    userId,
  });
  return data.data;
}

export async function uploadFile(file: File): Promise<UploadFileResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<Envelope<UploadFileResponse>>(
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
): Promise<unknown> {
  const { data } = await apiClient.post<Envelope<unknown>>('/onboarding/upload-media', {
    userId,
    url,
    type,
  });
  return data.data;
}
