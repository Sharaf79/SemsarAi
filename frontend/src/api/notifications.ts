import { apiClient } from './client';

export type NotificationType =
  | 'OFFER_PROPOSED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'OFFER_COUNTERED'
  | 'NEGOTIATION_AGREED'
  | 'NEGOTIATION_FAILED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  payload?: Record<string, unknown>;
  whatsappSent?: boolean;
  whatsappError?: string | null;
  createdAt: string;
  readAt?: string | null;
}

export async function listNotifications(opts?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<AppNotification[]> {
  const params: Record<string, string | number> = {};
  if (opts?.unreadOnly) params.unreadOnly = 'true';
  if (opts?.limit) params.limit = opts.limit;
  const { data } = await apiClient.get<AppNotification[]>('/notifications', {
    params,
  });
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>(
    '/notifications/unread-count',
  );
  return data.count;
}

export async function markRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/notifications/read-all');
}
