import { apiClient } from './client';
import type { NegotiationResult, ActionResult, NegotiationAction } from '../types';

export async function startNegotiation(
  propertyId: string,
  buyerMaxPrice: number,
): Promise<{ success: boolean; data: NegotiationResult }> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: NegotiationResult;
  }>('/negotiations/start', { propertyId, buyerMaxPrice });
  return data;
}

export async function handleAction(
  negotiationId: string,
  action: NegotiationAction,
): Promise<{ success: boolean; data: ActionResult }> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: ActionResult;
  }>('/negotiations/action', { negotiationId, action });
  return data;
}

export interface LatestEscalation {
  id: string;
  buyerOffer: string | number;
  sellerAction: 'ACCEPT' | 'REJECT' | 'COUNTER' | null;
  sellerCounter: string | number | null;
  status: 'PENDING' | 'RESOLVED';
  createdAt: string;
  resolvedAt: string | null;
}

export async function getNegotiation(negotiationId: string): Promise<{
  success: boolean;
  data: {
    negotiation: NegotiationResult;
    currentRound: number;
    maxRounds: number;
    latestEscalation?: LatestEscalation | null;
    deals?: { id: string; finalPrice: string | number; status: string }[];
  };
}> {
  const { data } = await apiClient.get(`/negotiations/${negotiationId}`);
  return data as {
    success: boolean;
    data: {
      negotiation: NegotiationResult;
      currentRound: number;
      maxRounds: number;
      latestEscalation?: LatestEscalation | null;
      deals?: { id: string; finalPrice: string | number; status: string }[];
    };
  };
}

// ─── Voice/Chat Negotiation ─────────────────────────────────

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithNegotiator(
  negotiationId: string,
  history: ChatHistoryItem[],
  userMessage: string,
): Promise<{ reply: string }> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: { reply: string };
  }>('/negotiations/chat', { negotiationId, history, userMessage });
  return data.data;
}

export interface ProposePriceResult {
  decision: 'IN_BAND' | 'BELOW_MIN' | 'ABOVE_MAX';
  message: string;
  depositRequired?: boolean;
  paymentId?: string;
  dealId?: string;
  agreedPrice?: number;
  escalationId?: string;
}

export async function proposePrice(
  negotiationId: string,
  proposedPrice: number,
): Promise<ProposePriceResult> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: ProposePriceResult;
  }>('/negotiations/propose-price', { negotiationId, proposedPrice });
  return data.data;
}

export interface SellerEscalationSummary {
  escalationId: string;
  buyerOffer: number;
  status: 'PENDING' | 'RESOLVED';
  property: {
    id: string;
    title: string;
    price: number;
    media: { id: string; url: string; type: string }[];
  };
  buyerName: string;
  createdAt: string;
}

export async function getSellerEscalation(
  token: string,
): Promise<SellerEscalationSummary> {
  const { data } = await apiClient.get<{
    success: boolean;
    data: SellerEscalationSummary;
  }>(`/negotiations/seller-action/${token}`);
  return data.data;
}

export async function submitSellerAction(
  token: string,
  action: 'ACCEPT' | 'REJECT' | 'COUNTER',
  counterPrice?: number,
): Promise<{
  escalationId: string;
  action: string;
  negotiationStatus: string;
  dealId?: string;
  paymentId?: string;
  counterPrice?: number;
}> {
  const { data } = await apiClient.post<{
    success: boolean;
    data: {
      escalationId: string;
      action: string;
      negotiationStatus: string;
      dealId?: string;
      paymentId?: string;
      counterPrice?: number;
    };
  }>(`/negotiations/seller-action/${token}`, { action, counterPrice });
  return data.data;
}
