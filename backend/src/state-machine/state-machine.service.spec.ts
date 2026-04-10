/**
 * Tests for state-machine.service.ts — ported 1:1 from Python test_state_machine.py
 * 50+ tests covering field sequences, transitions, questions, summary cards.
 */
import {
  FIELD_SEQUENCES,
  getNextField,
  generateQuestion,
  formatSummaryCard,
  generateWelcomeBack,
  transition,
} from './state-machine.service';
import {
  ConversationDto,
  ListingDto,
  FlowState,
  Intent,
  UnitType,
  ListingStatus,
} from '../common/types';

// ── Helpers ─────────────────────────────────────────────────────

function makeConversation(overrides: Partial<ConversationDto> = {}): ConversationDto {
  return {
    whatsappId: '201234567890',
    flowState: FlowState.AWAITING_INTENT,
    currentField: null,
    intent: null,
    listingId: null,
    ...overrides,
  };
}

function makeListing(overrides: Partial<ListingDto> = {}): ListingDto {
  return {
    whatsappId: '201234567890',
    intent: Intent.SELL,
    unitType: UnitType.APARTMENT,
    specs: {},
    location: null,
    price: null,
    mediaUrls: [],
    status: ListingStatus.DRAFT,
    ...overrides,
  };
}

// ── FIELD_SEQUENCES ─────────────────────────────────────────────

describe('FIELD_SEQUENCES', () => {
  it('sell apartment has correct sequence', () => {
    expect(FIELD_SEQUENCES['SELL_APARTMENT']).toEqual([
      'area', 'rooms', 'floor', 'finishing', 'location', 'price',
    ]);
  });

  it('sell land has correct sequence', () => {
    expect(FIELD_SEQUENCES['SELL_LAND']).toEqual([
      'total_area', 'legal_status', 'zoning', 'location', 'price',
    ]);
  });

  it('buy apartment has correct sequence', () => {
    expect(FIELD_SEQUENCES['BUY_APARTMENT']).toEqual([
      'location', 'budget', 'min_area', 'min_rooms',
    ]);
  });

  it('buy land has correct sequence', () => {
    expect(FIELD_SEQUENCES['BUY_LAND']).toEqual([
      'location', 'budget', 'min_area',
    ]);
  });

  it('rent apartment has correct sequence', () => {
    expect(FIELD_SEQUENCES['RENT_APARTMENT']).toEqual([
      'location', 'monthly_budget', 'duration', 'rooms',
    ]);
  });

  it('lease apartment has correct sequence', () => {
    expect(FIELD_SEQUENCES['LEASE_APARTMENT']).toEqual([
      'location', 'monthly_budget', 'duration', 'rooms',
    ]);
  });

  it('has 6 defined sequences', () => {
    const definedKeys = Object.keys(FIELD_SEQUENCES).filter(
      (k) => FIELD_SEQUENCES[k as keyof typeof FIELD_SEQUENCES] !== undefined,
    );
    expect(definedKeys).toHaveLength(6);
  });
});

// ── getNextField ────────────────────────────────────────────────

describe('getNextField', () => {
  it('returns first field when current is null', () => {
    expect(getNextField(Intent.SELL, UnitType.APARTMENT, null)).toBe('area');
  });

  it('returns next field in sequence', () => {
    expect(getNextField(Intent.SELL, UnitType.APARTMENT, 'area')).toBe('rooms');
  });

  it('returns last field', () => {
    expect(getNextField(Intent.SELL, UnitType.APARTMENT, 'finishing')).toBe('location');
  });

  it('returns null at end of sequence', () => {
    expect(getNextField(Intent.SELL, UnitType.APARTMENT, 'price')).toBeNull();
  });

  it('returns first when current not in sequence', () => {
    expect(getNextField(Intent.SELL, UnitType.APARTMENT, 'nonexistent')).toBe('area');
  });

  it('returns null for unsupported combo', () => {
    expect(getNextField(Intent.SELL, UnitType.VILLA, null)).toBeNull();
  });

  it('traverses buy land sequence correctly', () => {
    expect(getNextField(Intent.BUY, UnitType.LAND, null)).toBe('location');
    expect(getNextField(Intent.BUY, UnitType.LAND, 'location')).toBe('budget');
    expect(getNextField(Intent.BUY, UnitType.LAND, 'budget')).toBe('min_area');
    expect(getNextField(Intent.BUY, UnitType.LAND, 'min_area')).toBeNull();
  });
});

// ── generateQuestion ────────────────────────────────────────────

