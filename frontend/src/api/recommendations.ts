import { apiClient } from './client';
import type { RecommendationsResponse, Recommendation, RecommendationStatus } from '../types';

/**
 * Fetch paginated recommendations for the current user.
 */
export async function getRecommendations(
  status?: RecommendationStatus,
  page = 1,
  limit = 20,
): Promise<RecommendationsResponse> {
  const params: Record<string, string | number> = { page, limit };
  if (status) params.status = status;

  const { data } = await apiClient.get<RecommendationsResponse>(
    '/recommendations',
    { params },
  );
  return data;
}

/**
 * Get the count of UNSEEN recommendations.
 */
export async function getUnseenCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>(
    '/recommendations/unseen-count',
  );
  return data.count;
}

/**
 * Mark a recommendation as SEEN.
 */
export async function markRecommendationSeen(
  recommendationId: string,
): Promise<Recommendation> {
  const { data } = await apiClient.patch<Recommendation>(
    `/recommendations/${recommendationId}/seen`,
  );
  return data;
}

/**
 * Dismiss a recommendation (hide it from the user).
 */
export async function dismissRecommendation(
  recommendationId: string,
): Promise<Recommendation> {
  const { data } = await apiClient.patch<Recommendation>(
    `/recommendations/${recommendationId}/dismiss`,
  );
  return data;
}
