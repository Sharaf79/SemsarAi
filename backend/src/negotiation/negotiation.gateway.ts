import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  phone?: string;
}

/**
 * NegotiationGateway — real-time WebSocket gateway for negotiation rooms.
 *
 * Namespace: /negotiations
 * Room per negotiation: neg:<negotiationId>
 *
 * Auth: JWT token passed as handshake `auth.token`.
 * Rate limit: 6 messages/min, 1 typing event/sec.
 */
@WebSocketGateway({
  namespace: '/negotiations',
  cors: { origin: true, credentials: true },
})
export class NegotiationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NegotiationGateway.name);

  /** Rate limit tracking: socketId → { lastMessage, messageCount, lastTyping } */
  private readonly rateLimits = new Map<
    string,
    { messageCount: number; windowStart: number; lastTyping: number }
  >();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── T09: JWT Handshake Auth ─────────────────────────────────

  async handleConnection(client: AuthenticatedSocket) {
    const token =
      client.handshake.auth?.token ??
      client.handshake.headers?.['authorization']?.replace('Bearer ', '') ??
      (client.handshake.query?.token as string | undefined);

    if (!token) {
      this.logger.warn(`Client ${client.id} rejected — no token`);
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.phone = payload.phone;
      this.rateLimits.set(client.id, {
        messageCount: 0,
        windowStart: Date.now(),
        lastTyping: 0,
      });
      this.logger.log(`Client ${client.id} authenticated as user ${payload.sub}`);
    } catch {
      this.logger.warn(`Client ${client.id} rejected — invalid token`);
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.rateLimits.delete(client.id);
    this.logger.log(`Client ${client.id} disconnected`);
  }

  // ─── T10: Join Handler ───────────────────────────────────────

  @SubscribeMessage('join')
  async onJoin(
    @MessageBody() data: { negotiationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.userId;
    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: data.negotiationId },
      select: { buyerId: true, sellerId: true },
    });

    if (!negotiation) {
      client.emit('error', { message: 'Negotiation not found' });
      return;
    }

    if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
      client.emit('error', { message: 'Not authorized for this negotiation' });
      return;
    }

    const room = `neg:${data.negotiationId}`;
    await client.join(room);

    const viewerRole =
      negotiation.buyerId === userId ? 'BUYER' : 'SELLER';

    const messages = await this.prisma.negotiationMessage.findMany({
      where: { negotiationId: data.negotiationId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    client.emit('joined', {
      negotiationId: data.negotiationId,
      viewerRole,
      history: messages,
    });

    this.logger.log(
      `Client ${client.id} (${viewerRole}) joined room ${room}`,
    );
  }

  // ─── T11: Typing + Read Handlers ─────────────────────────────

  @SubscribeMessage('typing')
  onTyping(
    @MessageBody() data: { negotiationId: string; isTyping: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.userId;
    if (!userId) return;
    if (!client.rooms.has(`neg:${data.negotiationId}`)) return;

    const limits = this.rateLimits.get(client.id);
    if (limits) {
      const now = Date.now();
      if (now - limits.lastTyping < 1000) {
        return;
      }
      limits.lastTyping = now;
    }

    const room = `neg:${data.negotiationId}`;
    client.to(room).emit('typing', { userId, isTyping: data.isTyping });
  }

  @SubscribeMessage('read')
  async onRead(
    @MessageBody() data: { negotiationId: string; messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.userId;
    if (!userId) return;
    if (!client.rooms.has(`neg:${data.negotiationId}`)) return;

    const negotiation = await this.prisma.negotiation.findUnique({
      where: { id: data.negotiationId },
      select: { buyerId: true, sellerId: true },
    });
    if (!negotiation) return;
    if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
      return;
    }

    const isBuyer = negotiation.buyerId === userId;
    const updateField = isBuyer ? 'readByBuyerAt' : 'readBySellerAt';

    // updateMany scoped to negotiationId — no-op if message isn't in this thread.
    const result = await this.prisma.negotiationMessage.updateMany({
      where: { id: data.messageId, negotiationId: data.negotiationId },
      data: { [updateField]: new Date() },
    });
    if (result.count === 0) return;

    const room = `neg:${data.negotiationId}`;
    client.to(room).emit('read', { messageId: data.messageId, userId });
  }

  // ─── Internal helpers — called by NegotiationService ─────────

  /**
   * Emit a new message to all sockets in a negotiation room.
   */
  emitMessage(negotiationId: string, message: unknown) {
    this.server.to(`neg:${negotiationId}`).emit('message', message);
  }

  /**
   * Emit AI thinking state to all sockets in a negotiation room.
   */
  emitAiThinking(negotiationId: string, isThinking: boolean) {
    this.server
      .to(`neg:${negotiationId}`)
      .emit('ai_thinking', { isThinking });
  }

  /**
   * Check message rate limit for a socket.
   * Returns true if the message should be allowed.
   */
  checkMessageRateLimit(socketId: string): boolean {
    const limits = this.rateLimits.get(socketId);
    if (!limits) return false;

    const now = Date.now();
    // Reset window every 60 seconds
    if (now - limits.windowStart > 60_000) {
      limits.messageCount = 0;
      limits.windowStart = now;
    }

    limits.messageCount++;
    return limits.messageCount <= 6; // max 6 messages per minute
  }
}
