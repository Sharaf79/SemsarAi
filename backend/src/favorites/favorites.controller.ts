import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  private readonly logger = new Logger(FavoritesController.name);

  constructor(private readonly favoritesService: FavoritesService) {}

  // ─── POST /favorites/:propertyId ─────────────────────────────

  @Post(':propertyId')
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Param('propertyId', new ParseUUIDPipe({ version: '4' }))
    propertyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.debug(
      `POST /favorites/${propertyId} — user=${user.sub}`,
    );
    await this.favoritesService.add(user.sub, propertyId);
    return { message: 'تمت الإضافة للمفضّلة' };
  }

  // ─── DELETE /favorites/:propertyId ───────────────────────────

  @Delete(':propertyId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('propertyId', new ParseUUIDPipe({ version: '4' }))
    propertyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.debug(
      `DELETE /favorites/${propertyId} — user=${user.sub}`,
    );
    await this.favoritesService.remove(user.sub, propertyId);
    return { message: 'تمت الإزالة من المفضّلة' };
  }

  // ─── GET /favorites ──────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`GET /favorites — user=${user.sub}`);
    return this.favoritesService.findAll(user.sub);
  }

  // ─── GET /favorites/ids ──────────────────────────────────────

  @Get('ids')
  @HttpCode(HttpStatus.OK)
  async findIds(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`GET /favorites/ids — user=${user.sub}`);
    const ids = await this.favoritesService.findIds(user.sub);
    return { data: ids };
  }
}
