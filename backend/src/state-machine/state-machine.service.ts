/**
 * Conversational state machine — ported 1:1 from Python src/services/state_machine.py
 * Pure functions, zero DB coupling. Fully unit-testable.
 */
import {
  ConversationDto,
  ListingDto,
  FlowState,
  Intent,
  UnitType,
  ListingStatus,
  TransitionResult,
} from '../common/types';

// ─── Field Sequences ────────────────────────────────────────────

type FieldSequenceKey = `${Intent}_${UnitType}`;

export const FIELD_SEQUENCES: Partial<Record<FieldSequenceKey, string[]>> = {
  [`${Intent.SELL}_${UnitType.APARTMENT}`]: [
    'area',
    'rooms',
    'floor',
    'finishing',
    'location',
    'price',
  ],
  [`${Intent.SELL}_${UnitType.LAND}`]: [
    'total_area',
    'legal_status',
    'zoning',
    'location',
    'price',
  ],
  [`${Intent.BUY}_${UnitType.APARTMENT}`]: [
    'location',
    'budget',
    'min_area',
    'min_rooms',
  ],
  [`${Intent.BUY}_${UnitType.LAND}`]: ['location', 'budget', 'min_area'],
  [`${Intent.RENT}_${UnitType.APARTMENT}`]: [
    'location',
    'monthly_budget',
    'duration',
    'rooms',
  ],
  [`${Intent.LEASE}_${UnitType.APARTMENT}`]: [
    'location',
    'monthly_budget',
    'duration',
    'rooms',
  ],
};

// ─── Helpers ────────────────────────────────────────────────────

export function getNextField(
  intent: Intent,
  unitType: UnitType,
  currentField: string | null,
): string | null {
  const key: FieldSequenceKey = `${intent}_${unitType}`;
  const sequence = FIELD_SEQUENCES[key] ?? [];

  if (sequence.length === 0) return null;
  if (currentField === null) return sequence[0];

  const idx = sequence.indexOf(currentField);
  if (idx === -1) return sequence[0];
  if (idx + 1 < sequence.length) return sequence[idx + 1];

  return null;
}

export function generateQuestion(field: string): string {
  const questions: Record<string, string> = {
    intent: 'عايز تبيع، تشتري، ولا تأجر؟',
    unit_type: 'إيه نوع العقار؟ (شقة، أرض، فيلا، ولا تجاري؟)',
    area: 'المساحة كام متر؟',
    rooms: 'عدد الغرف كام؟',
    floor: 'الدور الكام؟',
    finishing:
      'مستوى التشطيب أيه؟ (طوب أحمر، محارة، سوبر لوكس، إلخ)',
    location: 'المكان فين بالظبط؟',
    price: 'السعر المطلوب كام؟',
    total_area: 'المساحة الكلية كام؟',
    legal_status: 'الوضع القانوني ايه؟ (مسجل ولا لأ؟)',
    zoning: 'التخصيص إيه؟ (سكني، زراعي، صناعي؟)',
    budget: 'الميزانية في حدود كام؟',
    min_area: 'أقل مساحة بتدور عليها كام؟',
    min_rooms: 'أقل عدد غرف كام؟',
    monthly_budget: 'ميزانية الإيجار في الشهر كام؟',
    duration: 'هتأجر لمدة أد إيه؟',
  };
  return questions[field] ?? `ممكن تدينا تفاصيل عن الـ ${field}؟`;
}

export function formatSummaryCard(listing: ListingDto): string {
  const specs = listing.specs ?? {};

  const intentLabel: Record<string, string> = {
    SELL: 'بيع',
    BUY: 'شراء',
    RENT: 'إيجار',
    LEASE: 'تأجير',
  };

  const unitTypeLabel: Record<string, string> = {
    APARTMENT: 'شقة',
    LAND: 'أرض',
    VILLA: 'فيلا',
    COMMERCIAL: 'تجاري',
  };

  const labelMap: Record<string, string> = {
    area: 'المساحة',
    rooms: 'عدد الغرف',
    floor: 'الدور',
    finishing: 'التشطيب',
    location: 'الموقع',
    price: 'السعر (إجمالي)',
    total_area: 'المساحة الكلية',
    legal_status: 'الوضع القانوني',
    zoning: 'التخصيص',
    budget: 'الميزانية القصوى',
    min_area: 'الحد الأدنى للمساحة',
    min_rooms: 'الحد الأدنى للغرف',
    monthly_budget: 'الإيجار الشهري',
    duration: 'المدة',
  };

  const lines: string[] = ['ملخص البيانات اللي جمعناها:'];
  lines.push(`النية: ${listing.intent ? (intentLabel[listing.intent] ?? listing.intent) : 'معلق'}`);
  lines.push(`النوع: ${listing.unitType ? (unitTypeLabel[listing.unitType] ?? listing.unitType) : 'معلق'}`);

  const key =
    listing.intent && listing.unitType
      ? (`${listing.intent}_${listing.unitType}` as FieldSequenceKey)
      : null;

  const sequence = key ? (FIELD_SEQUENCES[key] ?? []) : [];

  for (const fieldKey of sequence) {
    let val: unknown =
      specs[fieldKey] ??
      (fieldKey === 'location' ? listing.location : undefined) ??
      (fieldKey === 'price' || fieldKey === 'budget' || fieldKey === 'monthly_budget'
        ? listing.price
        : undefined);

    if (val === null || val === undefined || val === 'Pending') {
      val = 'معلق';
    }
    lines.push(`- ${labelMap[fieldKey] ?? fieldKey}: ${val}`);
  }

  lines.push('\nده صح ولا عايز تغير حاجة؟');
  return lines.join('\n');
}

