/**
 * Invoice Extractor Service — extracts structured offer data from free-text Arabic.
 *
 * Used by NegotiationService to detect when a user makes a free-text
 * price offer (e.g. "بدي اديك 500 الف" or "مش هدفع أكتر من مليون").
 *
 * Uses the LLM provider with a JSON schema for reliable extraction.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { INVOICE_EXTRACTION_PROMPT } from '../llm/prompts';

/** JSON schema for LLM extraction response */
const INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    offeredPrice: {
      type: 'number',
      description: 'The price offered by the user in EGP. Convert "ألف" to 1000 and "مليون" to 1000000.',
    },
    paymentMethod: {
      type: 'string',
      description: '"CASH" or "INSTALLMENT"',
    },
    installmentMonths: {
      type: 'number',
      description: 'Number of installment months, if mentioned. null otherwise.',
    },
    conditions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any additional conditions mentioned by the user.',
    },
  },
  required: ['offeredPrice'],
};

/** Parsed extraction result */
export interface ExtractedInvoice {
  /** The price offered in EGP */
  offeredPrice: number;
  /** CASH or INSTALLMENT */
  paymentMethod?: 'CASH' | 'INSTALLMENT';
  /** Installment duration in months (if applicable) */
  installmentMonths?: number | null;
  /** Additional conditions */
  conditions?: string[];
}

/** Keywords that likely indicate a price offer in Arabic */
const PRICE_KEYWORDS = [
  'ألف',
  'الف',
  'مليون',
  'جنيه',
  'جنية',
  'سعر',
  'بدي اشتري',
  'هبقى ادى',
  'ادفع',
  'ادى',
  'أدي',
  'أعطي',
  'اعطي',
  'عرض',
  'عرضا',
  'رقم',
  'نقد',
  'كاش',
  'تقسيط',
];

@Injectable()
export class InvoiceExtractorService {
  private readonly logger = new Logger(InvoiceExtractorService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /**
   * Quick heuristic check: does the message likely contain a price offer?
   * Used to avoid unnecessary LLM calls for simple accept/reject messages.
   */
  containsPriceOffer(text: string): boolean {
    const lower = text.toLowerCase();
    // Check for explicit price keywords
    for (const kw of PRICE_KEYWORDS) {
      if (lower.includes(kw)) return true;
    }
    // Check for numeric values that could be prices (4+ digits)
    const numericMatch = lower.match(/\d{4,}/);
    if (numericMatch) return true;
    return false;
  }

  /**
   * Extract structured invoice data from free-text Arabic.
   * Returns null if no price could be extracted.
   */
  async extract(text: string): Promise<ExtractedInvoice | null> {
    try {
      const result = await this.llm.sendMessage(
        text,
        INVOICE_EXTRACTION_PROMPT,
        INVOICE_SCHEMA,
      );

      const offeredPrice = result['offeredPrice'] as number;
      if (!offeredPrice || offeredPrice <= 0) {
        this.logger.warn(`No valid price extracted from: "${text}"`);
        return null;
      }

      return {
        offeredPrice: Number(offeredPrice),
        paymentMethod: result['paymentMethod'] as 'CASH' | 'INSTALLMENT' | undefined,
        installmentMonths: result['installmentMonths'] as number | null | undefined,
        conditions: result['conditions'] as string[] | undefined,
      };
    } catch (err) {
      this.logger.error(`Invoice extraction failed: ${err}`);
      return null;
    }
  }
}
