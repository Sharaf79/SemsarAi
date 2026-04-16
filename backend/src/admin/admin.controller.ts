import { Controller, Get, Post, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  /**
   * Get all properties with PENDING_REVIEW status
   * GET /admin/pending-properties
   */
  @Get('pending-properties')
  @HttpCode(HttpStatus.OK)
  async getPendingProperties() {
    this.logger.debug('GET /admin/pending-properties');
    return this.adminService.getPendingProperties();
  }

  /**
   * Get a single property by ID
   * GET /admin/properties/:id
   */
  @Get('properties/:id')
  @HttpCode(HttpStatus.OK)
  async getPropertyById(@Param('id') id: string) {
    this.logger.debug(`GET /admin/properties/${id}`);
    return this.adminService.getPropertyById(id);
  }

  /**
   * Approve a property (change status to ACTIVE)
   * POST /admin/properties/:id/approve
   */
  @Post('properties/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveProperty(@Param('id') id: string) {
    this.logger.debug(`POST /admin/properties/${id}/approve`);
    return this.adminService.approveProperty(id);
  }

  /**
   * Reject a property (change status to INACTIVE)
   * POST /admin/properties/:id/reject
   */
  @Post('properties/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectProperty(@Param('id') id: string) {
    this.logger.debug(`POST /admin/properties/${id}/reject`);
    return this.adminService.rejectProperty(id);
  }
}
