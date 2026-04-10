import { IsUUID, IsNotEmpty, IsNumber, IsPositive, IsOptional } from 'class-validator';

export class StartNegotiationDto {
  @IsNotEmpty({ message: 'propertyId is required' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID v4' })
  readonly propertyId: string;

  /**
   * Optional when using JWT auth — the controller will fall back to
   * the authenticated user's ID.  Required when calling without auth
   * (e.g. legacy WhatsApp flow or unit tests).
   */
  @IsOptional()
  @IsUUID('4', { message: 'buyerId must be a valid UUID v4' })
  readonly buyerId?: string;

  @IsNotEmpty({ message: 'buyerMaxPrice is required' })
  @IsNumber({}, { message: 'buyerMaxPrice must be a number' })
  @IsPositive({ message: 'buyerMaxPrice must be a positive number' })
  readonly buyerMaxPrice: number;
}
