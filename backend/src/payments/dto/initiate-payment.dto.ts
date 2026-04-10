import { IsUUID, IsNotEmpty } from 'class-validator';

export class InitiatePaymentDto {
  @IsUUID('4', { message: 'dealId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'dealId is required' })
  readonly dealId: string;
}
