/**
 * NotificationsService — CRUD + WhatsApp dispatch for in-app notifications.
 *
 * Spec ref: spec_negotiation_4.md §3.2
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { NotificationType, NotificationChannel, Prisma } from '@prisma/client';
import {
  WHATSAPP_TEMPLATES,
  NOTIFICATION_TITLES,
  NOTIFICATION_BODIES,
  buildDeepLink,
  type TemplateVars,
} from './constants/templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsapp: WhatsAppService,
  ) {}

  /**
   * Create notification rows for both buyer and seller.
   * Accepts an optional `tx` so callers can include the create inside their
   * own transaction. Wrapped in try/catch — failure must not abort the
   * surrounding transaction.
   */
  async createForBoth(args: {
    negotiationId: string;
    buyerId: string;
    sellerId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
    propertyTitle?: string;
    price?: string;
    escalationToken?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<{
    buyerNotificationId: string | null;
    sellerNotificationId: string | null;
  }> {
    const db = args.tx ?? this.prisma;

    const buyerLink = buildDeepLink({
      notificationId: 'placeholder', // will be set after insert
      negotiationId: args.negotiationId,
      role: 'buyer',
    });

    const sellerLink = buildDeepLink({
      notificationId: 'placeholder',
      negotiationId: args.negotiationId,
      role: 'seller',
      escalationToken: args.escalationToken,
    });

    const vars: TemplateVars = {
      price: args.price,
      title: args.propertyTitle,
      link: '', // placeholder, replaced per-notification
    };

    const titleFn = NOTIFICATION_TITLES[args.type];
    const bodyFn = NOTIFICATION_BODIES[args.type];

    try {
      // Create buyer notification
      const buyerNotif = await db.notification.create({
        data: {
          userId: args.buyerId,
          type: args.type,
          title: titleFn({ ...vars, link: buyerLink }),
          body: bodyFn({ ...vars, link: buyerLink }),
          payload: { ...args.payload, role: 'buyer' } as Prisma.InputJsonValue,
          link: buyerLink,
          channel: NotificationChannel.BOTH,
        },
      });

      // Create seller notification
      const sellerNotif = await db.notification.create({
        data: {
          userId: args.sellerId,
          type: args.type,
          title: titleFn({ ...vars, link: sellerLink }),
          body: bodyFn({ ...vars, link: sellerLink }),
          payload: { ...args.payload, role: 'seller' } as Prisma.InputJsonValue,
          link: sellerLink,
          channel: NotificationChannel.BOTH,
        },
      });

      return {
        buyerNotificationId: buyerNotif.id,
        sellerNotificationId: sellerNotif.id,
      };
    } catch (err) {
      this.logger.error(`createForBoth failed: ${(err as Error).message}`);
      return { buyerNotificationId: null, sellerNotificationId: null };
    }
  }

  /**
   * Create a single notification for one user.
   */
  async createForUser(args: {
    userId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
    propertyTitle?: string;
    price?: string;
    negotiationId: string;
    role: 'buyer' | 'seller';
    escalationToken?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<string | null> {
    const db = args.tx ?? this.prisma;

    const link = buildDeepLink({
      notificationId: 'placeholder',
      negotiationId: args.negotiationId,
      role: args.role,
      escalationToken: args.escalationToken,
    });

    const vars: TemplateVars = {
      price: args.price,
      title: args.propertyTitle,
      link,
    };

    const titleFn = NOTIFICATION_TITLES[args.type];
    const bodyFn = NOTIFICATION_BODIES[args.type];

    try {
      const notif = await db.notification.create({
        data: {
          userId: args.userId,
          type: args.type,
          title: titleFn(vars),
          body: bodyFn(vars),
          payload: { ...args.payload, role: args.role } as Prisma.InputJsonValue,
          link,
          channel: NotificationChannel.BOTH,
        },
      });
      return notif.id;
    } catch (err) {
      this.logger.error(`createForUser failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * List notifications for a user (newest first).
   */
  async listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number },
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts?.unreadOnly === true && { isRead: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 50,
    });
  }

  /**
   * Get a single notification (ownership checked by caller).
   */
  async findById(notificationId: string, userId: string) {
    return this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
  }

  /**
   * Mark a single notification as read.
   */
  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const notif = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notif) return false;

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
    return true;
  }

  /**
   * Mark all unread notifications as read for a user.
   */
  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Get unread notification count for a user (drives the bell badge).
   */
  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Send a WhatsApp message for a notification.
   * Skips if user has opted out. Records success/failure on the row.
   */
  async sendWhatsApp(notificationId: string): Promise<void> {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: true },
    });

    if (!notif) {
      this.logger.warn(`sendWhatsApp: notification ${notificationId} not found`);
      return;
    }

    // Skip if user opted out
    if (notif.user.whatsappOptOut) {
      this.logger.log(`sendWhatsApp: user ${notif.userId} opted out — skipping`);
      return;
    }

    const phone = notif.user.phone;
    if (!phone) {
      this.logger.warn(`sendWhatsApp: user ${notif.userId} has no phone`);
      return;
    }

    const templateFn = WHATSAPP_TEMPLATES[notif.type];
    if (!templateFn) {
      this.logger.warn(`sendWhatsApp: no template for type ${notif.type}`);
      return;
    }

    const payload = notif.payload as Record<string, unknown> ?? {};
    const vars: TemplateVars = {
      price: payload.price as string | undefined,
      title: payload.title as string | undefined,
      link: notif.link.startsWith('/') ? `${process.env.PUBLIC_FRONTEND_URL ?? 'http://localhost:5174'}${notif.link}` : notif.link,
    };

    const body = templateFn(vars);

    try {
      await this.whatsapp.sendTextMessage(phone, body);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { whatsappSent: true },
      });
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`sendWhatsApp failed for ${notificationId}: ${errorMsg}`);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { whatsappSent: false, whatsappError: errorMsg },
      });
    }
  }
}
