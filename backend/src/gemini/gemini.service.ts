/**
 * Gemini AI service — ported from Python src/services/gemini_service.py
 * Uses @google/generative-ai SDK with 3× exponential backoff.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, ResponseSchema } from '@google/generative-ai';
import { LlmProvider } from '../llm/llm-provider.interface';

@Injectable()
export class GeminiService implements LlmProvider {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    this.modelName =
      this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Send a prompt to Gemini and return parsed JSON.
   * Implements 3× exponential backoff on 429/5xx.
   */
  async sendMessage(
    prompt: string,
    systemInstruction: string,
    responseSchema?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const retries = 3;
    const backoffs = [1000, 2000, 4000]; // ms

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema: responseSchema as unknown as ResponseSchema } : {}),
      },
    });

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (text) {
          return JSON.parse(text) as Record<string, unknown>;
        }
        return {};
      } catch (error: unknown) {
        const statusCode = (error as { status?: number }).status ?? 500;

        if (statusCode === 429 || statusCode >= 500) {
          if (attempt < retries - 1) {
            this.logger.warn(
              `Gemini API error ${statusCode}, retrying in ${backoffs[attempt]}ms...`,
            );
            await this.sleep(backoffs[attempt]);
            continue;
          }
        }

        this.logger.error(`Gemini API error exhausted retries: ${error}`);
        throw error;
      }
    }

    throw new Error('Failed to get response from Gemini');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
