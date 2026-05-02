/**
 * DTO for notification response shape.
 */
import { NotificationType, NotificationChannel } from '@prisma/client';

export class NotificationResponseDto {
  id!: string;
  type!: NotificationType;
  title!: string;
  body!: string;
  link!: string;
  isRead!: boolean;
  channel!: NotificationChannel;
  createdAt!: Date;
  readAt?: Date | null;
}
