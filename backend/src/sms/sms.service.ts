/**
 * SMS fallback service — sends OTP codes via Twilio when WhatsApp delivery fails.
 *
 * This service is intentionally simple: it wraps the Twilio SDK and provides
 * a single `sendOtp()` method. It's only used when `SMS_FALLBACK_ENABLED=true`.
 *
 * If Twilio credentials are not configured, the service initializes in
 * "unconfigured" mode and `sendOtp()` will throw immediately.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly enabled: boolean;
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly _isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<string>('SMS_FALLBACK_ENABLED') === 'true';
    this.accountSid =
      this.configService.get<string>('TWILIO_ACCOUNT_SID') ?? '';
    this.authToken =
      this.configService.get<string>('TWILIO_AUTH_TOKEN') ?? '';
    this.fromNumber =
      this.configService.get<string>('TWILIO_PHONE_NUMBER') ?? '';

    this._isConfigured = !!(
      this.accountSid &&
      this.authToken &&
      this.fromNumber
    );

    if (this.enabled && !this._isConfigured) {
      this.logger.error(
        '[SMS] SMS_FALLBACK_ENABLED=true but Twilio credentials are missing. ' +
          'SMS fallback will not work.',
      );
    }

    if (this.enabled && this._isConfigured) {
      this.logger.log('[SMS] SMS fallback enabled via Twilio.');
    }
  }

  /** Whether SMS fallback is enabled AND configured. */
  isAvailable(): boolean {
    return this.enabled && this._isConfigured;
  }

  /**
   * Send an OTP code via SMS to the given phone number.
   *
   * @param toNumber — Phone number in E.164 format (e.g. +201012345678)
   * @param code — The 6-digit OTP code
   * @throws Error if SMS is not configured or Twilio API fails
   */
  async sendOtp(toNumber: string, code: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('SMS fallback is not enabled or not configured');
    }

    // Dynamic import to avoid loading twilio SDK when not needed
    const twilio = await import('twilio');
    const client = twilio.default(this.accountSid, this.authToken);

    const body = `كود التحقق: ${code} - سمسار AI`;

    try {
      const message = await client.messages.create({
        body,
        from: this.fromNumber,
        to: toNumber,
      });

      this.logger.log(
        `[SMS] OTP sent to ${toNumber} — SID: ${message.sid}, status: ${message.status}`,
      );
    } catch (err) {
      this.logger.error(`[SMS] Failed to send OTP to ${toNumber}: ${err}`);
      throw new Error(`SMS delivery failed: ${(err as Error).message}`);
    }
  }
}
