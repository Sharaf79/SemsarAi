import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
  Query,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertyStatus } from '@prisma/client';

/**
 * Admin endpoints for property moderation.
 * In production these should be guarded by an admin role — for now, open for dev.
 */
@Controller('admin/properties')
export class AdminPropertiesController {
  private readonly logger = new Logger(AdminPropertiesController.name);

  constructor(private readonly propertiesService: PropertiesService) {}

  // ─── GET /admin/properties/pending ───────────────────────────

  /**
   * List all properties awaiting admin review.
   */
  @Get('pending')
  @HttpCode(HttpStatus.OK)
  async findPending(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.debug('GET /admin/properties/pending');
    return this.propertiesService.findByStatus(
      PropertyStatus.PENDING_REVIEW,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  // ─── PATCH /admin/properties/:id/approve ────────────────────

  /**
   * Approve a pending property — sets status to ACTIVE.
   */
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    this.logger.debug(`PATCH /admin/properties/${id}/approve`);
    const updated = await this.propertiesService.adminUpdateStatus(
      id,
      PropertyStatus.ACTIVE,
    );
    return { data: updated, message: 'تم قبول العقار بنجاح' };
  }

  // ─── PATCH /admin/properties/:id/reject ─────────────────────

  /**
   * Reject a pending property — sets status to INACTIVE.
   */
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body('reason') reason?: string,
  ) {
    this.logger.debug(`PATCH /admin/properties/${id}/reject — reason: ${reason}`);
    const updated = await this.propertiesService.adminUpdateStatus(
      id,
      PropertyStatus.INACTIVE,
    );
    return { data: updated, message: 'تم رفض العقار' };
  }
}
