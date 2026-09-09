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

describe('dashboard presets (SMA-336)', () => {
  it.each(DASHBOARD_LEVELS)(
    'the %s preset lists all eight blocks in the canonical order',
    (level) => {
      expect(presetFor(level).map((block) => block.key)).toEqual([
        ...DASHBOARD_BLOCK_KEYS,
      ]);
    }
  );

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

  it('Gardener shows six widgets, Gardens in Large, and hides Statistics and Harvest', () => {
    expect(presetFor('gardener')).toEqual([
      { key: 'weather', size: 'medium', hidden: false },
      { key: 'gardens', size: 'large', hidden: false },
      { key: 'tips', size: 'medium', hidden: false },
      { key: 'month', size: 'medium', hidden: false },
      { key: 'todo', size: 'medium', hidden: false },
      { key: 'counters', size: 'medium', hidden: false },
      { key: 'stats', size: 'large', hidden: true },
      { key: 'harvest', size: 'large', hidden: true },
    ]);
  });

  it('Expert shows the eight widgets in Large, none hidden', () => {
    const expert = presetFor('expert');
    expect(expert).toHaveLength(8);
    expect(expert.every((block) => block.size === 'large')).toBe(true);
    expect(expert.some((block) => block.hidden)).toBe(false);
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

  it('is true when the layout does not carry all eight blocks', () => {
    expect(isAdjusted(presetFor('gardener').slice(0, 7), 'gardener')).toBe(true);
  });

  it('reads the preset of the LEVEL, not of the default one', () => {
    expect(isAdjusted(presetFor('novice'), 'gardener')).toBe(true);
    expect(isAdjusted(presetFor('novice'), 'novice')).toBe(false);
  });
});

describe('nextDashboardSize (SMA-336)', () => {
  it('cycles Small to Medium to Large and wraps back to Small', () => {
    expect(nextDashboardSize('small')).toBe('medium');
    expect(nextDashboardSize('medium')).toBe('large');
    expect(nextDashboardSize('large')).toBe('small');
  });
});
