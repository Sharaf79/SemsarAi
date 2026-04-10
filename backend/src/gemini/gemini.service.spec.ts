/**
 * GeminiService unit tests — ported from Python tests/unit/test_gemini_service.py
 * 9 test cases covering: happy path, retries, exhausted retries, non-retryable errors,
 * empty response, invalid JSON.
 */
import { GeminiService } from './gemini.service';
import { ConfigService } from '@nestjs/config';

// ── Mocks ──────────────────────────────────────────────────
const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

function makeService(): GeminiService {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  return new GeminiService(configService);
}

function makeResponse(text: string | null) {
  return { response: { text: () => text } };
}

function makeError(status: number, message = 'API Error') {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(() => {
    jest.useFakeTimers();
    mockGenerateContent.mockReset();
    service = makeService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper to advance timers for the sleep() calls
  async function flushRetries(promise: Promise<unknown>, count = 1) {
    for (let i = 0; i < count; i++) {
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // let microtasks run
    }
    return promise;
  }

  it('happy path: returns parsed JSON', async () => {
    mockGenerateContent.mockResolvedValue(
      makeResponse('{"intent": "BUY", "confidence": 0.9}'),
    );

    const result = await service.sendMessage('prompt', 'system');
    expect(result).toEqual({ intent: 'BUY', confidence: 0.9 });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('passes prompt as the first argument', async () => {
    mockGenerateContent.mockResolvedValue(makeResponse('{}'));
    await service.sendMessage('extract intent', 'system prompt');
    expect(mockGenerateContent).toHaveBeenCalledWith('extract intent');
  });

  it('empty text returns empty object', async () => {
    mockGenerateContent.mockResolvedValue(makeResponse(null));

    const result = await service.sendMessage('prompt', 'system');
    expect(result).toEqual({});
  });

  it('429 error retries once then succeeds', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(makeError(429))
      .mockResolvedValueOnce(makeResponse('{"ok": true}'));

    const promise = service.sendMessage('prompt', 'system');
    // Advance past the 1s backoff
    jest.advanceTimersByTime(1500);
    await Promise.resolve();
    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('500 error retries twice then succeeds', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(makeError(500))
      .mockRejectedValueOnce(makeError(502))
      .mockResolvedValueOnce(makeResponse('{"ok": true}'));

    const promise = service.sendMessage('prompt', 'system');
    // Advance past backoff delays (1s + 2s)
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    }

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('429 × 3 exhausts retries and throws', async () => {
    mockGenerateContent.mockRejectedValue(makeError(429));

    const promise = service.sendMessage('prompt', 'system');
    // Advance past all backoffs
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    }

    await expect(promise).rejects.toThrow('API Error');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('400 error throws immediately without retry', async () => {
    mockGenerateContent.mockRejectedValue(makeError(400));

    await expect(service.sendMessage('prompt', 'system')).rejects.toThrow(
      'API Error',
    );
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('non-JSON text throws SyntaxError', async () => {
    // JSON.parse errors have no .status → defaults to 500 → retries 3×
    // All 3 attempts return bad JSON, so it exhausts retries and throws
    mockGenerateContent.mockResolvedValue(
      makeResponse('This is not valid JSON'),
    );

    const promise = service.sendMessage('prompt', 'system');
    // Advance past all backoffs (1s + 2s + 4s)
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    }

    await expect(promise).rejects.toThrow();
  });

  it('accepts optional expectedSchema parameter', async () => {
    mockGenerateContent.mockResolvedValue(
      makeResponse('{"field": "value"}'),
    );

    const schema = { type: 'object', properties: { field: { type: 'string' } } };
    const result = await service.sendMessage('prompt', 'system', schema);
    expect(result).toEqual({ field: 'value' });
  });
});
