/**
 * WhatsApp Cloud API service — ported from Python src/services/whatsapp_service.py
 * HMAC verification, message parsing, sending, media URL retrieval.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ParsedMessage } from '../common/types';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly appSecret: string;
  readonly verifyToken: string;
  private readonly apiVersion = 'v21.0';
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.getOrThrow<string>('WHATSAPP_TOKEN');
    this.phoneNumberId = this.configService.getOrThrow<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    this.appSecret =
      this.configService.getOrThrow<string>('WHATSAPP_APP_SECRET');
    this.verifyToken = this.configService.getOrThrow<string>(
      'WHATSAPP_VERIFY_TOKEN',
    );
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Verify HMAC-SHA256 signature from WhatsApp webhook.
   */
  verifyWebhookSignature(payload: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.appSecret)
      .update(payload)
      .digest('hex');

    const providedSignature = signatureHeader.split('sha256=')[1];

    // timingSafeEqual requires same-length buffers
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const providedBuf = Buffer.from(providedSignature, 'hex');
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  /**
   * Parse incoming WhatsApp webhook payload into structured message.
   */
  parseIncomingMessage(
    payload: Record<string, unknown>,
  ): ParsedMessage | null {
    try {
      const entry = (payload['entry'] as unknown[])?.[0] as Record<
        string,
        unknown
      >;
      const changes = (entry?.['changes'] as unknown[])?.[0] as Record<
        string,
        unknown
      >;
      const value = changes?.['value'] as Record<string, unknown>;
      const messages = value?.['messages'] as Record<string, unknown>[];

      if (!messages || messages.length === 0) return null;

      const msg = messages[0];
      const from = msg['from'] as string;
      const msgType = msg['type'] as string;

      const result: ParsedMessage = {
        from,
        type: msgType,
        body: null,
        mediaId: null,
      };

      if (msgType === 'text') {
        result.body = (msg['text'] as Record<string, unknown>)?.['body'] as
          | string
          | null;
      } else if (msgType === 'image' || msgType === 'video') {
        result.mediaId = (msg[msgType] as Record<string, unknown>)?.[
          'id'
        ] as string | null;
      }

      return result;
    } catch (error) {
      this.logger.error(`Error parsing WhatsApp payload: ${error}`);
      return null;
    }
  }

  /**
   * Send a text message via WhatsApp Cloud API.
   */
  async sendTextMessage(toNumber: string, message: string): Promise<void> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `WhatsApp API error ${response.status}: ${body}`,
      );
    }
  }

  /**
   * Get the download URL for a media attachment.
   */
  async getMediaUrl(mediaId: string): Promise<string | null> {
    const url = `${this.baseUrl}/${mediaId}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;
      return (data['url'] as string) ?? null;
    }
    return null;
  }
}
