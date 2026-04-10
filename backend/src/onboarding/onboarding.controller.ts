import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  HttpException,
  InternalServerErrorException,
  Logger,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { OnboardingStep } from '@prisma/client';
import { OnboardingService } from './onboarding.service';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { AnswerDto } from './dto/submit-answer.dto';
import { EditFieldDto } from './dto/edit-field.dto';
import { FinalSubmitDto } from './dto/final-submit.dto';
import { UploadMediaDto } from './dto/upload-media.dto';

@Controller('onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  // ─── POST /onboarding/start ───────────────────────────────

  /**
   * Start a new draft or resume existing incomplete one.
   * Response: { success: true, data: { draft, question } }
   */
  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  async startOnboarding(@Body() dto: StartOnboardingDto) {
    try {
      this.logger.debug(`POST /start — userId: ${dto.userId}`);

      const draft = await this.onboardingService.startOrResumeDraft(dto.userId, dto.phone, dto.restart);
      const question = await this.onboardingService.getCurrentQuestion(draft.userId);

      return { success: true, data: { draft, question } };
    } catch (error) {
      this.handleError('POST /start', error);
    }
  }

  // ─── GET /onboarding/question ─────────────────────────────

  /**
   * Get the current step question for the user's active draft.
   * Response: { success: true, data: { step, question, inputType, options?, fields? } }
   */
  @Get('question')
  @HttpCode(HttpStatus.OK)
  async getQuestion(
    @Query('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    try {
      this.logger.debug(`GET /question — userId: ${userId}`);

      const data = await this.onboardingService.getCurrentQuestion(userId);

      return { success: true, data };
    } catch (error) {
      this.handleError('GET /question', error);
    }
  }

  // ─── POST /onboarding/answer ──────────────────────────────

  /**
   * Submit an answer for the current step.
   * Validates, merges into draft data, and advances to the next step.
   * Response: { success: true, data: { draft, question } }
   *           question is null when COMPLETED step is reached.
   */
  @Post('answer')
  @HttpCode(HttpStatus.OK)
  async submitAnswer(@Body() dto: AnswerDto) {
    try {
      this.logger.debug(`POST /answer — userId: ${dto.userId}, step: ${dto.step}`);

      const draft = await this.onboardingService.submitAnswer(
        dto.userId,
        dto.step,
        dto.answer,
      );

      // Don't fetch a question for the terminal state
      const question =
        draft.currentStep === OnboardingStep.COMPLETED
          ? null
          : await this.onboardingService.getCurrentQuestion(dto.userId);

      return { success: true, data: { draft, question } };
    } catch (error) {
      this.handleError('POST /answer', error);
    }
  }

  // ─── GET /onboarding/review ───────────────────────────────

  /**
   * Get all collected data for review before final submission.
   * Response: { success: true, data: { draft, data, isComplete, missingFields } }
   */
  @Get('review')
  @HttpCode(HttpStatus.OK)
  async getReview(
    @Query('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    try {
      this.logger.debug(`GET /review — userId: ${userId}`);

      const data = await this.onboardingService.getReview(userId);

      return { success: true, data };
    } catch (error) {
      this.handleError('GET /review', error);
    }
  }

  // ─── POST /onboarding/edit ────────────────────────────────

  /**
   * Rewind to a previous step from REVIEW so the user can correct an answer.
   * Response: { success: true, data: { draft, step, question, inputType, options?, fields? } }
   */
  @Post('edit')
  @HttpCode(HttpStatus.OK)
  async editField(@Body() dto: EditFieldDto) {
    try {
      this.logger.debug(`POST /edit — userId: ${dto.userId}, step: ${dto.step}`);

      const data = await this.onboardingService.editField(dto.userId, dto.step);

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /edit', error);
    }
  }

  // ─── POST /onboarding/submit ──────────────────────────────

  /**
   * Final submit: create Property from draft in a Prisma transaction,
   * transfer media, and mark draft completed.
   * Response: { success: true, data: Property }
   */
  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  async finalSubmit(@Body() dto: FinalSubmitDto) {
    try {
      this.logger.debug(`POST /submit — userId: ${dto.userId}`);

      const data = await this.onboardingService.finalSubmit(dto.userId);

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /submit', error);
    }
  }

  // ─── POST /onboarding/upload-file ────────────────────────

  /**
   * Real multipart file upload.
   * Saves file to /uploads/ folder and returns a public URL.
   */
  @Post('upload-file')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadDir = join(process.cwd(), 'uploads');
          if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi)$/i;
        if (allowed.test(extname(file.originalname))) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only image and video files are allowed'), false);
        }
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const url = `http://localhost:3000/uploads/${file.filename}`;
    this.logger.log(`Uploaded file: ${file.filename} (${file.size} bytes)`);
    return { success: true, data: { url, filename: file.filename, size: file.size } };
  }

  // ─── POST /onboarding/upload-media ────────────────────────

  /**
   * Attach a media URL (image or video) to the user's active draft.
   * Response: { success: true, data: PropertyMedia }
   */
  @Post('upload-media')
  @HttpCode(HttpStatus.CREATED)
  async uploadMedia(@Body() dto: UploadMediaDto) {
    try {
      this.logger.debug(`POST /upload-media — userId: ${dto.userId}`);

      const data = await this.onboardingService.uploadMedia(
        dto.userId,
        dto.url,
        dto.type,
      );

      return { success: true, data };
    } catch (error) {
      this.handleError('POST /upload-media', error);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────

  /**
   * Re-throw NestJS HTTP exceptions as-is (they carry the correct status
   * code and message). Wrap anything else in a 500 to avoid leaking
   * internal details to the client.
   */
  private handleError(context: string, error: unknown): never {
    if (error instanceof HttpException) {
      this.logger.warn(`${context} — ${error.message}`);
      throw error;
    }

    this.logger.error(
      `${context} — Unexpected error`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}
