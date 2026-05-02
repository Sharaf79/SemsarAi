/**
 * T27: Feature flags client.
 *
 * Fetches `/api/feature-flags` once on app load, then caches.
 * When NEGOTIATION_V2=false, the NegotiationPage falls back to
 * REST-only polling instead of Socket.IO.
 */

export interface FeatureFlags {
  NEGOTIATION_V2: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  NEGOTIATION_V2: true,
};

let cachedFlags: FeatureFlags | null = null;
let fetchPromise: Promise<FeatureFlags> | null = null;

/**
 * Fetch feature flags from the backend (once, cached).
 * Falls back to defaults on error.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (cachedFlags) return cachedFlags;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const { apiClient } = await import('./client');
      const { data } = await apiClient.get<FeatureFlags>('/feature-flags');
      cachedFlags = data;
      return cachedFlags;
    } catch {
      // Network error or endpoint missing — use defaults
      cachedFlags = DEFAULT_FLAGS;
      return cachedFlags;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Synchronous accessor — returns cached flags or defaults.
 * Call `getFeatureFlags()` first to populate the cache.
 */
export function getCachedFeatureFlags(): FeatureFlags {
  return cachedFlags ?? DEFAULT_FLAGS;
}

/**
 * Reset cache (useful for testing or hot-reload).
 */
export function resetFeatureFlags(): void {
  cachedFlags = null;
  fetchPromise = null;
}
