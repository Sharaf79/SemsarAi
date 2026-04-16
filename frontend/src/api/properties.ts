import { apiClient } from './client';
import type { Property, PropertyFilters, PropertyKind, PropertiesResponse } from '../types';

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

export async function fetchPropertyById(id: string): Promise<Property> {
  const { data } = await apiClient.get<{ data: Property }>(`/properties/${id}`);
  return data.data;
}

export async function getOwnerContact(
  propertyId: string,
): Promise<{ ownerPhone: string }> {
  const { data } = await apiClient.get<{ ownerPhone: string }>(
    `/properties/${propertyId}/owner-contact`,
  );
  return data;
}

export async function fetchMyProperties(): Promise<{
  data: Property[];
  meta: { total: number };
}> {
  const { data } = await apiClient.get<{
    data: Property[];
    meta: { total: number };
  }>('/properties/mine');
  return data;
}

export async function updatePropertyStatus(
  id: string,
  status: string,
): Promise<void> {
  await apiClient.patch(`/properties/${id}/status`, { status });
}

export async function deleteProperty(id: string): Promise<void> {
  await apiClient.delete(`/properties/${id}`);
}

export async function updateProperty(
  id: string,
  data: {
    adTitle?: string;
    adDescription?: string;
    price?: number;
    bedrooms?: number;
    bathrooms?: number;
    areaM2?: number;
    governorate?: string;
    city?: string;
    district?: string;
    isNegotiable?: boolean;
    propertyKind?: PropertyKind;
  },
): Promise<Property> {
  const { data: res } = await apiClient.patch<{ data: Property }>(
    `/properties/${id}`,
    data,
  );
  return res.data;
}
