/**
 * Ollama LLM service — runs local models (e.g. Gemma 3 4B) via Ollama REST API.
 *
 * Conforms to the same LlmProvider interface as GeminiService,
 * so the rest of the app is provider-agnostic.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm-provider.interface';

interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  format?: 'json';
  stream: false;
}

interface OllamaChatResponse {
  message: { content: string };
  done: boolean;
}

@Injectable()
export class OllamaService implements LlmProvider {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ??
      'http://localhost:11434';
    this.model =
      this.configService.get<string>('OLLAMA_MODEL') ?? 'gemma3:4b';
  }

  /**
   * Send a prompt to Ollama and return parsed JSON.
   * Implements 3× exponential backoff on 429/5xx (same as GeminiService).
   */
  async sendMessage(
    prompt: string,
    systemInstruction: string,
    responseSchema?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const retries = 3;
    const backoffs = [1000, 2000, 4000]; // ms

    const body: OllamaChatRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      // Request JSON output when a schema is provided
      ...(responseSchema ? { format: 'json' as const } : {}),
      stream: false,
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt < retries - 1) {
            this.logger.warn(
              `Ollama API error ${response.status}, retrying in ${backoffs[attempt]}ms...`,
            );
            await this.sleep(backoffs[attempt]);
            continue;
          }
          throw new Error(
            `Ollama API error ${response.status} after ${retries} retries`,
          );
        }

        if (!response.ok) {
          throw new Error(
            `Ollama API error ${response.status}: ${await response.text()}`,
          );
        }

        const data = (await response.json()) as OllamaChatResponse;
        const text = data.message?.content ?? '';

        if (text.trim().length === 0) {
          return {};
        }

        // When format: 'json' is set, Ollama should return valid JSON
        // but we still try-catch for safety
        try {
          return JSON.parse(text) as Record<string, unknown>;
        } catch {
          // If schema was requested but response isn't valid JSON,
          // wrap in a generic object
          this.logger.warn(
            'Ollama returned non-JSON response when JSON was expected',
          );
          return { message: text };
        }
      } catch (error: unknown) {
        if (attempt < retries - 1) {
          this.logger.warn(
            `Ollama request failed (attempt ${attempt + 1}/${retries}): ${error}`,
          );
          await this.sleep(backoffs[attempt]);
          continue;
        }

        this.logger.error(`Ollama API error exhausted retries: ${error}`);
        throw error;
      }
    }

    throw new Error('Failed to get response from Ollama');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
