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

export async function getNegotiation(negotiationId: string): Promise<{
  success: boolean;
  data: {
    negotiation: NegotiationResult;
    currentRound: number;
    maxRounds: number;
  };
}> {
  const { data } = await apiClient.get(`/negotiations/${negotiationId}`);
  return data as {
    success: boolean;
    data: {
      negotiation: NegotiationResult;
      currentRound: number;
      maxRounds: number;
    };
  };
}
