import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

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

  // CORS for Chat UI (FastAPI on :8000) and future frontend
  app.enableCors();

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  console.log(`🚀 Semsar AI backend running on port ${port}`);
}
void bootstrap();
