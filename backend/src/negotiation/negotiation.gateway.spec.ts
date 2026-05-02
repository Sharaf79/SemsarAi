import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { NegotiationGateway } from './negotiation.gateway';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const makePrisma = () => ({
  negotiation: {
    findUnique: jest.fn(),
  },
  negotiationMessage: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

const makeJwt = () => ({
  verify: jest.fn(),
});

interface MockSocket {
  id: string;
  handshake: {
    auth?: { token?: string };
    headers?: Record<string, string | undefined>;
    query?: Record<string, string>;
  };
  rooms: Set<string>;
  userId?: string;
  phone?: string;
  emit: jest.Mock;
  disconnect: jest.Mock;
  join: jest.Mock;
  to: jest.Mock;
}

function makeSocket(token?: string): MockSocket {
  const broadcast = { emit: jest.fn() };
  const sock: MockSocket = {
    id: 'sock-1',
    handshake: { auth: token ? { token } : {} },
    rooms: new Set(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(function (room: string) {
      sock.rooms.add(room);
      return Promise.resolve();
    }) as jest.Mock,
    to: jest.fn().mockReturnValue(broadcast),
  };
  return sock;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NegotiationGateway', () => {
  let gateway: NegotiationGateway;
  let prisma: ReturnType<typeof makePrisma>;
  let jwt: ReturnType<typeof makeJwt>;
  let mockServer: { to: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    jwt = makeJwt();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NegotiationGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    gateway = module.get<NegotiationGateway>(NegotiationGateway);

    // Stub the Socket.IO server so emitMessage / emitAiThinking don't crash.
    mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  afterEach(() => jest.clearAllMocks());

  // ── handleConnection (T09) ────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('rejects when no token is provided', async () => {
      const sock = makeSocket();
      await gateway.handleConnection(sock as never);
      expect(sock.disconnect).toHaveBeenCalledWith(true);
      expect(sock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Authentication required' }),
      );
    });

    it('rejects when token verification throws', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const sock = makeSocket('bad-token');
      await gateway.handleConnection(sock as never);
      expect(sock.disconnect).toHaveBeenCalledWith(true);
      expect(sock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Invalid or expired token' }),
      );
    });

    it('accepts a valid token and stores userId on the socket', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', phone: '+201' });
      const sock = makeSocket('good');
      await gateway.handleConnection(sock as never);
      expect(sock.userId).toBe('user-1');
      expect(sock.disconnect).not.toHaveBeenCalled();
    });
  });

  // ── onJoin (T10) ──────────────────────────────────────────────────────────

  describe('onJoin', () => {
    it('emits error when negotiation does not exist', async () => {
      prisma.negotiation.findUnique.mockResolvedValue(null);
      const sock = makeSocket();
      sock.userId = 'user-1';
      await gateway.onJoin({ negotiationId: 'neg-1' }, sock as never);
      expect(sock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Negotiation not found' }),
      );
      expect(sock.join).not.toHaveBeenCalled();
    });

    it('rejects users who are neither buyer nor seller', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        buyerId: 'buyer-x',
        sellerId: 'seller-y',
      });
      const sock = makeSocket();
      sock.userId = 'stranger';
      await gateway.onJoin({ negotiationId: 'neg-1' }, sock as never);
      expect(sock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'Not authorized for this negotiation' }),
      );
      expect(sock.join).not.toHaveBeenCalled();
    });

    it('joins room and emits history with viewerRole=BUYER', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        buyerId: 'user-1',
        sellerId: 'user-2',
      });
      prisma.negotiationMessage.findMany.mockResolvedValue([
        { id: 'm1', body: 'hi' },
      ]);
      const sock = makeSocket();
      sock.userId = 'user-1';
      await gateway.onJoin({ negotiationId: 'neg-1' }, sock as never);
      expect(sock.join).toHaveBeenCalledWith('neg:neg-1');
      expect(sock.emit).toHaveBeenCalledWith(
        'joined',
        expect.objectContaining({
          negotiationId: 'neg-1',
          viewerRole: 'BUYER',
          history: [{ id: 'm1', body: 'hi' }],
        }),
      );
    });

    it('joins with viewerRole=SELLER when user is the seller', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        buyerId: 'user-1',
        sellerId: 'user-2',
      });
      const sock = makeSocket();
      sock.userId = 'user-2';
      await gateway.onJoin({ negotiationId: 'neg-1' }, sock as never);
      expect(sock.emit).toHaveBeenCalledWith(
        'joined',
        expect.objectContaining({ viewerRole: 'SELLER' }),
      );
    });
  });

  // ── onTyping (T11) ────────────────────────────────────────────────────────

  describe('onTyping', () => {
    it('drops typing events from sockets not in the room', () => {
      const sock = makeSocket();
      sock.userId = 'user-1';
      // Not joined to neg:neg-1
      gateway.onTyping(
        { negotiationId: 'neg-1', isTyping: true },
        sock as never,
      );
      expect(sock.to).not.toHaveBeenCalled();
    });

    it('rate-limits typing to 1 per second', () => {
      const sock = makeSocket();
      sock.userId = 'user-1';
      sock.rooms.add('neg:neg-1');
      // Seed rate-limit map (handleConnection normally does this)
      (gateway as unknown as {
        rateLimits: Map<string, { messageCount: number; windowStart: number; lastTyping: number }>;
      }).rateLimits.set(sock.id, {
        messageCount: 0,
        windowStart: Date.now(),
        lastTyping: 0,
      });

      gateway.onTyping({ negotiationId: 'neg-1', isTyping: true }, sock as never);
      gateway.onTyping({ negotiationId: 'neg-1', isTyping: false }, sock as never);

      // First typing event broadcasts; second within 1s is dropped silently.
      expect(sock.to).toHaveBeenCalledTimes(1);
    });
  });

  // ── onRead (T11) ──────────────────────────────────────────────────────────

  describe('onRead', () => {
    it('ignores read events from non-members', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        buyerId: 'buyer-x',
        sellerId: 'seller-y',
      });
      const sock = makeSocket();
      sock.userId = 'stranger';
      sock.rooms.add('neg:neg-1');
      await gateway.onRead(
        { negotiationId: 'neg-1', messageId: 'm1' },
        sock as never,
      );
      expect(prisma.negotiationMessage.updateMany).not.toHaveBeenCalled();
    });

    it('scopes the update to the negotiation (no-op for cross-negotiation messageId)', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        buyerId: 'user-1',
        sellerId: 'user-2',
      });
      prisma.negotiationMessage.updateMany.mockResolvedValue({ count: 0 });
      const sock = makeSocket();
      sock.userId = 'user-1';
      sock.rooms.add('neg:neg-1');
      await gateway.onRead(
        { negotiationId: 'neg-1', messageId: 'm-from-other-neg' },
        sock as never,
      );
      expect(prisma.negotiationMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-from-other-neg', negotiationId: 'neg-1' },
        data: expect.objectContaining({ readByBuyerAt: expect.any(Date) }),
      });
      // count=0 ⇒ no broadcast
      expect(sock.to).not.toHaveBeenCalled();
    });

    it('updates readBySellerAt for seller users', async () => {
      prisma.negotiation.findUnique.mockResolvedValue({
        buyerId: 'user-1',
        sellerId: 'user-2',
      });
      prisma.negotiationMessage.updateMany.mockResolvedValue({ count: 1 });
      const sock = makeSocket();
      sock.userId = 'user-2';
      sock.rooms.add('neg:neg-1');
      await gateway.onRead(
        { negotiationId: 'neg-1', messageId: 'm1' },
        sock as never,
      );
      expect(prisma.negotiationMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', negotiationId: 'neg-1' },
        data: expect.objectContaining({ readBySellerAt: expect.any(Date) }),
      });
      expect(sock.to).toHaveBeenCalledWith('neg:neg-1');
    });
  });

  // ── checkMessageRateLimit ─────────────────────────────────────────────────

  describe('checkMessageRateLimit', () => {
    it('returns false for unknown sockets', () => {
      expect(gateway.checkMessageRateLimit('unknown-sock')).toBe(false);
    });

    it('allows up to 6 messages per minute and rejects the 7th', () => {
      (gateway as unknown as {
        rateLimits: Map<string, { messageCount: number; windowStart: number; lastTyping: number }>;
      }).rateLimits.set('s', {
        messageCount: 0,
        windowStart: Date.now(),
        lastTyping: 0,
      });
      for (let i = 0; i < 6; i++) {
        expect(gateway.checkMessageRateLimit('s')).toBe(true);
      }
      expect(gateway.checkMessageRateLimit('s')).toBe(false);
    });
  });

  // ── emitMessage / emitAiThinking ──────────────────────────────────────────

  describe('emit helpers', () => {
    it('emitMessage broadcasts to the correct room', () => {
      const roomEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: roomEmit });
      gateway.emitMessage('neg-1', { id: 'm1' });
      expect(mockServer.to).toHaveBeenCalledWith('neg:neg-1');
      expect(roomEmit).toHaveBeenCalledWith('message', { id: 'm1' });
    });

    it('emitAiThinking broadcasts the flag', () => {
      const roomEmit = jest.fn();
      mockServer.to.mockReturnValue({ emit: roomEmit });
      gateway.emitAiThinking('neg-1', true);
      expect(roomEmit).toHaveBeenCalledWith('ai_thinking', { isThinking: true });
    });
  });
});
