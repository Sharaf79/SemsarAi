/**
 * Tests for search.service.ts — format_search_results port.
 * Note: searchUnitsForBuyer is tested via integration tests (needs Prisma).
 * Here we test the pure formatSearchResults function.
 */
import { SearchService } from './search.service';
import { UnitDto, Intent, UnitType } from '../common/types';

// We only need formatSearchResults which is a pure method on SearchService.
// Create a minimal instance with null prisma (we won't call DB methods).
const service = new (SearchService as any)({ unit: {} });

function makeUnit(overrides: Partial<UnitDto> = {}): UnitDto {
  return {
    id: 'u1',
    listingId: 'l1',
    whatsappId: '201234567890',
    intent: Intent.SELL,
    unitType: UnitType.APARTMENT,
    specs: {},
    location: null,
    price: null,
    mediaUrls: [],
    isActive: true,
    ...overrides,
  };
}

describe('SearchService.formatSearchResults', () => {
  it('formats multiple units', () => {
    const units: UnitDto[] = [
      makeUnit({ id: 'u1', location: 'التجمع', price: 2000000, specs: { area: 120 } }),
      makeUnit({ id: 'u2', location: 'المعادي', price: 1500000, specs: {} }),
    ];
    const result = service.formatSearchResults(units);
    expect(result).toContain('1.');
    expect(result).toContain('2.');
    expect(result).toContain('التجمع');
    expect(result).toContain('المعادي');
    expect(result).toContain('2000000');
  });

  it('empty returns no-match message', () => {
    const result = service.formatSearchResults([]);
    expect(result).toContain('مفيش');
  });

  it('missing location shows placeholder', () => {
    const units: UnitDto[] = [
      makeUnit({ location: null, price: 1000000 }),
    ];
    const result = service.formatSearchResults(units);
    expect(result).toContain('غير محدد');
  });

  it('unit with area in specs', () => {
    const units: UnitDto[] = [
      makeUnit({ location: 'مصر الجديدة', price: 3000000, specs: { area: 200 } }),
    ];
    const result = service.formatSearchResults(units);
    expect(result).toContain('200');
    expect(result).toContain('متر');
  });

  it('no phone numbers in output (Privacy Firewall)', () => {
    const units: UnitDto[] = [
      makeUnit({ whatsappId: '201234567890', location: 'التجمع', price: 2000000 }),
    ];
    const result = service.formatSearchResults(units);
    expect(result).not.toContain('201234567890');
    expect(result.toLowerCase()).not.toContain('whatsapp');
  });
});
