import { Module } from '@nestjs/common';
import { ConversationEngineService } from './conversation-engine.service';
import { ConversationEngineController } from './conversation-engine.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { NegotiationModule } from '../negotiation/negotiation.module';

@Module({
  imports: [OnboardingModule, NegotiationModule],
  controllers: [ConversationEngineController],
  providers: [ConversationEngineService],
  exports: [ConversationEngineService],
})
export class ConversationModule {}
