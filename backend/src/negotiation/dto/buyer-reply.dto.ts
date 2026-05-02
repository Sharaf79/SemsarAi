import { IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, IsPositive, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export const VALID_BUYER_REPLY_TYPES = ['accept', 'reject', 'counter', 'opinion'] as const;
export type BuyerReplyType = (typeof VALID_BUYER_REPLY_TYPES)[number];

export class NegotiationBuyerReplyDto {
  @IsEnum(VALID_BUYER_REPLY_TYPES, {
    message: `responseType must be one of: ${VALID_BUYER_REPLY_TYPES.join(', ')}`,
  })
  readonly responseType: BuyerReplyType;

  @ValidateIf((o) => o.responseType === 'counter')
  @IsNumber()
  @Type(() => Number)
  @IsPositive({ message: 'counterAmount must be a positive number' })
  readonly counterAmount?: number;

  @ValidateIf((o) => o.responseType === 'opinion')
  @IsString()
  @IsNotEmpty({ message: 'comment is required when responseType is opinion' })
  readonly comment?: string;
}
