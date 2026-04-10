import { Injectable, BadRequestException } from '@nestjs/common';
import { ConversationContext, ConversationResponse } from '../common';
import { OnboardingService } from '../onboarding/onboarding.service';
import { NegotiationService } from '../negotiation/negotiation.service';

@Injectable()
export class ConversationEngineService {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly negotiationService: NegotiationService,
  ) {}

  async processMessage(
    context: ConversationContext,
    input: string,
  ): Promise<ConversationResponse> {
    switch (context.activeFlow) {
      case 'onboarding':
        return this.onboardingService.handleMessage(context, input);

      case 'negotiation':
        return this.negotiationService.handleMessage(context, input);

      default:
        throw new BadRequestException('Unknown conversation flow');
    }
  }
}
