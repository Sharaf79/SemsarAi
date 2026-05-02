import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SellerChatService } from './seller-chat.service';
import { SellerChatDto } from './dto/seller-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';

@Controller('negotiations')
export class SellerChatController {
  constructor(private readonly sellerChat: SellerChatService) {}

  /**
   * POST /negotiations/:id/seller-chat
   *
   * Seller-side Gemma chat. The seller sends a free-text message, Gemma
   * replies conversationally, and the backend classifies intent to
   * optionally relay to the negotiation engine.
   */
  @Post(':id/seller-chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async chat(
    @Param('id', ParseUUIDPipe) negotiationId: string,
    @Body() dto: SellerChatDto,
    @Request() req: { user: JwtPayload },
  ) {
    const sellerId = req.user.sub;

    const result = await this.sellerChat.chat(
      negotiationId,
      sellerId,
      dto.history,
      dto.userMessage,
    );

    return {
      success: true,
      data: result,
    };
  }
}
