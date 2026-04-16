import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

@Catch()
class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      this.logger.error(
        `HttpException [${status}]: ${typeof exceptionResponse === 'string' ? exceptionResponse : JSON.stringify(exceptionResponse)}`,
      );

      // Preserve the full response object (e.g. { message, creditId } for payment flows)
      if (typeof exceptionResponse === 'object') {
        response.status(status).json({ statusCode: status, ...exceptionResponse });
      } else {
        response.status(status).json({ statusCode: status, message: exceptionResponse });
      }
      return;
    }

    // Non-HTTP exceptions → generic 500
    this.logger.error(
      `Exception caught: ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Required for HMAC signature verification
    bodyParser: true,
  });

  // Serve uploaded media files as static assets at /uploads/*
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  // Global DTO validation — class-validator decorators on DTOs will be enforced
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // CORS — restrict origins in production, allow all in development
  const corsOrigins = process.env['CORS_ORIGINS'];
  app.enableCors(
    corsOrigins
      ? { origin: corsOrigins.split(',').map((o) => o.trim()), credentials: true }
      : undefined,
  );

  // Global exception filter to catch and log all errors
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  console.log(`🚀 Semsar AI backend running on port ${port}`);
}
void bootstrap();
