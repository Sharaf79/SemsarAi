/**
 * Conversations service — Prisma-based CRUD replacing Supabase.
 * Ported from Python src/services/supabase_service.py (conversation methods).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Conversation, FlowState, Intent } from '@prisma/client';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getByWhatsappId(whatsappId: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { whatsappId },
    });
  }

  async upsert(data: {
    whatsappId: string;
    flowState: FlowState;
    currentField: string | null;
    intent: Intent | null;
    listingId: string | null;
  }): Promise<Conversation> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return this.prisma.conversation.upsert({
      where: { whatsappId: data.whatsappId },
      update: {
        flowState: data.flowState,
        currentField: data.currentField,
        intent: data.intent,
        listingId: data.listingId,
        expiresAt,
      },
      create: {
        whatsappId: data.whatsappId,
        flowState: data.flowState,
        currentField: data.currentField,
        intent: data.intent,
        listingId: data.listingId,
        expiresAt,
      },
    });
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.conversation.deleteMany({
      where: {
        expiresAt: { lt: now },
        flowState: { not: 'CONFIRMED' },
      },
    });
    return result.count;
  }
}
