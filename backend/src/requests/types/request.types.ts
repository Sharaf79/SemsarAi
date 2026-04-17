// Shared types for the buyer-requests feature (spec 006).

export interface MatchReasons {
  matched: string[];
  missed: string[];
}

export interface ScoreBreakdown {
  score: number;
  priceScore: number;
  locationScore: number;
  featureScore: number;
  distanceKm?: number;
  reasons: MatchReasons;
}

export interface GovernorateCityDistrict {
  governorates: string[];
  cities: string[];
  districts: string[];
}

export const MIN_MATCH_SCORE = 40;
export const CANDIDATE_CAP = 500;
export const PRICE_TOLERANCE = 0.15;
export const AREA_TOLERANCE = 0.15;
export const FIRST_BATCH_SIZE = 50;
