import { Injectable, Logger } from '@nestjs/common';

export interface GemmaChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Thin wrapper around the Ollama HTTP API (POST /api/chat) for Gemma.
 *
 * Returns the assistant message string on success, or `null` on any failure
 * (network error, timeout, malformed response, non-200 status). Callers must
 * handle null with a deterministic Arabic fallback so user flows never break.
 */
@Injectable()
export class GemmaClient {
  private readonly logger = new Logger(GemmaClient.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs = 15_000;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.GEMMA_MODEL ?? 'gemma3:27b';
  }

  /**
   * Send a chat completion to Gemma via Ollama.
   *
   * @param systemPrompt The system instructions (Arabic).
   * @param history Prior turns (alternating user/assistant).
   * @param userMessage The new user message.
   * @returns The assistant reply text, or null on failure.
   */
  async chat(
    systemPrompt: string,
    history: GemmaChatMessage[],
    userMessage: string,
  ): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;
    const messages: GemmaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, stream: false, messages }),
        signal: controller.signal,
      });

      if (!res.ok) {
        this.logger.warn(`Ollama responded ${res.status} — falling back`);
        return null;
      }

      const data = (await res.json()) as {
        message?: { role: string; content: string };
      };
      const content = data?.message?.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return content.trim();
      }
      this.logger.warn('Ollama returned empty content — falling back');
      return null;
    } catch (err) {
      this.logger.warn(`Ollama call failed: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