export function generateWelcomeBack(question: string): string {
  return `أهلاً تاني! كنا وقفنا عند سؤال:\n${question}`;
}

// ─── Main Transition Function ───────────────────────────────────

export function transition(
  conversation: ConversationDto,
  listing: ListingDto,
  userInput: string,
  extractedData: Record<string, unknown>,
): TransitionResult {
  // ── AWAITING_INTENT ─────────────────────────────────────────
  if (conversation.flowState === FlowState.AWAITING_INTENT) {
    const intentVal = extractedData['intent'] as string | undefined;
    if (intentVal && intentVal !== 'UNKNOWN') {
      if (Object.values(Intent).includes(intentVal as Intent)) {
        const intentEnum = intentVal as Intent;
        conversation.intent = intentEnum;
        listing.intent = intentEnum;
        conversation.flowState = FlowState.AWAITING_UNIT_TYPE;
        return { conversation, listing, replyText: generateQuestion('unit_type') };
      }
    }
    return { conversation, listing, replyText: generateQuestion('intent') };
  }

  // ── AWAITING_UNIT_TYPE ──────────────────────────────────────
  if (conversation.flowState === FlowState.AWAITING_UNIT_TYPE) {
    const utVal = extractedData['unit_type'] as string | undefined;
    if (utVal && utVal !== 'UNKNOWN') {
      if (Object.values(UnitType).includes(utVal as UnitType)) {
        const utEnum = utVal as UnitType;
        listing.unitType = utEnum;

        const nextField = getNextField(conversation.intent!, utEnum, null);
        if (nextField) {
          conversation.flowState = FlowState.AWAITING_SPECS;
          conversation.currentField = nextField;
          return { conversation, listing, replyText: generateQuestion(nextField) };
        }
        return {
          conversation,
          listing,
          replyText: 'عفواً، النوع ده لسه مش مدعوم بالكامل.',
        };
      }
    }
    return { conversation, listing, replyText: generateQuestion('unit_type') };
  }

  // ── AWAITING_SPECS ──────────────────────────────────────────
  if (conversation.flowState === FlowState.AWAITING_SPECS) {
    const curr = conversation.currentField;
    if (!curr) {
      return { conversation, listing, replyText: generateQuestion('intent') };
    }

    const val = extractedData[curr];
    if (val !== null && val !== undefined) {
      if (curr === 'location') {
        listing.location = String(val);
      } else if (['price', 'budget', 'monthly_budget'].includes(curr)) {
        const numVal = Number(val);
        if (!isNaN(numVal)) {
          listing.price = numVal;
        }
      } else {
        listing.specs[curr] = val;
      }

      const nextField = getNextField(
        conversation.intent!,
        listing.unitType!,
        curr,
      );
      if (nextField) {
        conversation.currentField = nextField;
        return { conversation, listing, replyText: generateQuestion(nextField) };
      }

      // No more fields
      conversation.currentField = null;

      // BUY skips AWAITING_MEDIA
      if (conversation.intent === Intent.BUY) {
        conversation.flowState = FlowState.AWAITING_CONFIRMATION;
        return { conversation, listing, replyText: formatSummaryCard(listing) };
      }

      conversation.flowState = FlowState.AWAITING_MEDIA;
      return {
        conversation,
        listing,
        replyText:
          'الصور بتبيع الشقة — ابعتلي صور أو فيديو لو عندك. أو قول \'مش دلوقتي\'.',
      };
    }

    return { conversation, listing, replyText: generateQuestion(curr) };
  }

  // ── AWAITING_MEDIA ──────────────────────────────────────────
  if (conversation.flowState === FlowState.AWAITING_MEDIA) {
    if (
      userInput.includes('مش دلوقتي') ||
      userInput.includes('لا') ||
      extractedData['has_media']
    ) {
      conversation.flowState = FlowState.AWAITING_CONFIRMATION;
      return { conversation, listing, replyText: formatSummaryCard(listing) };
    }

    conversation.flowState = FlowState.AWAITING_CONFIRMATION;
    return { conversation, listing, replyText: formatSummaryCard(listing) };
  }

  // ── AWAITING_CONFIRMATION ───────────────────────────────────
  if (conversation.flowState === FlowState.AWAITING_CONFIRMATION) {
    const isCorrect = extractedData['is_correct'] as boolean | undefined;
    const correctionField = extractedData['correction_field'] as
      | string
      | undefined;

    if (isCorrect === true) {
      conversation.flowState = FlowState.CONFIRMED;
      listing.status = ListingStatus.CONFIRMED;
      return {
        conversation,
        listing,
        replyText: 'تمام، تم تأكيد البيانات بنجاح!',
      };
    }

    if (correctionField) {
      conversation.flowState = FlowState.AWAITING_SPECS;
      conversation.currentField = correctionField;
      return {
        conversation,
        listing,
        replyText: generateQuestion(correctionField),
      };
    }

    return {
      conversation,
      listing,
      replyText:
        'ده صح ولا عايز تغير حاجة؟ (قول \'صح\' أو \'عايز أغير ...\')',
    };
  }

  // ── Fallback ────────────────────────────────────────────────
  return {
    conversation,
    listing,
    replyText: 'عفواً، حصلت مشكلة، هنعيد من الأول؟',
  };
}
