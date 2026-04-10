/**
 * E2E: Full Onboarding Journey (T41–T43 scope)
 *
 * Covers three complete scenarios end-to-end through the real NestJS
 * application + MySQL database:
 *
 *   1. APARTMENT for SALE — all 10 steps → submit → verify Property + media + draft
 *   2. SHOP for SALE — DETAILS step is skipped → submit → verify no bedrooms/bathrooms
 *   3. Resume interrupted flow — answer 3 steps, restart, verify resume at step 4
 *
 * Prerequisites (same as onboarding-location.e2e-spec.ts):
 *   - MySQL running with migrations applied
 *   - Locations table seeded (Cairo / Nasr City / district row must exist)
 */

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

// ─── Helpers ────────────────────────────────────────────────────

/** Issue a POST /onboarding/answer and assert the HTTP status is 200. */
async function answer(
  app: INestApplication,
  userId: string,
  step: string,
  value: unknown,
) {
  const res = await request(app.getHttpServer())
    .post('/onboarding/answer')
    .send({ userId, step, answer: value })
    .expect(200);

  // All onboarding answers must use the { success, data } envelope
  expect(res.body.success).toBe(true);
  expect(res.body.data).toBeDefined();
  return res.body.data as { draft: Record<string, unknown>; question: Record<string, unknown> | null };
}

/** Pick the option whose label matches `label` from a question's option list. */
function pickOption(options: Array<{ id: number; label: string }>, label: string) {
  const found = options.find((o) => o.label === label);
  if (!found) {
    throw new Error(
      `Option "${label}" not found. Available: ${options.map((o) => o.label).join(', ')}`,
    );
  }
  return found;
}

/** Pick the first available option from a list. */
function pickFirst(options: Array<{ id: number; label: string }>) {
  if (!options.length) throw new Error('Option list is empty');
  return options[0];
}

// ─── Suite setup ────────────────────────────────────────────────