describe('generateQuestion', () => {
  const KNOWN_FIELDS = [
    'intent', 'unit_type', 'area', 'rooms', 'floor', 'finishing',
    'location', 'price', 'total_area', 'legal_status', 'zoning',
    'budget', 'min_area', 'min_rooms', 'monthly_budget', 'duration',
  ];

  it.each(KNOWN_FIELDS)('known field "%s" returns non-empty question', (field) => {
    const q = generateQuestion(field);
    expect(typeof q).toBe('string');
    expect(q.length).toBeGreaterThan(5);
  });

  it('intent question is in Ammiya', () => {
    const q = generateQuestion('intent');
    expect(q).toMatch(/تبيع|تشتري|تأجر/);
  });

  it('unknown field returns fallback', () => {
    const q = generateQuestion('unknown_xyz');
    expect(q).toContain('unknown_xyz');
  });

  it('location question contains relevant word', () => {
    const q = generateQuestion('location');
    expect(q).toMatch(/المكان|فين/);
  });
});

// ── formatSummaryCard ───────────────────────────────────────────

describe('formatSummaryCard', () => {
  it('sell apartment all fields', () => {
    const listing = makeListing({
      specs: { area: 120, rooms: 3, floor: 5, finishing: 'سوبر لوكس' },
      location: 'التجمع الخامس',
      price: 2500000,
    });
    const card = formatSummaryCard(listing);
    expect(card).toContain('ملخص');
    expect(card).toContain('120');
    expect(card).toContain('3');
    expect(card).toContain('5');
    expect(card).toContain('سوبر لوكس');
    expect(card).toContain('التجمع الخامس');
    expect(card).toContain('2500000');
    expect(card).toContain('صح ولا');
  });

  it('missing fields show pending', () => {
    const listing = makeListing({ specs: {}, location: null, price: null });
    const card = formatSummaryCard(listing);
    expect(card).toContain('معلق');
  });

  it('buy apartment summary', () => {
    const listing = makeListing({
      intent: Intent.BUY,
      unitType: UnitType.APARTMENT,
      specs: { min_area: 100, min_rooms: 2 },
      location: 'المعادي',
      price: 1500000,
    });
    const card = formatSummaryCard(listing);
    expect(card).toContain('شراء');
    expect(card).toContain('شقة');
    expect(card).toContain('صح ولا');
  });

  it('rent apartment summary', () => {
    const listing = makeListing({
      intent: Intent.RENT,
      unitType: UnitType.APARTMENT,
      specs: { rooms: 2, monthly_budget: 8000, duration: 'سنة' },
      location: 'مدينة نصر',
      price: 8000,
    });
    const card = formatSummaryCard(listing);
    expect(card).toContain('إيجار');
  });

  it('sell land summary', () => {
    const listing = makeListing({
      intent: Intent.SELL,
      unitType: UnitType.LAND,
      specs: { total_area: 500, legal_status: 'مسجل', zoning: 'سكني' },
      location: 'أكتوبر',
      price: 5000000,
    });
    const card = formatSummaryCard(listing);
    expect(card).toContain('أرض');
    expect(card).toContain('مسجل');
  });
});

// ── generateWelcomeBack ─────────────────────────────────────────

describe('generateWelcomeBack', () => {
  it('contains greeting', () => {
    const msg = generateWelcomeBack('المساحة كام متر؟');
    expect(msg).toContain('أهلاً تاني');
  });

  it('contains question', () => {
    const msg = generateWelcomeBack('المساحة كام متر؟');
    expect(msg).toContain('المساحة كام متر؟');
  });
});

// ── transition: AWAITING_INTENT ─────────────────────────────────

