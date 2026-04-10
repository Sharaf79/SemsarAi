import { apiClient } from './client';
import type { PaymentInfo, PaymentDetail } from '../types';

export async function initiatePayment(dealId: string): Promise<PaymentInfo> {
  const { data } = await apiClient.post<PaymentInfo>('/payments/initiate', {
    dealId,
  });
  return data;
}

/**
 * Mock success callback — in production this is called by Paymob.
 * Sends the payment amount for server-side validation.
 */
export async function completePayment(
  paymentId: string,
  amount: number,
): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<{ success: boolean }>(
    `/payments/callback/${paymentId}`,
    { amount },
  );
  return data;
}

/** Poll payment status (e.g. after redirect back from gateway). */
export async function getPayment(paymentId: string): Promise<PaymentDetail> {
  const { data } = await apiClient.get<PaymentDetail>(
    `/payments/${paymentId}`,
  );
  return data;
}
