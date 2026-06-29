import { describe, expect, it } from 'vitest';
import { lightBar, frostBar, phBar } from './characteristicsBars';

const L = 'plantDetail.characteristics.levels';

describe('lightBar', () => {
  it('maps the sunlight-hours average to a level + pct', () => {
    expect(lightBar(6, 8)).toEqual({ levelKey: `${L}.light.fullSun`, pct: 92 });
    expect(lightBar(2, 2)).toEqual({ levelKey: `${L}.light.shade`, pct: 18 });
    expect(lightBar(5, null)).toEqual({
      levelKey: `${L}.light.partialSun`,
      pct: 65,
    });
  });

  it('returns null when both bounds are absent', () => {
    expect(lightBar(null, null)).toBeNull();
  });
});

describe('frostBar', () => {
  it('maps the hardiness-zone min to a frost-tolerance level + pct', () => {
    expect(frostBar(2)).toEqual({ levelKey: `${L}.frost.veryHigh`, pct: 90 });
    expect(frostBar(6)).toEqual({ levelKey: `${L}.frost.medium`, pct: 50 });
    expect(frostBar(11)).toEqual({
      levelKey: `${L}.frost.lowFrostTender`,
      pct: 14,
    });
  });

  it('returns null when the zone min is absent', () => {
    expect(frostBar(null)).toBeNull();
  });
});

describe('phBar', () => {
  it('maps the soil-pH average to a level + pct', () => {
    expect(phBar(7, 7.5)).toEqual({ levelKey: `${L}.ph.neutral`, pct: 58 });
    expect(phBar(5, 5)).toEqual({ levelKey: `${L}.ph.acidic`, pct: 22 });
    expect(phBar(8.5, 8.5)).toEqual({ levelKey: `${L}.ph.alkaline`, pct: 88 });
  });

  it('returns null when both bounds are absent', () => {
    expect(phBar(null, null)).toBeNull();
  });
});
