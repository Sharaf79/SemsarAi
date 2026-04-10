import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversation-engine/conversation-engine.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    /** Provides ConversationEngineService (the flow dispatcher) */
    ConversationModule,
    /** Provides OnboardingService.startOrResumeDraft() */
    OnboardingModule,
    /** Provides OptionalJwtAuthGuard + JwtModule for token verification */
    AuthModule,
    /** Provides RecommendationsService for unseen property suggestions */
    RecommendationsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
