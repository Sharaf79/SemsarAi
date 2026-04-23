/**
 * usePropertyDraft Hook
 * Manages the entire property draft state and API communication
 */

import { useState, useCallback, useEffect } from 'react';
import {
  PropertyDraft,
  PropertyDraftData,
  OnboardingStep,
  PropertyMediaItem,
  ReviewData,
  QuestionData,
  LocationOption,
} from '../types/wizard.types';
import PropertyService from '../services/propertyService';

interface UsePropertyDraftOptions {
  userId: string | null;
  phone?: string | null;
  onSuccess?: (property: any) => void;
  onError?: (error: string) => void;
}

export const usePropertyDraft = ({
  userId,
  phone,
  onSuccess,
  onError,
}: UsePropertyDraftOptions) => {
  const [draft, setDraft] = useState<PropertyDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<PropertyMediaItem[]>([]);
  const [locations, setLocations] = useState<Map<number, LocationOption[]>>(new Map());

  // Initialize draft on mount
  useEffect(() => {
    if (!userId && !phone) return;

    const initializeDraft = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const newDraft = await PropertyService.startDraft(userId, phone, false);
        setDraft(newDraft);
      } catch (err) {
        const errorMsg = PropertyService.normalizeError(err);
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDraft();
  }, [userId, phone, onError]);

  // Submit answer for current step
  const submitAnswer = useCallback(
    async (step: OnboardingStep, answer: unknown) => {
      if (!userId) {
        setError('User ID is required');
        return null;
      }

      try {
        setIsSaving(true);
        setError(null);
        const result = await PropertyService.submitAnswer(userId, step, answer);
        setDraft(result.draft);
        return result.question;
      } catch (err) {
        const errorMsg = PropertyService.normalizeError(err);
        setError(errorMsg);
        onError?.(errorMsg);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [userId, onError],
  );

  // Get review data
  const getReview = useCallback(async (): Promise<ReviewData | null> => {
    if (!userId) {
      setError('User ID is required');
      return null;
    }

    try {
      setIsLoading(true);
      setError(null);
      const review = await PropertyService.getReview(userId);
      return review;
    } catch (err) {
      const errorMsg = PropertyService.normalizeError(err);
      setError(errorMsg);
      onError?.(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, onError]);

  // Edit field (rewind to step)
  const editField = useCallback(
    async (step: OnboardingStep): Promise<QuestionData | null> => {
      if (!userId) {
        setError('User ID is required');
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);
        const question = await PropertyService.editField(userId, step);
        // Refetch draft after edit
        const newDraft = await PropertyService.startDraft(userId, null, false);
        setDraft(newDraft);
        return question;
      } catch (err) {
        const errorMsg = PropertyService.normalizeError(err);
        setError(errorMsg);
        onError?.(errorMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, onError],
  );

  // Submit property (final)
  const submitProperty = useCallback(async () => {
    if (!userId) {
      setError('User ID is required');
      return null;
    }

    try {
      setIsSaving(true);
      setError(null);
      const property = await PropertyService.submitProperty(userId);
      onSuccess?.(property);
      return property;
    } catch (err: any) {
      const errorMsg = PropertyService.normalizeError(err);
      setError(errorMsg);
      onError?.(errorMsg);
      // Re-throw to handle payment flow
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [userId, onSuccess, onError]);

  // Upload media file
  const uploadMedia = useCallback(
    async (file: File) => {
      if (!userId) {
        setError('User ID is required');
        return null;
      }

      try {
        setIsSaving(true);
        setError(null);

        // 1. Upload file to server
        const uploadedFile = await PropertyService.uploadFile(file);

        // 2. Determine media type
        const mediaType = file.type.startsWith('video') ? 'VIDEO' : 'IMAGE';

        // 3. Attach media to draft
        const mediaItem = await PropertyService.uploadMedia(
          userId,
          uploadedFile.url,
          mediaType,
        );

        setMedia((prev) => [...prev, mediaItem]);
        return mediaItem;
      } catch (err) {
        const errorMsg = PropertyService.normalizeError(err);
        setError(errorMsg);
        onError?.(errorMsg);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [userId, onError],
  );

  // Remove media
  const removeMedia = useCallback((mediaId: string) => {
    setMedia((prev) => prev.filter((m) => m.id !== mediaId));
  }, []);

  // Update draft data locally (for form changes)
  const updateDraftData = useCallback((patch: Partial<PropertyDraftData>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        data: { ...prev.data, ...patch },
      };
    });
  }, []);

  // Restart draft
  const restartDraft = useCallback(async () => {
    if (!userId && !phone) {
      setError('User ID or phone is required');
      return null;
    }

    try {
      setIsLoading(true);
      setError(null);
      const newDraft = await PropertyService.startDraft(userId, phone, true);
      setDraft(newDraft);
      setMedia([]);
      return newDraft;
    } catch (err) {
      const errorMsg = PropertyService.normalizeError(err);
      setError(errorMsg);
      onError?.(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, phone, onError]);

  return {
    // State
    draft,
    isLoading,
    isSaving,
    error,
    media,
    locations,

    // Actions
    submitAnswer,
    getReview,
    editField,
    submitProperty,
    uploadMedia,
    removeMedia,
    updateDraftData,
    restartDraft,

    // Utilities
    setError,
    setDraft,
  };
};

export default usePropertyDraft;
