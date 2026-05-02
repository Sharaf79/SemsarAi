import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  HttpException,
  InternalServerErrorException,
  BadRequestException,
  UseGuards,
  Request,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NegotiationService } from './negotiation.service';
import {
  StartNegotiationDto,
  HandleActionDto,
  ChatDto,
  ProposePriceDto,
  SellerActionDto,
  NegotiationBuyerReplyDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';

@Controller('negotiations')
export class NegotiationController {
  private readonly logger = new Logger(NegotiationController.name);

  constructor(private readonly negotiationService: NegotiationService) {}

  // ─── POST /negotiations/start ──────────────────────────────

  /**
   * Start a new negotiation for a property.
   * Creates the first offer at buyerMaxPrice × 0.85.
   *
   * buyerId is taken from the JWT token when authenticated.
   * Falls back to the optional body field for legacy/test callers.
   */
  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async startNegotiation(
    @Body() dto: StartNegotiationDto,
    @Request() req: { user?: JwtPayload },
  ) {
    try {
      const buyerId = req?.user?.sub ?? dto.buyerId;

      if (!buyerId) {
        throw new BadRequestException(
          'buyerId is required — authenticate or pass buyerId in the request body',
        );
      }

      this.logger.debug(
        `POST /start — property ${dto.propertyId}, buyer ${buyerId}`,
      );

      const data = await this.negotiationService.startNegotiation(
        dto.propertyId,
        buyerId,
        dto.buyerMaxPrice,
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /start', error);
    }
  }

  // ─── GET /negotiations/:id/buyer ───────────────────────────

  @Get(':id/buyer')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getBuyerNegotiation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Request() req: { user?: JwtPayload },
  ) {
    try {
      this.logger.debug(`GET /:id/buyer — negotiation ${id}`);

      const data = await this.negotiationService.getBuyerNegotiation(
        id,
        req.user?.sub ?? '',
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('GET /:id/buyer', error);
    }
  }

  // ─── GET /negotiations/:id/seller ──────────────────────────

  @Get(':id/seller')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getSellerNegotiation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Request() req: { user?: JwtPayload },
  ) {
    try {
      this.logger.debug(`GET /:id/seller — negotiation ${id}`);

      const data = await this.negotiationService.getSellerNegotiation(
        id,
        req.user?.sub ?? '',
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('GET /:id/seller', error);
    }
  }

  // ─── POST /negotiations/:id/buyer/reply ─────────────────────

  @Post(':id/buyer/reply')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async submitBuyerReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: NegotiationBuyerReplyDto,
    @Request() req: { user?: JwtPayload },
  ) {
    try {
      this.logger.debug(`POST /:id/buyer/reply — negotiation ${id}, responseType ${dto.responseType}`);

      const data = await this.negotiationService.submitBuyerReply(
        id,
        req.user?.sub ?? '',
        dto,
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /:id/buyer/reply', error);
    }
  }

  // ─── POST /negotiations/action ─────────────────────────────

  /**
   * Handle a user action: accept | reject | request_counter.
   * Response: { success: true, data: ActionResult }
   */
  @Post('action')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async handleAction(@Body() dto: HandleActionDto) {
    try {
      this.logger.debug(
        `POST /action — negotiation ${dto.negotiationId}, action ${dto.action}`,
      );

      const data = await this.negotiationService.handleAction(
        dto.negotiationId,
        dto.action,
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /action', error);
    }
  }

  // ─── GET /negotiations/:id ─────────────────────────────────

  /**
   * Get full negotiation state: status, current round, all deals.
   * Response: { success: true, data: { negotiation, offers, deals, currentRound, maxRounds } }
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getNegotiation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    try {
      this.logger.debug(`GET /:id — negotiation ${id}`);

      const data = await this.negotiationService.getStatus(id);

      return { success: true, data };
    } catch (error) {
      this.handleError('GET /:id', error);
    }
  }

  // ─── GET /negotiations/:id/history ────────────────────────

  /**
   * Get the chronological offer history for a negotiation.
   * Response: { success: true, data: { negotiationId, offers, currentRound, maxRounds } }
   */
  @Get(':id/history')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    try {
      this.logger.debug(`GET /:id/history — negotiation ${id}`);

      const { negotiation, offers, currentRound, maxRounds } =
        await this.negotiationService.getStatus(id);

      return {
        success: true,
        data: { negotiationId: negotiation.id, offers, currentRound, maxRounds },
      };
    } catch (error) {
      this.handleError('GET /:id/history', error);
    }
  }

  // ─── POST /negotiations/chat ────────────────────────────────

  /**
   * Free-form chat with the Gemma negotiator.
   * Body: { negotiationId, userMessage, history? }
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async chat(@Body() dto: ChatDto) {
    try {
      this.logger.debug(
        `POST /chat — negotiation ${dto.negotiationId}`,
      );

      const history = (dto.history ?? []).map((h) => ({
        role: h.role as 'user' | 'assistant' | 'system',
        content: h.content,
      }));

      const data = await this.negotiationService.chatWithGemma(
        dto.negotiationId,
        history,
        dto.userMessage,
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /chat', error);
    }
  }

  // ─── GET /negotiations/:id/messages (T14) ─────────────────

  /**
   * Get messages for a negotiation with cursor-based pagination.
   * Query params: ?cursor=<messageId>&limit=50
   */
  @Get(':id/messages')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getMessages(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Request() req: { user?: JwtPayload; query?: Record<string, string> },
  ) {
    try {
      const userId = req.user?.sub ?? '';
      if (!userId) throw new BadRequestException('Not authenticated');

      // Role-agnostic membership check (buyer OR seller)
      await this.negotiationService.verifyMembership(id, userId);

      const cursor = req.query?.cursor;
      const limitRaw = req.query?.limit;
      const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

      const result = await this.negotiationService.getMessages(id, {
        cursor,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return { success: true, data: result };
    } catch (error) {
      this.handleError('GET /:id/messages', error);
    }
  }

  // ─── POST /negotiations/:id/messages (T14) ──────────────────

  /**
   * Send a text message in a negotiation.
   * Body: { body, clientId? }
   */
  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: { body: string; clientId?: string },
    @Request() req: { user?: JwtPayload },
  ) {
    try {
      const userId = req.user?.sub ?? '';
      if (!userId) throw new BadRequestException('Not authenticated');
      if (!dto?.body || !dto.body.trim()) {
        throw new BadRequestException('Message body is required');
      }

      const { role } = await this.negotiationService.verifyMembership(id, userId);

      // Rate limit: 6 messages/min per (user, negotiation)
      this.negotiationService.assertMessageRateLimit(id, userId);

      const message = await this.negotiationService.messageWriter({
        negotiationId: id,
        senderRole: role,
        senderUserId: userId,
        body: dto.body,
        kind: 'TEXT',
        clientId: dto.clientId,
      });

      return { success: true, data: message };
    } catch (error) {
      this.handleError('POST /:id/messages', error);
    }
  }

  // ─── POST /negotiations/:id/read (T14) ──────────────────────

  /**
   * Mark all messages in a negotiation as read for the current user.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async markRead(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Request() req: { user?: JwtPayload },
  ) {
    try {
      const userId = req.user?.sub ?? '';
      if (!userId) throw new BadRequestException('Not authenticated');

      await this.negotiationService.verifyMembership(id, userId);
      await this.negotiationService.markAllRead(id, userId);
      return { success: true };
    } catch (error) {
      this.handleError('POST /:id/read', error);
    }
  }

  // ─── POST /negotiations/propose-price ───────────────────────

  /**
   * Buyer proposes a concrete price. Auto-accept or escalate to seller.
   * Body: { negotiationId, proposedPrice }
   */
  @Post('propose-price')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async proposePrice(@Body() dto: ProposePriceDto) {
    try {
      this.logger.debug(
        `POST /propose-price — negotiation ${dto.negotiationId}, price ${dto.proposedPrice}`,
      );

      const data = await this.negotiationService.proposePrice(
        dto.negotiationId,
        dto.proposedPrice,
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /propose-price', error);
    }
  }

  // ─── GET /negotiations/seller-action/:token ─────────────────

  /**
   * Public endpoint — auth is via the JWT token in the URL.
   * Returns escalation details for the seller to view.
   */
  @Get('seller-action/:token')
  @HttpCode(HttpStatus.OK)
  async getSellerAction(@Param('token') token: string) {
    try {
      this.logger.debug(`GET /seller-action/:token`);
      const data = await this.negotiationService.getEscalationByToken(token);
      return { success: true, data };
    } catch (error) {
      this.handleError('GET /seller-action/:token', error);
    }
  }

  // ─── POST /negotiations/seller-action/:token ────────────────

  /**
   * Public endpoint — seller submits ACCEPT / REJECT / COUNTER.
   * Body: { action, counterPrice? }
   */
  @Post('seller-action/:token')
  @HttpCode(HttpStatus.OK)
  async submitSellerAction(
    @Param('token') token: string,
    @Body() dto: SellerActionDto,
  ) {
    try {
      this.logger.debug(
        `POST /seller-action/:token — action ${dto.action}`,
      );

      const data = await this.negotiationService.applySellerAction(
        token,
        dto.action,
        dto.counterPrice,
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /seller-action/:token', error);
    }
  }

  // ─── Private helpers ───────────────────────────────────────

  /**
   * Re-throws HttpExceptions as-is so NestJS renders the correct status.
   * Wraps anything else in InternalServerErrorException to avoid leaking
   * stack traces to the client.
   */
  private handleError(context: string, error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }
    this.logger.error(`Unhandled error in ${context}`, error);
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
