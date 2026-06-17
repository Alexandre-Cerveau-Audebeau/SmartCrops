import { describe, expect, it } from 'vitest';
import {
  celsiusToFahrenheit,
  cmToInches,
  formatLength,
  formatSpacing,
  formatTemperature,
  formatXDataRange,
  groupCommonNamesByLanguage,
  hasAnyXData,
  hasSpacing,
  inchesToCm,
  parseStringArrayJson,
  toCamelKey,
} from './plantDetail';
import type { PlantCommonName, PlantPerenualData } from '../types/Plant';

/** Build a PlantPerenualData with all xData null, overridable per field. */
function makeXData(
  overrides: Partial<PlantPerenualData> = {}
): PlantPerenualData {
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
  isPrimary: boolean
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

    expect(grouped.get('en')?.map((c) => c.name)).toEqual([
      'Tomato',
      'Love apple',
    ]);
    expect(grouped.get('fr')?.map((c) => c.name)).toEqual([
      'Tomate',
      'Pomme d’amour',
    ]);
  });

  it('breaks ties alphabetically by name when several non-primary entries share a language', () => {
    const input = [
      name(1, 'en', 'Cherokee Purple', false),
      name(2, 'en', 'Brandywine', false),
      name(3, 'en', 'Tomato', true),
    ];

    const grouped = groupCommonNamesByLanguage(input, 'en');

    expect(grouped.get('en')?.map((c) => c.name)).toEqual([
      'Tomato',
      'Brandywine',
      'Cherokee Purple',
    ]);
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

describe('unit conversions (SMA-178)', () => {
  it('converts cm↔in and °C→°F (raw, unrounded)', () => {
    expect(cmToInches(2.54)).toBeCloseTo(1);
    expect(inchesToCm(1)).toBeCloseTo(2.54);
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(18)).toBeCloseTo(64.4);
  });
});

describe('formatLength (SMA-178)', () => {
  it('shows raw cm in metric and rounded inches in imperial', () => {
    expect(formatLength(30, 120, 'metric')).toBe('30–120 cm');
    expect(formatLength(30, 120, 'imperial')).toBe('12–47 in'); // 11.8→12, 47.2→47
  });

  it('collapses equal bounds and keeps half-open / null contracts', () => {
    expect(formatLength(30, 30, 'metric')).toBe('30 cm');
    expect(formatLength(30, null, 'metric')).toBe('≥30 cm');
    expect(formatLength(null, 120, 'imperial')).toBe('≤47 in');
    expect(formatLength(null, null, 'metric')).toBeNull();
  });
});

describe('formatTemperature (SMA-178)', () => {
  it('shows °C in metric and rounded °F in imperial', () => {
    expect(formatTemperature(18, 24, 'metric')).toBe('18–24 °C');
    expect(formatTemperature(18, 24, 'imperial')).toBe('64–75 °F'); // 64.4→64, 75.2→75
  });

  it('collapses equal bounds and returns null when both are absent', () => {
    expect(formatTemperature(20, 20, 'metric')).toBe('20 °C');
    expect(formatTemperature(null, null, 'imperial')).toBeNull();
  });
});

describe('formatSpacing (SMA-178)', () => {
  it('parses an "inches" source and shows the chosen system', () => {
    // 18 in → 45.72 cm
    expect(formatSpacing(18, 'inches', 'imperial')).toBe('18 in');
    expect(formatSpacing(18, 'inches', 'metric')).toBe('46 cm');
  });

  it('parses a "cm" source and shows the chosen system', () => {
    // 40 cm → 15.7 in
    expect(formatSpacing(40, 'cm', 'metric')).toBe('40 cm');
    expect(formatSpacing(40, 'cm', 'imperial')).toBe('16 in');
  });

  it('returns null when value or unit is missing', () => {
    expect(formatSpacing(18, null, 'metric')).toBeNull();
    expect(formatSpacing(null, 'inches', 'metric')).toBeNull();
  });

  it('falls back to the raw value + unit for an unrecognized source unit', () => {
    expect(formatSpacing(2, 'feet', 'metric')).toBe('2 feet');
  });
});

describe('hasSpacing (SMA-178)', () => {
  it('is true only when both value and unit are present', () => {
    expect(hasSpacing(18, 'inches')).toBe(true);
    expect(hasSpacing(18, null)).toBe(false);
    expect(hasSpacing(null, 'inches')).toBe(false);
    expect(hasSpacing(18, '   ')).toBe(false);
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
    expect(
      hasAnyXData(
        makeXData({ xPlantSpacingValue: 18, xPlantSpacingUnit: 'inches' })
      )
    ).toBe(true);
  });

  it('returns true when a scalar range field is set', () => {
    expect(hasAnyXData(makeXData({ xWateringBasedTempMinC: 18 }))).toBe(true);
  });
});
