import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RequestsService } from './requests.service';
import { MatchingEngineService } from './matching-engine.service';
import { QueryBuilderService } from './query-builder.service';
import { ScorerService } from './scorer.service';
import {
  RequestsController,
  MatchesController,
  InterestedRequestsController,
} from './requests.controller';
import { InternalController, InternalSecretGuard } from './internal.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    RequestsController,
    MatchesController,
    InterestedRequestsController,
    InternalController,
  ],
  providers: [
    RequestsService,
    MatchingEngineService,
    QueryBuilderService,
    ScorerService,
    InternalSecretGuard,
  ],
  exports: [RequestsService, MatchingEngineService],
})
export class RequestsModule {}
