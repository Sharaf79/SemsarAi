import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [ConversationsModule],
  providers: [CleanupService],
})
export class CleanupModule {}
