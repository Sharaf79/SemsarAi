/**
 * LLM Module — provides the active LLM provider based on LLM_PROVIDER env var.
 *
 * Supported values: 'gemini' (default), 'ollama'
 *
 * Usage in other modules:
 *   import { LlmModule } from '../llm';
 *   // then inject @Inject(LLM_PROVIDER) private readonly llm: LlmProvider
 */
import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER } from './llm-provider.interface';
import { GeminiService } from '../gemini/gemini.service';
import { GeminiModule } from '../gemini/gemini.module';
import { OllamaService } from './ollama.service';

const logger = new Logger('LlmModule');

/**
 * Factory that selects the LLM provider based on the LLM_PROVIDER env var.
 * Falls back to 'gemini' if not set.
 */
const llmProviderFactory = {
  provide: LLM_PROVIDER,
  useFactory: (configService: ConfigService, geminiService: GeminiService) => {
    const provider = configService.get<string>('LLM_PROVIDER') ?? 'gemini';
    logger.log(`Using LLM provider: ${provider}`);

    switch (provider) {
      case 'ollama':
        return new OllamaService(configService);
      case 'gemini':
      default:
        return geminiService;
    }
  },
  inject: [ConfigService, GeminiService],
};

@Module({
  imports: [GeminiModule],
  providers: [OllamaService, llmProviderFactory],
  exports: [llmProviderFactory],
})
export class LlmModule {}
