/**
 * CleanupService — runs a periodic cron job to purge expired conversations.
 * Replaces the per-message deleteExpired() call that was in the orchestrator.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConversationsService } from '../conversations/conversations.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly conversations: ConversationsService) {}

  /**
   * Delete expired non-confirmed conversations once per hour.
   * Runs at minute 0 of every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredConversations(): Promise<void> {
    try {
      const count = await this.conversations.deleteExpired();
      if (count > 0) {
        this.logger.log(`Purged ${count} expired conversation(s).`);
      }
    } catch (e) {
      this.logger.warn(`Expired conversation cleanup failed (non-fatal): ${e}`);
    }
  }
}
