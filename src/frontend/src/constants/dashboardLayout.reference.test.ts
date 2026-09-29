import { describe, expect, it } from 'vitest';
import reference from './dashboardLayout.reference.json';
import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_LEVELS,
  DASHBOARD_SIZES,
  DEFAULT_DASHBOARD_LEVEL,
  DEFAULT_GARDEN_SORT,
  GARDENS_COUNTS,
  GARDENS_COUNT_ALL,
  GARDEN_SORTS,
  NON_HIDABLE_BLOCK,
  WEATHER_MODES,
  isGardenSort,
  isWeatherMode,
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

  // SMA-448, lot F4 — the weather mode of each formula is a capability the
  // page draws by: the file writes a mode the client's vocabulary knows, and
  // the three formulas use the three modes — the Novice's cards, the
  // Gardener's one fixed city, the Expert's every city (V3-02, [A] 22/09).
  it('writes a weather mode the client knows for every formula — the cards, one city, every city', () => {
    const modes = DASHBOARD_LEVELS.map((level) => reference.formulas[level].weather);
    for (const mode of modes) expect(isWeatherMode(mode), mode).toBe(true);
    expect(modes).toEqual([...WEATHER_MODES]);
    expect(reference.formulas.novice.weather).toBe('gardenCards');
    expect(reference.formulas.gardener.weather).toBe('singleCity');
    expect(reference.formulas.expert.weather).toBe('allCities');
  });

  // SMA-448, lot F5-a — the Gardens widget's settings (V3-04; A-N3, A-N4,
  // decided by Alexandre on 28/09): the counts, the sorts and the default
  // sort are one vocabulary on both sides; which sorts a formula serves is
  // its row of the file — none for the Novice, three for the Gardener, five
  // for the Expert.
  it('knows the reference’s gardens settings — the counts, the sorts, the default sort', () => {
    expect([...GARDENS_COUNTS]).toEqual(reference.gardensSettings.counts);
    expect(GARDENS_COUNT_ALL).toBe(reference.gardensSettings.countAll);
    expect([...GARDEN_SORTS]).toEqual(reference.gardensSettings.sorts);
    expect(DEFAULT_GARDEN_SORT).toBe(reference.gardensSettings.defaultSort);
  });

  it('writes garden sorts the client knows for every formula — none, three, five', () => {
    for (const level of DASHBOARD_LEVELS) {
      for (const sort of reference.formulas[level].gardenSorts) expect(isGardenSort(sort), `${level}: ${sort}`).toBe(true);
    }
    expect(reference.formulas.novice.gardenSorts).toEqual([]);
    expect(reference.formulas.gardener.gardenSorts).toEqual(['lastOpened', 'name', 'updated']);
    expect(reference.formulas.expert.gardenSorts).toEqual(['lastOpened', 'name', 'created', 'updated', 'custom']);
  });
});
