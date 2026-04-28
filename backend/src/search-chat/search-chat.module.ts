import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { AuthModule } from '../auth/auth.module';
import { SearchChatService } from './search-chat.service';
import { SearchChatController } from './search-chat.controller';

@Module({
  imports: [PrismaModule, LlmModule, forwardRef(() => AuthModule)],
  controllers: [SearchChatController],
  providers: [SearchChatService],
  exports: [SearchChatService],
})
export class SearchChatModule {}
