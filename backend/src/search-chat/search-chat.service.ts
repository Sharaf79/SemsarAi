import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import type { LlmProvider } from '../llm/llm-provider.interface';
import { SEARCH_CHAT_SYSTEM_PROMPT } from '../llm/prompts';
import { PrismaService } from '../prisma/prisma.service';
import {
  applySlangMapping,
  findMatchingProperties,
  getRecommendations,
  type PropertySearchFilters,
} from './search-tools';

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    propertyKind: { type: 'string' },
    locationNames: { type: 'array', items: { type: 'string' } },
    minPrice: { type: 'number' },
    maxPrice: { type: 'number' },
    bedrooms: { type: 'number' },
    paymentMethod: { type: 'string' },
    wantsRecommendations: { type: 'boolean' },
  },
};

export interface SearchFilters {
  type?: string;
  kind?: string;
  governorate?: string;
  city?: string;
  bedrooms?: number;
  maxPrice?: number;
}

export interface HistoryEntry {
  role: 'user' | 'bot';
  text: string;
}

export interface SearchChatResponse {
  message: string;
  properties?: unknown[];
  filters?: SearchFilters;
}

@Injectable()
export class SearchChatService {
  private readonly logger = new Logger(SearchChatService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly prisma: PrismaService,
  ) {}

  /** Match location names against actual property DB fields (governorate / city / district). */
  private async resolveLocationToPropertyField(
    names: string[],
  ): Promise<{ governorate?: string; city?: string }> {
    // Find any property whose governorate, city, or district contains one of the names
    for (const name of names) {
      const match = await this.prisma.property.findFirst({
        where: {
          OR: [
            { governorate: { contains: name } },
            { city: { contains: name } },
            { district: { contains: name } },
          ],
          propertyStatus: 'ACTIVE',
        },
        select: { governorate: true, city: true, district: true },
      });
      if (match) {
        // Determine which field matched and return it at the right level
        if (match.city?.includes(name) || match.district?.includes(name)) {
          return { governorate: match.governorate ?? undefined, city: match.city ?? undefined };
        }
        return { governorate: match.governorate ?? undefined };
      }
    }
    return {};
  }

  /** Reset keywords that drop accumulated filter memory and start a fresh search. */
  private isResetCommand(text: string): boolean {
    const t = text.trim();
    const keywords = [
      'بحث جديد',
      'ابدأ من جديد',
      'ابدا من جديد',
      'ابدأ تاني',
      'ابدا تاني',
      'من الأول',
      'من الاول',
      'reset',
      'restart',
      'نسي اللي قبل',
      'انسى',
      'انسى اللي فات',
    ];
    return keywords.some((k) => t.includes(k));
  }

  /** Merge new extraction onto previous filters — extracted fields override, others persist. */
  private mergeFilters(
    previous: PropertySearchFilters,
    extracted: PropertySearchFilters,
  ): PropertySearchFilters {
    return {
      intent: extracted.intent ?? previous.intent,
      propertyKind: extracted.propertyKind ?? previous.propertyKind,
      locationNames:
        extracted.locationNames && extracted.locationNames.length > 0
          ? extracted.locationNames
          : previous.locationNames,
      minPrice: extracted.minPrice ?? previous.minPrice,
      maxPrice: extracted.maxPrice ?? previous.maxPrice,
      bedrooms: extracted.bedrooms ?? previous.bedrooms,
      paymentMethod: extracted.paymentMethod ?? previous.paymentMethod,
    };
  }

  /** Convert frontend response filters back into internal PropertySearchFilters. */
  private hydratePreviousFilters(prev?: SearchFilters): PropertySearchFilters {
    if (!prev) return {};
    const locationNames: string[] = [];
    if (prev.city) locationNames.push(prev.city);
    if (prev.governorate && !locationNames.includes(prev.governorate)) {
      locationNames.push(prev.governorate);
    }
    return {
      intent: prev.type as 'SALE' | 'RENT' | undefined,
      propertyKind: prev.kind,
      bedrooms: prev.bedrooms,
      maxPrice: prev.maxPrice,
      locationNames: locationNames.length > 0 ? locationNames : undefined,
    };
  }

