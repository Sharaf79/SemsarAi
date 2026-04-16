import { apiClient } from './client';
import type { Property } from '../types';

export async function addFavorite(propertyId: string): Promise<void> {
  await apiClient.post(`/favorites/${propertyId}`);
}

export async function removeFavorite(propertyId: string): Promise<void> {
  await apiClient.delete(`/favorites/${propertyId}`);
}

export async function fetchFavorites(): Promise<{
  data: Property[];
  meta: { total: number };
}> {
  const { data } = await apiClient.get<{
    data: Property[];
    meta: { total: number };
  }>('/favorites');
  return data;
}

export async function fetchFavoriteIds(): Promise<string[]> {
  const { data } = await apiClient.get<{ data: string[] }>('/favorites/ids');
  return data.data;
}
