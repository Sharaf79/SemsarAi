/**
 * Property API Service
 * Handles all communication with the backend onboarding endpoints
 */

import {
  PropertyDraft,
  PropertyDraftData,
  OnboardingStep,
  PropertyMediaItem,
  ApiResponse,
  ReviewData,
  MediaTypeEnum,
  QuestionData,
} from '../types/wizard.types';

const API_BASE = '/api';

export class PropertyService {
  /**
   * Start a new draft or resume existing incomplete one
   */
  static async startDraft(userId: string | null, phone: string | null, restart: boolean = false): Promise<PropertyDraft> {
    const response = await fetch(`${API_BASE}/onboarding/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(userId && { userId }),
        ...(phone && { phone }),
        restart,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start draft: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data?.draft;
  }

  /**
   * Get current question for the active draft
   */
  static async getQuestion(userId: string): Promise<QuestionData> {
    const response = await fetch(`${API_BASE}/onboarding/question?userId=${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to get question: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Submit an answer for the current step
   * Advances to the next step automatically
   */
  static async submitAnswer(
    userId: string,
    step: OnboardingStep,
    answer: unknown,
  ): Promise<{ draft: PropertyDraft; question: QuestionData | null }> {
    const response = await fetch(`${API_BASE}/onboarding/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        step,
        answer,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Failed to submit answer: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      draft: data.data?.draft,
      question: data.data?.question,
    };
  }

  /**
   * Get review summary before final submission
   */
  static async getReview(userId: string): Promise<ReviewData> {
    const response = await fetch(`${API_BASE}/onboarding/review?userId=${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to get review: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Rewind to a previous step from REVIEW to edit a field
   */
  static async editField(userId: string, targetStep: OnboardingStep): Promise<QuestionData> {
    const response = await fetch(`${API_BASE}/onboarding/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        step: targetStep,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to edit field: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Final submission: create Property from draft
   * Requires user to have a completed listing credit
   */
  static async submitProperty(userId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/onboarding/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Check if it's a payment/credit error
      if (response.status === 403) {
        throw {
          code: 'PAYMENT_REQUIRED',
          message: errorData.message,
          creditId: errorData.creditId,
        };
      }
      throw new Error(errorData.message || `Failed to submit property: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data; // Returns the created Property
  }

  /**
   * Upload a file to the server
   * Returns a public URL for the uploaded file
   */
  static async uploadFile(file: File): Promise<{ url: string; filename: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/onboarding/upload-file`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Attach a media file (image or video) to the active draft
   */
  static async uploadMedia(userId: string, url: string, type: MediaTypeEnum): Promise<PropertyMediaItem> {
    const response = await fetch(`${API_BASE}/onboarding/upload-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        url,
        type,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload media: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get locations (governorates, cities, districts)
   * Note: In a real app, you might fetch this from a separate locations API
   * For now, we'll assume this is handled by the question endpoint
   */
  static async getGovernorates(): Promise<any[]> {
    // This would typically come from a separate locations API
    // For now, we rely on the question data from getCurrentQuestion()
    // In a real implementation, add a GET /locations/governorates endpoint
    return [];
  }

  /**
   * Normalize validation errors for display
   */
  static normalizeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'object' && error !== null) {
      const err = error as any;
      if (err.message) return err.message;
      if (err.code === 'PAYMENT_REQUIRED') {
        return err.message || 'يجب دفع 100 جنيه لنشر هذا العقار';
      }
    }
    return 'حدث خطأ غير متوقع';
  }
}

export default PropertyService;
