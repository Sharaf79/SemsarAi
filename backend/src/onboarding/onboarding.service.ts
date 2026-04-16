import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { OnboardingStep, PropertyKind, PropertyType, LocationType, MediaType, CreditStatus, Prisma } from '@prisma/client';
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
  RENT_DAILY_PRICE_OPTIONS, RENT_DAILY_PRICE_MAP,
  RENT_ANNUAL_PRICE_OPTIONS, RENT_ANNUAL_PRICE_MAP,
  RENT_RATE_OPTIONS,
  RENT_APARTMENT_TYPES,
  MEDIA_OPTIONS,
  REVIEW_OPTIONS,
  QuestionDef,
  APARTMENT_TYPES,
  OWNERSHIP_OPTIONS,
  READINESS_OPTIONS,
  FINISHING_OPTIONS,
  FLOOR_OPTIONS,
  YES_NO_OPTIONS,
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
      const normalised = this.normalisePhone(phone);
      // Try normalised format first, then raw phone as fallback
      const user =
        (await this.prisma.user.findUnique({ where: { phone: normalised } })) ??
        (normalised !== phone
          ? await this.prisma.user.findUnique({ where: { phone } })
          : null);
      if (!user) {
        // No existing user — create one on the fly (anonymous onboarding)
        const newUser = await this.prisma.user.create({
          data: {
            phone: normalised,
            name: normalised,
            isPhoneVerified: false,
          },
        });
        this.logger.log(`Created anonymous user ${newUser.id} for phone ${normalised}`);
        resolvedUserId = newUser.id;
      } else {
        resolvedUserId = user.id;
      }
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

      // ── Create draft (payment check moved to REVIEW step) ──────────
      const draft = await tx.propertyDraft.create({
        data: {
          userId: uid,
          currentStep: OnboardingStep.GOVERNORATE,
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
            try {
              const cities = await this.locationsService.getCities(govId);
              options = cities.map((c) => ({ id: c.id, label: c.nameAr }));
            } catch {
              // Stale governorate_id (e.g. after a DB reseed) — roll back to
              // GOVERNORATE step so the user picks again.
              this.logger.warn(
                `Stale governorate_id ${govId} in draft, rolling back to GOVERNORATE step`,
              );
              delete data.governorate_id;
              delete data.governorate_name;
              delete data.city_id;
              delete data.city_name;
              delete data.district_id;
              delete data.district_name;
              await this.prisma.propertyDraft.update({
                where: { id: draft.id },
                data: {
                  currentStep: OnboardingStep.GOVERNORATE,
                  data: data as any,
                },
              });
              draft.currentStep = OnboardingStep.GOVERNORATE;
              const govs = await this.locationsService.getGovernorates();
              options = govs.map((g) => ({ id: g.id, label: g.nameAr }));
            }
          } else {
            options = [];
          }
          break;
        }
        case 'districts': {
          const cityId = data.city_id as number | undefined;
          if (cityId) {
            try {
              const districts = await this.locationsService.getDistricts(cityId);
              options = districts.map((d) => ({ id: d.id, label: d.nameAr }));
            } catch {
              // Stale city_id (e.g. after a DB reseed) — roll back to CITY step.
              this.logger.warn(
                `Stale city_id ${cityId} in draft, rolling back to CITY step`,
              );
              delete data.city_id;
              delete data.city_name;
              delete data.district_id;
              delete data.district_name;
              await this.prisma.propertyDraft.update({
                where: { id: draft.id },
                data: {
                  currentStep: OnboardingStep.CITY,
                  data: data as any,
                },
              });
              draft.currentStep = OnboardingStep.CITY;
              const govId2 = data.governorate_id as number | undefined;
              if (govId2) {
                const cities = await this.locationsService.getCities(govId2);
                options = cities.map((c) => ({ id: c.id, label: c.nameAr }));
              } else {
                options = [];
              }
            }
          } else {
            options = [];
          }
          break;
        }
      }
    }

    // ─── MCQ overrides for remaining steps ──────────────────
    let inputType: QuestionDef['inputType'] = def.inputType;

    // DETAILS sub-steps
    if (draft.currentStep === OnboardingStep.DETAILS) {
      inputType = 'multi-choice';
      const substep = (data._details_substep as string) ?? 'area';
      switch (substep) {
        case 'area':
          question = 'المساحة كم متر مربع؟ 📐';
          inputType = 'number';
          options = [];
          break;
        case 'bedrooms':
          question = 'كم غرفة نوم؟ 🛏️';
          options = BEDROOM_OPTIONS;
          break;
        case 'bathrooms':
          question = 'كم حمام؟ 🚿';
          options = BATHROOM_OPTIONS;
          break;
        case 'apartmentType': {
          question = 'نوع العقار؟ 🏢';
          const isRentFlow = data.listing_type === 'RENT';
          options = isRentFlow ? RENT_APARTMENT_TYPES : APARTMENT_TYPES;
          break;
        }
        case 'ownershipType':
          question = 'نوع الملكية؟ 📄';
          options = OWNERSHIP_OPTIONS;
          break;
        case 'rentRateType':
          question = 'معدل الإيجار؟ 📅';
          options = RENT_RATE_OPTIONS;
          break;
        case 'readiness':
          question = 'حالة العقار؟ 🏗️';
          options = READINESS_OPTIONS;
          break;
        case 'deliveryDate':
          question = 'تاريخ التسليم المتوقع؟ 📅 (اكتب التاريخ، أو الشهر والسنة)';
          inputType = 'number'; // 'number' triggers standard text input in UI
          options = [];
          break;
        case 'finishingType':
          question = 'نوع التشطيب؟ 🎨';
          options = FINISHING_OPTIONS;
          break;
        case 'adTitle':
          question = 'عنوان الإعلان؟ 📝';
          inputType = 'textarea';
          options = [];
          break;
        case 'adDescription':
          question = 'وصف العقار بالتفصيل 📄';
          inputType = 'textarea';
          options = [];
          break;
        case 'floorLevel':
          question = 'الطابق كم؟ 🏢';
          options = FLOOR_OPTIONS;
          break;
        case 'isFurnished':
          question = 'العقار مفروش؟ 🛋️';
          options = YES_NO_OPTIONS;
          break;
        case 'mapLocation':
          question = 'حدد موقع العقار على الخريطة 📍\n(اضغط "احصل على موقعي" أو اضغط "تخطي")';
          inputType = 'map';
          options = [];
          break;
        case 'amenities':
          question = 'ما الكماليات المتوفرة؟ 🌟 (اختياري)\n(مثلا: شرفة، أمن، جراج)';
          inputType = 'optional-textarea';
          options = [];
          break;
      }
    }

    // PRICE – dynamic options based on sale vs rent rate type
    if (draft.currentStep === OnboardingStep.PRICE) {
      inputType = 'number';
      const isSale = data.listing_type === 'SALE';
      const details = data.details as Record<string, unknown> | undefined;
      const rentRate = details?.rentRateType as string | undefined;

      if (isSale) {
        question = 'سعر البيع المتوقع؟ 💰 (اختياري)';
        options = [...SALE_PRICE_OPTIONS, 'تخطي ⏭️'];
      } else if (rentRate === 'يومي') {
        question = 'الإيجار اليومي المتوقع؟ 💰 (اختياري)';
        options = [...RENT_DAILY_PRICE_OPTIONS, 'تخطي ⏭️'];
      } else if (rentRate === 'سنوي') {
        question = 'الإيجار السنوي المتوقع؟ 💰 (اختياري)';
        options = [...RENT_ANNUAL_PRICE_OPTIONS, 'تخطي ⏭️'];
      } else {
        question = 'الإيجار الشهري المتوقع؟ 💰 (اختياري)';
        options = [...RENT_PRICE_OPTIONS, 'تخطي ⏭️'];
      }
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

    // Details are now submitted as a single JSON object.

    // Validate and normalize the answer
    const validated = await this.validateAnswer(step, answer, draft.data as Record<string, unknown>);

    // Merge into draft data
    const currentData = (draft.data as Record<string, unknown>) ?? {};
    const updatedData = { ...currentData, ...validated };

    // Advance step (pass data for SHOP skip rule)
    let nextStep = getNextStep(step, updatedData);

    // Auto-skip DISTRICT if the chosen city has no districts in DB.
    if (nextStep === OnboardingStep.DISTRICT) {
      const cityId = updatedData.city_id as number | undefined;
      if (cityId) {
        const districtCount = await this.prisma.location.count({
          where: { type: LocationType.DISTRICT, parentId: cityId, isActive: true },
        });
        if (districtCount === 0) {
          this.logger.log(`City ${cityId} has no districts — skipping DISTRICT step`);
          nextStep = getNextStep(OnboardingStep.DISTRICT, updatedData);
        }
      }
    }

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

    // ── Payment guard: require a COMPLETED listing credit ────
    const existingCredit = await this.prisma.listingCredit.findFirst({
      where: { userId, status: CreditStatus.COMPLETED, draftId: null },
    });
    if (!existingCredit) {
      // Create a PENDING credit so the user can pay
      const newCredit = await this.prisma.listingCredit.create({
        data: { userId, amount: 100, status: CreditStatus.PENDING },
      });
      throw new ForbiddenException({
        message: 'يجب دفع 100 جنيه لنشر هذا العقار',
        creditId: newCredit.id,
      });
    }

    const data = draft.data as Record<string, unknown>;
    const details = data.details as Record<string, unknown> | null;
    const propertyType = data.property_type as string;

    // Validate all required fields
    if (!data.property_type || !data.listing_type) {
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

    const KIND_AR: Record<string, string> = {
      APARTMENT: 'شقة',
      VILLA: 'فيلا',
      SHOP: 'محل تجاري',
      OFFICE: 'مكتب',
      SUMMER_RESORT: 'شاليه / مصيف',
      COMMERCIAL: 'عقار تجاري',
      LAND_BUILDING: 'أرض / مبنى',
    };
    const typeAr = type === PropertyType.SALE ? 'للبيع' : 'للإيجار';
    const subTypeAr = (details?.apartmentType as string) ?? null;
    const kindAr = subTypeAr ?? (KIND_AR[propertyKind] ?? propertyKind);

    const property = await this.prisma.$transaction(async (tx) => {
      // Check if user has a completed listing credit (to set isPaid flag)
      const credit = await tx.listingCredit.findFirst({
        where: { userId, status: CreditStatus.COMPLETED, draftId: null },
      });
      const isPaid = !!credit;

      // 1. Create Property
      const prop = await tx.property.create({
        data: {
          userId,
          title: `${kindAr} ${typeAr}`,
          price: (data.price as number) ?? null,
          type,
          propertyKind,
          isPaid,
          bedrooms: propertyType === 'SHOP' ? null : (details?.bedrooms as number) ?? null,
          bathrooms: propertyType === 'SHOP' ? null : (details?.bathrooms as number) ?? null,
          areaM2: propertyType === 'SHOP' ? null : (details?.area_m2 as number),
          apartmentType: details?.apartmentType as string | null,
          rentRateType: details?.rentRateType as string | null,
          ownershipType: details?.ownershipType as string | null,
          amenities: (details?.amenities as Prisma.InputJsonValue) ?? null,
          floorLevel: details?.floorLevel as string | null,
          isFurnished: details?.isFurnished as boolean | null,
          readiness: details?.readiness as string | null,
          deliveryDate: details?.deliveryDate as string | null,
          deliveryTerms: details?.deliveryTerms as string | null,
          finishingType: details?.finishingType as string | null,
          paymentMethod: details?.paymentMethod as string | null,
          paymentType: details?.paymentType as string | null,
          isNegotiable: (details?.isNegotiable as boolean) ?? false,
          governorate: (data.governorate_name as string) ?? null,
          city: (data.city_name as string) ?? null,
          district: (data.district_name as string) ?? null,
          zone: null,
          nearestLandmark: null,
          latitude: details?.lat != null ? details.lat as number : null,
          longitude: details?.lng != null ? details.lng as number : null,
          // Resort/Seasonal property fields
          location: details?.location as string | null,
          rentalRate: details?.rentalRate as number | null,
          rentalFees: details?.rentalFees as number | null,
          downPayment: details?.downPayment as number | null,
          insurance: details?.insurance as number | null,
          adTitle: details?.adTitle as string | null,
          adDescription: details?.adDescription as string | null,
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

      // 2.5. Consume listing credit (if user has one)
      if (credit) {
        await tx.listingCredit.update({
          where: { id: credit.id },
          data: { draftId: prop.id },
        });
        this.logger.log(`Consumed listing credit ${credit.id} for property ${prop.id}`);
      }

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

    // ─── DETAILS sub-steps ────────────────────────────────────
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
        apartmentType: det.apartmentType ?? null,
        rentRateType: det.rentRateType ?? null,
        ownershipType: det.ownershipType ?? null,
        amenities: det.amenities ?? null,
        floorLevel: det.floorLevel ?? null,
        isFurnished: det.isFurnished ?? null,
        readiness: det.readiness ?? null,
        deliveryDate: det.deliveryDate ?? null,
        finishingType: det.finishingType ?? null,
        paymentMethod: det.paymentMethod ?? null,
        isNegotiable: det.isNegotiable ?? false,
        lat: det.lat ?? null,
        lng: det.lng ?? null,
        adTitle: det.adTitle ?? null,
        adDescription: det.adDescription ?? null,
      },
    };
  }

  private validatePrice(answer: unknown, currentData: Record<string, unknown>): Record<string, unknown> {
    let price = Number(String(answer).replace(/,/g, ''));

    if (isNaN(price) && typeof answer === 'string') {
      const allMaps = [SALE_PRICE_MAP, RENT_PRICE_MAP, RENT_DAILY_PRICE_MAP, RENT_ANNUAL_PRICE_MAP];
      for (const map of allMaps) {
        if (map[answer.trim()] !== undefined) {
          price = map[answer.trim()];
          break;
        }
      }
    }

    if (isNaN(price) || price < 0) {
      throw new BadRequestException('Price must be a positive number');
    }

    return { price: price === 0 ? null : price };
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

    const advance = async (nextSub: string, updateData: any) => {
      await this.updateDraftData(draft.id, data, { ...updateData, _details_substep: nextSub });
      const next = await this.getCurrentQuestion(userId);
      return { message: next.question, action: next.step, data: next };
    };

    const reask = async (msg: string, step: string, options?: string[]) => {
      const q = await this.getCurrentQuestion(userId);
      return this.buildMcqResponse(`${msg}\n\n${q.question}`, step as OnboardingStep, options ?? []);
    };

    if (substep === 'area') {
      const area = AREA_MAP[input] ?? Number(input);
      if (isNaN(area) || area <= 0) return reask('الرجاء إدخال مساحة صحيحة 👇', 'DETAILS');
      return advance('bedrooms', { _temp_area: area });
    }

    if (substep === 'bedrooms') {
      const bedrooms = BEDROOM_MAP[input] ?? (isNaN(Number(input)) ? undefined : Number(input));
      if (bedrooms === undefined || bedrooms < 1 || bedrooms > 10) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', BEDROOM_OPTIONS);
      return advance('bathrooms', { _temp_bedrooms: bedrooms });
    }

    if (substep === 'bathrooms') {
      const bathrooms = BATHROOM_MAP[input] ?? (isNaN(Number(input)) ? undefined : Number(input));
      if (bathrooms === undefined || bathrooms < 0) return reask('الرجاء إدخال عدد حمامات صحيح 👇', 'DETAILS', BATHROOM_OPTIONS);
      return advance('apartmentType', { _temp_bathrooms: bathrooms });
    }

    if (substep === 'apartmentType') {
      const isRent = data.listing_type === 'RENT';
      const validTypes = isRent ? RENT_APARTMENT_TYPES : APARTMENT_TYPES;
      if (!validTypes.includes(input)) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', validTypes);
      // RENT: skip ownershipType, go to rentRateType. SALE: ask ownershipType.
      const nextSub = isRent ? 'rentRateType' : 'ownershipType';
      return advance(nextSub, { _temp_apartmentType: input });
    }

    if (substep === 'ownershipType') {
      if (!OWNERSHIP_OPTIONS.includes(input)) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', OWNERSHIP_OPTIONS);
      return advance('readiness', { _temp_ownershipType: input });
    }

    if (substep === 'rentRateType') {
      if (!RENT_RATE_OPTIONS.includes(input)) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', RENT_RATE_OPTIONS);
      return advance('readiness', { _temp_rentRateType: input });
    }

    if (substep === 'readiness') {
      if (!READINESS_OPTIONS.includes(input)) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', READINESS_OPTIONS);
      const nextSub = input === 'قيد الإنشاء' ? 'deliveryDate' : 'finishingType';
      return advance(nextSub, { _temp_readiness: input });
    }

    if (substep === 'deliveryDate') {
      return advance('finishingType', { _temp_deliveryDate: input });
    }

    if (substep === 'finishingType') {
      if (!FINISHING_OPTIONS.includes(input)) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', FINISHING_OPTIONS);
      return advance('adTitle', { _temp_finishingType: input });
    }

    if (substep === 'adTitle') {
      if (!input.trim()) return reask('الرجاء إدخال عنوان الإعلان 👇', 'DETAILS');
      return advance('adDescription', { _temp_adTitle: input.trim() });
    }

    if (substep === 'adDescription') {
      if (!input.trim()) return reask('الرجاء إدخال وصف العقار 👇', 'DETAILS');
      return advance('floorLevel', { _temp_adDescription: input.trim() });
    }

    if (substep === 'floorLevel') {
      if (!FLOOR_OPTIONS.includes(input)) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', FLOOR_OPTIONS);
      return advance('isFurnished', { _temp_floorLevel: input });
    }

    if (substep === 'isFurnished') {
      if (!YES_NO_OPTIONS.includes(input)) return reask('الرجاء الاختيار من الخيارات 👇', 'DETAILS', YES_NO_OPTIONS);
      return advance('mapLocation', { _temp_isFurnished: input === 'نعم' });
    }

    if (substep === 'mapLocation') {
      let lat: number | null = null;
      let lng: number | null = null;
      if (input !== 'skip' && input.trim()) {
        try {
          const parsed = JSON.parse(input);
          lat = typeof parsed.lat === 'number' ? parsed.lat : null;
          lng = typeof parsed.lng === 'number' ? parsed.lng : null;
        } catch { /* invalid JSON — treat as skip */ }
      }
      return advance('amenities', { _temp_lat: lat, _temp_lng: lng });
    }

    if (substep === 'amenities') {
      const fullDetails = {
        area_m2: data._temp_area,
        bedrooms: data._temp_bedrooms,
        bathrooms: data._temp_bathrooms,
        apartmentType: data._temp_apartmentType,
        rentRateType: data._temp_rentRateType ?? null,
        ownershipType: data._temp_ownershipType ?? null,
        readiness: data._temp_readiness,
        deliveryDate: data._temp_deliveryDate,
        finishingType: data._temp_finishingType,
        floorLevel: data._temp_floorLevel,
        isFurnished: data._temp_isFurnished,
        amenities: input === 'لا' || input === 'لا يوجد' || !input.trim() ? {} : { parsed: input.trim() },
        lat: data._temp_lat ?? null,
        lng: data._temp_lng ?? null,
        adTitle: data._temp_adTitle,
        adDescription: data._temp_adDescription,
      };

      await this.submitAnswer(userId, OnboardingStep.DETAILS, fullDetails);

      const updatedDraft = await this.getActiveDraft(userId);
      const clean = { ...(updatedDraft.data as Record<string, unknown>) };
      Object.keys(clean).forEach(k => { if (k.startsWith('_temp_') || k === '_details_substep') delete clean[k]; });
      await this.prisma.propertyDraft.update({ where: { id: updatedDraft.id }, data: { data: clean as Prisma.InputJsonValue } });

      const next = await this.getCurrentQuestion(userId);
      return { message: next.question, action: next.step, data: next };
    }

    return { message: 'خطأ', action: 'DETAILS' };
  }


  private async handlePriceStep(
    userId: string,
    data: Record<string, unknown>,
    input: string,
  ): Promise<ConversationResponse> {
    const isSale = data.listing_type === 'SALE';
    const details = data.details as Record<string, unknown> | undefined;
    const rentRate = details?.rentRateType as string | undefined;

    let priceMap: Record<string, number>;
    let priceOptions: string[];
    let question: string;

    if (isSale) {
      priceMap = SALE_PRICE_MAP;
      priceOptions = SALE_PRICE_OPTIONS;
      question = 'سعر البيع المتوقع؟ 💰 (اختياري)';
    } else if (rentRate === 'يومي') {
      priceMap = RENT_DAILY_PRICE_MAP;
      priceOptions = RENT_DAILY_PRICE_OPTIONS;
      question = 'الإيجار اليومي المتوقع؟ 💰 (اختياري)';
    } else if (rentRate === 'سنوي') {
      priceMap = RENT_ANNUAL_PRICE_MAP;
      priceOptions = RENT_ANNUAL_PRICE_OPTIONS;
      question = 'الإيجار السنوي المتوقع؟ 💰 (اختياري)';
    } else {
      priceMap = RENT_PRICE_MAP;
      priceOptions = RENT_PRICE_OPTIONS;
      question = 'الإيجار الشهري المتوقع؟ 💰 (اختياري)';
    }

    // Allow skip
    if (input === 'تخطي ⏭️' || input === 'تخطي' || input === 'skip') {
      await this.submitAnswer(userId, OnboardingStep.PRICE, 0);
      const next = await this.getCurrentQuestion(userId);
      return { message: next.question, action: next.step, data: next };
    }

    const price = priceMap[input] ?? (Number(input.replace(/,/g, '')) > 0 ? Number(input.replace(/,/g, '')) : undefined);
    if (price === undefined) {
      return this.buildMcqResponse(`الرجاء اختر من الخيارات أو اكتب السعر رقماً 👇\n\n${question}`, 'PRICE', [...priceOptions, 'تخطي ⏭️']);
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
        if (err instanceof BadRequestException || err instanceof ForbiddenException) {
          const q = await this.getCurrentQuestion(userId);
          const errMsg = typeof (err as any)?.response === 'object'
            ? (err as any).response.message
            : (err as any).message;
          const creditId = typeof (err as any)?.response === 'object'
            ? (err as any).response.creditId
            : undefined;
          return {
            message: `⚠️ ${errMsg}`,
            action: q.step,
            data: { ...q, ...(creditId ? { creditId } : {}) },
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
      if (details.apartmentType) lines.push(`🏠 نوع الوحدة: ${details.apartmentType}`);
      if (details.ownershipType) lines.push(`🔑 الملكية: ${details.ownershipType}`);
      if (details.rentRateType) lines.push(`📅 معدل الإيجار: ${details.rentRateType}`);
      lines.push(`📐 المساحة: ${details.area_m2} م²`);
      if (details.bedrooms) lines.push(`🛏️ الغرف: ${details.bedrooms}`);
      if (details.bathrooms) lines.push(`🚿 الحمامات: ${details.bathrooms}`);
      if (details.readiness) lines.push(`🏗️ حالة العقار: ${details.readiness}`);
      if (details.deliveryDate) lines.push(`📅 موعد التسليم: ${details.deliveryDate}`);
      if (details.deliveryTerms) lines.push(`📋 شروط التسليم: ${details.deliveryTerms}`);
      if (details.finishingType) lines.push(`🎨 التشطيب: ${details.finishingType}`);
      if (details.paymentType) lines.push(`💳 طريقة الدفع: ${details.paymentType}`);
      if (details.paymentMethod) lines.push(`💰 طريقة السداد: ${details.paymentMethod}`);
      if (details.adTitle) lines.push(`📝 عنوان الإعلان: ${details.adTitle}`);
      if (details.adDescription) lines.push(`📄 وصف العقار: ${details.adDescription}`);
      if (details.floorLevel) lines.push(`🏢 الطابق: ${details.floorLevel}`);
      if (details.isFurnished != null) lines.push(`🛋️ مفروش: ${details.isFurnished ? 'نعم' : 'لا'}`);
      if (details.lat && details.lng) lines.push(`📍 إحداثيات: ${(details.lat as number).toFixed(5)}, ${(details.lng as number).toFixed(5)}`);
      const amenities = details.amenities as Record<string, unknown> | undefined;
      if (amenities?.parsed) lines.push(`✨ الكماليات: ${amenities.parsed}`);
    }

    const price = (data.price as number) ?? null;
    if (price) {
      const isSale = data.listing_type === 'SALE';
      const rentRate = details?.rentRateType as string | undefined;
      const rateLabel = isSale ? '' : rentRate === 'يومي' ? '/يوم' : rentRate === 'سنوي' ? '/سنة' : '/شهر';
      lines.push(`💰 السعر: ${price.toLocaleString('en')} جنيه${rateLabel}`);
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

  /**
   * Normalise an Egyptian phone number to the international +20… format
   * used in the `users.phone` column.
   */
  private normalisePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('20')) return `+${digits}`;
    if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
    return `+20${digits}`;
  }
}
