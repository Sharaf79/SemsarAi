import { Test, TestingModule } from '@nestjs/testing';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';
import { NegotiationSimulatorService } from './negotiation-simulator.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const NEGOTIATION_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SELLER_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

const negotiationPayload = {
  negotiation: {
    id: NEGOTIATION_ID,
    buyerId: USER_ID,
    sellerId: SELLER_ID,
    currentOffer: 850000,
    roundNumber: 1,
    status: 'ACTIVE',
  },
  offers: [],
  deals: [],
  currentRound: 1,
  maxRounds: 6,
};

describe('NegotiationController', () => {
  let controller: NegotiationController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getBuyerNegotiation: jest.fn().mockResolvedValue(negotiationPayload),
      getSellerNegotiation: jest.fn().mockResolvedValue(negotiationPayload),
      submitBuyerReply: jest.fn().mockResolvedValue({ success: true }),
      handleAction: jest.fn(),
      startNegotiation: jest.fn(),
      simulate: jest.fn(),
      getStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NegotiationController],
      providers: [
        { provide: NegotiationService, useValue: service },
        { provide: NegotiationSimulatorService, useValue: { simulate: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<NegotiationController>(NegotiationController);
  });

  afterEach(() => jest.clearAllMocks());

  const mockReq = () => ({ user: { sub: USER_ID, phone: '01000000000' } });

  it('should call getBuyerNegotiation for buyer routes', async () => {
    const result = await controller.getBuyerNegotiation(NEGOTIATION_ID, mockReq() as any);

    expect(service.getBuyerNegotiation).toHaveBeenCalledWith(NEGOTIATION_ID, USER_ID);
    expect(result.success).toBe(true);
    expect(result.data).toBe(negotiationPayload);
  });

  it('should call getSellerNegotiation for seller routes', async () => {
    const sellerReq = { user: { sub: SELLER_ID, phone: '01111111111' } };
    const result = await controller.getSellerNegotiation(NEGOTIATION_ID, sellerReq as any);

    expect(service.getSellerNegotiation).toHaveBeenCalledWith(NEGOTIATION_ID, SELLER_ID);
    expect(result.success).toBe(true);
    expect(result.data).toBe(negotiationPayload);
  });

  it('should call submitBuyerReply for buyer reply routes', async () => {
    const payload = { responseType: 'opinion', comment: 'هذا رأيي' };
    const result = await controller.submitBuyerReply(NEGOTIATION_ID, payload as any, mockReq() as any);

    expect(service.submitBuyerReply).toHaveBeenCalledWith(NEGOTIATION_ID, USER_ID, payload);
    expect(result.success).toBe(true);
  });
});
