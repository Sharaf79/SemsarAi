import { Module, forwardRef, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';
import { GemmaClient } from './gemma.client';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SellerChatController } from './seller-chat.controller';
import { SellerChatService } from './seller-chat.service';
import { NegotiationGateway } from './negotiation.gateway';

/**
 * Minimal stub that satisfies NegotiationGateway's public API
 * without opening any WebSocket connections (T27).
 */
export class NegotiationGatewayStub {
  private readonly logger = new Logger(NegotiationGatewayStub.name);

  server = null;

  constructor() {
    this.logger.log('NEGOTIATION_V2=false — gateway stub active (no Socket.IO)');
  }

  emitMessage() { /* no-op */ }
  emitAiThinking() { /* no-op */ }
  checkMessageRateLimit() { return true; }
}

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    JwtModule.register({}),
    PaymentsModule,
    forwardRef(() => WhatsAppModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [NegotiationController, SellerChatController],
  providers: [
    NegotiationService,
    GemmaClient,
    SellerChatService,
    {
      provide: NegotiationGateway,
      useFactory: (
        configService: ConfigService,
        jwtService: JwtService,
        prisma: PrismaService,
      ) => {
        const v2 = configService.get<boolean>('NEGOTIATION_V2', true);
        const logger = new Logger('NegotiationModule');
        logger.log(`NEGOTIATION_V2 feature flag = ${v2}`);
        if (!v2) {
          return new NegotiationGatewayStub();
        }
        return new NegotiationGateway(jwtService, prisma);
      },
      inject: [ConfigService, JwtService, PrismaService],
    },
  ],
  exports: [NegotiationService],
})
export class NegotiationModule {}
