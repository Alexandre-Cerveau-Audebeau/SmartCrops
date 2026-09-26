import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DASHBOARD_LEVEL,
  isAdjusted,
  presetFor,
} from './dashboardPresets';
import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_LEVELS,
  nextDashboardSize,
} from '../types/Dashboard';

// SMA-336 locks on the frozen design (_spec.md 8) and on the server's
// DashboardPresets.cs, which must stay byte-identical to these three lists.

/** The eight widgets of every formula, in the canonical order — every key but the Key figures band. */
const EIGHT = DASHBOARD_BLOCK_KEYS.filter((key) => key !== 'keyfigures');

describe('dashboard presets (SMA-336)', () => {
  // SMA-437 lot 1, PR B, step B1 (pre-flight D4, D8) — a preset lists EXACTLY
  // the blocks its formula permits. The Key figures band is the Expert's
  // alone (V3-01: « Les chiffres clés — Non · Non · Oui »), so the Novice lists
  // the eight others, hidden ones included, and nothing else: its Customize
  // gallery cannot offer the band back.
  it('the novice preset lists the eight widgets of its formula in the canonical order — never the Key figures band', () => {
    expect(presetFor('novice').map((block) => block.key)).toEqual(EIGHT);
  });

  // SMA-448, lot F1 — R1 (V3-01: « Les statistiques — Non · Non · Oui »):
  // Statistics is not the Gardener's either, so its preset — and its gallery —
  // never carries it.
  it('the gardener preset lists the seven widgets of its formula in the canonical order — neither the band nor Statistics', () => {
    expect(presetFor('gardener').map((block) => block.key)).toEqual(
      EIGHT.filter((key) => key !== 'stats')
    );
  });

  it('Expert: the Key figures band first, in Full width — its one size — then the eight widgets in Large, none hidden', () => {
    // « en tête du preset Expert » (contract § 3.3 [A], § 4.5): written by
    // hand now, where it was derived from the keys, and byte-identical to the
    // server's (`dashboardLayout.reference.json`).
    expect(presetFor('expert')).toEqual([
      { key: 'keyfigures', size: 'wide', hidden: false },
      ...EIGHT.map((key) => ({ key, size: 'large', hidden: false })),
    ]);
  });

  it('Novice shows Weather M, Gardens M, Tips S, This month S and hides the rest', () => {
    expect(presetFor('novice')).toEqual([
      { key: 'weather', size: 'medium', hidden: false },
      { key: 'gardens', size: 'medium', hidden: false },
      { key: 'tips', size: 'small', hidden: false },
      { key: 'month', size: 'small', hidden: false },
      { key: 'todo', size: 'medium', hidden: true },
      { key: 'counters', size: 'medium', hidden: true },
      { key: 'stats', size: 'large', hidden: true },
      { key: 'harvest', size: 'large', hidden: true },
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

describe('isAdjusted (SMA-336)', () => {
  it.each(DASHBOARD_LEVELS)('is false for the untouched %s preset', (level) => {
    expect(isAdjusted(presetFor(level), level)).toBe(false);
  });

  it('is true once a block is resized', () => {
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'large';
    expect(isAdjusted(blocks, 'gardener')).toBe(true);
  });

  it('is true once a block is hidden', () => {
    const blocks = presetFor('gardener');
    blocks[2]!.hidden = true;
    expect(isAdjusted(blocks, 'gardener')).toBe(true);
  });

  it('is true once two blocks swap places', () => {
    const blocks = presetFor('gardener');
    const [first, second] = [blocks[0]!, blocks[1]!];
    blocks[0] = second;
    blocks[1] = first;
    expect(isAdjusted(blocks, 'gardener')).toBe(true);
  });

  it('is true when the layout does not carry all the blocks of its preset', () => {
    const preset = presetFor('gardener');
    expect(isAdjusted(preset.slice(0, preset.length - 1), 'gardener')).toBe(true);
  });

  it('reads the preset of the LEVEL, not of the default one', () => {
    expect(isAdjusted(presetFor('novice'), 'gardener')).toBe(true);
    expect(isAdjusted(presetFor('novice'), 'novice')).toBe(false);
  });
});

describe('nextDashboardSize (SMA-336)', () => {
  const THREE = ['small', 'medium', 'large'] as const;

  it('cycles Small to Medium to Large and wraps back to Small', () => {
    expect(nextDashboardSize('small', THREE)).toBe('medium');
    expect(nextDashboardSize('medium', THREE)).toBe('large');
    expect(nextDashboardSize('large', THREE)).toBe('small');
  });

  // SMA-437 lot 1, PR A, step A2 (pre-flight D3) — the handle steps through
  // the sizes the widget may take at its formula, never through every size.
  it('steps through the list it is given: with the Full width in it, Large → Full width → Small (the Expert cycle of A-N11)', () => {
    const expert = ['small', 'medium', 'large', 'wide'] as const;
    expect(nextDashboardSize('large', expert)).toBe('wide');
    expect(nextDashboardSize('wide', expert)).toBe('small');
  });

  it('stays put on a one-size list — the Key figures band, which has no handle', () => {
    expect(nextDashboardSize('wide', ['wide'])).toBe('wide');
  });

  it('steps a size the list does not hold to the first one', () => {
    expect(nextDashboardSize('wide', THREE)).toBe('small');
  });
});