describe('transition — AWAITING_INTENT', () => {
  const makeIntentPair = () => ({
    conv: makeConversation({ flowState: FlowState.AWAITING_INTENT }),
    listing: makeListing({ id: undefined, intent: null, unitType: null, specs: {} }),
  });

  it('valid SELL moves to unit type', () => {
    const { conv, listing } = makeIntentPair();
    const r = transition(conv, listing, 'عايز ابيع', { intent: 'SELL' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_UNIT_TYPE);
    expect(r.conversation.intent).toBe(Intent.SELL);
    expect(r.listing.intent).toBe(Intent.SELL);
  });

  it('valid BUY moves to unit type', () => {
    const { conv, listing } = makeIntentPair();
    const r = transition(conv, listing, 'عايز اشتري', { intent: 'BUY' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_UNIT_TYPE);
    expect(r.conversation.intent).toBe(Intent.BUY);
  });

  it('valid RENT moves to unit type', () => {
    const { conv, listing } = makeIntentPair();
    const r = transition(conv, listing, 'عايز اأجر', { intent: 'RENT' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_UNIT_TYPE);
    expect(r.conversation.intent).toBe(Intent.RENT);
  });

  it('UNKNOWN intent stays', () => {
    const { conv, listing } = makeIntentPair();
    const r = transition(conv, listing, 'مش عارف', { intent: 'UNKNOWN' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_INTENT);
  });

  it('empty extracted stays', () => {
    const { conv, listing } = makeIntentPair();
    const r = transition(conv, listing, 'hello', {});
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_INTENT);
  });

  it('invalid enum value stays', () => {
    const { conv, listing } = makeIntentPair();
    const r = transition(conv, listing, 'xyz', { intent: 'INVALID' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_INTENT);
  });
});

// ── transition: AWAITING_UNIT_TYPE ──────────────────────────────

describe('transition — AWAITING_UNIT_TYPE', () => {
  const makeUtPair = (intent: Intent = Intent.SELL) => ({
    conv: makeConversation({
      flowState: FlowState.AWAITING_UNIT_TYPE,
      intent,
    }),
    listing: makeListing({ id: undefined, intent, unitType: null, specs: {} }),
  });

  it('valid APARTMENT moves to specs', () => {
    const { conv, listing } = makeUtPair();
    const r = transition(conv, listing, 'شقة', { unit_type: 'APARTMENT' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_SPECS);
    expect(r.listing.unitType).toBe(UnitType.APARTMENT);
    expect(r.conversation.currentField).toBe('area');
  });

  it('valid LAND moves to specs', () => {
    const { conv, listing } = makeUtPair();
    const r = transition(conv, listing, 'أرض', { unit_type: 'LAND' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_SPECS);
    expect(r.listing.unitType).toBe(UnitType.LAND);
    expect(r.conversation.currentField).toBe('total_area');
  });

  it('UNKNOWN type stays', () => {
    const { conv, listing } = makeUtPair();
    const r = transition(conv, listing, 'مش عارف', { unit_type: 'UNKNOWN' });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_UNIT_TYPE);
  });

  it('unsupported combo gives error', () => {
    const { conv, listing } = makeUtPair(Intent.BUY);
    const r = transition(conv, listing, 'فيلا', { unit_type: 'VILLA' });
    expect(r.replyText).toContain('مش مدعوم');
  });

  it('buy apartment first field is location', () => {
    const { conv, listing } = makeUtPair(Intent.BUY);
    const r = transition(conv, listing, 'شقة', { unit_type: 'APARTMENT' });
    expect(r.conversation.currentField).toBe('location');
  });
});

// ── transition: AWAITING_SPECS ──────────────────────────────────

describe('transition — AWAITING_SPECS', () => {
  it('stores area in specs', () => {
    const conv = makeConversation({
      flowState: FlowState.AWAITING_SPECS,
      intent: Intent.SELL,
      currentField: 'area',
    });
    const listing = makeListing({ id: undefined, intent: Intent.SELL, unitType: UnitType.APARTMENT, specs: {} });
    const r = transition(conv, listing, '120 متر', { area: 120 });
    expect(r.listing.specs['area']).toBe(120);
    expect(r.conversation.currentField).toBe('rooms');
  });

  it('stores location in listing', () => {
    const conv = makeConversation({
      flowState: FlowState.AWAITING_SPECS,
      intent: Intent.SELL,
      currentField: 'location',
    });
    const listing = makeListing({
      id: undefined, intent: Intent.SELL, unitType: UnitType.APARTMENT,
      specs: { area: 120, rooms: 3, floor: 5, finishing: 'سوبر لوكس' },
    });
    const r = transition(conv, listing, 'التجمع', { location: 'التجمع' });
    expect(r.listing.location).toBe('التجمع');
  });

  it('stores price in listing', () => {
    const conv = makeConversation({
      flowState: FlowState.AWAITING_SPECS,
      intent: Intent.SELL,
      currentField: 'price',
    });
    const listing = makeListing({
      id: undefined, intent: Intent.SELL, unitType: UnitType.APARTMENT,
      specs: { area: 120, rooms: 3, floor: 5, finishing: 'سوبر لوكس' },
      location: 'التجمع',
    });
    const r = transition(conv, listing, 'مليونين', { price: 2000000 });
    expect(r.listing.price).toBe(2000000);
  });

  it('last field SELL goes to media', () => {
    const conv = makeConversation({
      flowState: FlowState.AWAITING_SPECS,
      intent: Intent.SELL,
      currentField: 'price',
    });
    const listing = makeListing({
      id: undefined, intent: Intent.SELL, unitType: UnitType.APARTMENT,
      specs: { area: 120, rooms: 3, floor: 5, finishing: 'سوبر لوكس' },
      location: 'التجمع',
    });
    const r = transition(conv, listing, '2 مليون', { price: 2000000 });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_MEDIA);
    expect(r.replyText).toMatch(/صور|فيديو/);
  });

  it('last field BUY skips media', () => {
    const conv = makeConversation({
      flowState: FlowState.AWAITING_SPECS,
      intent: Intent.BUY,
      currentField: 'min_rooms',
    });
    const listing = makeListing({
      id: undefined, intent: Intent.BUY, unitType: UnitType.APARTMENT,
      specs: { min_area: 100 },
      location: 'المعادي',
      price: 1500000,
    });
    const r = transition(conv, listing, '2', { min_rooms: 2 });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_CONFIRMATION);
    expect(r.replyText).toContain('ملخص');
  });

  it('no extracted value re-asks', () => {
    const conv = makeConversation({
      flowState: FlowState.AWAITING_SPECS,
      intent: Intent.SELL,
      currentField: 'area',
    });
    const listing = makeListing({ id: undefined, intent: Intent.SELL, unitType: UnitType.APARTMENT, specs: {} });
    const r = transition(conv, listing, 'مش فاهم', {});
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_SPECS);
    expect(r.conversation.currentField).toBe('area');
  });

  it('stores budget in price', () => {
    const conv = makeConversation({
      flowState: FlowState.AWAITING_SPECS,
      intent: Intent.BUY,
      currentField: 'budget',
    });
    const listing = makeListing({
      id: undefined, intent: Intent.BUY, unitType: UnitType.APARTMENT,
      specs: {}, location: 'المعادي',
    });
    const r = transition(conv, listing, 'مليون ونص', { budget: 1500000 });
    expect(r.listing.price).toBe(1500000);
  });
});

// ── transition: AWAITING_MEDIA ──────────────────────────────────

describe('transition — AWAITING_MEDIA', () => {
  const makeMediaPair = () => ({
    conv: makeConversation({
      flowState: FlowState.AWAITING_MEDIA,
      intent: Intent.SELL,
    }),
    listing: makeListing({ intent: Intent.SELL, unitType: UnitType.APARTMENT }),
  });

  it('skip with mesh dalokty', () => {
    const { conv, listing } = makeMediaPair();
    const r = transition(conv, listing, 'مش دلوقتي', {});
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_CONFIRMATION);
    expect(r.replyText).toContain('ملخص');
  });

  it('skip with la', () => {
    const { conv, listing } = makeMediaPair();
    const r = transition(conv, listing, 'لا', {});
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_CONFIRMATION);
  });

  it('media received', () => {
    const { conv, listing } = makeMediaPair();
    const r = transition(conv, listing, '', { has_media: true });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_CONFIRMATION);
  });

  it('other text still advances', () => {
    const { conv, listing } = makeMediaPair();
    const r = transition(conv, listing, 'تمام', {});
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_CONFIRMATION);
  });
});

