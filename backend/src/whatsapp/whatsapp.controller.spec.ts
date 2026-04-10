/**
 * WhatsAppController unit tests — ported from Python tests/unit/test_webhook.py
 * Tests: GET /webhook (verification handshake), POST /webhook (HMAC, routing).
 */
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOrchestratorService } from './whatsapp-orchestrator.service';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';

// ── Mocks ──────────────────────────────────────────────────

const APP_SECRET = 'test-secret-key';
const VERIFY_TOKEN = 'my-verify-token';

function makeWhatsAppService(): jest.Mocked<WhatsAppService> {
  const svc = {
    verifyToken: VERIFY_TOKEN,
    verifyWebhookSignature: jest.fn(),
    parseIncomingMessage: jest.fn(),
    sendTextMessage: jest.fn(),
    getMediaUrl: jest.fn(),
  } as unknown as jest.Mocked<WhatsAppService>;
  return svc;
}

function makeOrchestrator(): jest.Mocked<WhatsAppOrchestratorService> {
  return {
    processMessage: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WhatsAppOrchestratorService>;
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & typeof res;
}

function signPayload(body: string): string {
  const hmac = crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return `sha256=${hmac}`;
}

function makeWebhookPayload(text: string, from = '201234567890') {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsAppController', () => {
  let controller: WhatsAppController;
  let whatsapp: jest.Mocked<WhatsAppService>;
  let orchestrator: jest.Mocked<WhatsAppOrchestratorService>;

  beforeEach(() => {
    whatsapp = makeWhatsAppService();
    orchestrator = makeOrchestrator();
    controller = new WhatsAppController(whatsapp, orchestrator);
  });

  // ────────────────────────────────────────────────────────────
  // GET /webhook — Verification handshake
  // ────────────────────────────────────────────────────────────
  describe('GET /webhook verification', () => {
    it('valid subscribe returns 200 with challenge', () => {
      const res = makeRes();
      controller.verify('subscribe', VERIFY_TOKEN, 'challenge-123', res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('challenge-123');
    });

    it('wrong token returns 403', () => {
      const res = makeRes();
      controller.verify('subscribe', 'wrong-token', 'challenge', res);
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it('wrong mode returns 403', () => {
      const res = makeRes();
      controller.verify('unsubscribe', VERIFY_TOKEN, 'challenge', res);
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it('missing mode returns 403', () => {
      const res = makeRes();
      controller.verify(undefined as any, VERIFY_TOKEN, 'challenge', res);
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it('missing token returns 403', () => {
      const res = makeRes();
      controller.verify('subscribe', undefined as any, 'challenge', res);
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it('no params returns 403', () => {
      const res = makeRes();
      controller.verify(
        undefined as any,
        undefined as any,
        undefined as any,
        res,
      );
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    });
  });

  // ────────────────────────────────────────────────────────────
  // POST /webhook — Message reception
  // ────────────────────────────────────────────────────────────
  describe('POST /webhook receive', () => {
    it('invalid HMAC returns 401', async () => {
      whatsapp.verifyWebhookSignature.mockReturnValue(false);
      const res = makeRes();
      const body = Buffer.from('{"test": true}');

      await controller.receive(
        { rawBody: body, headers: { 'x-hub-signature-256': 'sha256=bad' } } as unknown as Request & { rawBody?: Buffer },
        res,
      );

      expect(res.sendStatus).toHaveBeenCalledWith(401);
      expect(orchestrator.processMessage).not.toHaveBeenCalled();
    });

    it('missing rawBody returns 401', async () => {
      const res = makeRes();

      await controller.receive(
        { rawBody: undefined, headers: { 'x-hub-signature-256': 'sha256=abc' } } as unknown as Request & { rawBody?: Buffer },
        res,
      );

      expect(res.sendStatus).toHaveBeenCalledWith(401);
    });

    it('valid text message returns 200 and processes', async () => {
      whatsapp.verifyWebhookSignature.mockReturnValue(true);
      whatsapp.parseIncomingMessage.mockReturnValue({
        from: '201234567890',
        type: 'text',
        body: 'Hello',
        mediaId: null,
      });

      const payload = makeWebhookPayload('Hello');
      const body = Buffer.from(JSON.stringify(payload));
      const res = makeRes();

      await controller.receive(
        {
          rawBody: body,
          headers: { 'x-hub-signature-256': signPayload(body.toString()) },
        } as unknown as Request & { rawBody?: Buffer },
        res,
      );

      expect(res.sendStatus).toHaveBeenCalledWith(200);
      // Give fire-and-forget a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(orchestrator.processMessage).toHaveBeenCalledWith({
        from: '201234567890',
        type: 'text',
        body: 'Hello',
        mediaId: null,
      });
    });

    it('message without body or mediaId does not process', async () => {
      whatsapp.verifyWebhookSignature.mockReturnValue(true);
      whatsapp.parseIncomingMessage.mockReturnValue({
        from: '201234567890',
        type: 'text',
        body: null,
        mediaId: null,
      });

      const body = Buffer.from('{}');
      const res = makeRes();

      await controller.receive(
        {
          rawBody: body,
          headers: { 'x-hub-signature-256': 'sha256=abc' },
        } as unknown as Request & { rawBody?: Buffer },
        res,
      );

      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(orchestrator.processMessage).not.toHaveBeenCalled();
    });

    it('null parseIncomingMessage does not process', async () => {
      whatsapp.verifyWebhookSignature.mockReturnValue(true);
      whatsapp.parseIncomingMessage.mockReturnValue(null);

      const body = Buffer.from('{}');
      const res = makeRes();

      await controller.receive(
        {
          rawBody: body,
          headers: { 'x-hub-signature-256': 'sha256=abc' },
        } as unknown as Request & { rawBody?: Buffer },
        res,
      );

      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(orchestrator.processMessage).not.toHaveBeenCalled();
    });
  });
});
