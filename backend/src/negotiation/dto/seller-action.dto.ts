import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export type SellerActionKind = 'ACCEPT' | 'REJECT' | 'COUNTER';

export class SellerActionDto {
  @IsIn(['ACCEPT', 'REJECT', 'COUNTER'])
  readonly action: SellerActionKind;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  readonly counterPrice?: number;
}