// ── transition: AWAITING_CONFIRMATION ───────────────────────────

describe('transition — AWAITING_CONFIRMATION', () => {
  const makeConfirmPair = () => ({
    conv: makeConversation({
      flowState: FlowState.AWAITING_CONFIRMATION,
      intent: Intent.SELL,
    }),
    listing: makeListing({ intent: Intent.SELL, unitType: UnitType.APARTMENT }),
  });

  it('confirm moves to CONFIRMED', () => {
    const { conv, listing } = makeConfirmPair();
    const r = transition(conv, listing, 'صح', { is_correct: true });
    expect(r.conversation.flowState).toBe(FlowState.CONFIRMED);
    expect(r.listing.status).toBe(ListingStatus.CONFIRMED);
    expect(r.replyText).toContain('تم');
  });

  it('correction goes back to specs', () => {
    const { conv, listing } = makeConfirmPair();
    const r = transition(conv, listing, 'عايز أغير المساحة', {
      is_correct: false,
      correction_field: 'area',
    });
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_SPECS);
    expect(r.conversation.currentField).toBe('area');
  });

  it('no data re-asks', () => {
    const { conv, listing } = makeConfirmPair();
    const r = transition(conv, listing, 'hmm', {});
    expect(r.conversation.flowState).toBe(FlowState.AWAITING_CONFIRMATION);
    expect(r.replyText).toContain('صح ولا');
  });
});
