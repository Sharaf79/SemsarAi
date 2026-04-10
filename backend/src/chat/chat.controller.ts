import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { ConversationResponse } from '../common/types';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

interface RequestWithOptionalUser extends Request {
  user?: JwtPayload;
}

/**
 * Frontend chat endpoint.
 *
 * POST /chat/message
 *
 * Supports both authenticated users (JWT in Authorization header) and
 * anonymous visitors (UUID in `dto.userId`, stored client-side in
 * localStorage as 'semsar_anon_id').
 *
 * Priority for resolving userId:
 *   1. JWT `sub` claim (authenticated)
 *   2. `dto.userId` (anonymous)
 *   3. 400 Bad Request
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @UseGuards(OptionalJwtAuthGuard)
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Request() req: RequestWithOptionalUser,
  ): Promise<ConversationResponse> {
    // Resolve userId — JWT sub takes precedence over anonymous UUID.
    const userId: string | undefined = req.user?.sub ?? dto.userId;

    if (!userId) {
      throw new BadRequestException(
        'userId is required when not authenticated. ' +
          'Send your anonymous UUID in the `userId` field.',
      );
    }

    return this.chatService.processMessage(
      userId,
      dto.message,
      dto.flow,
      dto.entityId,
    );
  }
}
