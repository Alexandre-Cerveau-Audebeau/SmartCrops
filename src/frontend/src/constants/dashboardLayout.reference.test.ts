import { describe, expect, it } from 'vitest';
import reference from './dashboardLayout.reference.json';
import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_LEVELS,
  DASHBOARD_SIZES,
  DEFAULT_DASHBOARD_LEVEL,
  NON_HIDABLE_BLOCK,
} from '../types/Dashboard';

// PR #287, fix round 1, S2 (CodeRabbit, both surfaces) — the dashboard's
// vocabulary, its size table and its presets existed twice, here and in
// `SmartCrops.Core/Dashboard`, each pinned by its own literals: both suites
// compared THEIR constants to the one reference file,
// `dashboardLayout.reference.json`.
//
// SMA-448, lot F1, S5 — the client no longer holds the size table nor the
// presets: the API serves them with the layout (pre-flight § C.2 a), and the
// file is the contract of that SERVED catalogue, tested on the server
// (`FormulasControllerTests`, `DashboardLayoutReferenceTests.cs`). What the
// client still owns is the VOCABULARY it parses the wire with — the keys, the
// sizes, the levels — and that stays checked here. The client's tests serve
// the catalogue through `src/test/fixtures/formulas.ts`, which reads this file.
describe('the dashboard layout reference — the client’s vocabulary against the file both sides read', () => {
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

  it('describes every formula the client knows, and only them', () => {
    expect(Object.keys(reference.formulas)).toEqual([...DASHBOARD_LEVELS]);
    expect(Object.keys(reference.presets)).toEqual([...DASHBOARD_LEVELS]);
  });
});
