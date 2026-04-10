/**
 * Extraction prompt builder — instructs Gemini to extract one field from user text.
 * Ported 1:1 from Python src/prompts/extraction_prompt.py
 */
import { FlowState } from '../common/types';

export interface ExtractionConfig {
  hint: string;
  schema: Record<string, unknown>;
}

const PROMPTS: Record<string, ExtractionConfig> = {
  intent: {
    hint: 'أنت تحدد نية المستخدم: هل يريد شراء (BUY)، بيع (SELL)، تأجير (RENT)، أو البحث عن إيجار (LEASE).',
    schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: ['BUY', 'SELL', 'RENT', 'LEASE', 'UNKNOWN'],
        },
      },
      required: ['intent'],
    },
  },
  unit_type: {
    hint: 'أنت تحدد نوع العقار المذكور: شقة (APARTMENT)، أرض (LAND)، فيلا (VILLA)، أو تجاري (COMMERCIAL).',
    schema: {
      type: 'object',
      properties: {
        unit_type: {
          type: 'string',
          enum: ['APARTMENT', 'LAND', 'VILLA', 'COMMERCIAL', 'UNKNOWN'],
        },
      },
      required: ['unit_type'],
    },
  },
  area: {
    hint: 'استخرج مساحة العقار كرقم فقط (بالمتر المربع عادة).',
    schema: { type: 'object', properties: { area: { type: 'number' } }, required: ['area'] },
  },
  rooms: {
    hint: 'استخرج عدد الغرف كرقم صحيح.',
    schema: { type: 'object', properties: { rooms: { type: 'integer' } }, required: ['rooms'] },
  },
  floor: {
    hint: 'استخرج رقم الدور.',
    schema: { type: 'object', properties: { floor: { type: 'integer' } }, required: ['floor'] },
  },
  finishing: {
    hint: 'استخرج حالة التشطيب (مثال: طوب أحمر، محارة، سوبر لوكس، الترا سوبر لوكس).',
    schema: {
      type: 'object',
      properties: { finishing: { type: 'string' } },
      required: ['finishing'],
    },
  },
  location: {
    hint: 'استخرج موقع أو عنوان العقار.',
    schema: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
    },
  },
  price: {
    hint: 'استخرج السعر المطلوب كرقم.',
    schema: { type: 'object', properties: { price: { type: 'number' } }, required: ['price'] },
  },
  budget: {
    hint: 'استخرج الميزانية القصوى للشراء كرقم.',
    schema: { type: 'object', properties: { budget: { type: 'number' } }, required: ['budget'] },
  },
  min_area: {
    hint: 'استخرج الحد الأدنى للمساحة المطلوبة كرقم (بالمتر المربع).',
    schema: {
      type: 'object',
      properties: { min_area: { type: 'number' } },
      required: ['min_area'],
    },
  },
  min_rooms: {
    hint: 'استخرج أقل عدد غرف مطلوب كرقم صحيح.',
    schema: {
      type: 'object',
      properties: { min_rooms: { type: 'integer' } },
      required: ['min_rooms'],
    },
  },
  monthly_budget: {
    hint: 'استخرج ميزانية الإيجار الشهري كرقم.',
    schema: {
      type: 'object',
      properties: { monthly_budget: { type: 'number' } },
      required: ['monthly_budget'],
    },
  },
  duration: {
    hint: 'استخرج مدة الإيجار المطلوبة (مثال: سنة، 6 شهور، شهرين).',
    schema: {
      type: 'object',
      properties: { duration: { type: 'string' } },
      required: ['duration'],
    },
  },
  total_area: {
    hint: 'استخرج المساحة الكلية للأرض كرقم (بالمتر المربع).',
    schema: {
      type: 'object',
      properties: { total_area: { type: 'number' } },
      required: ['total_area'],
    },
  },
  legal_status: {
    hint: 'استخرج الوضع القانوني للأرض (مسجل، غير مسجل، عقد ابتدائي، توكيل).',
    schema: {
      type: 'object',
      properties: { legal_status: { type: 'string' } },
      required: ['legal_status'],
    },
  },
  zoning: {
    hint: 'استخرج تخصيص الأرض (سكني، زراعي، صناعي، تجاري).',
    schema: {
      type: 'object',
      properties: { zoning: { type: 'string' } },
      required: ['zoning'],
    },
  },
  is_correct: {
    hint: 'المستخدم يؤكد على ملخص البيانات. هل أرد التأكيد (true) أم يريد التعديل (false)؟ إذا أراد التعديل، ما هو الحقل الذي يريد تعديله؟ الحقول: intent, unit_type, area, rooms, floor, finishing, location, price.',
    schema: {
      type: 'object',
      properties: {
        is_correct: { type: 'boolean' },
        correction_field: { type: 'string' },
      },
      required: ['is_correct'],
    },
  },
};

/**
 * Build the extraction prompt for Gemini.
 * @returns [schema, promptText] tuple — mirrors Python's (schema, prompt) return.
 */
export function buildExtractionPrompt(
  flowState: FlowState,
  fieldName: string,
  userMessage: string,
): [Record<string, unknown>, string] {
  let config: ExtractionConfig;

  if (flowState === FlowState.AWAITING_CONFIRMATION) {
    config = PROMPTS['is_correct'];
  } else {
    config = PROMPTS[fieldName] ?? {
      hint: `Extract ${fieldName}.`,
      schema: {
        type: 'object',
        properties: { [fieldName]: { type: 'string' } },
      },
    };
  }

  const prompt = `
${config.hint}

User Message: "${userMessage}"

Extract the value strictly conforming to the requested schema. If not found or ambiguous, return null or UNKNOWN.
`.trim();

  return [config.schema, prompt];
}
