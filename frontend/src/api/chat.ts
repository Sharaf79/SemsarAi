import { apiClient } from './client';

// ─── Types ───────────────────────────────────────────────────────

/** A single choice option — static (string) or from DB (object with id/label) */
export type ChatOption = string | { id: string; label: string };

export interface ChatResponseData {
  step?: string;
  question?: string;
  inputType?: 'text' | 'number' | 'multi-choice' | 'file' | 'form' | 'display';
  options?: ChatOption[];
  fields?: Array<{ name: string; label: string; required: boolean }>;
  /** Populated when the flow is `negotiation` */
  negotiationId?: string;
  [key: string]: unknown;
}

export interface ChatApiResponse {
  /** Bot reply message (Arabic) */
  message: string;
  /** Current step name (onboarding) or negotiation action result */
  action?: string;
  /** Structured payload from the active flow */
  data?: ChatResponseData;
}

export interface SendMessageRequest {
  message: string;
  /** Optional explicit flow override */
  flow?: 'onboarding' | 'negotiation';
  /** Optional entity ID (draft UUID or negotiation UUID) */
  entityId?: string;
  /**
   * Caller-supplied userId override.
   * - Authenticated users: pass `user.id` (JWT also carries it, but being explicit is clean).
   * - Omit for anonymous visitors — `getOrCreateAnonId()` is used as the fallback.
   */
  userId?: string;
}

// ─── Anonymous user UUID ─────────────────────────────────────────

const ANON_ID_KEY = 'semsar_anon_id';

/**
 * Returns the anonymous user UUID stored in localStorage.
 * Creates and persists a new UUID if none exists.
 */
export function getOrCreateAnonId(): string {
  // If the backend has assigned a real user ID to this anonymous session, prioritize it
  const backendId = localStorage.getItem('semsar_anon_backend_id');
  if (backendId) return backendId;

  const existing = localStorage.getItem(ANON_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(ANON_ID_KEY, id);
  return id;
}

// ─── API call ────────────────────────────────────────────────────

/**
 * Sends a chat message to the backend `/chat/message` endpoint.
 *
 * If the user is authenticated the JWT is attached automatically by the
 * axios interceptor in `client.ts` — no extra work needed.
 * For unauthenticated visitors the anonymous UUID is included in `userId`
 * so the backend can build a stable conversation context.
 */
export async function sendChatMessage(
  req: SendMessageRequest,
): Promise<ChatApiResponse> {
  // For authenticated users: use their real ID.
  // For anonymous visitors: use/create a stable UUID in localStorage.
  const userId = req.userId ?? getOrCreateAnonId();

  const { data } = await apiClient.post<ChatApiResponse>('/chat/message', {
    message: req.message,
    userId,
    ...(req.flow ? { flow: req.flow } : {}),
    ...(req.entityId ? { entityId: req.entityId } : {}),
  });
  return data;
}

// ─── Backend response shape (onboarding) ──────────────────────────

interface BackendOnboardingResponse {
  success: boolean;
  data?: {
    draft?: { userId: string; currentStep: string; id: string };
    question?: {
      question: string;
      inputType: string;
      options?: unknown[];
      fields?: unknown[];
      step?: string;
    } | null;
  };
}

/**
 * Transform the NestJS onboarding response into the ChatApiResponse
 * shape that ChatWidget already knows how to render.
 */
function adaptOnboardingResponse(raw: BackendOnboardingResponse): ChatApiResponse {
  const q = raw.data?.question;
  const draft = raw.data?.draft;
  const step = draft?.currentStep ?? q?.step;

  if (!q) {
    // Completed — no more questions
    return {
      message: '✅ تم حفظ العقار بنجاح! شكراً لك.',
      action: 'COMPLETED',
      data: { step: 'COMPLETED' },
    };
  }

  return {
    message: q.question,
    data: {
      step,
      question: q.question,
      inputType: q.inputType as ChatApiResponse['data'] extends undefined ? never : NonNullable<ChatApiResponse['data']>['inputType'],
      options: q.options as ChatOption[] | undefined,
      fields: q.fields as ChatResponseData['fields'],
    },
  };
}

export async function startOnboarding(userId: string, restart?: boolean): Promise<ChatApiResponse> {
  const isAnon = !localStorage.getItem('semsar_token');

  if (isAnon) {
    const existingPhone = localStorage.getItem('semsar_anon_phone');
    const mockPhone = existingPhone || ('010' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0'));
    if (!existingPhone) localStorage.setItem('semsar_anon_phone', mockPhone);

    const { data } = await apiClient.post<BackendOnboardingResponse>('/onboarding/start', { phone: mockPhone, restart });

    // Save backend's designated user ID so subsequent requests pass referential integrity
    const backendId = data.data?.draft?.userId;
    if (backendId) localStorage.setItem('semsar_anon_backend_id', backendId);

    return adaptOnboardingResponse(data);
  }

  const { data } = await apiClient.post<BackendOnboardingResponse>('/onboarding/start', { userId, restart });
  return adaptOnboardingResponse(data);
}

export async function submitOnboardingAnswer(userId: string, step: string, answer: unknown): Promise<ChatApiResponse> {
  const { data } = await apiClient.post<BackendOnboardingResponse>('/onboarding/answer', { userId, step, answer });
  return adaptOnboardingResponse(data);
}

export async function finalSubmitOnboarding(userId: string): Promise<ChatApiResponse> {
  const { data } = await apiClient.post<{ success: boolean; data: unknown }>('/onboarding/submit', { userId });
  if (data.success) {
    return {
      message: '✅ تم نشر عقارك بنجاح! سيظهر في قائمة العقارات. شكراً لك 🎉',
      action: 'COMPLETED',
      data: { step: 'COMPLETED' },
    };
  }
  throw new Error('فشل نشر العقار، حاول مرة أخرى.');
}

