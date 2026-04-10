import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { OnboardingStep, PropertyKind, PropertyType, LocationType, MediaType, Prisma } from '@prisma/client';
import { ConversationContext, ConversationResponse } from '../common';
import {
  ONBOARDING_QUESTIONS,
  STEP_ORDER,
  getNextStep,
  COMBINED_PROPERTY_MAP,
  AREA_OPTIONS, AREA_MAP,
  BEDROOM_OPTIONS, BEDROOM_MAP,
  BATHROOM_OPTIONS, BATHROOM_MAP,
  SALE_PRICE_OPTIONS, SALE_PRICE_MAP,
  RENT_PRICE_OPTIONS, RENT_PRICE_MAP,
  MEDIA_OPTIONS,
  REVIEW_OPTIONS,
  QuestionDef,
} from './constants/questions';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationsService: LocationsService,
    @Inject(forwardRef(() => RecommendationsService))
    private readonly recommendationsService: RecommendationsService,
  ) {}

  // ─── T12: Start or Resume Draft ─────────────────────────────

  /**
   * Start a new draft or resume existing incomplete one.
   * Only one active (incomplete) draft per user at a time.
   */
  async startOrResumeDraft(userId?: string, phone?: string, restart?: boolean) {
    // Resolve userId from phone when a UUID is not available (e.g. WhatsApp users)
    let resolvedUserId = userId;

    if (!resolvedUserId && phone) {
      const user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        throw new NotFoundException(`No user found with phone ${phone}`);
      }
      resolvedUserId = user.id;
    }

    if (!resolvedUserId) {
      throw new BadRequestException('Either userId or phone is required');
    }

    // Narrow to a plain string so the closure below is typed correctly
    const uid = resolvedUserId;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.propertyDraft.findFirst({
        where: { userId: uid, isCompleted: false },
      });

      if (existing) {
        if (restart) {
          this.logger.log(`Restarting onboarding — deleting existing draft ${existing.id} for user ${uid}`);
          await tx.propertyDraft.delete({ where: { id: existing.id } });
        } else {
          this.logger.log(`Resuming draft ${existing.id} for user ${uid}`);
          return existing;
        }
      }

      const draft = await tx.propertyDraft.create({
        data: {
          userId: uid,
          currentStep: OnboardingStep.PROPERTY_TYPE,
          data: {},
          isCompleted: false,
        },
      });

      this.logger.log(`Created draft ${draft.id} for user ${uid}`);
      return draft;
    });
  }

  // ─── T13: Get Current Question ──────────────────────────────

  /**
   * Get the current question for the user's active draft.
   * Throws 404 if no active draft.
   */
  async getCurrentQuestion(userId: string) {
    const draft = await this.getActiveDraft(userId);
    const def = ONBOARDING_QUESTIONS[draft.currentStep];
    const data = (draft.data as Record<string, unknown>) ?? {};

    // Apply template substitution for location step questions
    let question = def.question;
    if (question.includes('{governorate_name}') && data.governorate_name) {
      question = question.replace('{governorate_name}', data.governorate_name as string);
    }
    if (question.includes('{city_name}') && data.city_name) {
      question = question.replace('{city_name}', data.city_name as string);
    }

    // Load dynamic options from DB for location steps
    let options: Array<{ id: number; label: string }> | string[] | undefined = def.options;
    if (def.optionsSource) {
      switch (def.optionsSource) {
        case 'governorates': {
          const govs = await this.locationsService.getGovernorates();
          options = govs.map((g) => ({ id: g.id, label: g.nameAr }));
          break;
        }
        case 'cities': {
          const govId = data.governorate_id as number | undefined;
          if (govId) {
            const cities = await this.locationsService.getCities(govId);
            options = cities.map((c) => ({ id: c.id, label: c.nameAr }));
          } else {
            options = [];
          }
          break;
        }
        case 'districts': {
          const cityId = data.city_id as number | undefined;
          if (cityId) {
            const districts = await this.locationsService.getDistricts(cityId);
            options = districts.map((d) => ({ id: d.id, label: d.nameAr }));
          } else {
            options = [];
          }
          break;
        }
      }
    }

    // ─── MCQ overrides for remaining steps ──────────────────
    let inputType: QuestionDef['inputType'] = def.inputType;

    // DETAILS sub-steps (area → bedrooms → bathrooms)
    if (draft.currentStep === OnboardingStep.DETAILS) {
      inputType = 'multi-choice';
      const substep = (data._details_substep as string) ?? 'area';
      if (substep === 'bedrooms') {
        question = 'كام أوضة نوم؟ 🛏️';
        options = BEDROOM_OPTIONS;
      } else if (substep === 'bathrooms') {
        question = 'كام حمام؟ 🚿';
        options = BATHROOM_OPTIONS;
      } else {
        question = 'المساحة كام متر مربع؟ 📐';
        options = AREA_OPTIONS;
      }
    }

    // PRICE – dynamic options based on sale vs rent
    if (draft.currentStep === OnboardingStep.PRICE) {
      inputType = 'multi-choice';
      const isSale = data.listing_type === 'SALE';
      question = isSale ? 'سعر البيع المتوقع كام؟ 💰' : 'الإيجار الشهري المتوقع كام؟ 💰';
      options = isSale ? SALE_PRICE_OPTIONS : RENT_PRICE_OPTIONS;
    }

    // REVIEW – data summary + confirm button
    if (draft.currentStep === OnboardingStep.REVIEW) {
      inputType = 'multi-choice';
      question = this.buildReviewSummary(data);
      options = REVIEW_OPTIONS;
    }

    return {
      step: draft.currentStep,
      question,
      inputType,
      options,
      fields: def.fields,
    };
  }

  // ─── T15: Submit Answer ─────────────────────────────────────

  /**
   * Submit an answer for the current step.
   * Validates the answer, merges into draft data, advances step.
   */
  async submitAnswer(userId: string, step: OnboardingStep, answer: unknown) {
    const draft = await this.getActiveDraft(userId);

    // Verify step matches current step
    if (draft.currentStep !== step) {
      throw new BadRequestException(
        `Wrong step: expected ${draft.currentStep}, got ${step}`,
      );
    }

    // COMPLETED and REVIEW don't accept answers via this endpoint
    if (
      step === OnboardingStep.COMPLETED ||
      step === OnboardingStep.REVIEW
    ) {
      throw new BadRequestException(
        `Cannot submit answer for step ${step}`,
      );
    }

    // Handle DETAILS incremental sub-steps (area → bedrooms → bathrooms)
    if (step === OnboardingStep.DETAILS && typeof answer !== 'object') {
      const draftData = (draft.data as Record<string, unknown>) ?? {};
      const substep = (draftData._details_substep as string) ?? 'area';
      const input = String(answer).trim();

      if (substep === 'area') {
        const area = AREA_MAP[input] ?? Number(input);
        if (isNaN(area) || area <= 0) throw new BadRequestException('Invalid area');
        draftData._temp_area = area;
        draftData._details_substep = 'bedrooms';
        return this.prisma.propertyDraft.update({
          where: { id: draft.id },
          data: { data: draftData as Prisma.InputJsonValue },
        });
      }

      if (substep === 'bedrooms') {
        let bedrooms = BEDROOM_MAP[input];
        if (bedrooms === undefined) {
          const parsed = parseInt(input, 10);
          if (!isNaN(parsed) && parsed >= 0) bedrooms = parsed;
          else throw new BadRequestException('Invalid bedrooms');
        }
        draftData._temp_bedrooms = bedrooms;
        draftData._details_substep = 'bathrooms';
        return this.prisma.propertyDraft.update({
          where: { id: draft.id },
          data: { data: draftData as Prisma.InputJsonValue },
        });
      }

      if (substep === 'bathrooms') {
        let bathrooms = BATHROOM_MAP[input];
        if (bathrooms === undefined) {
          const parsed = parseInt(input, 10);
          if (!isNaN(parsed) && parsed >= 0) bathrooms = parsed;
          else throw new BadRequestException('Invalid bathrooms');
        }
        // Build final object and clean up temps
        answer = {
          area_m2: draftData._temp_area,
          bedrooms: draftData._temp_bedrooms,
          bathrooms,
        };
        delete draftData._temp_area;
        delete draftData._temp_bedrooms;
        delete draftData._details_substep;
        draft.data = draftData as any;
      }
    }

    // Validate and normalize the answer
    const validated = await this.validateAnswer(step, answer, draft.data as Record<string, unknown>);

    // Merge into draft data
    const currentData = (draft.data as Record<string, unknown>) ?? {};
    const updatedData = { ...currentData, ...validated };

    // Advance step (pass data for SHOP skip rule)
    const nextStep = getNextStep(step, updatedData);

    const updated = await this.prisma.propertyDraft.update({
      where: { id: draft.id },
      data: {
        currentStep: nextStep,
        data: updatedData as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Draft ${draft.id}: step ${step} → ${nextStep}`,
    );

    return updated;
  }

  // ─── T17: Get Review ────────────────────────────────────────

  /**
   * Get all collected data for review.
   * Must be at REVIEW step or later.
   */
  async getReview(userId: string) {
    const draft = await this.getActiveDraft(userId);

    const data = (draft.data as Record<string, unknown>) ?? {};

    // Check required fields
    const requiredFields = [
      'property_type',
      'listing_type',
      'governorate_id',
      'governorate_name',
      'city_id',
      'city_name',
      'district_id',
      'district_name',
      'price',
    ];
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      if (!data[field]) {
        missingFields.push(field);
      }
    }

    // Check details (not required for SHOP)
    const details = data.details as Record<string, unknown> | undefined;
    if (data.property_type !== 'SHOP' && !details?.area_m2) {
      missingFields.push('details.area_m2');
    }

    return {
      draft,
      data,
      isComplete: missingFields.length === 0,
      missingFields,
    };
  }

  // ─── T18: Edit Field ────────────────────────────────────────

  /**
   * Go back to a specific step from REVIEW.
   * After re-answering, flow continues forward back to REVIEW.
   */
  async editField(userId: string, targetStep: OnboardingStep) {
    const draft = await this.getActiveDraft(userId);

    if (draft.currentStep !== OnboardingStep.REVIEW) {
      throw new BadRequestException(
        'Can only edit fields from REVIEW step',
      );
    }

    if (targetStep === OnboardingStep.COMPLETED || targetStep === OnboardingStep.REVIEW) {
      throw new BadRequestException(
        `Cannot edit step ${targetStep}`,
      );
    }

    // Clear dependent data to prevent stale values
    const currentData = (draft.data as Record<string, unknown>) ?? {};
    const clearedData = this.clearDependentData(targetStep, currentData);

    const updated = await this.prisma.propertyDraft.update({
      where: { id: draft.id },
      data: {
        currentStep: targetStep,
        data: clearedData as Prisma.InputJsonValue,
      },
    });

    const def = ONBOARDING_QUESTIONS[targetStep];
    return {
      draft: updated,
      step: targetStep,
      question: def.question,
      inputType: def.inputType,
      options: def.options,
      fields: def.fields,
    };
  }

  /**
   * When rewinding to a step, clear all data collected AFTER that step.
   * e.g., editing GOVERNORATE wipes city, district, details, price, media.
   */
  private clearDependentData(
    targetStep: OnboardingStep,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const stepIndex = STEP_ORDER.indexOf(targetStep);
    const fieldsByStep: Record<number, string[]> = {
      [STEP_ORDER.indexOf(OnboardingStep.PROPERTY_TYPE)]: ['property_type', 'listing_type'],
      [STEP_ORDER.indexOf(OnboardingStep.GOVERNORATE)]: ['governorate_id', 'governorate_name'],
      [STEP_ORDER.indexOf(OnboardingStep.CITY)]: ['city_id', 'city_name'],
      [STEP_ORDER.indexOf(OnboardingStep.DISTRICT)]: ['district_id', 'district_name'],
      [STEP_ORDER.indexOf(OnboardingStep.DETAILS)]: ['details'],
      [STEP_ORDER.indexOf(OnboardingStep.PRICE)]: ['price'],
      [STEP_ORDER.indexOf(OnboardingStep.MEDIA)]: ['media_skipped'],
    };

    // Remove all fields from the target step onward (user will re-answer them)
    const cleaned = { ...data };
    for (let i = stepIndex; i < STEP_ORDER.length; i++) {
      const fields = fieldsByStep[i];
      if (fields) {
        for (const field of fields) {
          delete cleaned[field];
        }
      }
    }

    return cleaned;
  }

  // ─── T19: Final Submit ──────────────────────────────────────

  /**
   * Final submit: create Property, transfer media, mark draft completed.
   * Uses a Prisma transaction for atomicity.
   */
  async finalSubmit(userId: string) {
    const draft = await this.getActiveDraft(userId);

    if (draft.currentStep !== OnboardingStep.REVIEW) {
      throw new BadRequestException(
        `Draft must be at REVIEW step, currently at ${draft.currentStep}`,
      );
    }

    const data = draft.data as Record<string, unknown>;
    const details = data.details as Record<string, unknown> | null;
    const propertyType = data.property_type as string;

    // Validate all required fields
    if (!data.property_type || !data.listing_type || !data.price) {
      throw new BadRequestException('Missing required fields');
    }
    if (!data.governorate_name) {
      throw new BadRequestException('Missing governorate');
    }
    // SHOP properties don't require details
    if (propertyType !== 'SHOP' && !details?.area_m2) {
      throw new BadRequestException('Missing area_m2 in details');
    }

    // Map to Prisma types
    const propertyKind = data.property_type as PropertyKind;
    const listingType = data.listing_type as string;
    const type = listingType === 'SALE' ? PropertyType.SALE : PropertyType.RENT;

    const property = await this.prisma.$transaction(async (tx) => {
      // 1. Create Property
      const prop = await tx.property.create({
        data: {
          userId,
          title: `${propertyKind} for ${type.toLowerCase()}`,
          price: data.price as number,
          type,
          propertyKind,
          bedrooms: propertyType === 'SHOP' ? null : (details?.bedrooms as number) ?? null,
          bathrooms: propertyType === 'SHOP' ? null : (details?.bathrooms as number) ?? null,
          areaM2: propertyType === 'SHOP' ? null : (details?.area_m2 as number),
          governorate: (data.governorate_name as string) ?? null,
          city: (data.city_name as string) ?? null,
          district: (data.district_name as string) ?? null,
          zone: null,
          nearestLandmark: null,
        },
      });

      // 2. Transfer media from draft to property
      await tx.propertyMedia.updateMany({
        where: { draftId: draft.id },
        data: {
          propertyId: prop.id,
          draftId: null,
        },
      });

      // 3. Mark draft completed
      await tx.propertyDraft.update({
        where: { id: draft.id },
        data: {
          propertyId: prop.id,
          currentStep: OnboardingStep.COMPLETED,
          isCompleted: true,
        },
      });

      this.logger.log(
        `Draft ${draft.id} → Property ${prop.id} created`,
      );

      return prop;
    });

    // Fire-and-forget: match buyers for the newly created property
    this.recommendationsService
      .matchBuyersForProperty(property)
      .catch((err) =>
        this.logger.warn(`Buyer matching failed for property ${property.id}: ${err}`),
      );

    return property;
  }

  // ─── T20: Upload Media ──────────────────────────────────────

  /**
   * Upload a media file reference linked to the active draft.
   */
  async uploadMedia(userId: string, url: string, mediaType: MediaType) {
    const draft = await this.getActiveDraft(userId);

    if (!url || typeof url !== 'string') {
      throw new BadRequestException('URL is required');
    }

    const media = await this.prisma.propertyMedia.create({
      data: {
        draftId: draft.id,
        url,
        type: mediaType,
      },
    });

    this.logger.log(`Media ${media.id} uploaded for draft ${draft.id}`);
    return media;
  }

  // ─── Message-based interaction layer ───────────────────────

  /**
   * Handle a single user message in the onboarding flow.
   *
   * Orchestrates the full round-trip:
   *   1. Load the active draft to determine current step.
   *   2. Submit the input as the answer for that step (validates + advances).
   *   3. Fetch and return the next question.
   *
   * This method composes existing public methods and adds no new business logic.
   * It is the entry point used by ConversationEngineService for onboarding routing.
   *
   * @param userId  - Platform user ID
   * @param input   - Raw user input (string value submitted for the current step)
   * @returns Next question envelope from getCurrentQuestion()
   */
  async handleMessage(
    context: ConversationContext,
    input: string,
  ): Promise<ConversationResponse> {
    const { userId } = context;
    const draft = await this.getActiveDraft(userId);
    const currentStep = draft.currentStep;

    // ─── Welcome for first interaction ────────────────────────
    if (currentStep === OnboardingStep.PROPERTY_TYPE && !COMBINED_PROPERTY_MAP[input.trim()]) {
      const q = await this.getCurrentQuestion(userId);
      return {
        message: `أهلاً بيك! 👋 يلا نبدأ نسجل عقارك.\n\n${q.question}`,
        action: q.step,
        data: q,
      };
    }

    // ─── DETAILS sub-steps (area → bedrooms → bathrooms) ──────
    if (currentStep === OnboardingStep.DETAILS) {
      return this.handleDetailsSubStep(userId, draft, input.trim());
    }

    // ─── PRICE ────────────────────────────────────────────────
    if (currentStep === OnboardingStep.PRICE) {
      const data = (draft.data as Record<string, unknown>) ?? {};
      return this.handlePriceStep(userId, data, input.trim());
    }

    // ─── MEDIA (auto-skip) ───────────────────────────────────
    if (currentStep === OnboardingStep.MEDIA) {
      return this.handleMediaStep(userId);
    }

    // ─── REVIEW → finalSubmit ────────────────────────────────
    if (currentStep === OnboardingStep.REVIEW) {
      return this.handleReviewStep(userId, input.trim());
    }

    // ─── Location steps: resolve text label → { id } ─────────
    let answer: unknown = input;
    const locationSteps: OnboardingStep[] = [
      OnboardingStep.GOVERNORATE,
      OnboardingStep.CITY,
      OnboardingStep.DISTRICT,
    ];
    if (locationSteps.includes(currentStep)) {
      const questionData = await this.getCurrentQuestion(userId);
      if (Array.isArray(questionData.options)) {
        const match = (questionData.options as Array<{ id: number; label: string }>)
          .find((opt) => typeof opt === 'object' && opt.label === input.trim());
        if (match) {
          answer = { id: match.id };
        }
      }
    }

    // ─── Default: submit + next question ──────────────────────
    try {
      await this.submitAnswer(userId, currentStep, answer);
    } catch (err) {
      if (err instanceof BadRequestException) {
        const currentQuestion = await this.getCurrentQuestion(userId);
        return {
          message: `الرجاء اختر من الخيارات المتاحة 👇\n\n${currentQuestion.question}`,
          action: currentQuestion.step,
          data: currentQuestion,
        };
      }
      throw err;
    }

    const next = await this.getCurrentQuestion(userId);
    return {
      message: next.question,
      action: next.step,
      data: next,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────

  /**
   * Get active (incomplete) draft for user, or throw 404.
   */
  private async getActiveDraft(userId: string) {
    const draft = await this.prisma.propertyDraft.findFirst({
      where: { userId, isCompleted: false },
    });

    if (!draft) {
      throw new NotFoundException(
        `No active draft found for user ${userId}`,
      );
    }

    return draft;
  }

  // ─── T14: Step Validation Helpers ───────────────────────────

  /**
   * Validate answer for a given step. Returns a normalized key-value
   * object to merge into draft.data.
   */
  private async validateAnswer(
    step: OnboardingStep,
    answer: unknown,
    currentData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (step) {
      case OnboardingStep.PROPERTY_TYPE:
        return this.validatePropertyType(answer);
      case OnboardingStep.GOVERNORATE:
        return this.validateGovernorate(answer);
      case OnboardingStep.CITY:
        return this.validateCity(answer, currentData);
      case OnboardingStep.DISTRICT:
        return this.validateDistrict(answer, currentData);
      case OnboardingStep.DETAILS:
        return this.validateDetails(answer);
      case OnboardingStep.PRICE:
        return this.validatePrice(answer, currentData);
      case OnboardingStep.MEDIA:
        return this.validateMedia(answer);
      default:
        throw new BadRequestException(`No validator for step ${step}`);
    }
  }

  private validatePropertyType(answer: unknown): Record<string, unknown> {
    if (typeof answer !== 'string') {
      throw new BadRequestException('Property type must be a string');
    }

    const mapped = COMBINED_PROPERTY_MAP[answer];
    if (!mapped) {
      const valid = Object.keys(COMBINED_PROPERTY_MAP).join(', ');
      throw new BadRequestException(
        `Invalid property type "${answer}". Valid options: ${valid}`,
      );
    }

    return { property_type: mapped.kind, listing_type: mapped.listingType };
  }

  private async validateGovernorate(answer: unknown): Promise<Record<string, unknown>> {
    if (typeof answer !== 'object' || answer === null) {
      throw new BadRequestException('Governorate answer must be an object with { id }');
    }

    const obj = answer as Record<string, unknown>;
    const id = Number(obj.id);

    if (!id || isNaN(id)) {
      throw new BadRequestException('Governorate id must be a valid number');
    }

    // Validate against DB — use server-side nameAr, not client label
    const validated = await this.locationsService.validateLocationId(
      id,
      LocationType.GOVERNORATE,
    );

    return { governorate_id: validated.id, governorate_name: validated.nameAr };
  }

  private async validateCity(
    answer: unknown,
    currentData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (typeof answer !== 'object' || answer === null) {
      throw new BadRequestException('City answer must be an object with { id }');
    }

    const obj = answer as Record<string, unknown>;
    const id = Number(obj.id);

    if (!id || isNaN(id)) {
      throw new BadRequestException('City id must be a valid number');
    }
    if (!currentData.governorate_id) {
      throw new BadRequestException('Governorate must be selected before city');
    }

    // Validate against DB with parent check
    const validated = await this.locationsService.validateLocationId(
      id,
      LocationType.CITY,
      currentData.governorate_id as number,
    );

    return { city_id: validated.id, city_name: validated.nameAr };
  }

  private async validateDistrict(
    answer: unknown,
    currentData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (typeof answer !== 'object' || answer === null) {
      throw new BadRequestException('District answer must be an object with { id }');
    }

    const obj = answer as Record<string, unknown>;
    const id = Number(obj.id);

    if (!id || isNaN(id)) {
      throw new BadRequestException('District id must be a valid number');
    }
    if (!currentData.city_id) {
      throw new BadRequestException('City must be selected before district');
    }

    // Validate against DB with parent check
    const validated = await this.locationsService.validateLocationId(
      id,
      LocationType.DISTRICT,
      currentData.city_id as number,
    );

    return { district_id: validated.id, district_name: validated.nameAr };
  }

  private validateDetails(answer: unknown): Record<string, unknown> {
    if (typeof answer !== 'object' || answer === null) {
      throw new BadRequestException('Details must be an object');
    }

    const det = answer as Record<string, unknown>;

    const areaM2 = Number(det.area_m2);
    if (!det.area_m2 || isNaN(areaM2) || areaM2 <= 0) {
      throw new BadRequestException('area_m2 must be a positive number');
    }

    const bedrooms =
      det.bedrooms !== undefined && det.bedrooms !== null
        ? Number(det.bedrooms)
        : undefined;
    const bathrooms =
      det.bathrooms !== undefined && det.bathrooms !== null
        ? Number(det.bathrooms)
        : undefined;

    if (bedrooms !== undefined && (isNaN(bedrooms) || bedrooms < 0)) {
      throw new BadRequestException('bedrooms must be a non-negative number');
    }
    if (bathrooms !== undefined && (isNaN(bathrooms) || bathrooms < 0)) {
      throw new BadRequestException('bathrooms must be a non-negative number');
    }

    return {
      details: {
        area_m2: areaM2,
        bedrooms: bedrooms ?? null,
        bathrooms: bathrooms ?? null,
      },
    };
  }

  private validatePrice(answer: unknown, currentData: Record<string, unknown>): Record<string, unknown> {
    let price = Number(answer);

    if (isNaN(price) && typeof answer === 'string') {
      const isSale = currentData.listing_type === 'SALE';
      const priceMap = isSale ? SALE_PRICE_MAP : RENT_PRICE_MAP;
      const mappedPrice = priceMap[answer.trim()];
      if (mappedPrice !== undefined) {
        price = mappedPrice;
      }
    }

    if (isNaN(price) || price <= 0) {
      throw new BadRequestException('Price must be a positive number');
    }

    return { price };
  }

  private validateMedia(_answer: unknown): Record<string, unknown> {
    // Media is optional — user can skip
    return { media_skipped: true };
  }

  // ─── MCQ Step Handlers ──────────────────────────────────────

  private async handleDetailsSubStep(
    userId: string,
    draft: { id: string; data: unknown },
    input: string,
  ): Promise<ConversationResponse> {
    const data = (draft.data as Record<string, unknown>) ?? {};
    const substep = (data._details_substep as string) ?? 'area';

    if (substep === 'area') {
      const area = AREA_MAP[input];
      if (area === undefined) {
        return this.buildMcqResponse(
          'الرجاء اختر من الخيارات المتاحة 👇\n\nالمساحة كام متر مربع؟ 📐',
          'DETAILS', AREA_OPTIONS,
        );
      }
      await this.updateDraftData(draft.id, data, { _temp_area: area, _details_substep: 'bedrooms' });
      return this.buildMcqResponse('كام أوضة نوم؟ 🛏️', 'DETAILS', BEDROOM_OPTIONS);
    }

    if (substep === 'bedrooms') {
      const bedrooms = BEDROOM_MAP[input];
      if (bedrooms === undefined) {
        return this.buildMcqResponse(
          'الرجاء اختر من الخيارات المتاحة 👇\n\nكام أوضة نوم؟ 🛏️',
          'DETAILS', BEDROOM_OPTIONS,
        );
      }
      await this.updateDraftData(draft.id, data, { _temp_bedrooms: bedrooms, _details_substep: 'bathrooms' });
      return this.buildMcqResponse('كام حمام؟ 🚿', 'DETAILS', BATHROOM_OPTIONS);
    }

    // substep === 'bathrooms'
    const bathrooms = BATHROOM_MAP[input];
    if (bathrooms === undefined) {
      return this.buildMcqResponse(
        'الرجاء اختر من الخيارات المتاحة 👇\n\nكام حمام؟ 🚿',
        'DETAILS', BATHROOM_OPTIONS,
      );
    }

    // Combine all details and submit
    const fullDetails = {
      area_m2: data._temp_area as number,
      bedrooms: data._temp_bedrooms as number,
      bathrooms,
    };
    await this.submitAnswer(userId, OnboardingStep.DETAILS, fullDetails);

    // Clean up temp fields
    const updatedDraft = await this.getActiveDraft(userId);
    const clean = { ...(updatedDraft.data as Record<string, unknown>) };
    delete clean._temp_area;
    delete clean._temp_bedrooms;
    delete clean._details_substep;
    await this.prisma.propertyDraft.update({
      where: { id: updatedDraft.id },
      data: { data: clean as Prisma.InputJsonValue },
    });

    const next = await this.getCurrentQuestion(userId);
    return { message: next.question, action: next.step, data: next };
  }

  private async handlePriceStep(
    userId: string,
    data: Record<string, unknown>,
    input: string,
  ): Promise<ConversationResponse> {
    const isSale = data.listing_type === 'SALE';
    const priceMap = isSale ? SALE_PRICE_MAP : RENT_PRICE_MAP;
    const price = priceMap[input];

    if (price === undefined) {
      const opts = isSale ? SALE_PRICE_OPTIONS : RENT_PRICE_OPTIONS;
      const q = isSale ? 'سعر البيع المتوقع كام؟ 💰' : 'الإيجار الشهري المتوقع كام؟ 💰';
      return this.buildMcqResponse(`الرجاء اختر من الخيارات المتاحة 👇\n\n${q}`, 'PRICE', opts);
    }

    await this.submitAnswer(userId, OnboardingStep.PRICE, price);
    const next = await this.getCurrentQuestion(userId);
    return { message: next.question, action: next.step, data: next };
  }

  private async handleMediaStep(userId: string): Promise<ConversationResponse> {
    // Auto-skip media (MCQ only has skip option)
    await this.submitAnswer(userId, OnboardingStep.MEDIA, { media_skipped: true });
    const next = await this.getCurrentQuestion(userId);
    return { message: next.question, action: next.step, data: next };
  }

  private async handleReviewStep(
    userId: string,
    input: string,
  ): Promise<ConversationResponse> {
    if (input === '✅ تأكيد ونشر') {
      try {
        const property = await this.finalSubmit(userId);
        return {
          message: '🎉 تم إضافة عقارك بنجاح!\n\nيمكنك الآن متابعة العقار في صفحة العقارات.',
          action: 'COMPLETED',
          data: { step: 'COMPLETED', propertyId: property.id },
        };
      } catch (err) {
        if (err instanceof BadRequestException) {
          const q = await this.getCurrentQuestion(userId);
          return {
            message: `⚠️ ${(err as BadRequestException).message}\n\nحاول تاني.`,
            action: q.step,
            data: q,
          };
        }
        throw err;
      }
    }

    // Any other input → re-show review summary
    const q = await this.getCurrentQuestion(userId);
    return {
      message: `الرجاء اختر من الخيارات 👇\n\n${q.question}`,
      action: q.step,
      data: q,
    };
  }

  // ─── Review Summary Builder ─────────────────────────────────

  private buildReviewSummary(data: Record<string, unknown>): string {
    const TYPE_LABELS: Record<string, string> = {
      APARTMENT: 'شقة', VILLA: 'فيلا', SHOP: 'محل', OFFICE: 'مكتب',
      SUMMER_RESORT: 'مصيف', COMMERCIAL: 'تجارى', LAND_BUILDING: 'مبانى / أراضى'
    };
    const LISTING_LABELS: Record<string, string> = {
      SALE: 'بيع', RENT: 'إيجار',
    };

    const lines: string[] = ['📋 ملخص بيانات العقار:\n'];
    lines.push(`🏠 النوع: ${TYPE_LABELS[data.property_type as string] ?? data.property_type}`);
    lines.push(`📌 الغرض: ${LISTING_LABELS[data.listing_type as string] ?? data.listing_type}`);
    lines.push(`📍 الموقع: ${data.governorate_name} - ${data.city_name} - ${data.district_name}`);

    const details = data.details as Record<string, unknown> | undefined;
    if (details) {
      lines.push(`📐 المساحة: ${details.area_m2} م²`);
      if (details.bedrooms) lines.push(`🛏️ الغرف: ${details.bedrooms}`);
      if (details.bathrooms) lines.push(`🚿 الحمامات: ${details.bathrooms}`);
    }

    const price = data.price as number;
    if (price) {
      const isSale = data.listing_type === 'SALE';
      lines.push(`💰 السعر: ${price.toLocaleString('en')} جنيه${isSale ? '' : '/شهر'}`);
    }

    lines.push('\nهل البيانات صحيحة؟');
    return lines.join('\n');
  }

  // ─── Utility Helpers ────────────────────────────────────────

  private async updateDraftData(
    draftId: string,
    currentData: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const merged = { ...currentData, ...patch };
    await this.prisma.propertyDraft.update({
      where: { id: draftId },
      data: { data: merged as Prisma.InputJsonValue },
    });
  }

  private buildMcqResponse(
    message: string,
    step: string,
    options: string[],
  ): ConversationResponse {
    return {
      message,
      action: step,
      data: { step, question: message, inputType: 'multi-choice', options },
    };
  }
}
