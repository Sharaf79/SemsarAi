import {
  Controller,
  Get,
  Param,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { QueryPropertiesDto, UpdatePropertyStatusDto, UpdatePropertyDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';

@Controller('properties')
export class PropertiesController {
  private readonly logger = new Logger(PropertiesController.name);

  constructor(private readonly propertiesService: PropertiesService) {}

  // ─── GET /properties ─────────────────────────────────────────

  /**
   * Public paginated property listing.
   * Sensitive owner data (phone, email) is never included.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: QueryPropertiesDto) {
    this.logger.debug(`GET /properties — query: ${JSON.stringify(query)}`);
    return this.propertiesService.findAll(query);
  }

  // ─── GET /properties/mine ────────────────────────────────────

  /**
   * List the current user's own properties (any status).
   * Must be declared BEFORE :id to avoid route conflict.
   */
  @Get('mine')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async findMine(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`GET /properties/mine — user=${user.sub}`);
    return this.propertiesService.findMine(user.sub);
  }

  // ─── GET /properties/:id ─────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    this.logger.debug(`GET /properties/${id}`);
    const property = await this.propertiesService.findOne(id);
    return { data: property };
  }

  // ─── PATCH /properties/:id ───────────────────────────────────

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePropertyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.debug(`PATCH /properties/${id} — user=${user.sub}`);
    const updated = await this.propertiesService.update(id, user.sub, dto);
    return { data: updated };
  }

  // ─── PATCH /properties/:id/status ────────────────────────────

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePropertyStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.debug(
      `PATCH /properties/${id}/status — status=${dto.status}, user=${user.sub}`,
    );
    const updated = await this.propertiesService.updateStatus(
      id,
      user.sub,
      dto.status,
    );
    return { data: updated };
  }

  // ─── DELETE /properties/:id ──────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.debug(`DELETE /properties/${id} — user=${user.sub}`);
    await this.propertiesService.remove(id, user.sub);
    return { message: 'تم حذف العقار بنجاح' };
  }

  // ─── GET /properties/:id/owner-contact ───────────────────────

  /**
   * Returns the owner phone number.
   * Requires a valid JWT and a COMPLETED payment for this property.
   */
  @Get(':id/owner-contact')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getOwnerContact(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.debug(
      `GET /properties/${id}/owner-contact — user=${user.sub}`,
    );
    return this.propertiesService.getOwnerContact(id, user.sub);
  }
}
