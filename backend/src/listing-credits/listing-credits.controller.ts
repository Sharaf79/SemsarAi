import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ListingCreditsService } from './listing-credits.service';

@Controller('listing-credits')
export class ListingCreditsController {
  private readonly logger = new Logger(ListingCreditsController.name);

  constructor(private readonly service: ListingCreditsService) {}

  /**
   * POST /listing-credits/initiate
   * Creates (or returns existing) PENDING 100 EGP listing credit.
   * Requires JWT authentication.
   */
  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async initiate(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`POST /listing-credits/initiate — user=${user.sub}`);
    return this.service.initiate(user.sub);
  }

  /**
   * POST /listing-credits/complete/:creditId
   * Confirms payment — marks the credit as COMPLETED.
   * No auth guard (called from payment redirect page).
   */
  @Post('complete/:creditId')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('creditId', new ParseUUIDPipe({ version: '4' })) creditId: string,
  ) {
    this.logger.debug(`POST /listing-credits/complete/${creditId}`);
    await this.service.complete(creditId);
    return { success: true };
  }

  /**
   * GET /listing-credits/status
   * Returns whether the authenticated user has an unused paid credit.
   * Requires JWT authentication.
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`GET /listing-credits/status — user=${user.sub}`);
    return this.service.getStatus(user.sub);
  }
}
