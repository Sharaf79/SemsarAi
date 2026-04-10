import { apiClient } from './client';
import type { PropertyFilters, PropertiesResponse } from '../types';

export async function fetchProperties(
  filters: PropertyFilters = {},
): Promise<PropertiesResponse> {
  // Strip undefined / empty-string params so they're not sent
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
  );
  const { data } = await apiClient.get<PropertiesResponse>('/properties', {
    params,
  });
  return data;
}

export async function getOwnerContact(
  propertyId: string,
): Promise<{ ownerPhone: string }> {
  const { data } = await apiClient.get<{ ownerPhone: string }>(
    `/properties/${propertyId}/owner-contact`,
  );
  return data;
}
