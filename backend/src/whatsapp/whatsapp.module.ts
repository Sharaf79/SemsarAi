import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppOrchestratorService } from './whatsapp-orchestrator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationModule } from '../conversation-engine/conversation-engine.module';

@Module({
  imports: [PrismaModule, ConversationModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppOrchestratorService],
  exports: [WhatsAppService, WhatsAppOrchestratorService],
})
export class WhatsAppModule {}
