import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsPositive,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyKind } from '@prisma/client';

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  adTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adDescription?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  bedrooms?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  bathrooms?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  areaM2?: number;

  @IsOptional()
  @IsString()
  governorate?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsBoolean()
  isNegotiable?: boolean;

  @IsOptional()
  @IsEnum(PropertyKind)
  propertyKind?: PropertyKind;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  maxPrice?: number;
}
