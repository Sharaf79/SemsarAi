import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto, PaymentCallbackDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── POST /payments/initiate ──────────────────────────────────

  /**
   * Create a PENDING payment for a deal.
   * Fee = 0.25% of the deal's final price.
   * Returns a Paymob payment URL (mock-ready, swap in real keys to go live).
   */
  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async initiatePayment(
    @Body() dto: InitiatePaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.debug(
      `POST /payments/initiate — deal=${dto.dealId} user=${user.sub}`,
    );
    return this.paymentsService.initiatePayment(dto.dealId, user.sub);
  }

  // ─── POST /payments/callback/:paymentId ──────────────────────

  /**
   * Payment gateway callback endpoint.
   *
   * Validates:
   *   - Payment exists and is PENDING
   *   - Callback amount matches stored amount (tolerance ± 0.02 EGP)
   *
   * Then atomically marks Payment → COMPLETED and Deal → CONFIRMED.
   *
   * ⚠️  In production, add Paymob HMAC-SHA512 verification via the `hmac`
   *     field in the callback body before exposing publicly.
   */
  @Post('callback/:paymentId')
  @HttpCode(HttpStatus.OK)
  async paymentCallback(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' }))
    paymentId: string,
    @Body() dto: PaymentCallbackDto,
  ) {
    this.logger.debug(
      `POST /payments/callback/${paymentId} — amount=${dto.amount}`,
    );
    return this.paymentsService.markCompleted(
      paymentId,
      dto.amount,
      dto.transactionId,
      dto.hmac,
    );
  }

  // ─── GET /payments/:paymentId ────────────────────────────────

  /**
   * Retrieve a single payment by ID.
   * Used for status polling after redirect back from payment gateway,
   * or to show receipt info.
   */
  @Get(':paymentId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getPayment(
    @Param('paymentId', new ParseUUIDPipe({ version: '4' }))
    paymentId: string,
  ) {
    return this.paymentsService.getPayment(paymentId);
  }
}
