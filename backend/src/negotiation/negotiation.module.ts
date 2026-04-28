import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';
import { GemmaClient } from './gemma.client';
import { PrismaModule } from '../prisma/prisma.module';
import { GeminiModule } from '../gemini/gemini.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    GeminiModule,
    forwardRef(() => AuthModule),
    forwardRef(() => WhatsAppModule),
    PaymentsModule,
  ],
  controllers: [NegotiationController],
  providers: [NegotiationService, GemmaClient],
  exports: [NegotiationService],
})
export class NegotiationModule {}
