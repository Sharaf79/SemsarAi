import { IsUUID, IsNotEmpty, IsEnum } from 'class-validator';
import { OnboardingStep } from '@prisma/client';

export class EditFieldDto {
  @IsNotEmpty({ message: 'userId is required' })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  readonly userId: string;

  @IsNotEmpty({ message: 'step is required' })
  @IsEnum(OnboardingStep, {
    message: `step must be one of: ${Object.values(OnboardingStep).join(', ')}`,
  })
  readonly step: OnboardingStep;
}
