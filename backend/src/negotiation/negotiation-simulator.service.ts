import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import type { LlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';

export type SimulatorOutcome =
  | 'INITIAL'
  | 'COUNTER'
  | 'AGREED'
  | 'ESCALATE_TO_OWNER';

export interface SimulatorStep {
  round: number;
  sellerOffer: number;
  buyerOffer: number;
  outcome: SimulatorOutcome;
  message: string;
}

export interface SimulationResult {
  sellerMaxPrice: number;
  sellerMinPrice: number;
  schedule: number[];
  steps: SimulatorStep[];
  finalOutcome: SimulatorOutcome;
  ownerNotice?: string;
}

const SYSTEM_PROMPT = `أنت سمسار AI تتفاوض نيابةً عن مالك العقار باللغة العربية المصرية المهذبة.
- لا تتخذ قرارات: فقط صيغ الرسالة بشكل مهذب وودود.
- استخدم رموز تعبيرية بسيطة عند الاقتضاء.
- أعد JSON بالشكل: { "message": "..." }`;

@Injectable()
export class NegotiationSimulatorService {
  private readonly logger = new Logger(NegotiationSimulatorService.name);

  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  /**
   * Build the descending price schedule from sellerMaxPrice down to sellerMinPrice
   * by splitting the [min, max] range into three equal parts.
   *
   *   schedule = [ max, max - gap/3, max - 2*gap/3, min ]
   *
   * Per spec step 2: "divide the range into three equal parts and reduce step
   * by step until the minimum is reached".
   */
  buildSchedule(sellerMaxPrice: number, sellerMinPrice: number): number[] {
    if (sellerMinPrice <= 0 || sellerMaxPrice <= 0) {
      throw new BadRequestException('Prices must be positive');
    }
    if (sellerMaxPrice < sellerMinPrice) {
      throw new BadRequestException('sellerMaxPrice must be >= sellerMinPrice');
    }
    const gap = sellerMaxPrice - sellerMinPrice;
    const step = gap / 3;
    return [
      this.round2dp(sellerMaxPrice),
      this.round2dp(sellerMaxPrice - step),
      this.round2dp(sellerMaxPrice - 2 * step),
      this.round2dp(sellerMinPrice),
    ];
  }

  /**
   * Simulate the full negotiation between buyer and seller-AI using the schedule
   * built from the owner's [min, max] range.
   *
   * Step 1: Begin negotiation within the owner's range, anchoring at sellerMaxPrice.
   * Step 2: Each round, drop to the next price in the thirds-split schedule.
   * Step 3: Continue dropping until the seller offer reaches sellerMinPrice.
   * Step 4: If the buyer's standing offer is still below the floor at that point,
   *         escalate: notify the owner that a serious buyer offered X and ask for a decision.
   */
  async simulate(
    sellerMaxPrice: number,
    sellerMinPrice: number,
    buyerOffer: number,
  ): Promise<SimulationResult> {
    if (buyerOffer <= 0) {
      throw new BadRequestException('buyerOffer must be positive');
    }

    const schedule = this.buildSchedule(sellerMaxPrice, sellerMinPrice);
    const steps: SimulatorStep[] = [];

    let finalOutcome: SimulatorOutcome = 'INITIAL';

    for (let i = 0; i < schedule.length; i++) {
      const round = i + 1;
      const sellerOffer = schedule[i];

      // Buyer met or exceeded current seller offer → DEAL
      if (buyerOffer >= sellerOffer) {
        const message = await this.formatMessage('accept', sellerOffer, round);
        steps.push({
          round,
          sellerOffer,
          buyerOffer,
          outcome: 'AGREED',
          message,
        });
        finalOutcome = 'AGREED';
        break;
      }

      // Last step (we've reached the floor) and buyer still below → escalate
      if (i === schedule.length - 1) {
        const message = await this.formatMessage('floor', sellerOffer, round);
        steps.push({
          round,
          sellerOffer,
          buyerOffer,
          outcome: 'ESCALATE_TO_OWNER',
          message,
        });
        finalOutcome = 'ESCALATE_TO_OWNER';
        break;
      }

      // Otherwise present the next counter
      const context = i === 0 ? 'initial' : 'counter';
      const message = await this.formatMessage(context, sellerOffer, round);
      steps.push({
        round,
        sellerOffer,
        buyerOffer,
        outcome: i === 0 ? 'INITIAL' : 'COUNTER',
        message,
      });
    }

    const result: SimulationResult = {
      sellerMaxPrice: this.round2dp(sellerMaxPrice),
      sellerMinPrice: this.round2dp(sellerMinPrice),
      schedule,
      steps,
      finalOutcome,
    };

    if (finalOutcome === 'ESCALATE_TO_OWNER') {
      result.ownerNotice = await this.formatOwnerEscalation(buyerOffer, sellerMinPrice);
    }

    return result;
  }

  // ─── Message formatting via Gemini (Gama4) ───────────────────

  private async formatMessage(
    context: 'initial' | 'counter' | 'accept' | 'floor',
    price: number,
    round: number,
  ): Promise<string> {
    const fallback = this.fallbackMessage(context, price);
    try {
      const prompt = JSON.stringify({
        context,
        round,
        price,
        formattedPrice: price.toLocaleString('en-EG'),
      });
      const schema = {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      };
      const out = await this.llm.sendMessage(prompt, SYSTEM_PROMPT, schema);
      const msg = out['message'];
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
      return fallback;
    } catch (err) {
      this.logger.warn(`LLM formatting failed (${context}): ${err}`);
      return fallback;
    }
  }

  private async formatOwnerEscalation(
    buyerOffer: number,
    sellerMinPrice: number,
  ): Promise<string> {
    const fallback =
      `📢 إشعار للمالك: مشترٍ جاد عرض ${buyerOffer.toLocaleString('en-EG')} جنيه — وهو أقل من الحد الأدنى (${sellerMinPrice.toLocaleString('en-EG')} جنيه). برجاء اتخاذ القرار: قبول، رفض، أو تعديل الحد الأدنى.`;
    try {
      const prompt = JSON.stringify({
        context: 'owner_escalation',
        buyerOffer,
        sellerMinPrice,
        formattedBuyerOffer: buyerOffer.toLocaleString('en-EG'),
        formattedFloor: sellerMinPrice.toLocaleString('en-EG'),
      });
      const schema = {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      };
      const out = await this.llm.sendMessage(prompt, SYSTEM_PROMPT, schema);
      const msg = out['message'];
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
      return fallback;
    } catch (err) {
      this.logger.warn(`Owner escalation formatting failed: ${err}`);
      return fallback;
    }
  }

  private fallbackMessage(
    context: 'initial' | 'counter' | 'accept' | 'floor',
    price: number,
  ): string {
    const formatted = price.toLocaleString('en-EG');
    switch (context) {
      case 'initial':
        return `أهلاً بك 👋 السعر المطلوب للعقار هو ${formatted} جنيه.`;
      case 'counter':
        return `بعد التفاوض، أفضل سعر يمكنني تقديمه الآن هو ${formatted} جنيه. هل يناسب حضرتك؟`;
      case 'accept':
        return `تم الاتفاق على ${formatted} جنيه ✅ برجاء استكمال الدفع.`;
      case 'floor':
        return `هذا هو الحد الأدنى الذي يقبله المالك: ${formatted} جنيه — وهو أفضل سعر متاح.`;
    }
  }

  private round2dp(v: number): number {
    return Math.round(v * 100) / 100;
  }
}
