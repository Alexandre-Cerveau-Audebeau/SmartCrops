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

  it.each<[number, string, number]>([
    [3, 'partialShade', 42],
    [4.5, 'partialSun', 65],
    [6, 'fullSun', 92],
  ])('boundary at avg %s → %s', (v, key, pct) => {
    expect(lightBar(v, v)).toEqual({ levelKey: `${L}.light.${key}`, pct });
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

  it.each<[number, string, number]>([
    [3, 'veryHigh', 90],
    [5, 'high', 70],
    [7, 'medium', 50],
    [9, 'low', 30],
  ])('boundary at zoneMin %s → %s', (v, key, pct) => {
    expect(frostBar(v)).toEqual({ levelKey: `${L}.frost.${key}`, pct });
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

  it.each<[number, string, number]>([
    [5.5, 'slightlyAcidic', 46],
    [6.5, 'neutral', 58],
    [7.3, 'slightlyAlkaline', 72],
    [8, 'slightlyAlkaline', 72],
  ])('boundary at avg %s → %s', (v, key, pct) => {
    expect(phBar(v, v)).toEqual({ levelKey: `${L}.ph.${key}`, pct });
  });

  it('returns null when both bounds are absent', () => {
    expect(phBar(null, null)).toBeNull();
  });
});
