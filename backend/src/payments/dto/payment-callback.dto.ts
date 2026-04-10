import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Body sent by the payment gateway on the callback.
 *
 * Currently used with mock data — when switching to Paymob, this DTO
 * will receive the real webhook fields and the `hmac` will be validated
 * against `PAYMOB_HMAC_SECRET`.
 */
export class PaymentCallbackDto {
  /** Amount paid (in EGP). Must match the stored Payment amount. */
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than zero' })
  readonly amount: number;

  /** Transaction reference from the payment provider (optional for mock). */
  @IsOptional()
  @IsString()
  readonly transactionId?: string;

  /**
   * HMAC-SHA512 signature from Paymob.
   * Ignored in mock mode — validated in production via `verifyPaymobHmac()`.
   */
  @IsOptional()
  @IsString()
  readonly hmac?: string;
}
