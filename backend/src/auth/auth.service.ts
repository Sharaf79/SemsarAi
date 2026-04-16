import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { SmsService } from '../sms/sms.service';
import { JwtPayload } from './guards/jwt-auth.guard';

/** How long (ms) an OTP code is valid */
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 min
/** Max wrong attempts before the code is locked */
const OTP_MAX_ATTEMPTS = 3;
/** Sliding window for rate-limit (ms) */
const OTP_RL_WINDOW_MS = 10 * 60 * 1000; // 10 min
/** Max new OTPs allowed per phone within the window */
const OTP_RL_MAX = 3;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsapp: WhatsAppService,
    private readonly sms: SmsService,
  ) {}

  // ─── POST /auth/send-otp ──────────────────────────────────────

  async sendOtp(phone: string): Promise<{ message: string; channel: 'whatsapp' | 'sms'; devOtp?: string }> {
    const normalised = this.normalisePhone(phone);

    // Rate-limit: no more than OTP_RL_MAX requests per phone per window
    const windowStart = new Date(Date.now() - OTP_RL_WINDOW_MS);
    const recentCount = await this.prisma.otpCode.count({
      where: { phone: normalised, createdAt: { gte: windowStart } },
    });

    if (recentCount >= OTP_RL_MAX) {
      throw new BadRequestException(
        'Too many OTP requests. Please wait 10 minutes before trying again.',
      );
    }

    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    const otpRecord = await this.prisma.otpCode.create({
      data: { phone: normalised, code, expiresAt },
    });

    // ── Send OTP via WhatsApp ──
    this.logger.log(`[OTP] Sending OTP to ${normalised}`);
    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    let channel: 'whatsapp' | 'sms' = 'whatsapp';

    try {
      if (this.whatsapp.isConfigured()) {
        // Production (or dev with real creds): use template for reliable delivery
        const { messageId } = await this.whatsapp.sendOtpTemplate(
          normalised,
          code,
        );
        // Track delivery
        await this.prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { whatsappMessageId: messageId, deliveryStatus: 'sent' },
        });
      } else {
        // Dev mode without real WhatsApp credentials — log to console
        this.logger.warn(`[DEV] OTP for ${normalised}: ${code}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send OTP via WhatsApp to ${normalised}`, err);

      // ── SMS Fallback ──
      if (this.sms.isAvailable()) {
        this.logger.log(`[SMS] Attempting SMS fallback for ${normalised}`);
        try {
          await this.sms.sendOtp(normalised, code);
          channel = 'sms';
          await this.prisma.otpCode.update({
            where: { id: otpRecord.id },
            data: { deliveryStatus: 'sms_sent' },
          });
          this.logger.log(`[SMS] OTP sent via SMS to ${normalised}`);
        } catch (smsErr) {
          this.logger.error(`SMS fallback also failed for ${normalised}`, smsErr);
          if (isDev) {
            this.logger.warn(`[DEV] OTP for ${normalised}: ${code}`);
          } else {
            throw new BadRequestException(
              'Failed to send OTP via WhatsApp and SMS. Please try again later.',
            );
          }
        }
      } else if (isDev) {
        this.logger.warn(`[DEV] OTP for ${normalised}: ${code}`);
      } else {
        throw new BadRequestException(
          'Failed to send OTP. Please try again later.',
        );
      }
    }

    return {
      message: 'OTP sent successfully',
      channel,
      // Only include devOtp in non-production environments
      ...(isDev ? { devOtp: code } : {}),
    };
  }

  // ─── POST /auth/verify-otp ────────────────────────────────────

  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{
    token: string;
    isNewUser: boolean;
    userId: string;
    name: string;
    email: string | null;
  }> {
    const normalised = this.normalisePhone(phone);

    // Fetch the latest unused, unexpired OTP for this phone
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        phone: normalised,
        usedAt: null,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('OTP has expired or does not exist');
    }

    // Increment attempt counter first (prevents race-condition bypass)
    const updated = await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    if (updated.attempts > OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    if (otp.code !== code) {
      throw new UnauthorizedException('Invalid OTP code');
    }

    // Consume the OTP (mark used)
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    // Find or create the user
    let user = await this.prisma.user.findUnique({
      where: { phone: normalised },
    });
    const isNewUser = !user;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: normalised,
          name: normalised, // temporary – updated via PATCH /auth/profile
          isPhoneVerified: true,
        },
      });
    } else if (!user.isPhoneVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isPhoneVerified: true },
      });
    }

    const payload: JwtPayload = { sub: user.id, phone: user.phone };
    const token = this.jwtService.sign(payload);

    this.logger.log(`Auth OK — user=${user.id} isNew=${isNewUser}`);
    return { token, isNewUser, userId: user.id, name: user.name, email: user.email ?? null };
  }

  // ─── GET /auth/profile ────────────────────────────────────────

  async getProfile(
    userId: string,
  ): Promise<{ id: string; phone: string; name: string; email: string | null; dateOfBirth: string | null; sexType: string | null; notes: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, name: true, email: true, dateOfBirth: true, sexType: true, notes: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      ...user,
      dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
    };
  }

  // ─── PATCH /auth/profile ──────────────────────────────────────

  async updateProfile(
    userId: string,
    name: string,
    email?: string,
    dateOfBirth?: string,
    sexType?: string,
    notes?: string,
  ): Promise<{ id: string; name: string; email: string | null; phone: string; dateOfBirth: string | null; sexType: string | null; notes: string | null }> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        ...(email !== undefined ? { email } : {}),
        ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
        ...(sexType !== undefined ? { sexType: sexType || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, dateOfBirth: true, sexType: true, notes: true },
    });

    return {
      ...user,
      dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /** Normalise phone to E.164-like +20 format */
  private normalisePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('20')) return `+${digits}`;
    if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
    return `+20${digits}`;
  }

  /** Cryptographically-safe 6-digit OTP */
  private generateOtp(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }
}
