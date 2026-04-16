import { apiClient } from './client';

export interface AdminProperty {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  type: string;
  propertyKind: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  governorate: string | null;
  city: string | null;
  district: string | null;
  propertyStatus: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    phone: string;
  };
  media: {
    id: string;
    url: string;
    type: string;
    createdAt: string;
  }[];
}

export interface AdminApproveResponse {
  success: boolean;
  message: string;
  property: AdminProperty;
}

/**
 * Get all pending properties (PENDING_REVIEW status)
 */
export const getPendingProperties = async (): Promise<AdminProperty[]> => {
  const response = await apiClient.get('/admin/pending-properties');
  return response.data;
};

/**
 * Get a single property by ID
 */
export const getPropertyById = async (id: string): Promise<AdminProperty> => {
  const response = await apiClient.get(`/admin/properties/${id}`);
  return response.data;
};

/**
 * Approve a property (change status to ACTIVE)
 */
export const approveProperty = async (id: string): Promise<AdminApproveResponse> => {
  const response = await apiClient.post(`/admin/properties/${id}/approve`);
  return response.data;
};

/**
 * Reject a property (change status to INACTIVE)
 */
export const rejectProperty = async (id: string): Promise<AdminApproveResponse> => {
  const response = await apiClient.post(`/admin/properties/${id}/reject`);
  return response.data;
};
