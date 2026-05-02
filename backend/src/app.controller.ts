import { Controller, Get, Post, Body } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // ─── Feature Flags (T27) ──────────────────────────────────

  /**
   * Public endpoint returning current feature flag state.
   * Frontend polls this to decide whether to use Socket.IO or REST polling.
   */
  @Get('api/feature-flags')
  getFeatureFlags(): Record<string, boolean> {
    const negotiationV2 = this.config.get<boolean>('NEGOTIATION_V2', true);
    return {
      NEGOTIATION_V2: negotiationV2,
    };
  }

  /**
   * DEV-ONLY: Ensure a user exists for the Chat UI demo.
   * Creates the user if not found; returns the user record either way.
   */
  @Post('api/ensure-user')
  async ensureUser(@Body() body: { userId: string; name?: string }) {
    const existing = await this.prisma.user.findUnique({
      where: { id: body.userId },
    });
    if (existing) return existing;

    return this.prisma.user.create({
      data: {
        id: body.userId,
        name: body.name ?? 'مستخدم تجريبي',
        phone: `+20${body.userId.replace(/-/g, '').slice(0, 10)}`,
      },
    });
  }
}
