import { apiClient } from './client';
import type { LocationItem } from '../types';

export async function getGovernorates(): Promise<{ governorates: LocationItem[] }> {
  const { data } = await apiClient.get<{ governorates: LocationItem[] }>('/locations/governorates');
  return data;
}

export async function getCities(
  governorateId: number,
): Promise<{ cities: LocationItem[] }> {
  const { data } = await apiClient.get<{ cities: LocationItem[] }>('/locations/cities', {
    params: { governorateId },
  });
  return data;
}

export async function getDistricts(
  cityId: number,
): Promise<{ districts: LocationItem[] }> {
  const { data } = await apiClient.get<{ districts: LocationItem[] }>('/locations/districts', {
    params: { cityId },
  });
  return data;
}
