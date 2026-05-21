import { describe, expect, it } from 'vitest';
import {
  formatPlantSpacing,
  formatXDataRange,
  groupCommonNamesByLanguage,
  hasAnyXData,
  parseStringArrayJson,
  toCamelKey,
} from './plantDetail';
import type { PlantCommonName, PlantPerenualData } from '../types/Plant';

/** Build a PlantPerenualData with all xData null, overridable per field. */
function makeXData(overrides: Partial<PlantPerenualData> = {}): PlantPerenualData {
  return {
    id: 'pd-1',
    perenualId: 1,
    requestedPerenualId: 1,
    cultivar: null,
    perenualType: null,
    originCountries: null,
    propagationMethods: null,
    wateringBenchmark: null,
    wateringBenchmarkUnit: null,
    sunlightPreferences: null,
    pruningMonths: null,
    maintenance: null,
    floweringSeason: null,
    harvestSeason: null,
    hasEdibleFruit: null,
    hasEdibleLeaves: null,
    isCulinary: null,
    plantAnatomyJson: null,
    apiVersion: 'v2',
    hasSupremeData: true,
    lastSyncAt: '2026-01-01T00:00:00Z',
    xWateringBasedTempMinC: null,
    xWateringBasedTempMaxC: null,
    xWateringPhMin: null,
    xWateringPhMax: null,
    xSunlightHoursMin: null,
    xSunlightHoursMax: null,
    xTemperatureToleranceMinC: null,
    xTemperatureToleranceMaxC: null,
    xPlantSpacingValue: null,
    xPlantSpacingUnit: null,
    xWateringQualityJson: null,
    xWateringPeriodJson: null,
    ...overrides,
  };
}

function name(
  id: number,
  languageCode: string,
  text: string,
  isPrimary: boolean,
): PlantCommonName {
  return { id, languageCode, name: text, isPrimary };
}

describe('groupCommonNamesByLanguage', () => {
  it('sorts the primary common name first within each language group', () => {
    // Insertion order deliberately puts secondary names first to prove the
    // function reorders rather than preserving insertion order.
    const input = [
      name(1, 'en', 'Love apple', false),
      name(2, 'en', 'Tomato', true),
      name(3, 'fr', 'Pomme d’amour', false),
      name(4, 'fr', 'Tomate', true),
    ];

    const grouped = groupCommonNamesByLanguage(input, 'en');

    expect(grouped.get('en')?.map((c) => c.name)).toEqual(['Tomato', 'Love apple']);
    expect(grouped.get('fr')?.map((c) => c.name)).toEqual(['Tomate', 'Pomme d’amour']);
  });

  it('breaks ties alphabetically by name when several non-primary entries share a language', () => {
    const input = [
      name(1, 'en', 'Cherokee Purple', false),
      name(2, 'en', 'Brandywine', false),
      name(3, 'en', 'Tomato', true),
    ];

    const grouped = groupCommonNamesByLanguage(input, 'en');

    expect(grouped.get('en')?.map((c) => c.name)).toEqual(['Tomato', 'Brandywine', 'Cherokee Purple']);
  });

  it('orders language groups with the UI language first, then alphabetical', () => {
    const input = [
      name(1, 'de', 'Tomate', true),
      name(2, 'en', 'Tomato', true),
      name(3, 'fr', 'Tomate', true),
    ];

    const grouped = groupCommonNamesByLanguage(input, 'fr');

    expect([...grouped.keys()]).toEqual(['fr', 'de', 'en']);
  });
});

describe('formatXDataRange', () => {
  it('renders a half-open range with a trailing + when max is null', () => {
    expect(formatXDataRange(6, null, ' h')).toBe('6+ h');
  });

  it('renders a closed range with an em-dash separator', () => {
    expect(formatXDataRange(6, 8, ' h')).toBe('6–8 h');
  });

  it('collapses equal bounds to a single value (no em-dash)', () => {
    expect(formatXDataRange(18, 18, '°C')).toBe('18°C');
  });

  it('renders a defensive max-only range with ≤', () => {
    expect(formatXDataRange(null, 30, '°C')).toBe('≤30°C');
  });

  it('returns null when both bounds are absent', () => {
    expect(formatXDataRange(null, null)).toBeNull();
  });
});

describe('parseStringArrayJson', () => {
  it('parses a non-empty JSON string array', () => {
    expect(parseStringArrayJson('["Rainwater","Distilled Water"]')).toEqual([
      'Rainwater',
      'Distilled Water',
    ]);
  });

  it('returns null for null, empty array, or malformed JSON', () => {
    expect(parseStringArrayJson(null)).toBeNull();
    expect(parseStringArrayJson('[]')).toBeNull();
    expect(parseStringArrayJson('{ not json')).toBeNull();
  });
});

describe('formatPlantSpacing', () => {
  it('composes value + unit, and returns null when either part is missing', () => {
    expect(formatPlantSpacing(18, 'inches')).toBe('18 inches');
    expect(formatPlantSpacing(18, null)).toBeNull();
    expect(formatPlantSpacing(null, 'inches')).toBeNull();
  });
});

describe('toCamelKey', () => {
  it('strips whitespace and slashes and lower-cases the first character', () => {
    expect(toCamelKey('Rainwater')).toBe('rainwater');
    expect(toCamelKey('Reverse Osmosis Water')).toBe('reverseOsmosisWater');
    expect(toCamelKey('Pond/Lake Water')).toBe('pondLakeWater');
  });
});

describe('hasAnyXData', () => {
  it('returns false when no xData field is set', () => {
    expect(hasAnyXData(makeXData())).toBe(false);
  });

  it('returns false when only xPlantSpacingUnit is set (no value) — CR #76 r1', () => {
    // Regression: unit alone has no renderable spacing row, so the gate must
    // not pass and render an empty Section F.6.
    expect(hasAnyXData(makeXData({ xPlantSpacingUnit: 'inches' }))).toBe(false);
  });

  it('returns true when both spacing value and unit are set', () => {
    expect(hasAnyXData(makeXData({ xPlantSpacingValue: 18, xPlantSpacingUnit: 'inches' }))).toBe(true);
  });

  it('returns true when a scalar range field is set', () => {
    expect(hasAnyXData(makeXData({ xWateringBasedTempMinC: 18 }))).toBe(true);
  });
});
