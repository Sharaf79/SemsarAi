/**
 * WhatsApp webhook controller — ported from Python src/api/webhook.py
 * GET /webhook  → verification handshake
 * POST /webhook → receive messages, process in background
 */
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppOrchestratorService } from './whatsapp-orchestrator.service';

@Controller('webhook')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly orchestrator: WhatsAppOrchestratorService,
  ) {}

  /**
   * GET /webhook — Meta verification handshake.
   */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    if (mode && token) {
      if (mode === 'subscribe' && token === this.whatsapp.verifyToken) {
        res.status(HttpStatus.OK).send(challenge);
        return;
      }
    }
    res.sendStatus(HttpStatus.FORBIDDEN);
  }

  /**
   * POST /webhook — Receive WhatsApp messages.
   * Always returns 200 to avoid retries from Meta.
   */
  @Post()
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ): Promise<void> {
    const body: Buffer | undefined = req.rawBody;
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!body || !this.whatsapp.verifyWebhookSignature(body, signature)) {
      res.sendStatus(HttpStatus.UNAUTHORIZED);
      return;
    }

    // Return 200 immediately, process in background
    res.sendStatus(HttpStatus.OK);

    try {
      const payload = JSON.parse(body.toString()) as Record<string, unknown>;
      const parsed = this.whatsapp.parseIncomingMessage(payload);

      if (parsed && (parsed.body || parsed.mediaId)) {
        // Fire-and-forget processing (no await blocking the response)
        this.orchestrator.processMessage(parsed).catch((err: unknown) => {
          this.logger.error(`Error processing message: ${err}`);
        });
      }
    } catch (e) {
      this.logger.error(`Error processing webhook: ${e}`);
    }
  }
}
