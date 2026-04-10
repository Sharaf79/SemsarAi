import { IsUUID, IsNotEmpty, IsEnum, IsDefined } from 'class-validator';
import { OnboardingStep } from '@prisma/client';

export class AnswerDto {
  @IsNotEmpty({ message: 'userId is required' })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  readonly userId: string;

  /**
   * The onboarding step being answered.
   * Must match the draft's `currentStep` — submitting the wrong step returns 400.
   */
  @IsNotEmpty({ message: 'step is required' })
  @IsEnum(OnboardingStep, {
    message: `step must be one of: ${Object.values(OnboardingStep).join(', ')}`,
  })
  readonly step: OnboardingStep;

  /**
   * The user's answer. Shape varies by step:
   *
   *   PROPERTY_TYPE / LISTING_TYPE  → string  (Arabic label, e.g. "شقة" / "بيع")
   *   GOVERNORATE / CITY / DISTRICT → { id: number }
   *   DETAILS                       → { area_m2: number; bedrooms?: number; bathrooms?: number }
   *   PRICE                         → number
   *   MEDIA                         → null  (skip)
   */
  @IsDefined({ message: 'answer is required (pass null to skip optional steps)' })
  readonly answer: unknown;
}

/** @deprecated Use AnswerDto instead */
export { AnswerDto as SubmitAnswerDto };
