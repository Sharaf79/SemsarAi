/**
 * NJ-028: Model DTO spec tests - validates TypeScript types and enums.
 */
import { FlowState, Intent, UnitType, ListingStatus } from './types';

describe('FlowState enum', () => {
  it('has all 6 states', () => {
    const states = Object.values(FlowState);
    expect(states).toHaveLength(6);
    expect(states).toContain('AWAITING_INTENT');
    expect(states).toContain('AWAITING_UNIT_TYPE');
    expect(states).toContain('AWAITING_SPECS');
    expect(states).toContain('AWAITING_MEDIA');
    expect(states).toContain('AWAITING_CONFIRMATION');
    expect(states).toContain('CONFIRMED');
  });

  it('values equal their string keys', () => {
    expect(FlowState.AWAITING_INTENT).toBe('AWAITING_INTENT');
    expect(FlowState.CONFIRMED).toBe('CONFIRMED');
  });
});

describe('Intent enum', () => {
  it('has BUY SELL RENT LEASE', () => {
    const values = Object.values(Intent);
    expect(values).toHaveLength(4);
    expect(Intent.BUY).toBe('BUY');
    expect(Intent.SELL).toBe('SELL');
    expect(Intent.RENT).toBe('RENT');
    expect(Intent.LEASE).toBe('LEASE');
  });
});

describe('UnitType enum', () => {
  it('has APARTMENT LAND VILLA COMMERCIAL', () => {
    const values = Object.values(UnitType);
    expect(values).toHaveLength(4);
    expect(UnitType.APARTMENT).toBe('APARTMENT');
    expect(UnitType.LAND).toBe('LAND');
    expect(UnitType.VILLA).toBe('VILLA');
    expect(UnitType.COMMERCIAL).toBe('COMMERCIAL');
  });
});

describe('ListingStatus enum', () => {
  it('has DRAFT and CONFIRMED', () => {
    expect(ListingStatus.DRAFT).toBe('DRAFT');
    expect(ListingStatus.CONFIRMED).toBe('CONFIRMED');
    expect(Object.values(ListingStatus)).toHaveLength(2);
  });
});
