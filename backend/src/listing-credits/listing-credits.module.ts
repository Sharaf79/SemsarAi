import { Module } from '@nestjs/common';
import { ListingCreditsController } from './listing-credits.controller';
import { ListingCreditsService } from './listing-credits.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ListingCreditsController],
  providers: [ListingCreditsService],
  exports: [ListingCreditsService],
})
export class ListingCreditsModule {}
