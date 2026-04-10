import { IsUUID, IsString, IsNotEmpty, Matches, ValidateIf, IsOptional, IsBoolean } from 'class-validator';

/**
 * Either `userId` (UUID v4) or `phone` (Egyptian mobile number) must be provided.
 * When both are present, `userId` takes precedence and `phone` is ignored.
 *
 * Valid phone formats accepted:
 *   01012345678           local — Vodafone
 *   01112345678           local — Etisalat/e&
 *   01212345678           local — Orange
 *   01512345678           local — WE / Telecom Egypt
 *   +201012345678         international with + prefix
 *   00201012345678        international with 00 prefix
 */
export class StartOnboardingDto {
  /**
   * UUID v4 of an existing User row.
   * Required when `phone` is not provided.
   */
  @ValidateIf((o: StartOnboardingDto) => !o.phone)
  @IsNotEmpty({ message: 'userId is required when phone is not provided' })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  readonly userId?: string;

  /**
   * Egyptian mobile number — operator prefix must be 010, 011, 012 or 015.
   * Required when `userId` is not provided.
   */
  @ValidateIf((o: StartOnboardingDto) => !o.userId)
  @IsNotEmpty({ message: 'phone is required when userId is not provided' })
  @IsString()
  @Matches(/^(\+?20|0020|0)1[0125][0-9]{8}$/, {
    message:
      'phone must be a valid Egyptian mobile number (e.g. 01012345678 or +201012345678)',
  })
  readonly phone?: string;

  /**
   * If true, abandons any existing incomplete draft and starts a fresh one.
   */
  @IsOptional()
  @IsBoolean()
  readonly restart?: boolean;
}


