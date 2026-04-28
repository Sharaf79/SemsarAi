import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

export interface NlpAnalysisRequest {
  text: string;
}

export interface NlpSlots {
  propertyType?: 'SALE' | 'RENT';
  propertyKind?:
    | 'APARTMENT'
    | 'VILLA'
    | 'SHOP'
    | 'OFFICE'
    | 'SUMMER_RESORT'
    | 'COMMERCIAL'
    | 'LAND_BUILDING';
  bedrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  governorate?: string;
  city?: string;
  district?: string;
}

export interface NlpAnalysisResponse {
  intent: 'search_properties' | 'search_drafts' | 'search_media' | 'unclear';
  confidence: number;
  slots: NlpSlots;
  classifier: 'stub' | 'distilbert';
}

@Injectable()
export class NlpService {
  private readonly logger = new Logger(NlpService.name);
  private readonly nlpUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Default: http://localhost:8001 for local dev
    // In Docker: http://nlp-service:8001 (from docker-compose service name)
    this.nlpUrl = this.configService.get<string>(
      'NLP_SERVICE_URL',
      'http://localhost:8001',
    );
  }

  /**
   * Analyze user text and extract intent + slots.
   *
   * Falls back gracefully if the NLP service is unavailable:
   * - intent = 'unclear'
   * - confidence = 0
   * - slots = {}
   *
   * @param text User message (Arabic, English, or mixed)
   * @returns {NlpAnalysisResponse}
   */
  async analyze(text: string): Promise<NlpAnalysisResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<NlpAnalysisResponse>(
          `${this.nlpUrl}/nlp/analyze`,
          { text } as NlpAnalysisRequest,
          { timeout: 5000 }, // 5s timeout to avoid blocking
        ),
      );
      return (response as any).data;
    } catch (error) {
      this.logger.error(
        `NLP service failed (${this.nlpUrl}): ${error.message}. Returning fallback.`,
      );

      // Graceful fallback when NLP service is unavailable
      return {
        intent: 'unclear',
        confidence: 0,
        slots: {},
        classifier: 'stub',
      };
    }
  }

  /**
   * Health check for the NLP service.
   *
   * @returns true if service is healthy, false otherwise
   */
  async isHealthy(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`${this.nlpUrl}/health`, { timeout: 2000 }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
