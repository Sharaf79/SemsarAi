/**
 * WhatsApp Cloud API service — ported from Python src/services/whatsapp_service.py
 * HMAC verification, message parsing, sending (text + template), media URL retrieval.
 *
 * Production mode: requires all WHATSAPP_* env vars.
 * Dev mode: works without credentials (logs instead of sending).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ParsedMessage } from '../common/types';

/** Delivery status update from Meta webhook */
export interface DeliveryStatus {
  id: string;        // WhatsApp message ID (wamid.xxx)
  status: string;    // sent | delivered | read | failed
  timestamp: string; // Unix timestamp
  recipientId: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly appSecret: string;
  readonly verifyToken: string;
  private readonly apiVersion = 'v21.0';
  private readonly baseUrl: string;
  private readonly _isConfigured: boolean;
  private readonly isProduction: boolean;
  private readonly otpTemplateName: string;
  private readonly otpTemplateLang: string;

  constructor(private readonly configService: ConfigService) {
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    // In dev, allow missing WhatsApp vars (mock mode).
    // In production, getOrThrow will crash at bootstrap — which is correct.
    const token = this.isProduction
      ? this.configService.getOrThrow<string>('WHATSAPP_TOKEN')
      : this.configService.get<string>('WHATSAPP_TOKEN') ?? '';
    const phoneNumberId = this.isProduction
      ? this.configService.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID')
      : this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    const appSecret = this.isProduction
      ? this.configService.getOrThrow<string>('WHATSAPP_APP_SECRET')
      : this.configService.get<string>('WHATSAPP_APP_SECRET') ?? '';
    const verifyToken = this.isProduction
      ? this.configService.getOrThrow<string>('WHATSAPP_VERIFY_TOKEN')
      : this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') ?? '';

    this.token = token;
    this.phoneNumberId = phoneNumberId;
    this.appSecret = appSecret;
    this.verifyToken = verifyToken;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

    this._isConfigured = !!(token && phoneNumberId && appSecret && verifyToken)
      && token !== 'your_whatsapp_token_here';

    this.otpTemplateName =
      this.configService.get<string>('WHATSAPP_OTP_TEMPLATE_NAME') ??
      'otp_verification';
    this.otpTemplateLang =
      this.configService.get<string>('WHATSAPP_OTP_TEMPLATE_LANG') ?? 'ar';

    if (!this._isConfigured && !this.isProduction) {
      this.logger.warn(
        '[WhatsApp] Not configured — running in mock mode. ' +
        'Messages will be logged to console instead of sent.',
      );
    }
  }

  /** Whether real WhatsApp credentials are configured. */
  isConfigured(): boolean {
    return this._isConfigured;
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
   * Parse delivery status updates from a WhatsApp webhook payload.
   * These are separate from incoming messages and report on sent message delivery.
   */
  parseDeliveryStatuses(
    payload: Record<string, unknown>,
  ): DeliveryStatus[] {
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
      const statuses = value?.['statuses'] as Record<string, unknown>[];

      if (!statuses || statuses.length === 0) return [];

      return statuses.map((s) => ({
        id: s['id'] as string,
        status: s['status'] as string,
        timestamp: s['timestamp'] as string,
        recipientId: s['recipient_id'] as string,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Send a text message via WhatsApp Cloud API.
   * In dev without credentials, logs the message instead.
   */
  async sendTextMessage(toNumber: string, message: string): Promise<void> {
    if (!this._isConfigured) {
      this.logger.log(
        `[WhatsApp Mock] sendTextMessage to=${toNumber}: ${message}`,
      );
      return;
    }

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
   * Send a template message via WhatsApp Cloud API.
   * Required for business-initiated messages (e.g. OTP to new users).
   *
   * @returns The WhatsApp message ID for delivery tracking.
   */
  async sendTemplateMessage(
    toNumber: string,
    templateName: string,
    languageCode: string,
    bodyParameters: string[],
  ): Promise<{ messageId: string }> {
    if (!this._isConfigured) {
      const mockId = `mock-${Date.now()}`;
      this.logger.log(
        `[WhatsApp Mock] sendTemplateMessage to=${toNumber} ` +
        `template=${templateName} lang=${languageCode} ` +
        `params=${JSON.stringify(bodyParameters)} → messageId=${mockId}`,
      );
      return { messageId: mockId };
    }

    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const components =
      bodyParameters.length > 0
        ? [
            {
              type: 'body',
              parameters: bodyParameters.map((text) => ({
                type: 'text',
                text,
              })),
            },
          ]
        : [];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `WhatsApp Template API error ${response.status}: ${body}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const messages = data['messages'] as Record<string, unknown>[] | undefined;
    const messageId = (messages?.[0]?.['id'] as string) ?? 'unknown';

    return { messageId };
  }

  /**
   * Send an OTP verification code via pre-approved WhatsApp template.
   * Uses configured template name/language from env vars.
   */
  async sendOtpTemplate(
    toNumber: string,
    otpCode: string,
  ): Promise<{ messageId: string }> {
    return this.sendTemplateMessage(
      toNumber,
      this.otpTemplateName,
      this.otpTemplateLang,
      [otpCode],
    );
  }

  /**
   * Get the download URL for a media attachment.
   */
  async getMediaUrl(mediaId: string): Promise<string | null> {
    if (!this._isConfigured) {
      this.logger.log(
        `[WhatsApp Mock] getMediaUrl id=${mediaId} → null`,
      );
      return null;
    }

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

  /**
   * Generic notification message sender.
   * Used by NotificationsService for all milestone notifications.
   * Delegates to sendTextMessage internally.
   */
  async sendNotificationMessage(toPhone: string, body: string): Promise<void> {
    return this.sendTextMessage(toPhone, body);
  }
}
