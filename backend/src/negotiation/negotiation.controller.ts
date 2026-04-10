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
import { StartNegotiationDto, HandleActionDto } from './dto';
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
