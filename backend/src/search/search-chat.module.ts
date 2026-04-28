/**
 * Search Chat Module — natural language property search flow.
 *
 * Extends the existing SearchModule by adding the SearchChatService
 * which uses the LLM provider for Arabic query understanding.
 */
import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SearchChatService } from './search-chat.service';

@Module({
  imports: [LlmModule],
  providers: [SearchChatService],
  exports: [SearchChatService],
})
export class SearchChatModule {}
