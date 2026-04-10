/**
 * Tests for extraction-prompt.ts — ported 1:1 from Python test_extraction_prompt.py
 */
import { buildExtractionPrompt } from './extraction-prompt';
import { FlowState } from '../common/types';

describe('buildExtractionPrompt', () => {
  it('returns tuple of schema and prompt', () => {
    const [schema, prompt] = buildExtractionPrompt(
      FlowState.AWAITING_INTENT, 'intent', 'عايز ابيع',
    );
    expect(typeof schema).toBe('object');
    expect(typeof prompt).toBe('string');
  });

  it('intent schema has enum', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_INTENT, 'intent', 'test');
    const props = (schema as any).properties;
    expect(props.intent).toBeDefined();
    expect(props.intent.enum).toContain('BUY');
    expect(props.intent.enum).toContain('SELL');
    expect(props.intent.enum).toContain('RENT');
    expect(props.intent.enum).toContain('UNKNOWN');
  });

  it('unit_type schema has enum', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_UNIT_TYPE, 'unit_type', 'شقة');
    const props = (schema as any).properties;
    expect(props.unit_type).toBeDefined();
    expect(props.unit_type.enum).toContain('APARTMENT');
    expect(props.unit_type.enum).toContain('LAND');
  });

  it('area schema is number', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'area', '120 متر');
    expect((schema as any).properties.area.type).toBe('number');
  });

  it('rooms schema is integer', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'rooms', '3 غرف');
    expect((schema as any).properties.rooms.type).toBe('integer');
  });

  it('location schema is string', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'location', 'التجمع');
    expect((schema as any).properties.location.type).toBe('string');
  });

  it('price schema is number', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'price', '2 مليون');
    expect((schema as any).properties.price.type).toBe('number');
  });

  it('is_correct schema has boolean and correction_field', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_CONFIRMATION, 'is_correct', 'صح');
    const props = (schema as any).properties;
    expect(props.is_correct.type).toBe('boolean');
    expect(props.correction_field).toBeDefined();
  });

  it('awaiting confirmation uses is_correct config', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_CONFIRMATION, 'anything', 'صح');
    const props = (schema as any).properties;
    expect(props.is_correct).toBeDefined();
  });

  it('unknown field uses fallback', () => {
    const [schema, prompt] = buildExtractionPrompt(
      FlowState.AWAITING_SPECS, 'some_new_field', 'data',
    );
    const props = (schema as any).properties;
    expect(props.some_new_field).toBeDefined();
  });

  it('prompt includes user message', () => {
    const [, prompt] = buildExtractionPrompt(
      FlowState.AWAITING_INTENT, 'intent', 'عايز اشتري شقة',
    );
    expect(prompt).toContain('عايز اشتري شقة');
  });

  // ── All 17 known fields have configs ──────────────────────────

  const KNOWN_FIELDS: [string, FlowState][] = [
    ['intent', FlowState.AWAITING_INTENT],
    ['unit_type', FlowState.AWAITING_UNIT_TYPE],
    ['area', FlowState.AWAITING_SPECS],
    ['rooms', FlowState.AWAITING_SPECS],
    ['floor', FlowState.AWAITING_SPECS],
    ['finishing', FlowState.AWAITING_SPECS],
    ['location', FlowState.AWAITING_SPECS],
    ['price', FlowState.AWAITING_SPECS],
    ['budget', FlowState.AWAITING_SPECS],
    ['min_area', FlowState.AWAITING_SPECS],
    ['min_rooms', FlowState.AWAITING_SPECS],
    ['monthly_budget', FlowState.AWAITING_SPECS],
    ['duration', FlowState.AWAITING_SPECS],
    ['total_area', FlowState.AWAITING_SPECS],
    ['legal_status', FlowState.AWAITING_SPECS],
    ['zoning', FlowState.AWAITING_SPECS],
    ['is_correct', FlowState.AWAITING_CONFIRMATION],
  ];

  it.each(KNOWN_FIELDS)('field "%s" has config', (field, flowState) => {
    const [schema, prompt] = buildExtractionPrompt(flowState, field, 'test input');
    expect(schema).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(10);
  });

  it('floor schema is integer', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'floor', 'الدور التالت');
    expect((schema as any).properties.floor.type).toBe('integer');
  });

  it('finishing schema is string', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'finishing', 'سوبر لوكس');
    expect((schema as any).properties.finishing.type).toBe('string');
  });

  it('budget schema is number', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'budget', 'مليون');
    expect((schema as any).properties.budget.type).toBe('number');
  });

  it('min_area schema is number', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'min_area', '100');
    expect((schema as any).properties.min_area.type).toBe('number');
  });

  it('min_rooms schema is integer', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'min_rooms', '2');
    expect((schema as any).properties.min_rooms.type).toBe('integer');
  });

  it('monthly_budget schema is number', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'monthly_budget', '8000');
    expect((schema as any).properties.monthly_budget.type).toBe('number');
  });

  it('duration schema is string', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'duration', 'سنة');
    expect((schema as any).properties.duration.type).toBe('string');
  });

  it('total_area schema is number', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'total_area', '500');
    expect((schema as any).properties.total_area.type).toBe('number');
  });

  it('legal_status schema is string', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'legal_status', 'مسجل');
    expect((schema as any).properties.legal_status.type).toBe('string');
  });

  it('zoning schema is string', () => {
    const [schema] = buildExtractionPrompt(FlowState.AWAITING_SPECS, 'zoning', 'سكني');
    expect((schema as any).properties.zoning.type).toBe('string');
  });
});
