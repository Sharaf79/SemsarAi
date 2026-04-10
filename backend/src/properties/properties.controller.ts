import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { QueryPropertiesDto } from './dto';
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
