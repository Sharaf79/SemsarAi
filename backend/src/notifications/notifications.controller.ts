/**
 * NotificationsController — 5 REST endpoints for the notification center.
 *
 * Spec ref: spec_negotiation_4.md §5.1
 * Auth: all endpoints require JWT; ownership is enforced.
 */
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQuery } from './dto/list-notifications.query';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /notifications
   * List notifications for the logged-in user (newest first).
   */
  @Get()
  async list(
    @Request() req: { user: JwtPayload },
    @Query() query: ListNotificationsQuery,
  ) {
    const userId = req.user.sub;
    const unreadOnly = query.unreadOnly === 'true';
    return this.notificationsService.listForUser(userId, {
      unreadOnly,
      limit: query.limit,
    });
  }

  /**
   * GET /notifications/unread-count
   * Returns { count } — drives the bell badge.
   *
   * NOTE: declared BEFORE the `:id` dynamic route so Nest matches the
   * static path first.
   */
  @Get('unread-count')
  async unreadCount(@Request() req: { user: JwtPayload }) {
    const userId = req.user.sub;
    const count = await this.notificationsService.unreadCount(userId);
    return { count };
  }

  /**
   * POST /notifications/read-all
   * Mark all unread as read. Static path declared before dynamic ones.
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Request() req: { user: JwtPayload }) {
    const userId = req.user.sub;
    const count = await this.notificationsService.markAllRead(userId);
    return { success: true, count };
  }

  /**
   * GET /notifications/:id
   * Get one notification (owner-only).
   */
  @Get(':id')
  async getOne(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = req.user.sub;
    const notif = await this.notificationsService.findById(id, userId);
    if (!notif) {
      throw new NotFoundException('Notification not found');
    }
    return notif;
  }

  /**
   * POST /notifications/:id/read
   * Mark as read.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = req.user.sub;
    const ok = await this.notificationsService.markRead(userId, id);
    if (!ok) {
      throw new NotFoundException('Notification not found');
    }
    return { success: true };
  }
}
