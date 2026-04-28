import { Module } from '@nestjs/common';
import { ConversationEngineService } from './conversation-engine.service';
import { ConversationEngineController } from './conversation-engine.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { NegotiationModule } from '../negotiation/negotiation.module';
import { SearchChatModule } from '../search/search-chat.module';

@Module({
  imports: [OnboardingModule, NegotiationModule, SearchChatModule],
  controllers: [ConversationEngineController],
  providers: [ConversationEngineService],
  exports: [ConversationEngineService],
})
export class ConversationModule {}
