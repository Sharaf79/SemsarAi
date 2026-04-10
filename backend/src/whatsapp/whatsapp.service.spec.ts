/**
 * Tests for whatsapp.service.ts — HMAC verification, message parsing.
 * Ported from Python test_whatsapp_service.py
 */
import * as crypto from 'crypto';
import { WhatsAppService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';

function makeService(overrides: Record<string, string> = {}): WhatsAppService {
  const defaults: Record<string, string> = {
    WHATSAPP_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '12345',
    WHATSAPP_APP_SECRET: 'test-secret',
    WHATSAPP_VERIFY_TOKEN: 'verify-me',
  };
  const merged = { ...defaults, ...overrides };
  const configService = {
    getOrThrow: (key: string) => {
      if (!(key in merged)) throw new Error(`Missing ${key}`);
      return merged[key];
    },
  } as unknown as ConfigService;
  return new WhatsAppService(configService);
}

function signPayload(payload: string, secret: string): string {
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${sig}`;
}

describe('WhatsAppService', () => {
  describe('verifyWebhookSignature', () => {
    it('valid signature returns true', () => {
      const svc = makeService();
      const body = Buffer.from('{"test": true}');
      const sig = signPayload(body.toString(), 'test-secret');
      expect(svc.verifyWebhookSignature(body, sig)).toBe(true);
    });

    it('invalid signature returns false', () => {
      const svc = makeService();
      const body = Buffer.from('{"test": true}');
      expect(svc.verifyWebhookSignature(body, 'sha256=bad')).toBe(false);
    });

    it('missing sha256 prefix returns false', () => {
      const svc = makeService();
      const body = Buffer.from('{"test": true}');
      expect(svc.verifyWebhookSignature(body, 'not-sha256')).toBe(false);
    });

    it('empty header returns false', () => {
      const svc = makeService();
      const body = Buffer.from('test');
      expect(svc.verifyWebhookSignature(body, '')).toBe(false);
    });
  });

  describe('parseIncomingMessage', () => {
    const textPayload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '201234567890',
              type: 'text',
              text: { body: 'عايز ابيع شقة' },
            }],
          },
        }],
      }],
    };

    it('parses text message', () => {
      const svc = makeService();
      const result = svc.parseIncomingMessage(textPayload);
      expect(result).not.toBeNull();
      expect(result!.from).toBe('201234567890');
      expect(result!.type).toBe('text');
      expect(result!.body).toBe('عايز ابيع شقة');
      expect(result!.mediaId).toBeNull();
    });

    it('parses image message', () => {
      const svc = makeService();
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '201234567890',
                type: 'image',
                image: { id: 'img-123' },
              }],
            },
          }],
        }],
      };
      const result = svc.parseIncomingMessage(payload);
      expect(result!.type).toBe('image');
      expect(result!.mediaId).toBe('img-123');
      expect(result!.body).toBeNull();
    });

    it('returns null for empty messages', () => {
      const svc = makeService();
      const payload = {
        entry: [{ changes: [{ value: { messages: [] } }] }],
      };
      expect(svc.parseIncomingMessage(payload)).toBeNull();
    });

    it('returns null for missing messages key', () => {
      const svc = makeService();
      const payload = {
        entry: [{ changes: [{ value: {} }] }],
      };
      expect(svc.parseIncomingMessage(payload)).toBeNull();
    });

    it('returns null for malformed payload', () => {
      const svc = makeService();
      expect(svc.parseIncomingMessage({})).toBeNull();
    });
  });
});
