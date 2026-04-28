import { Injectable } from '@nestjs/common';
import { Prisma, Property, PropertyRequest } from '@prisma/client';
import { ScoreBreakdown, MatchReasons } from './types/request.types';

/**
 * ScorerService — pure deterministic scorer. No DB, no I/O.
 *
 * finalScore = 0.40 * locationScore + 0.30 * priceScore + 0.30 * featureScore
 */
@Injectable()
export class ScorerService {
  score(
    property: Property,
    request: PropertyRequest & { locationNames?: { governorates: string[]; cities: string[]; districts: string[] } },
  ): ScoreBreakdown {
    const reasons: MatchReasons = { matched: [], missed: [] };

    const location = this.scoreLocation(property, request, reasons);
    const price = this.scorePrice(property, request, reasons);
    const feature = this.scoreFeatures(property, request, reasons);

    const finalScore = 0.4 * location.score + 0.3 * price + 0.3 * feature;

    return {
      score: Math.round(finalScore * 100) / 100,
      priceScore: Math.round(price * 100) / 100,
      locationScore: Math.round(location.score * 100) / 100,
      featureScore: Math.round(feature * 100) / 100,
      distanceKm: location.distanceKm,
      reasons,
    };
  }

  // ─── Location ────────────────────────────────────────────────

  private scoreLocation(
    property: Property,
    request: PropertyRequest & { locationNames?: { governorates: string[]; cities: string[]; districts: string[] } },
    reasons: MatchReasons,
  ): { score: number; distanceKm?: number } {
    const names = request.locationNames ?? { governorates: [], cities: [], districts: [] };

    // Helpers — a level "matches" if the request doesn't specify it OR the property value is in the list.
    const govOk = !names.governorates.length || (!!property.governorate && names.governorates.includes(property.governorate));
    const cityOk = !names.cities.length || (!!property.city && names.cities.includes(property.city));

    // District must match AND its parent city+governorate must also match (prevents cross-city collisions
    // where different cities share the same district name, e.g. "الحي الأول" in القاهرة vs الجيزة).
    if (property.district && names.districts.includes(property.district) && cityOk && govOk) {
      reasons.matched.push('same_district');
      return { score: 100 };
    }
    if (property.city && names.cities.includes(property.city) && govOk) {
      reasons.matched.push('same_city');
      return { score: 75 };
    }
    if (property.governorate && names.governorates.includes(property.governorate)) {
      reasons.matched.push('same_governorate');
      return { score: 50 };
    }

    // Radius fallback
    if (
      request.centerLatitude &&
      request.centerLongitude &&
      request.searchRadiusKm &&
      property.latitude &&
      property.longitude
    ) {
      const d = this.haversineKm(
        this.toNum(request.centerLatitude),
        this.toNum(request.centerLongitude),
        this.toNum(property.latitude),
        this.toNum(property.longitude),
      );
      const radius = this.toNum(request.searchRadiusKm);
      if (d <= radius) {
        const score = Math.max(0, (1 - d / radius) * 100);
        reasons.matched.push(`within_${Math.round(d)}km`);
        return { score, distanceKm: Math.round(d * 100) / 100 };
      }
      reasons.missed.push('outside_radius');
      return { score: 0, distanceKm: Math.round(d * 100) / 100 };
    }

    reasons.missed.push('location_mismatch');
    return { score: 0 };
  }

  // ─── Price ──────────────────────────────────────────────────

  private scorePrice(property: Property, request: PropertyRequest, reasons: MatchReasons): number {
    if (property.price == null) {
      reasons.missed.push('price_unknown');
      return 0;
    }

    const price = this.toNum(property.price);
    const min = request.minPrice ? this.toNum(request.minPrice) : 0;
    const max = request.maxPrice ? this.toNum(request.maxPrice) : Number.POSITIVE_INFINITY;

    if (price >= min && price <= max) {
      reasons.matched.push('price_in_range');
      return 100;
    }

    // How far outside the range?
    const rangeMid = (min + (max === Number.POSITIVE_INFINITY ? min * 1.5 : max)) / 2 || price;
    const distance = price < min ? (min - price) / (min || 1) : (price - max) / (max || 1);

    if (distance <= 0.1) {
      reasons.matched.push('price_within_10pct');
      return 80;
    }
    if (distance <= 0.2) {
      reasons.matched.push('price_within_20pct');
      return 50;
    }
    if (distance <= 0.3) {
      reasons.matched.push('price_within_30pct');
      return 25;
    }

    reasons.missed.push('price_out_of_range');
    return 0;
  }

  // ─── Features ────────────────────────────────────────────────

  private scoreFeatures(property: Property, request: PropertyRequest, reasons: MatchReasons): number {
    let score = 0;

    // Bedrooms
    if (property.bedrooms != null && (request.minBedrooms != null || request.maxBedrooms != null)) {
      const min = request.minBedrooms ?? 0;
      const max = request.maxBedrooms ?? 99;
      if (property.bedrooms >= min && property.bedrooms <= max) {
        score += 30;
        reasons.matched.push('bedrooms_exact');
      } else if (property.bedrooms >= min - 1 && property.bedrooms <= max + 1) {
        score += 15;
        reasons.matched.push('bedrooms_close');
      } else {
        reasons.missed.push('bedrooms_mismatch');
      }
    }

    // Bathrooms
    if (property.bathrooms != null && (request.minBathrooms != null || request.maxBathrooms != null)) {
      const min = request.minBathrooms ?? 0;
      const max = request.maxBathrooms ?? 99;
      if (property.bathrooms >= min && property.bathrooms <= max) {
        score += 10;
        reasons.matched.push('bathrooms_exact');
      } else if (property.bathrooms >= min - 1 && property.bathrooms <= max + 1) {
        score += 5;
        reasons.matched.push('bathrooms_close');
      } else {
        reasons.missed.push('bathrooms_mismatch');
      }
    }

    // Finishing
    if (request.finishingType) {
      if (property.finishingType === request.finishingType) {
        score += 15;
        reasons.matched.push('finishing_match');
      } else {
        reasons.missed.push('finishing_mismatch');
      }
    }

    // Furnished
    if (request.isFurnished != null) {
      if (property.isFurnished === request.isFurnished) {
        score += 10;
        reasons.matched.push('furnished_match');
      } else {
        reasons.missed.push('furnished_mismatch');
      }
    }

    // Amenities
    const requested = this.asStringArray(request.preferredAmenities);
    if (requested.length > 0) {
      const have = this.asStringArray(property.amenities);
      const intersection = requested.filter((a) => have.includes(a));
      const pct = intersection.length / requested.length;
      const amenityScore = Math.min(35, pct * 35);
      score += amenityScore;
      if (intersection.length > 0) {
        reasons.matched.push(`${intersection.length}_amenities_match`);
      }
      if (intersection.length < requested.length) {
        reasons.missed.push('missing_amenities');
      }
    }

    return Math.min(100, score);
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  private toNum(v: Prisma.Decimal | number | string | null): number {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v);
    return parseFloat(v.toString());
  }

  private asStringArray(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    return [];
  }
}
