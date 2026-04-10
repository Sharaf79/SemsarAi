import { Module, forwardRef } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { LocationsModule } from '../locations/locations.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';

@Module({
  imports: [LocationsModule, forwardRef(() => RecommendationsModule)],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
