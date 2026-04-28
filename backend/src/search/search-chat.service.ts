/**
 * Search Chat Service — natural language property search via LLM tool-calling.
 *
 * Flow:
 *  1. User sends Arabic description (e.g. "عايز شقة 3 اوض في المعادي不超过 مليون")
 *  2. LLM extracts structured criteria → { intent, propertyKind, location, minPrice, maxPrice, bedrooms }
 *  3. Service runs Prisma queries via search-tools
 *  4. LLM formats results into Egyptian Arabic response
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { SEARCH_CHAT_SYSTEM_PROMPT } from '../llm/prompts';
import { ConversationContext, ConversationResponse } from '../common';
import {
  searchProperties,
  countProperties,
  resolveSlang,
  SearchResult,
} from './search-tools';

/** JSON schema for the LLM extraction response */
const SEARCH_CRITERIA_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', description: 'SALE or RENT' },
    propertyKind: {
      type: 'string',
      description: 'APARTMENT, VILLA, SHOP, OFFICE, SUMMER_RESORT, COMMERCIAL, LAND_BUILDING',
    },
    location: { type: 'string', description: 'City or district name in Arabic' },
    minPrice: { type: 'number', description: 'Minimum price in EGP' },
    maxPrice: { type: 'number', description: 'Maximum price in EGP' },
    bedrooms: { type: 'number', description: 'Minimum number of bedrooms' },
    paymentPreference: { type: 'string', description: 'CASH or INSTALLMENT' },
  },
};

@Injectable()
export class SearchChatService {
  private readonly logger = new Logger(SearchChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /**
   * Handle a user message in the search_chat flow.
   *
   * If metadata.extractedCriteria already exists (follow-up), refine it.
   * Otherwise, extract fresh criteria from the user's message.
   */
  async handleMessage(
    context: ConversationContext,
    input: string,
  ): Promise<ConversationResponse> {
    this.logger.debug(`searchChat: input="${input}"`);

    // ── Step 1: Extract structured criteria via LLM ──────────────
    const extractionPrompt = context.metadata?.['extractedCriteria']
      ? `المعايير الحالية: ${JSON.stringify(context.metadata['extractedCriteria'])}\nرسالة المستخدم: ${input}\nحدّث المعايير بناءً على رسالة المستخدم.`
      : input;

    let extracted: Record<string, unknown>;
    try {
      extracted = await this.llm.sendMessage(
        extractionPrompt,
        SEARCH_CHAT_SYSTEM_PROMPT,
        SEARCH_CRITERIA_SCHEMA,
      );
    } catch (err) {
      this.logger.error(`LLM extraction failed: ${err}`);
      return {
        message:
          'معلش، معرفتش أفهم طلبك ممكن تكتبه بشكل تاني؟\nمثال: "عايز شقة 3 اوض في المعادي بسعر أقل من ٢ مليون"',
        action: 'search_chat_retry',
        data: { rawInput: input },
      };
    }

    this.logger.debug(`Extracted criteria: ${JSON.stringify(extracted)}`);

    // ── Step 2: Resolve slang → DB enum values ───────────────────
    const resolved = resolveSlang(extracted);

    // ── Step 3: Run search via Prisma ─────────────────────────────
    const criteria = {
      intent: resolved['intent'] as string | undefined,
      propertyKind: resolved['propertyKind'] as string | undefined,
      city: (resolved['location'] as string) || undefined,
      district: undefined,
      minPrice: resolved['minPrice'] as number | undefined,
      maxPrice: resolved['maxPrice'] as number | undefined,
      bedrooms: resolved['bedrooms'] as number | undefined,
      paymentType: resolved['paymentType'] as string | undefined,
    };

    const [results, totalCount] = await Promise.all([
      searchProperties(this.prisma, criteria),
      countProperties(this.prisma, criteria),
    ]);

    this.logger.debug(`Found ${results.length}/${totalCount} properties`);

    // ── Step 4: Format response via LLM ──────────────────────────
    if (results.length === 0) {
      return {
        message: this.formatNoResults(criteria),
        action: 'search_chat_no_results',
        data: { criteria, totalCount },
      };
    }

    const resultsText = this.formatResultsForLlm(results);
    const formattedMessage = await this.formatResultsWithLlm(
      input,
      resultsText,
      totalCount,
    );

    return {
      message: formattedMessage,
      action: 'search_chat_results',
      data: { criteria, results, totalCount },
    };
  }

  // ─── Private helpers ────────────────────────────────────────────

  private formatNoResults(criteria: Record<string, unknown>): string {
    return (
      `للأسف مفيش نتائج مطابقة لطلبك${criteria['city'] ? ` في ${criteria['city']}` : ''}. ` +
      'جرب تغيّر المعايير أو البحث في منطقة تانية. 🏠'
    );
  }

  private formatResultsForLlm(results: SearchResult[]): string {
    return results
      .map((r, i) => {
        const parts = [
          `${i + 1}. ${r.title}`,
          r.city || r.district ? `📍 ${[r.district, r.city].filter(Boolean).join(', ')}` : '',
          r.price ? `💰 ${Number(r.price).toLocaleString('ar-EG')} جنيه` : '',
          r.areaM2 ? `📐 ${r.areaM2} متر` : '',
          r.bedrooms ? `🛏️ ${r.bedrooms} اوض` : '',
          r.finishingType ? `🔧 ${r.finishingType}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
        return parts;
      })
      .join('\n');
  }

  private async formatResultsWithLlm(
    originalQuery: string,
    resultsText: string,
    totalCount: number,
  ): Promise<string> {
    try {
      const response = await this.llm.sendMessage(
        `سؤال المستخدم: ${originalQuery}\n\nالنتائج (${totalCount} عقار):\n${resultsText}\n\nاكتب رد بالعامية المصرية المهذبة تعرض فيه النتائج بشكل منظم وودود.`,
        'أنت مساعد عقارات مصري. اكتب رد قصير وودود بالعامية المصرية تعرض فيه نتائج البحث بشكل واضح. لا تضف عقارات غير المذكورة.',
      );
      return (response['message'] as string) || resultsText;
    } catch {
      // Fallback to raw results if LLM fails
      return `لقينا ${totalCount} عقار مطابق:\n${resultsText}`;
    }
  }
}
