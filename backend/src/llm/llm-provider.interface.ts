/**
 * LLM Provider interface — abstraction over Gemini, Ollama, etc.
 *
 * Any LLM service must implement `sendMessage()` with the same
 * signature so the rest of the app is provider-agnostic.
 */
export interface LlmProvider {
  /**
   * Send a prompt to the LLM and return parsed JSON.
   *
   * @param prompt          — The user/assistant message to send
   * @param systemInstruction — System-level context/instructions
   * @param responseSchema  — Optional JSON schema for structured output
   * @returns Parsed JSON object from the LLM response
   */
  sendMessage(
    prompt: string,
    systemInstruction: string,
    responseSchema?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

/** NestJS injection token for the active LLM provider */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
