export const INITIAL_OFFER_FACTOR = 0.85;
export const MAX_ROUNDS = 6;
export const CONCESSION_SCHEDULE = [
  { minRound: 1, maxRound: 2, rate: 0.05 },
  { minRound: 3, maxRound: 5, rate: 0.10 },
  { minRound: 6, maxRound: Infinity, rate: 0.15 },
];
