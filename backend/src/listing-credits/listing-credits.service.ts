import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreditStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const LISTING_FEE_EGP = 100;

@Injectable()
export class ListingCreditsService {
  private readonly logger = new Logger(ListingCreditsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /listing-credits/initiate
   * Creates a PENDING listing credit for the user.
   * Idempotent: returns existing PENDING credit if one already exists.
   */
  async initiate(userId: string): Promise<{ creditId: string; amount: number; paymentUrl: string }> {
    // Re-use an existing PENDING credit (idempotent)
    const existing = await this.prisma.listingCredit.findFirst({
      where: { userId, status: CreditStatus.PENDING },
    });

    if (existing) {
      this.logger.log(`Reusing existing pending credit ${existing.id} for user ${userId}`);
      return {
        creditId: existing.id,
        amount: LISTING_FEE_EGP,
        paymentUrl: `/listing-payment/${existing.id}`,
      };
    }

    const credit = await this.prisma.listingCredit.create({
      data: {
        userId,
        amount: LISTING_FEE_EGP,
        status: CreditStatus.PENDING,
      },
    });

    this.logger.log(`Created listing credit ${credit.id} for user ${userId}`);
    return {
      creditId: credit.id,
      amount: LISTING_FEE_EGP,
      paymentUrl: `/listing-payment/${credit.id}`,
    };
  }

  /**
   * POST /listing-credits/complete/:creditId
   * Marks a PENDING credit as COMPLETED (called after mock payment confirmation).
   * Idempotent: silently succeeds if already COMPLETED.
   */
  async complete(creditId: string): Promise<void> {
    const credit = await this.prisma.listingCredit.findUnique({
      where: { id: creditId },
    });

    if (!credit) {
      throw new NotFoundException(`Listing credit ${creditId} not found`);
    }

    if (credit.status === CreditStatus.COMPLETED) {
      // Already completed — idempotent success
      return;
    }

    if (credit.status === CreditStatus.FAILED) {
      throw new ConflictException('This payment has already been marked as failed');
    }

    await this.prisma.listingCredit.update({
      where: { id: creditId },
      data: { status: CreditStatus.COMPLETED },
    });

    this.logger.log(`Listing credit ${creditId} marked as COMPLETED for user ${credit.userId}`);
  }

  /**
   * GET /listing-credits/status
   * Returns whether the user has an available (paid, not yet consumed) credit.
   */
  async getStatus(userId: string): Promise<{ canList: boolean; creditId?: string }> {
    const credit = await this.prisma.listingCredit.findFirst({
      where: { userId, status: CreditStatus.COMPLETED, draftId: null },
    });

    return { canList: !!credit, creditId: credit?.id };
  }
}
