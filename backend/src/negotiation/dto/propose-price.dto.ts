import { IsNumber, IsPositive, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ProposePriceDto {
  @IsUUID('4')
  readonly negotiationId: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  readonly proposedPrice: number;
}
