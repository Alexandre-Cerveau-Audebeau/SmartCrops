import { describe, expect, it } from 'vitest';
import reference from './dashboardLayout.reference.json';
import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_LEVELS,
  DASHBOARD_SIZES,
  NON_HIDABLE_BLOCK,
} from '../types/Dashboard';
import { sizesFor } from './dashboardCapabilities';
import { DEFAULT_DASHBOARD_LEVEL, presetFor } from './dashboardPresets';

// PR #287, fix round 1, S2 (CodeRabbit, both surfaces) — the dashboard's
// vocabulary, its size table and its presets exist twice, here and in
// `SmartCrops.Core/Dashboard`, each pinned by its own literals: a change made
// on one side only failed no test. Both suites now compare THEIR constants to
// the one reference file, `dashboardLayout.reference.json`; the server's twin
// of this test is `DashboardLayoutReferenceTests.cs`, which reads the same
// file. A drift on either side fails that side's suite.
describe('the dashboard layout reference — the client’s constants against the file both sides read', () => {
  it('lists the blocks in the reference’s order', () => {
    expect([...DASHBOARD_BLOCK_KEYS]).toEqual(reference.blocks);
  });

  it('knows the reference’s sizes', () => {
    expect([...DASHBOARD_SIZES]).toEqual(reference.sizes);
  });

  it('knows the reference’s levels, and its default one', () => {
    expect([...DASHBOARD_LEVELS]).toEqual(reference.levels);
    expect(DEFAULT_DASHBOARD_LEVEL).toBe(reference.defaultLevel);
  });

  it('never lets go of the reference’s non-hidable block', () => {
    expect(NON_HIDABLE_BLOCK).toBe(reference.nonHidableBlock);
  });

  it.each(DASHBOARD_LEVELS)('offers every block, at %s, the sizes of the reference’s table, in its order', (level) => {
    const table = Object.fromEntries(DASHBOARD_BLOCK_KEYS.map((key) => [key, [...sizesFor(key, level)]]));
    expect(table).toEqual(reference.sizesFor[level]);
  });

  it.each(DASHBOARD_LEVELS)('draws the %s preset the reference describes, block by block', (level) => {
    expect(presetFor(level)).toEqual(reference.presets[level]);
  });
});
