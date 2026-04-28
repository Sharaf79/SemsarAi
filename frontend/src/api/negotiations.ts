import { apiClient } from './client';
import type { NegotiationResult, ActionResult, NegotiationAction } from '../types';

export type SimulatorOutcome = 'INITIAL' | 'COUNTER' | 'AGREED' | 'ESCALATE_TO_OWNER';

export interface SimulatorStep {
  round: number;
  sellerOffer: number;
  buyerOffer: number;
  outcome: SimulatorOutcome;
  message: string;
}

export interface SimulationResult {
  sellerMaxPrice: number;
  sellerMinPrice: number;
  schedule: number[];
  steps: SimulatorStep[];
  finalOutcome: SimulatorOutcome;
  ownerNotice?: string;
}

export async function simulateNegotiation(
  sellerMaxPrice: number,
  sellerMinPrice: number,
  buyerOffer: number,
): Promise<{ success: boolean; data: SimulationResult }> {
  const { data } = await apiClient.post<{ success: boolean; data: SimulationResult }>(
    '/negotiations/simulate',
    { sellerMaxPrice, sellerMinPrice, buyerOffer },
  );
  return data;
}

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
