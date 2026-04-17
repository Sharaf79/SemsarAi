import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PropertyKind, PropertyType, RequestUrgency } from '@prisma/client';

export class CreateRequestDto {
  @IsEnum(PropertyType)
  intent!: PropertyType;

  @IsOptional()
  @IsEnum(PropertyKind)
  propertyKind?: PropertyKind;

  @IsOptional()
  @IsString()
  apartmentType?: string;

  // Budget
  @IsOptional()
  @IsNumberString()
  minPrice?: string;

  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @IsOptional()
  @IsString()
  paymentPreference?: string;

  @IsOptional()
  @IsString()
  rentRateType?: string;

  // Size ranges
  @IsOptional()
  @IsInt()
  @Min(0)
  minBedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minBathrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBathrooms?: number;

  @IsOptional()
  @IsNumberString()
  minAreaM2?: string;

  @IsOptional()
  @IsNumberString()
  maxAreaM2?: string;

  // Geo
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  locationIds?: number[];

  @IsOptional()
  @IsLatitude()
  centerLatitude?: number;

  @IsOptional()
  @IsLongitude()
  centerLongitude?: number;

  @IsOptional()
  @IsNumberString()
  searchRadiusKm?: string;

  // Features
  @IsOptional()
  @IsBoolean()
  isFurnished?: boolean;

  @IsOptional()
  @IsString()
  finishingType?: string;

  @IsOptional()
  @IsString()
  floorLevel?: string;

  @IsOptional()
  @IsString()
  readiness?: string;

  @IsOptional()
  @IsString()
  ownershipType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredAmenities?: string[];

  // Lifecycle
  @IsOptional()
  @IsEnum(RequestUrgency)
  urgency?: RequestUrgency;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
