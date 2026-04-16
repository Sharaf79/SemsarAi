/**
 * Tests for whatsapp.service.ts — HMAC verification, message parsing,
 * template messages, delivery status parsing, mock mode.
 */
import * as crypto from 'crypto';
import { WhatsAppService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';

function makeService(
  overrides: Record<string, string | undefined> = {},
): WhatsAppService {
  const defaults: Record<string, string> = {
    WHATSAPP_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '12345',
    WHATSAPP_APP_SECRET: 'test-secret',
    WHATSAPP_VERIFY_TOKEN: 'verify-me',
    WHATSAPP_OTP_TEMPLATE_NAME: 'otp_verification',
    WHATSAPP_OTP_TEMPLATE_LANG: 'ar',
  };
  const merged = { ...defaults, ...overrides };
  const configService = {
    get: (key: string) => merged[key] ?? undefined,
    getOrThrow: (key: string) => {
      if (!(key in merged) || merged[key] === undefined)
        throw new Error(`Missing ${key}`);
      return merged[key];
    },
  } as unknown as ConfigService;
  return new WhatsAppService(configService);
}

function makeUnconfiguredService(): WhatsAppService {
  return makeService({
    WHATSAPP_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    WHATSAPP_APP_SECRET: '',
    WHATSAPP_VERIFY_TOKEN: '',
  });
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

  // ────────────────────────────────────────────────────────────
  // isConfigured()
  // ────────────────────────────────────────────────────────────
  describe('isConfigured', () => {
    it('returns true when all credentials are set', () => {
      const svc = makeService();
      expect(svc.isConfigured()).toBe(true);
    });

    it('returns false when token is empty', () => {
      const svc = makeService({ WHATSAPP_TOKEN: '' });
      expect(svc.isConfigured()).toBe(false);
    });

    it('returns false when token is placeholder', () => {
      const svc = makeService({ WHATSAPP_TOKEN: 'your_whatsapp_token_here' });
      expect(svc.isConfigured()).toBe(false);
    });

    it('returns false when phone number ID is missing', () => {
      const svc = makeService({ WHATSAPP_PHONE_NUMBER_ID: '' });
      expect(svc.isConfigured()).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // parseDeliveryStatuses()
  // ────────────────────────────────────────────────────────────
  describe('parseDeliveryStatuses', () => {
    it('parses delivery status from webhook payload', () => {
      const svc = makeService();
      const payload = {
        entry: [{
          changes: [{
            value: {
              statuses: [{
                id: 'wamid.abc123',
                status: 'delivered',
                timestamp: '1720000000',
                recipient_id: '201234567890',
              }],
            },
          }],
        }],
      };

      const result = svc.parseDeliveryStatuses(payload);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'wamid.abc123',
        status: 'delivered',
        timestamp: '1720000000',
        recipientId: '201234567890',
      });
    });

    it('parses multiple statuses', () => {
      const svc = makeService();
      const payload = {
        entry: [{
          changes: [{
            value: {
              statuses: [
                { id: 'wamid.1', status: 'sent', timestamp: '100', recipient_id: '20111' },
                { id: 'wamid.2', status: 'read', timestamp: '200', recipient_id: '20222' },
              ],
            },
          }],
        }],
      };
      expect(svc.parseDeliveryStatuses(payload)).toHaveLength(2);
    });

    it('returns empty array for no statuses', () => {
      const svc = makeService();
      expect(svc.parseDeliveryStatuses({})).toEqual([]);
    });

    it('returns empty array for malformed payload', () => {
      const svc = makeService();
      expect(svc.parseDeliveryStatuses({ entry: [] })).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Mock mode (sendTextMessage, sendTemplateMessage)
  // ────────────────────────────────────────────────────────────
  describe('mock mode (unconfigured)', () => {
    it('sendTextMessage resolves without error', async () => {
      const svc = makeUnconfiguredService();
      // Should not throw, just log
      await expect(
        svc.sendTextMessage('201234567890', 'Hello'),
      ).resolves.toBeUndefined();
    });

    it('sendTemplateMessage returns mock messageId', async () => {
      const svc = makeUnconfiguredService();
      const result = await svc.sendTemplateMessage(
        '201234567890',
        'otp_verification',
        'ar',
        ['123456'],
      );
      expect(result.messageId).toMatch(/^mock-/);
    });

    it('sendOtpTemplate returns mock messageId', async () => {
      const svc = makeUnconfiguredService();
      const result = await svc.sendOtpTemplate('201234567890', '654321');
      expect(result.messageId).toMatch(/^mock-/);
    });

    it('getMediaUrl returns null in mock mode', async () => {
      const svc = makeUnconfiguredService();
      const result = await svc.getMediaUrl('media-123');
      expect(result).toBeNull();
    });
  });
});
