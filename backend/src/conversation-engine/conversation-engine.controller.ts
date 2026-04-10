import { Controller, Post, Body } from '@nestjs/common';
import { ConversationEngineService } from './conversation-engine.service';
import { ConversationChannel, ActiveFlow, ConversationContext } from '../common';

@Controller('conversation')
export class ConversationEngineController {
  constructor(
    private readonly conversationEngine: ConversationEngineService,
  ) {}

  @Post('message')
  async sendMessage(
    @Body() body: {
      userId: string;
      flow: ActiveFlow;
      entityId: string;
      message: string;
      channel?: ConversationChannel;
    },
  ) {
    const context: ConversationContext = {
      userId: body.userId,
      channel: body.channel ?? 'app',
      activeFlow: body.flow,
      entityId: body.entityId,
    };

    return this.conversationEngine.processMessage(context, body.message);
  }
}
