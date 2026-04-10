import {
  IsOptional,
  IsNumber,
  IsPositive,
  IsString,
  IsEnum,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyType, PropertyKind } from '@prisma/client';

export { PropertyType, PropertyKind };

export enum SortOption {
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NEWEST = 'newest',
}

export class QueryPropertiesDto {
  @IsOptional()
  @IsNumber({}, { message: 'minPrice must be a number' })
  @IsPositive({ message: 'minPrice must be positive' })
  @Type(() => Number)
  readonly minPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'maxPrice must be a number' })
  @IsPositive({ message: 'maxPrice must be positive' })
  @Type(() => Number)
  readonly maxPrice?: number;

  @IsOptional()
  @IsString()
  readonly city?: string;

  @IsOptional()
  @IsString()
  readonly governorate?: string;

  @IsOptional()
  @IsString()
  readonly district?: string;

  @IsOptional()
  @IsEnum(PropertyType, {
    message: `propertyType must be one of: ${Object.values(PropertyType).join(', ')}`,
  })
  readonly propertyType?: PropertyType;

  @IsOptional()
  @IsEnum(PropertyKind, {
    message: `propertyKind must be one of: ${Object.values(PropertyKind).join(', ')}`,
  })
  readonly propertyKind?: PropertyKind;

  @IsOptional()
  @IsInt({ message: 'bedrooms must be an integer' })
  @Min(0)
  @Type(() => Number)
  readonly bedrooms?: number;

  @IsOptional()
  @IsEnum(SortOption, {
    message: `sort must be one of: ${Object.values(SortOption).join(', ')}`,
  })
  readonly sort?: SortOption;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'page must be at least 1' })
  @Type(() => Number)
  readonly page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100, { message: 'limit cannot exceed 100' })
  @Type(() => Number)
  readonly limit?: number = 20;
}
