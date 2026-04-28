import { Module, forwardRef } from '@nestjs/common';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';
import { NegotiationSimulatorService } from './negotiation-simulator.service';
import { InvoiceExtractorService } from './invoice-extractor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, LlmModule, forwardRef(() => AuthModule)],
  controllers: [NegotiationController],
  providers: [NegotiationService, NegotiationSimulatorService, InvoiceExtractorService],
  exports: [NegotiationService, NegotiationSimulatorService],
})
export class NegotiationModule {}