describe('Onboarding — Full Journey (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Each test uses its own isolated userId so tests are independent
  const makeUserId = () => `e2e-journey-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror production middleware exactly
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.enableCors();

    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Cascade-delete all test data in dependency order
    await prisma.propertyMedia.deleteMany({
      where: { draft: { userId: { in: createdUserIds } } },
    });
    await prisma.propertyMedia.deleteMany({
      where: { property: { userId: { in: createdUserIds } } },
    });
    await prisma.propertyDraft.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.property.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await app.close();
  });

  /** Create a real User row and register the id for afterAll cleanup. */
  async function createUser(): Promise<string> {
    const id = makeUserId();
    const phone = `+201${Date.now().toString().slice(-9)}`;
    await prisma.user.create({
      data: { id, name: 'E2E Journey Test', phone },
    });
    createdUserIds.push(id);
    return id;
  }

  // ─────────────────────────────────────────────────────────────
  // Scenario 1 — APARTMENT for SALE (full 10-step journey)
  // ─────────────────────────────────────────────────────────────

  describe('Scenario 1: APARTMENT for SALE — full 10-step journey', () => {
    let userId: string;
    let draftId: string;
    let mediaId: string;

    beforeAll(async () => {
      userId = await createUser();
    });

    it('POST /onboarding/start — creates draft at PROPERTY_TYPE', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding/start')
        .send({ userId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.draft).toBeDefined();
      expect(res.body.data.draft.currentStep).toBe('PROPERTY_TYPE');
      expect(res.body.data.draft.isCompleted).toBe(false);
      expect(res.body.data.question.step).toBe('PROPERTY_TYPE');
      expect(res.body.data.question.inputType).toBe('multi-choice');
      expect(res.body.data.question.options).toEqual(
        expect.arrayContaining(['شقة', 'فيلا', 'محل', 'مكتب']),
      );

      draftId = res.body.data.draft.id;
    });

    it('answer PROPERTY_TYPE → advances to LISTING_TYPE', async () => {
      const { draft, question } = await answer(app, userId, 'PROPERTY_TYPE', 'شقة');
      expect(draft.currentStep).toBe('LISTING_TYPE');
      expect(question!['step']).toBe('LISTING_TYPE');
      expect(question!['options']).toEqual(expect.arrayContaining(['بيع', 'إيجار']));
    });

    it('answer LISTING_TYPE → advances to GOVERNORATE with DB options', async () => {
      const { draft, question } = await answer(app, userId, 'LISTING_TYPE', 'بيع');
      expect(draft.currentStep).toBe('GOVERNORATE');
      expect(question!['step']).toBe('GOVERNORATE');
      // Dynamic options loaded from DB — must be { id, label } objects
      expect(Array.isArray(question!['options'])).toBe(true);
      expect((question!['options'] as any[]).length).toBeGreaterThan(0);
      expect((question!['options'] as any[])[0]).toHaveProperty('id');
      expect((question!['options'] as any[])[0]).toHaveProperty('label');
    });

    it('answer GOVERNORATE (القاهرة) → advances to CITY with filtered options', async () => {
      const govOptions = await request(app.getHttpServer())
        .post('/onboarding/answer')
        .send({ userId, step: 'LISTING_TYPE', answer: 'بيع' })
        // We already answered LISTING_TYPE above, so re-query the current question
        .then(() =>
          request(app.getHttpServer())
            .get('/onboarding/question')
            .query({ userId })
            .expect(200)
            .then((r) => r.body.data.options as Array<{ id: number; label: string }>),
        );

      const cairo = pickOption(govOptions, 'القاهرة');

      const { draft, question } = await answer(app, userId, 'GOVERNORATE', cairo);
      expect(draft.currentStep).toBe('CITY');
      expect(question!['step']).toBe('CITY');
      // City question should mention the chosen governorate name
      expect(question!['question']).toContain('القاهرة');
      expect((question!['options'] as any[]).length).toBeGreaterThan(0);
    });

    it('answer CITY (مدينة نصر) → advances to DISTRICT', async () => {
      const cityOptions = await request(app.getHttpServer())
        .get('/onboarding/question')
        .query({ userId })
        .expect(200)
        .then((r) => r.body.data.options as Array<{ id: number; label: string }>);

      const nasrCity = pickOption(cityOptions, 'مدينة نصر');

      const { draft, question } = await answer(app, userId, 'CITY', nasrCity);
      expect(draft.currentStep).toBe('DISTRICT');
      expect(question!['step']).toBe('DISTRICT');
      expect(question!['question']).toContain('مدينة نصر');
      expect((question!['options'] as any[]).length).toBeGreaterThan(0);
    });

    it('answer DISTRICT → advances to DETAILS', async () => {
      const distOptions = await request(app.getHttpServer())
        .get('/onboarding/question')
        .query({ userId })
        .expect(200)
        .then((r) => r.body.data.options as Array<{ id: number; label: string }>);

      const dist = pickFirst(distOptions);

      const { draft, question } = await answer(app, userId, 'DISTRICT', dist);
      expect(draft.currentStep).toBe('DETAILS');
      expect(question!['step']).toBe('DETAILS');
      expect(question!['inputType']).toBe('form');
    });

    it('answer DETAILS → advances to PRICE', async () => {
      const { draft, question } = await answer(app, userId, 'DETAILS', {
        area_m2: 120,
        bedrooms: 3,
        bathrooms: 2,
      });
      expect(draft.currentStep).toBe('PRICE');
      expect(question!['step']).toBe('PRICE');
      expect(question!['inputType']).toBe('number');
    });

    it('answer PRICE → advances to MEDIA', async () => {
      const { draft, question } = await answer(app, userId, 'PRICE', 2500000);
      expect(draft.currentStep).toBe('MEDIA');
      expect(question!['step']).toBe('MEDIA');
    });

    it('POST /onboarding/upload-media — attaches image to draft', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding/upload-media')
        .send({
          userId,
          url: 'https://cdn.example.com/property/main.jpg',
          type: 'IMAGE',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.draftId).toBe(draftId);
      expect(res.body.data.propertyId).toBeNull();
      expect(res.body.data.url).toBe('https://cdn.example.com/property/main.jpg');
      expect(res.body.data.type).toBe('IMAGE');

      mediaId = res.body.data.id;
    });

    it('answer MEDIA (skip) → advances to REVIEW', async () => {
      const { draft, question } = await answer(app, userId, 'MEDIA', null);
      expect(draft.currentStep).toBe('REVIEW');
      expect(question!['step']).toBe('REVIEW');
    });

    it('GET /onboarding/review — reports complete data, no missing fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/onboarding/review')
        .query({ userId })
        .expect(200);

      expect(res.body.success).toBe(true);
      const { data, isComplete, missingFields } = res.body.data;
      expect(isComplete).toBe(true);
      expect(missingFields).toHaveLength(0);
      expect(data.property_type).toBe('APARTMENT');
      expect(data.listing_type).toBe('SALE');
      expect(data.governorate_name).toBe('القاهرة');
      expect(data.city_name).toBe('مدينة نصر');
      expect(data.district_name).toBeDefined();
      expect(data.price).toBe(2500000);
      expect(data.details.area_m2).toBe(120);
      expect(data.details.bedrooms).toBe(3);
      expect(data.details.bathrooms).toBe(2);
    });

    it('POST /onboarding/submit — creates Property, transfers media, completes draft', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding/submit')
        .send({ userId })
        .expect(201);

      expect(res.body.success).toBe(true);

      const property = res.body.data;
      expect(property.id).toBeDefined();
      expect(property.userId).toBe(userId);
      expect(property.propertyKind).toBe('APARTMENT');
      expect(property.type).toBe('SALE');
      expect(property.governorate).toBe('القاهرة');
      expect(property.city).toBe('مدينة نصر');
      expect(Number(property.price)).toBe(2500000);

      // ── Verify Property row in DB ────────────────────────────
      const dbProperty = await prisma.property.findUnique({
        where: { id: property.id },
      });
      expect(dbProperty).not.toBeNull();
      expect(dbProperty!.propertyKind).toBe('APARTMENT');
      expect(dbProperty!.type).toBe('SALE');
      expect(Number(dbProperty!.areaM2)).toBe(120);
      expect(dbProperty!.bedrooms).toBe(3);
      expect(dbProperty!.bathrooms).toBe(2);

      // ── Verify media was transferred from draft to property ──
      const dbMedia = await prisma.propertyMedia.findUnique({
        where: { id: mediaId },
      });
      expect(dbMedia).not.toBeNull();
      expect(dbMedia!.propertyId).toBe(property.id); // transferred
      expect(dbMedia!.draftId).toBeNull();            // cleared

      // ── Verify draft is marked completed ────────────────────
      const dbDraft = await prisma.propertyDraft.findUnique({
        where: { id: draftId },
      });
      expect(dbDraft).not.toBeNull();
      expect(dbDraft!.isCompleted).toBe(true);
      expect(dbDraft!.currentStep).toBe('COMPLETED');
      expect(dbDraft!.propertyId).toBe(property.id);
    });

    it('POST /onboarding/submit again — 404 because no active draft', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding/submit')
        .send({ userId })
        .expect(404);

      expect(res.body.success).toBeUndefined(); // error responses don't use envelope
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 2 — SHOP for SALE (DETAILS step skipped)
  // ─────────────────────────────────────────────────────────────

  describe('Scenario 2: SHOP for SALE — DETAILS step is skipped', () => {
    let userId: string;

    beforeAll(async () => {
      userId = await createUser();
    });

    it('completes the SHOP flow and submits without bedrooms/bathrooms', async () => {
      // Start
      await request(app.getHttpServer())
        .post('/onboarding/start')
        .send({ userId })
        .expect(201);

      // PROPERTY_TYPE → محل (SHOP)
      await answer(app, userId, 'PROPERTY_TYPE', 'محل');

      // LISTING_TYPE → بيع
      await answer(app, userId, 'LISTING_TYPE', 'بيع');

      // GOVERNORATE — get options dynamically
      const govOptions = await request(app.getHttpServer())
        .get('/onboarding/question')
        .query({ userId })
        .expect(200)
        .then((r) => r.body.data.options as Array<{ id: number; label: string }>);
      await answer(app, userId, 'GOVERNORATE', pickOption(govOptions, 'القاهرة'));

      // CITY
      const cityOptions = await request(app.getHttpServer())
        .get('/onboarding/question')
        .query({ userId })
        .expect(200)
        .then((r) => r.body.data.options as Array<{ id: number; label: string }>);
      await answer(app, userId, 'CITY', pickOption(cityOptions, 'مدينة نصر'));

      // DISTRICT
      const distOptions = await request(app.getHttpServer())
        .get('/onboarding/question')
        .query({ userId })
        .expect(200)
        .then((r) => r.body.data.options as Array<{ id: number; label: string }>);
      const { question: afterDist } = await answer(app, userId, 'DISTRICT', pickFirst(distOptions));

      // DETAILS must be skipped for SHOP → jumps straight to PRICE
      expect(afterDist!['step']).toBe('PRICE');

      // PRICE
      const { question: afterPrice } = await answer(app, userId, 'PRICE', 850000);
      expect(afterPrice!['step']).toBe('MEDIA');

      // MEDIA (skip)
      const { question: afterMedia } = await answer(app, userId, 'MEDIA', null);
      expect(afterMedia!['step']).toBe('REVIEW');

      // SUBMIT
      const res = await request(app.getHttpServer())
        .post('/onboarding/submit')
        .send({ userId })
        .expect(201);

      expect(res.body.success).toBe(true);
      const property = res.body.data;

      // ── DB assertions ────────────────────────────────────────
      const dbProperty = await prisma.property.findUnique({
        where: { id: property.id },
      });
      expect(dbProperty!.propertyKind).toBe('SHOP');
      // SHOP must have null bedrooms / bathrooms / area_m2
      expect(dbProperty!.bedrooms).toBeNull();
      expect(dbProperty!.bathrooms).toBeNull();
      expect(dbProperty!.areaM2).toBeNull();
      expect(Number(dbProperty!.price)).toBe(850000);

      // Draft completed
      const draft = await prisma.propertyDraft.findFirst({
        where: { userId },
      });
      expect(draft!.isCompleted).toBe(true);
      expect(draft!.currentStep).toBe('COMPLETED');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Scenario 3 — Resume interrupted flow
  // ─────────────────────────────────────────────────────────────

  describe('Scenario 3: Resume interrupted flow at the correct step', () => {
    let userId: string;
    let firstDraftId: string;

    beforeAll(async () => {
      userId = await createUser();
    });

    it('answers 3 steps, then calling /start again resumes at step 4', async () => {
      // First session: start + answer PROPERTY_TYPE + LISTING_TYPE
      const startRes = await request(app.getHttpServer())
        .post('/onboarding/start')
        .send({ userId })
        .expect(201);

      firstDraftId = startRes.body.data.draft.id;
      expect(startRes.body.data.question.step).toBe('PROPERTY_TYPE');

      await answer(app, userId, 'PROPERTY_TYPE', 'فيلا');
      await answer(app, userId, 'LISTING_TYPE', 'إيجار');

      // At this point the draft should be at GOVERNORATE
      const midDraft = await prisma.propertyDraft.findUnique({
        where: { id: firstDraftId },
      });
      expect(midDraft!.currentStep).toBe('GOVERNORATE');

      // Second session: POST /start for the same user
      const resumeRes = await request(app.getHttpServer())
        .post('/onboarding/start')
        .send({ userId })
        .expect(201);

      // Same draft id — not a new one
      expect(resumeRes.body.data.draft.id).toBe(firstDraftId);
      // Resumes at the step where we left off
      expect(resumeRes.body.data.draft.currentStep).toBe('GOVERNORATE');
      expect(resumeRes.body.data.question.step).toBe('GOVERNORATE');
      // Collected data is preserved
      const draftData = resumeRes.body.data.draft.data as Record<string, unknown>;
      expect(draftData.property_type).toBe('VILLA');
      expect(draftData.listing_type).toBe('RENT');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Validation error cases
  // ─────────────────────────────────────────────────────────────

  describe('Validation errors', () => {
    let userId: string;

    beforeAll(async () => {
      userId = await createUser();

      // Start the draft
      await request(app.getHttpServer())
        .post('/onboarding/start')
        .send({ userId })
        .expect(201);
    });

    it('POST /onboarding/start — 400 when body is empty', async () => {
      await request(app.getHttpServer())
        .post('/onboarding/start')
        .send({})
        .expect(400);
    });

    it('POST /onboarding/start — 400 when userId is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/onboarding/start')
        .send({ userId: 'not-a-uuid' })
        .expect(400);
    });

    it('POST /onboarding/answer — 400 when step does not match current step', async () => {
      // Current step is PROPERTY_TYPE, submitting PRICE should fail
      const res = await request(app.getHttpServer())
        .post('/onboarding/answer')
        .send({ userId, step: 'PRICE', answer: 1000000 })
        .expect(400);

      expect(res.body.message).toMatch(/wrong step/i);
    });

    it('POST /onboarding/answer — 400 when answer is an invalid property type', async () => {
      const res = await request(app.getHttpServer())
        .post('/onboarding/answer')
        .send({ userId, step: 'PROPERTY_TYPE', answer: 'قصر' }) // not a valid option
        .expect(400);

      expect(res.body.message).toMatch(/invalid property type/i);
    });

    it('GET /onboarding/question — 400 when userId is not a UUID', async () => {
      await request(app.getHttpServer())
        .get('/onboarding/question')
        .query({ userId: 'bad-id' })
        .expect(400);
    });

    it('GET /onboarding/question — 404 when no active draft exists for user', async () => {
      const unknownId = makeUserId();
      await request(app.getHttpServer())
        .get('/onboarding/question')
        .query({ userId: unknownId })
        .expect(404);
    });

    it('POST /onboarding/upload-media — 400 when url is missing protocol', async () => {
      // Current step might not be MEDIA yet — upload is allowed from any step
      await request(app.getHttpServer())
        .post('/onboarding/upload-media')
        .send({ userId, url: 'not-a-url', type: 'IMAGE' })
        .expect(400);
    });

    it('POST /onboarding/upload-media — 400 when type is invalid', async () => {
      await request(app.getHttpServer())
        .post('/onboarding/upload-media')
        .send({ userId, url: 'https://cdn.example.com/photo.jpg', type: 'PDF' })
        .expect(400);
    });
  });
});
