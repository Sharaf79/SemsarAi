import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
} from 'class-validator';

export class SendMessageDto {
  /** The user's message text */
  @IsString()
  @IsNotEmpty()
  message!: string;

  /**
   * Anonymous user UUID — used when the request is not authenticated.
   * The frontend stores this in localStorage('semsar_anon_id').
   */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /**
   * Optional explicit flow override (advanced use).
   * When omitted the service auto-detects the active flow from the DB.
   */
  @IsOptional()
  @IsIn(['onboarding', 'negotiation'])
  flow?: 'onboarding' | 'negotiation';

  /**
   * Optional entity UUID (draft ID or negotiation ID).
   * Required when `flow` is 'negotiation' and is provided explicitly.
   */
  @IsOptional()
  @IsUUID()
  entityId?: string;
}
