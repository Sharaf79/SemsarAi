import { apiClient } from './client';
import type { User } from '../types';

export async function sendOtp(phone: string): Promise<{ message: string; channel: 'whatsapp' | 'sms'; devOtp?: string }> {
  const { data } = await apiClient.post<{ message: string; channel: 'whatsapp' | 'sms'; devOtp?: string }>(
    '/auth/send-otp',
    { phone },
  );
  return data;
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<{ token: string; isNewUser: boolean; userId: string; name: string; email: string | null }> {
  const { data } = await apiClient.post<{
    token: string;
    isNewUser: boolean;
    userId: string;
    name: string;
    email: string | null;
  }>('/auth/verify-otp', { phone, code });
  return data;
}

export async function updateProfile(
  name: string,
  email?: string,
  dateOfBirth?: string | null,
  sexType?: string | null,
  notes?: string | null,
): Promise<User> {
  const { data } = await apiClient.patch<User>('/auth/profile', {
    name,
    ...(email ? { email } : {}),
    ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
    ...(sexType !== undefined ? { sexType } : {}),
    ...(notes !== undefined ? { notes } : {}),
  });
  return data;
}

export async function getProfile(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/profile');
  return data;
}
