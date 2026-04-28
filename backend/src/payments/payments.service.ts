import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  PaymentStatus,
  PaymentType,
  PaymentProvider,
  DealStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Commission rate charged by Semsar AI */
const COMMISSION_RATE = 0.0025; // 0.25 %

/**
 * Tolerance (in EGP) when comparing callback amount to stored amount.
 * Accounts for floating-point rounding across gateway & frontend.
 */
const AMOUNT_TOLERANCE = 0.02;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── POST /payments/initiate ──────────────────────────────────

  /**
   * Initiates a commission payment for a confirmed deal.
   *
   * - Fee = 0.25 % of the deal's finalPrice
   * - Creates a PENDING Payment record
   * - Returns a mock Paymob payment URL
   */
  async initiatePayment(
    dealId: string,
    userId: string,
  ): Promise<{
    paymentId: string;
    amount: number;
    fee: number;
    currency: string;
    paymentUrl: string;
  }> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        payments: {
          where: { status: { not: PaymentStatus.FAILED } },
        },
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    if (deal.buyerId !== userId) {
      throw new ForbiddenException(
        'Only the buyer of this deal can initiate payment',
      );
    }

    // Idempotency: if a COMPLETED payment already exists, surface it
    const completed = deal.payments.find(
      (p) => p.status === PaymentStatus.COMPLETED,
    );
    if (completed) {
      throw new ConflictException('Payment for this deal is already completed');
    }

    // Reuse an existing PENDING payment rather than creating duplicates
    const pending = deal.payments.find(
      (p) => p.status === PaymentStatus.PENDING,
    );
    if (pending) {
      return this.buildPaymentResponse(pending.id, Number(pending.fee), Number(pending.amount));
    }

    const feeAmount = Number(deal.finalPrice) * COMMISSION_RATE;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        dealId,
        type: PaymentType.COMMISSION,
        amount: Number(deal.finalPrice),
        fee: feeAmount,
        provider: PaymentProvider.MOCK,
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(
      `Payment initiated — id=${payment.id} fee=${feeAmount} EGP for deal=${dealId}`,
    );

    return this.buildPaymentResponse(payment.id, feeAmount, Number(deal.finalPrice));
  }

  // ─── POST /payments/initiate-deposit ──────────────────────────

  /**
   * Initiates a fixed 100 EGP DEPOSIT payment for a deal — used by the
   * negotiation flow to unlock the owner's contact details after a deal is
   * agreed (either via auto-accept or seller approval).
   *
   * Same idempotency guards as initiatePayment: surfaces a pending payment
   * if one already exists, errors if a completed payment exists.
   */
  async initiateDeposit(
    dealId: string,
    userId: string,
  ): Promise<{
    paymentId: string;
    amount: number;
    fee: number;
    currency: string;
    paymentUrl: string;
  }> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        payments: {
          where: { status: { not: PaymentStatus.FAILED } },
        },
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    if (deal.buyerId !== userId) {
      throw new ForbiddenException(
        'Only the buyer of this deal can initiate a deposit',
      );
    }

    const completed = deal.payments.find(
      (p) => p.status === PaymentStatus.COMPLETED,
    );
    if (completed) {
      throw new ConflictException('Payment for this deal is already completed');
    }

    const pending = deal.payments.find(
      (p) => p.status === PaymentStatus.PENDING,
    );
    if (pending) {
      return this.buildPaymentResponse(
        pending.id,
        Number(pending.fee),
        Number(pending.amount),
      );
    }

    // Fixed 100 EGP — set both amount and fee so the callback (which compares
    // against `fee`) accepts an amount of 100.
    const DEPOSIT_AMOUNT = 100;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        dealId,
        type: PaymentType.DEPOSIT,
        amount: DEPOSIT_AMOUNT,
        fee: DEPOSIT_AMOUNT,
        provider: PaymentProvider.MOCK,
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(
      `Deposit initiated — id=${payment.id} amount=${DEPOSIT_AMOUNT} EGP for deal=${dealId}`,
    );

    return this.buildPaymentResponse(payment.id, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
  }

  // ─── POST /payments/callback/:paymentId ──────────────────────

  /**
   * Payment-gateway callback.
   *
   * Validates:
   *   1. Payment exists
   *   2. Payment is still PENDING (cannot complete FAILED or re-complete)
   *   3. Callback amount matches stored amount (tolerance ± 0.02 EGP)
   *   4. (Production) HMAC-SHA512 signature from Paymob
   *
   * Then atomically:
   *   - Marks the Payment as COMPLETED
   *   - Marks the Deal as CONFIRMED
   */
  async markCompleted(
    paymentId: string,
    callbackAmount: number,
    transactionId?: string,
    hmac?: string,
  ): Promise<{ success: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    // ── Idempotent: already completed ───────────────────────────
    if (payment.status === PaymentStatus.COMPLETED) {
      return { success: true };
    }

    // ── Reject non-PENDING states (e.g. FAILED, REFUNDED) ──────
    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException(
        `Payment ${paymentId} is ${payment.status} and cannot be completed`,
      );
    }

    // ── Amount validation (callback amount should match the fee) ──
    const storedFee = Number(payment.fee);
    if (Math.abs(callbackAmount - storedFee) > AMOUNT_TOLERANCE) {
      this.logger.warn(
        `Amount mismatch for payment ${paymentId}: expected fee ${storedFee}, got ${callbackAmount}`,
      );
      throw new BadRequestException(
        `Amount mismatch: expected ${storedFee.toFixed(2)} EGP, received ${callbackAmount.toFixed(2)} EGP`,
      );
    }

    // ── HMAC verification placeholder ───────────────────────────
    // TODO: In production, enable this:
    //   if (!this.verifyPaymobHmac(hmac, paymentId, callbackAmount)) {
    //     throw new ForbiddenException('Invalid HMAC signature');
    //   }
    if (hmac) {
      this.logger.debug(`HMAC received for payment ${paymentId} (not verified in dev mode)`);
    }

    // ── Atomic: Payment → COMPLETED + Deal → CONFIRMED ─────────
    const txnId = transactionId ?? `TXN-MOCK-${Date.now()}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.COMPLETED,
          transactionId: txnId,
        },
      });

      await tx.deal.update({
        where: { id: payment.dealId },
        data: { status: DealStatus.CONFIRMED },
      });
    });

    this.logger.log(
      `Payment completed — id=${paymentId} txn=${txnId} fee=${storedFee} EGP`,
    );
    return { success: true };
  }

  // ─── Query helpers ────────────────────────────────────────────

  /**
   * Check whether a COMPLETED payment exists for a given deal.
   * Optionally scoped to a specific user.
   */
  async isPaymentCompleted(
    dealId: string,
    userId?: string,
  ): Promise<boolean> {
    const where: Record<string, unknown> = {
      dealId,
      status: PaymentStatus.COMPLETED,
    };
    if (userId) where.userId = userId;

    const payment = await this.prisma.payment.findFirst({ where });
    return !!payment;
  }

  /**
   * Retrieve a single payment by ID (for status polling / receipts).
   */
  async getPayment(paymentId: string): Promise<{
    id: string;
    dealId: string;
    amount: number;
    fee: number;
    currency: string;
    status: PaymentStatus;
    transactionId: string | null;
    createdAt: Date;
  }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    return {
      id: payment.id,
      dealId: payment.dealId,
      amount: Number(payment.amount),
      fee: Number(payment.fee),
      currency: 'EGP',
      status: payment.status,
      transactionId: payment.transactionId,
      createdAt: payment.createdAt,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────

  private buildPaymentResponse(
    paymentId: string,
    fee: number,
    amount: number,
  ): {
    paymentId: string;
    amount: number;
    fee: number;
    currency: string;
    paymentUrl: string;
  } {
    // TODO: Replace with real Paymob API calls:
    //   1. POST https://accept.paymob.com/api/auth/tokens        → auth token
    //   2. POST https://accept.paymob.com/api/ecommerce/orders    → order
    //   3. POST https://accept.paymob.com/api/acceptance/payment_keys → payment key
    //   4. Redirect → https://accept.paymob.com/api/acceptance/iframes/{iframeId}?payment_token={key}
    const paymentUrl = `/payment/${paymentId}`;

    return {
      paymentId,
      amount: parseFloat(amount.toFixed(2)),
      fee: parseFloat(fee.toFixed(2)),
      currency: 'EGP',
      paymentUrl,
    };
  }

  /**
   * Verify HMAC-SHA512 from Paymob callback.
   * @see https://docs.paymob.com/docs/hmac-calculation
   *
   * Uncomment and provide `PAYMOB_HMAC_SECRET` env variable for production.
   */
  // private verifyPaymobHmac(
  //   receivedHmac: string | undefined,
  //   paymentId: string,
  //   amount: number,
  // ): boolean {
  //   if (!receivedHmac) return false;
  //   const secret = process.env.PAYMOB_HMAC_SECRET;
  //   if (!secret) {
  //     this.logger.warn('PAYMOB_HMAC_SECRET not set — skipping HMAC check');
  //     return true;
  //   }
  //   const crypto = require('crypto');
  //   const data = `${amount.toFixed(2)}${paymentId}`;
  //   const computed = crypto
  //     .createHmac('sha512', secret)
  //     .update(data)
  //     .digest('hex');
  //   return crypto.timingSafeEqual(
  //     Buffer.from(computed, 'hex'),
  //     Buffer.from(receivedHmac, 'hex'),
  //   );
  // }
}
