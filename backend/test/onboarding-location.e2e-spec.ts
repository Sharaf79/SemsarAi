import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Polyfill crypto for @nestjs/schedule CronJob in test environment
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

/**
 * L28: E2E test — Full onboarding with cascading location steps.
 *
 * This test requires:
 * - A running MySQL database with the locations table seeded
 * - The `20260401081500_add_locations_and_update_steps` migration applied
 *
 * It tests the full onboarding flow:
 * POST /start → PROPERTY_TYPE → LISTING_TYPE → GOVERNORATE → CITY → DISTRICT → DETAILS → PRICE → MEDIA (skip) → REVIEW → POST /submit
 */
describe('Onboarding Location Flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const userId = 'e2e-location-test-user-' + Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Match production middleware — global DTO validation
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.enableCors();

    prisma = app.get(PrismaService);

    // Ensure test user exists
    await prisma.user.upsert({
      where: { phone: `+2010${Date.now()}` },
      update: {},
      create: {
        id: userId,
        name: 'E2E Location Test',
        phone: `+2010${Date.now()}`,
      },
    });

    await app.init();
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.propertyMedia.deleteMany({
      where: { draft: { userId } },
    });
    await prisma.propertyDraft.deleteMany({ where: { userId } });
    await prisma.property.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('should complete full onboarding flow with location steps', async () => {
    // 1. Start onboarding
    const startRes = await request(app.getHttpServer())
      .post('/onboarding/start')
      .send({ userId })
      .expect(201);

    expect(startRes.body.draft).toBeDefined();
    expect(startRes.body.question.step).toBe('PROPERTY_TYPE');
    expect(startRes.body.question.inputType).toBe('multi-choice');

    // 2. Answer PROPERTY_TYPE
    const ptRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({ userId, step: 'PROPERTY_TYPE', answer: 'شقة' })
      .expect(200);

    expect(ptRes.body.question.step).toBe('LISTING_TYPE');

    // 3. Answer LISTING_TYPE
    const ltRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({ userId, step: 'LISTING_TYPE', answer: 'بيع' })
      .expect(200);

    expect(ltRes.body.question.step).toBe('GOVERNORATE');
    expect(ltRes.body.question.options).toBeDefined();
    expect(ltRes.body.question.options.length).toBeGreaterThan(0);
    // Options should be objects with { id, label }
    expect(ltRes.body.question.options[0]).toHaveProperty('id');
    expect(ltRes.body.question.options[0]).toHaveProperty('label');

    // 4. Answer GOVERNORATE — pick القاهرة (Cairo, id=1)
    const govOption = ltRes.body.question.options.find(
      (o: any) => o.label === 'القاهرة',
    );
    expect(govOption).toBeDefined();

    const govRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({ userId, step: 'GOVERNORATE', answer: govOption })
      .expect(200);

    expect(govRes.body.question.step).toBe('CITY');
    expect(govRes.body.question.question).toContain('القاهرة');
    expect(govRes.body.question.options.length).toBeGreaterThan(0);

    // 5. Answer CITY — pick مدينة نصر (Nasr City)
    const cityOption = govRes.body.question.options.find(
      (o: any) => o.label === 'مدينة نصر',
    );
    expect(cityOption).toBeDefined();

    const cityRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({ userId, step: 'CITY', answer: cityOption })
      .expect(200);

    expect(cityRes.body.question.step).toBe('DISTRICT');
    expect(cityRes.body.question.question).toContain('مدينة نصر');
    expect(cityRes.body.question.options.length).toBeGreaterThan(0);

    // 6. Answer DISTRICT — pick first available
    const distOption = cityRes.body.question.options[0];

    const distRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({ userId, step: 'DISTRICT', answer: distOption })
      .expect(200);

    expect(distRes.body.question.step).toBe('DETAILS');

    // 7. Answer DETAILS
    const detRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({
        userId,
        step: 'DETAILS',
        answer: { area_m2: 120, bedrooms: 3, bathrooms: 2 },
      })
      .expect(200);

    expect(detRes.body.question.step).toBe('PRICE');

    // 8. Answer PRICE
    const priceRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({ userId, step: 'PRICE', answer: 2500000 })
      .expect(200);

    expect(priceRes.body.question.step).toBe('MEDIA');

    // 9. Skip MEDIA
    const mediaRes = await request(app.getHttpServer())
      .post('/onboarding/answer')
      .send({ userId, step: 'MEDIA', answer: 'skip' })
      .expect(200);

    expect(mediaRes.body.question.step).toBe('REVIEW');

    // Verify the draft data via direct DB query
    // (Review/Submit endpoints are T28-T30 scope, not yet wired)
    const draft = await prisma.propertyDraft.findFirst({
      where: { userId, isCompleted: false },
    });
    expect(draft).toBeDefined();
    expect(draft!.currentStep).toBe('REVIEW');

    const draftData = draft!.data as Record<string, unknown>;
    expect(draftData.property_type).toBe('APARTMENT');
    expect(draftData.listing_type).toBe('SALE');
    expect(draftData.governorate_name).toBe('القاهرة');
    expect(draftData.governorate_id).toBeDefined();
    expect(draftData.city_name).toBe('مدينة نصر');
    expect(draftData.city_id).toBeDefined();
    expect(draftData.district_name).toBeDefined();
    expect(draftData.district_id).toBeDefined();
    expect(draftData.price).toBe(2500000);
  });

  it('should return location endpoints correctly', async () => {
    // GET /locations/governorates
    const govRes = await request(app.getHttpServer())
      .get('/locations/governorates')
      .expect(200);

    expect(govRes.body.governorates).toBeDefined();
    expect(govRes.body.governorates.length).toBeGreaterThan(0);
    expect(govRes.body.governorates[0]).toHaveProperty('id');
    expect(govRes.body.governorates[0]).toHaveProperty('nameAr');

    // GET /locations/cities — Cairo (id=1)
    const cityRes = await request(app.getHttpServer())
      .get('/locations/cities')
      .query({ governorateId: 1 })
      .expect(200);

    expect(cityRes.body.cities).toBeDefined();
    expect(cityRes.body.cities.length).toBeGreaterThan(0);

    // GET /locations/districts — first city
    const firstCityId = cityRes.body.cities[0].id;
    const distRes = await request(app.getHttpServer())
      .get('/locations/districts')
      .query({ cityId: firstCityId })
      .expect(200);

    expect(distRes.body.districts).toBeDefined();

    // Invalid governorate → 404
    await request(app.getHttpServer())
      .get('/locations/cities')
      .query({ governorateId: 99999 })
      .expect(404);

    // Missing param → 400
    await request(app.getHttpServer())
      .get('/locations/cities')
      .expect(400);
  });
});
