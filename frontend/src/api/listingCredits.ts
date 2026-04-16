import { apiClient } from './client';

export interface ListingCreditStatus {
  canList: boolean;
  creditId?: string;
}

export interface ListingCreditInitiated {
  creditId: string;
  amount: number;
  paymentUrl: string;
}

/** GET /listing-credits/status — requires JWT */
export async function checkListingCreditStatus(): Promise<ListingCreditStatus> {
  const { data } = await apiClient.get<ListingCreditStatus>('/listing-credits/status');
  return data;
}

/** POST /listing-credits/initiate — requires JWT */
export async function initiateListingCredit(): Promise<ListingCreditInitiated> {
  const { data } = await apiClient.post<ListingCreditInitiated>('/listing-credits/initiate');
  return data;
}

/** POST /listing-credits/complete/:creditId — no auth required */
export async function completeListingCredit(creditId: string): Promise<void> {
  await apiClient.post(`/listing-credits/complete/${creditId}`);
}
