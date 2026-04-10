import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaModule } from './prisma/prisma.module';
import { GeminiModule } from './gemini/gemini.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ListingsModule } from './listings/listings.module';
import { SearchModule } from './search/search.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { NegotiationModule } from './negotiation/negotiation.module';
import { LocationsModule } from './locations/locations.module';
import { AuthModule } from './auth/auth.module';
import { PropertiesModule } from './properties/properties.module';
import { PaymentsModule } from './payments/payments.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvironmentVariables } from './config';
import { ConversationModule } from './conversation-engine/conversation-engine.module';
import { ChatModule } from './chat/chat.module';
import { RecommendationsModule } from './recommendations/recommendations.module';

function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.toString()}`);
  }
  return validated;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: process.env['NODE_ENV'] === 'production',
      validate,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    GeminiModule,
    ConversationsModule,
    ListingsModule,
    SearchModule,
    CleanupModule,
    WhatsAppModule,
    OnboardingModule,
    NegotiationModule,
    LocationsModule,
    AuthModule,
    PropertiesModule,
    PaymentsModule,
    ConversationModule,
    ChatModule,
    RecommendationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