  async handleMessage(
    userId: string,
    text: string,
    history: HistoryEntry[] = [],
    previousFilters?: SearchFilters,
  ): Promise<SearchChatResponse> {
    // Reset → drop accumulated filters before extraction.
    const previous: PropertySearchFilters = this.isResetCommand(text)
      ? {}
      : this.hydratePreviousFilters(previousFilters);

    // Apply slang mapping to enrich the prompt context
    const slangExtras = applySlangMapping(text);

    // Build conversation context from last 6 exchanges
    const recent = history.slice(-12); // 6 pairs = 12 entries
    const contextBlock =
      recent.length > 0
        ? [
            '[سياق المحادثة السابقة]',
            ...recent.map((e) => `${e.role === 'user' ? 'المستخدم' : 'المساعد'}: ${e.text}`),
            '[نهاية السياق]',
            '',
          ].join('\n')
        : '';

    const enrichedPrompt = [
      contextBlock,
      `رسالة المستخدم: "${text}"`,
      Object.keys(slangExtras).length > 0
        ? `مصطلحات مكتشفة: ${JSON.stringify(slangExtras)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    let filters: PropertySearchFilters = {};

    try {
      const extracted = await this.llm.sendMessage(
        enrichedPrompt,
        SEARCH_CHAT_SYSTEM_PROMPT,
        SEARCH_SCHEMA,
      );

      // Merge slang extras with LLM extraction
      const extractedFilters: PropertySearchFilters = {
        intent: (extracted['intent'] as 'SALE' | 'RENT') ?? undefined,
        propertyKind: (extracted['propertyKind'] as string) ?? undefined,
        locationNames: (extracted['locationNames'] as string[]) ?? undefined,
        minPrice: (extracted['minPrice'] as number) ?? undefined,
        maxPrice: (extracted['maxPrice'] as number) ?? undefined,
        bedrooms: (extracted['bedrooms'] as number) ?? undefined,
        paymentMethod: slangExtras['paymentMethod'] ?? (extracted['paymentMethod'] as string) ?? undefined,
      };
      // Merge with previous turn's filters so follow-up messages refine instead of reset.
      filters = this.mergeFilters(previous, extractedFilters);

      if (extracted['wantsRecommendations']) {
        const recs = await getRecommendations(this.prisma, userId);
        if (recs.length > 0) {
          return {
            message: `وجدت ${recs.length} توصيات مخصصة لك 🏡`,
            properties: recs.map((r) => r.property),
          };
        }
        return { message: 'مفيش توصيات متاحة دلوقتي. جرب تبحث بمواصفات تانية.' };
      }
    } catch (err) {
      this.logger.warn(`LLM extraction failed, using slang-only filters: ${err}`);
      filters = this.mergeFilters(previous, { paymentMethod: slangExtras['paymentMethod'] });
    }

    // Build flat filter object for frontend URL params.
    const locationNames = filters.locationNames ?? [];
    const responseFilters: SearchFilters = {
      ...(filters.intent && { type: filters.intent }),
      ...(filters.propertyKind && { kind: filters.propertyKind }),
      ...(filters.bedrooms != null && filters.bedrooms > 0 && { bedrooms: filters.bedrooms }),
      ...(filters.maxPrice != null && filters.maxPrice > 0 && { maxPrice: filters.maxPrice }),
    };

    // Resolve location names: prefer the exact governorate/city already present in DB,
    // but fall back to passing the raw user term as `city` so HomePage's `contains`
    // filter still applies (e.g. "التجمع الخامس" stored as district elsewhere).
    if (locationNames.length > 0) {
      const locationMatch = await this.resolveLocationToPropertyField(locationNames);
      if (locationMatch.governorate) responseFilters.governorate = locationMatch.governorate;
      if (locationMatch.city) {
        responseFilters.city = locationMatch.city;
      } else if (!locationMatch.governorate) {
        responseFilters.city = locationNames[0];
      }
    }

    try {
      const properties = await findMatchingProperties(this.prisma, filters);

      if (properties.length === 0) {
        return {
          message: 'معنديش عقارات مطابقة دلوقتي. جرب تغير المواصفات أو تتواصل مع أحد المستشارين.',
          filters: responseFilters,
        };
      }

      const count = properties.length;
      return {
        message: `وجدت ${count} عقار${count > 1 ? 'ات' : ''} مناسب${count > 1 ? 'ة' : ''} ليك 🏡`,
        properties,
        filters: responseFilters,
      };
    } catch (err) {
      this.logger.error(`Property search failed: ${err}`);
      return { message: 'حدث خطأ أثناء البحث. حاول تاني بعد شوية.' };
    }
  }
}
