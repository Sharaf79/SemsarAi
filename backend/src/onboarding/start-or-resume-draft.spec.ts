import { OnboardingService } from './onboarding.service';
import { OnboardingStep } from '@prisma/client';

describe('OnboardingService — startOrResumeDraft', () => {
  let service: OnboardingService;
  let prisma: any;
  let locations: any;

  beforeEach(() => {
    prisma = {
      propertyDraft: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    locations = {
      getGovernorates: jest.fn(),
      getCities: jest.fn(),
      getDistricts: jest.fn(),
    };

    service = new OnboardingService(prisma, locations, { matchBuyersForProperty: jest.fn().mockResolvedValue(0) } as any);
  });

  it('should create new draft if none exists', async () => {
    prisma.propertyDraft.findFirst.mockResolvedValue(null);
    prisma.propertyDraft.create.mockResolvedValue({
      id: 'draft-1',
      userId: 'user-1',
      currentStep: OnboardingStep.PROPERTY_TYPE,
      data: {},
      isCompleted: false,
    });

    const result = await service.startOrResumeDraft('user-1');

    expect(prisma.propertyDraft.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', isCompleted: false },
    });
    expect(prisma.propertyDraft.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        currentStep: OnboardingStep.PROPERTY_TYPE,
        data: {},
        isCompleted: false,
      },
    });
    expect(result.id).toBe('draft-1');
    expect(result.currentStep).toBe(OnboardingStep.PROPERTY_TYPE);
  });

  it('should return existing draft if found', async () => {
    const existing = {
      id: 'draft-existing',
      userId: 'user-1',
      currentStep: OnboardingStep.PRICE,
      data: { property_type: 'APARTMENT' },
      isCompleted: false,
    };
    prisma.propertyDraft.findFirst.mockResolvedValue(existing);

    const result = await service.startOrResumeDraft('user-1');

    expect(prisma.propertyDraft.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', isCompleted: false },
    });
    expect(prisma.propertyDraft.create).not.toHaveBeenCalled();
    expect(result.id).toBe('draft-existing');
    expect(result.currentStep).toBe(OnboardingStep.PRICE);
  });

  it('should create new draft when all previous drafts are completed', async () => {
    prisma.propertyDraft.findFirst.mockResolvedValue(null);
    prisma.propertyDraft.create.mockResolvedValue({
      id: 'draft-new',
      userId: 'user-1',
      currentStep: OnboardingStep.PROPERTY_TYPE,
      data: {},
      isCompleted: false,
    });

    const result = await service.startOrResumeDraft('user-1');

    expect(prisma.propertyDraft.create).toHaveBeenCalled();
    expect(result.isCompleted).toBe(false);
    expect(result.currentStep).toBe(OnboardingStep.PROPERTY_TYPE);
  });
});
