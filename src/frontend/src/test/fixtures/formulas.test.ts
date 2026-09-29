import { describe, expect, it } from 'vitest';
import { capabilitiesFor, presetFor } from './formulas';
import { DASHBOARD_BLOCK_KEYS, DASHBOARD_LEVELS, DEFAULT_DASHBOARD_LEVEL } from '../../types/Dashboard';

// SMA-336 locked the three presets on the frozen design (_spec.md § 8); they
// lived in `constants/dashboardPresets.ts`, a twin of the server's
// `DashboardPresets.cs`. SMA-448, lot F1, S5: the server serves them now, and
// the client keeps no copy — these pins moved here, onto the fixture every
// client test serves, which READS the reference file the served catalogue is
// tested against. A preset changed in the contract without the design turns
// red here, as it did before.

/** The eight widgets of the frozen design, in the canonical order — every key but the Key figures band. */
const EIGHT = DASHBOARD_BLOCK_KEYS.filter((key) => key !== 'keyfigures');

describe('the served presets (SMA-336, SMA-448)', () => {
  // SMA-448, lot F2 — the Novice's page is one card per garden, not a grid:
  // it has NO widget (V3-01: « Aucun »; contract v3 § 3.1), so its preset is
  // empty and its capabilities serve no widget and no size.
  it('the novice preset lists no widget: the Novice page is not a grid (SMA-448, lot F2)', () => {
    expect(presetFor('novice')).toEqual([]);
    expect(capabilitiesFor('novice').widgets).toEqual([]);
    expect(capabilitiesFor('novice').sizes).toEqual({});
  });

  // R1 (V3-01: « Les statistiques — Non · Non · Oui »).
  it('the gardener preset lists the seven widgets of its formula in the canonical order — neither the band nor Statistics', () => {
    expect(presetFor('gardener').map((block) => block.key)).toEqual(EIGHT.filter((key) => key !== 'stats'));
  });

  // SMA-448, lot F5-b — PR #300, fix round 1, P1 (Alexandre, 29/09:
  // « personnellement je préfère que de base, en Expert, le widget Jardins soit
  // en large comme ça »): the Gardens widget in the Full width. SMA-437, lot
  // V3-08, step S5 (A-15): the preset without a hole — the Weather after the
  // Gardens, in the Full width too, then the six others in Large, two by two.
  it('Expert: the Key figures band first, in Full width — its one size — then the Gardens and the Weather in Full width and the six others in Large, none hidden', () => {
    expect(presetFor('expert')).toEqual([
      { key: 'keyfigures', size: 'wide', hidden: false },
      { key: 'gardens', size: 'wide', hidden: false },
      { key: 'weather', size: 'wide', hidden: false },
      ...EIGHT.filter((key) => key !== 'gardens' && key !== 'weather').map((key) => ({ key, size: 'large', hidden: false })),
    ]);
  });

  it('Gardener shows six widgets, Gardens in Large, and hides Harvest — Statistics is not its own (SMA-448, R1)', () => {
    expect(presetFor('gardener')).toEqual([
      { key: 'weather', size: 'medium', hidden: false },
      { key: 'gardens', size: 'large', hidden: false },
      { key: 'tips', size: 'medium', hidden: false },
      { key: 'month', size: 'medium', hidden: false },
      { key: 'todo', size: 'medium', hidden: false },
      { key: 'counters', size: 'medium', hidden: false },
      { key: 'harvest', size: 'large', hidden: true },
    ]);
  });

  it('the default level is Gardener, like the server', () => {
    expect(DEFAULT_DASHBOARD_LEVEL).toBe('gardener');
  });

  it('hands out a fresh copy so a caller cannot mutate the preset', () => {
    const first = presetFor('gardener');
    first[0]!.size = 'small';
    expect(presetFor('gardener')[0]!.size).toBe('medium');
  });
});

describe('the served capabilities, as the fixture builds them (SMA-448)', () => {
  it.each(DASHBOARD_LEVELS)('the %s formula lists its preset’s widgets, a size list for each, and nothing else', (level) => {
    const capabilities = capabilitiesFor(level);
    expect(capabilities.key).toBe(level);
    expect(capabilities.widgets).toEqual(presetFor(level).map((block) => block.key));
    expect(Object.keys(capabilities.sizes).sort()).toEqual([...capabilities.widgets].sort());
    expect(capabilities.preset).toEqual(presetFor(level));
  });

  it('the limits decided by Alexandre: Novice 3 up to 20 × 20, Gardener 10 up to 50 × 50, Expert unlimited up to 100 × 100', () => {
    expect([capabilitiesFor('novice').gardenLimit, capabilitiesFor('novice').maxGardenSize]).toEqual([3, { width: 20, height: 20 }]);
    expect([capabilitiesFor('gardener').gardenLimit, capabilitiesFor('gardener').maxGardenSize]).toEqual([10, { width: 50, height: 50 }]);
    expect([capabilitiesFor('expert').gardenLimit, capabilitiesFor('expert').maxGardenSize]).toEqual([null, { width: 100, height: 100 }]);
  });
});
