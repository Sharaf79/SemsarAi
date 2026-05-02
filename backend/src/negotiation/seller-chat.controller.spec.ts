/**
 * SellerChatController tests (T30).
 *
 * Verifies the controller delegates to the service with the correct params
 * extracted from JWT and URL.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SellerChatController } from './seller-chat.controller';
import { SellerChatService } from './seller-chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const SELLER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const NEGOTIATION_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

describe('SellerChatController', () => {
  let controller: SellerChatController;
  let service: { chat: jest.Mock };

  beforeEach(async () => {
    service = {
      chat: jest.fn().mockResolvedValue({
        reply: 'أهلاً!',
        intent: 'comment',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SellerChatController],
      providers: [
        { provide: SellerChatService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<SellerChatController>(SellerChatController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should pass sellerId from JWT and negotiationId from URL to service', async () => {
    const req = { user: { sub: SELLER_ID, phone: '01000000000' } };
    const dto = {
      history: [{ role: 'user' as const, content: 'hello' }],
      userMessage: 'ايه الاخبار؟',
    };

    const result = await controller.chat(NEGOTIATION_ID, dto, req as any);

    expect(service.chat).toHaveBeenCalledWith(
      NEGOTIATION_ID,
      SELLER_ID,
      dto.history,
      dto.userMessage,
    );
    expect(result.success).toBe(true);
    expect(result.data.reply).toBe('أهلاً!');
    expect(result.data.intent).toBe('comment');
  });

  it('should wrap service result in { success: true, data }', async () => {
    const req = { user: { sub: SELLER_ID, phone: '01000000000' } };
    const dto = { history: [], userMessage: 'test' };

    const result = await controller.chat(NEGOTIATION_ID, dto, req as any);

    expect(result).toEqual({
      success: true,
      data: { reply: 'أهلاً!', intent: 'comment' },
    });
  });
});
