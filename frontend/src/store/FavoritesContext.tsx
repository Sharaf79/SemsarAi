import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  fetchFavoriteIds,
  addFavorite as apiAdd,
  removeFavorite as apiRemove,
} from '../api/favorites';

interface FavoritesContextValue {
  favoriteIds: Set<string>;
  isFavorite: (propertyId: string) => boolean;
  toggle: (propertyId: string) => Promise<void>;
  loading: boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export const FavoritesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Load favorite IDs on mount for authenticated users
  useEffect(() => {
    if (!isAuthenticated) {
      setFavoriteIds(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchFavoriteIds()
      .then((ids) => {
        if (!cancelled) setFavoriteIds(new Set(ids));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const isFavorite = useCallback(
    (propertyId: string) => favoriteIds.has(propertyId),
    [favoriteIds],
  );

  const toggle = useCallback(
    async (propertyId: string) => {
      if (!isAuthenticated) return;
      const wasFav = favoriteIds.has(propertyId);

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFav) next.delete(propertyId);
        else next.add(propertyId);
        return next;
      });

      try {
        if (wasFav) {
          await apiRemove(propertyId);
        } else {
          await apiAdd(propertyId);
        }
      } catch {
        // Revert on error
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(propertyId);
          else next.delete(propertyId);
          return next;
        });
      }
    },
    [isAuthenticated, favoriteIds],
  );

  return (
    <FavoritesContext.Provider
      value={{ favoriteIds, isFavorite, toggle, loading }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx)
    throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return ctx;
}
