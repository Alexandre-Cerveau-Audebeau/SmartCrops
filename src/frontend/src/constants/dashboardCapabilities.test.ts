import { describe, expect, it } from 'vitest';
import { hasActionBar, isAdjusted, isCardsPage, permitsBlock, presetOf, showsEveryCity, sizesFor } from './dashboardCapabilities';
import { capabilitiesFor } from '../test/fixtures/formulas';
import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_LEVELS,
  stepDashboardSize,
  type DashboardLevel,
  type DashboardSize,
  type DashboardSizeList,
  type DashboardSizeStep,
} from '../types/Dashboard';

// SMA-437 lot 1, PR A, step A2 (pre-flight D3) — the sizes a widget may take,
// per formula. SMA-448, lot F1, S5: the client READS them from the
// capabilities the server serves with the layout; it no longer holds the
// table. These tests read the served capabilities of each formula — the
// fixture's, which are the reference file's, which is the contract the served
// catalogue is tested against on the server (`FormulasControllerTests`).

/** Every size one segment of the size pill reaches from `start`, one click after another, until that end of the scale. */
function ladder(start: DashboardSize, sizes: DashboardSizeList, step: DashboardSizeStep): DashboardSize[] {
  const reached: DashboardSize[] = [];
  for (let size = stepDashboardSize(start, sizes, step); size !== null; size = stepDashboardSize(size, sizes, step)) {
    reached.push(size);
  }
  return reached;
}

/** Whether a (widget, formula) is the Key figures band at the Expert formula — the one row of the table that is not Small, Medium, Large. */
const isExpertBand = (key: string, level: string) => key === 'keyfigures' && level === 'expert';
/**
 * The widgets drawn in Full width besides the band, the Expert's alone: the
 * Weather (SMA-448, lot F4), the Gardens (lot F5-b), and Statistics, Counts
 * and This month (SMA-437, lot V3-08 — A-14, decided on 28/09).
 */
const EXPERT_FULL_WIDTH = ['weather', 'gardens', 'month', 'counters', 'stats'];
/** Whether a (widget, formula) is one of them at the Expert formula — a row that is Small, Medium, Large AND the Full width. */
const isExpertFullWidth = (key: string, level: string) => EXPERT_FULL_WIDTH.includes(key) && level === 'expert';
/** Every widget of a formula whose row is the plain three sizes. */
const threeSizedWidgets = (level: DashboardLevel) =>
  capabilitiesFor(level).widgets.filter((key) => !isExpertBand(key, level) && !isExpertFullWidth(key, level));

describe('sizesFor — as served: the Key figures band takes the Full width, at the Expert formula, the Weather, the Gardens, Statistics, Counts and This month add it there, and nothing else has it', () => {
  // SMA-437 lot 1, PR B, step B1 (pre-flight D3): « keyfigures@Expert =
  // [wide] ; tout le reste = [P, M, G] ». The band is the one widget DRAWN in
  // Full width — its only size — and the Expert the one formula that has it
  // (V3-01). SMA-448, lot F4 (V3-02): the Weather is drawn in Full width too
  // — every city at once — so its Expert row is the three sizes, then it.
  // SMA-448, lot F5-b (V3-03, V3-04; C.4): the Gardens widget likewise — the
  // seven-column table.
  it('the Key figures band takes ONE size at the Expert formula: the Full width', () => {
    expect(sizesFor('keyfigures', capabilitiesFor('expert'))).toEqual(['wide']);
  });

  it('the Weather takes the three sizes and then the Full width at the Expert formula — and the three sizes alone at the Gardener (SMA-448, lot F4)', () => {
    expect(sizesFor('weather', capabilitiesFor('expert'))).toEqual(['small', 'medium', 'large', 'wide']);
    expect(sizesFor('weather', capabilitiesFor('gardener'))).toEqual(['small', 'medium', 'large']);
  });

  it('the Gardens takes the three sizes and then the Full width at the Expert formula — and the three sizes alone at the Gardener (SMA-448, lot F5-b)', () => {
    expect(sizesFor('gardens', capabilitiesFor('expert'))).toEqual(['small', 'medium', 'large', 'wide']);
    expect(sizesFor('gardens', capabilitiesFor('gardener'))).toEqual(['small', 'medium', 'large']);
  });

  // SMA-437, lot V3-08 (A-14, Alexandre 28/09): Statistics in one line per
  // garden, Counts in four columns from 1 200 px, This month the grid alone.
  it.each(['stats', 'counters', 'month'] as const)('%s takes the three sizes and then the Full width at the Expert formula (SMA-437, lot V3-08)', (key) => {
    expect(sizesFor(key, capabilitiesFor('expert'))).toEqual(['small', 'medium', 'large', 'wide']);
  });

  it('This month and Counts keep the three sizes alone at the Gardener — who has no Statistics at all (SMA-437, lot V3-08; R1)', () => {
    expect(sizesFor('month', capabilitiesFor('gardener'))).toEqual(['small', 'medium', 'large']);
    expect(sizesFor('counters', capabilitiesFor('gardener'))).toEqual(['small', 'medium', 'large']);
    expect(sizesFor('stats', capabilitiesFor('gardener'))).toBeNull();
  });

  it.each(DASHBOARD_LEVELS)('at %s, every other widget of the formula takes Small, Medium and Large, in that order', (level) => {
    const capabilities = capabilitiesFor(level);
    for (const key of threeSizedWidgets(level)) {
      expect(sizesFor(key, capabilities), `${key} at ${level}`).toEqual(['small', 'medium', 'large']);
    }
  });

  it('no other widget is offered `wide` at any formula — a widget gets it the day its Full-width version is drawn', () => {
    for (const level of DASHBOARD_LEVELS) {
      const capabilities = capabilitiesFor(level);
      for (const key of threeSizedWidgets(level)) {
        expect(sizesFor(key, capabilities), `${key} at ${level}`).not.toContain('wide');
      }
    }
  });

  // SMA-448, lot F1 — a widget the formula does not have takes no size at
  // all: the page never renders it, and nothing here stands in for a size.
  it('a widget the formula does not have has no sizes: the band outside the Expert, Statistics at the Gardener', () => {
    expect(sizesFor('keyfigures', capabilitiesFor('gardener'))).toBeNull();
    expect(sizesFor('keyfigures', capabilitiesFor('novice'))).toBeNull();
    expect(sizesFor('stats', capabilitiesFor('gardener'))).toBeNull();
  });
});

describe('permitsBlock — as served (SMA-448, R1)', () => {
  it('the formula has exactly the widgets its capabilities list', () => {
    for (const level of DASHBOARD_LEVELS) {
      const capabilities = capabilitiesFor(level);
      for (const key of DASHBOARD_BLOCK_KEYS) {
        expect(permitsBlock(capabilities, key), `${key} at ${level}`).toBe(capabilities.widgets.includes(key));
      }
    }
    expect(permitsBlock(capabilitiesFor('gardener'), 'stats')).toBe(false);
    expect(permitsBlock(capabilitiesFor('expert'), 'stats')).toBe(true);
  });
});

// REWRITTEN by SMA-437's size stepper (Alexandre, 05/10, validated on 26/11):
// these pinned the corner handle's CYCLE, Large back to Small. « − » and « + »
// climb down and up the same lists, and stop at both ends.
describe('the size pill, per formula (A-N11; SMA-437)', () => {
  it('the Gardener’s steps never reach the Full width, for any widget, from any size, in either direction', () => {
    const capabilities = capabilitiesFor('gardener');
    for (const key of capabilities.widgets) {
      const sizes = sizesFor(key, capabilities)!;
      for (const start of sizes) {
        for (const step of ['smaller', 'larger'] as const) {
          expect(ladder(start, sizes, step), `${key} from ${start}, ${step}`).not.toContain('wide');
        }
      }
    }
  });

  it('the Expert’s every resizable widget not drawn in Full width — Tips, To do, Harvest — climbs Small → Medium → Large, stops there, and comes back down the same way', () => {
    const capabilities = capabilitiesFor('expert');
    const threeSized = capabilities.widgets.filter((candidate) => candidate !== 'keyfigures' && !EXPERT_FULL_WIDTH.includes(candidate));
    expect(threeSized).toEqual(['tips', 'todo', 'harvest']);
    for (const key of threeSized) {
      expect(ladder('small', sizesFor(key, capabilities)!, 'larger'), key).toEqual(['medium', 'large']);
      expect(ladder('large', sizesFor(key, capabilities)!, 'smaller'), key).toEqual(['medium', 'small']);
    }
  });

  it.each(['stats', 'counters', 'month'] as const)('the Expert’s %s climbs through the Full width and stops there: Small → Medium → Large → Full width (A-N11; SMA-437, lot V3-08)', (key) => {
    expect(ladder('small', sizesFor(key, capabilitiesFor('expert'))!, 'larger')).toEqual(['medium', 'large', 'wide']);
  });

  it('the Expert’s Weather climbs through the Full width and stops there: Small → Medium → Large → Full width (A-N11; SMA-448, lot F4)', () => {
    expect(ladder('small', sizesFor('weather', capabilitiesFor('expert'))!, 'larger')).toEqual(['medium', 'large', 'wide']);
  });

  it('the Expert’s Gardens climbs through the Full width too and comes back down from it — and the Gardener’s Gardens stops at Large (A-N11; SMA-448, lot F5-b)', () => {
    expect(ladder('small', sizesFor('gardens', capabilitiesFor('expert'))!, 'larger')).toEqual(['medium', 'large', 'wide']);
    expect(ladder('wide', sizesFor('gardens', capabilitiesFor('expert'))!, 'smaller')).toEqual(['large', 'medium', 'small']);
    expect(ladder('large', sizesFor('gardens', capabilitiesFor('gardener'))!, 'larger')).toEqual([]);
  });

  it('the Key figures band takes no step at all: one size, so no size pill (A-N11, C28)', () => {
    // `DashboardGrid` draws the pill for a widget with MORE than one size.
    const sizes = sizesFor('keyfigures', capabilitiesFor('expert'))!;
    expect(sizes).toHaveLength(1);
    expect(ladder('wide', sizes, 'smaller')).toEqual([]);
    expect(ladder('wide', sizes, 'larger')).toEqual([]);
  });
});

// SMA-437, lot V39, PR B, step B3 — which formula has the compact action bar
// (A-9, Alexandre 25/09): not the Novice, not even with « Créer un jardin »
// alone. SMA-448, S5: the formula's served capability, read by a named
// predicate the page calls — never a literal comparison in a component.
describe('the compact action bar, per formula (A-9)', () => {
  it('no action bar at the Novice formula; one at the Gardener and the Expert formulas', () => {
    expect(Object.fromEntries(DASHBOARD_LEVELS.map((level) => [level, hasActionBar(capabilitiesFor(level))]))).toEqual({
      novice: false,
      gardener: true,
      expert: true,
    });
  });
});

// SMA-448, lot F4 — the Weather widget draws by the served weather mode
// (V3-02, [A] 22/09 18:52): the Expert walks every city, the Gardener shows
// one, fixed, the Novice has no widget at all (its cards). Named predicates
// the page calls, never a literal comparison in a component.
describe('the weather of each formula, as served (SMA-448, lot F4)', () => {
  it('the Expert alone walks every city; the Novice alone is the cards page; the Gardener neither — one city, fixed', () => {
    expect(
      Object.fromEntries(DASHBOARD_LEVELS.map((level) => [level, showsEveryCity(capabilitiesFor(level))]))
    ).toEqual({ novice: false, gardener: false, expert: true });
    expect(
      Object.fromEntries(DASHBOARD_LEVELS.map((level) => [level, isCardsPage(capabilitiesFor(level))]))
    ).toEqual({ novice: true, gardener: false, expert: false });
  });
});

describe('presetOf (SMA-448)', () => {
  it('hands out a fresh copy, so a caller cannot mutate the capabilities it was served', () => {
    const capabilities = capabilitiesFor('gardener');
    const first = presetOf(capabilities);
    first[0]!.size = 'small';
    expect(presetOf(capabilities)[0]!.size).toBe('medium');
    expect(capabilities.preset[0]!.size).toBe('medium');
  });
});

// Moved here from `dashboardPresets.test.ts` (SMA-336), which went with the
// client's presets: « · ajustée » compares against the SERVED preset now.
describe('isAdjusted (SMA-336)', () => {
  it.each(DASHBOARD_LEVELS)('is false for the untouched %s preset', (level) => {
    const capabilities = capabilitiesFor(level);
    expect(isAdjusted(presetOf(capabilities), capabilities)).toBe(false);
  });

  it('is true once a block is resized', () => {
    const capabilities = capabilitiesFor('gardener');
    const blocks = presetOf(capabilities);
    blocks[0]!.size = 'large';
    expect(isAdjusted(blocks, capabilities)).toBe(true);
  });

  it('is true once a block is hidden', () => {
    const capabilities = capabilitiesFor('gardener');
    const blocks = presetOf(capabilities);
    blocks[2]!.hidden = true;
    expect(isAdjusted(blocks, capabilities)).toBe(true);
  });

  it('is true once two blocks swap places', () => {
    const capabilities = capabilitiesFor('gardener');
    const blocks = presetOf(capabilities);
    const [first, second] = [blocks[0]!, blocks[1]!];
    blocks[0] = second;
    blocks[1] = first;
    expect(isAdjusted(blocks, capabilities)).toBe(true);
  });

  it('is true when the layout does not carry all the blocks of its preset', () => {
    const capabilities = capabilitiesFor('gardener');
    const preset = presetOf(capabilities);
    expect(isAdjusted(preset.slice(0, preset.length - 1), capabilities)).toBe(true);
  });

  it('reads the preset of the FORMULA, not of the default one', () => {
    expect(isAdjusted(presetOf(capabilitiesFor('novice')), capabilitiesFor('gardener'))).toBe(true);
    expect(isAdjusted(presetOf(capabilitiesFor('novice')), capabilitiesFor('novice'))).toBe(false);
  });

  it('ignores the options (V19): setting a widget never relabels a layout', () => {
    const capabilities = capabilitiesFor('expert');
    const blocks = presetOf(capabilities).map((block) =>
      block.key === 'keyfigures' ? { ...block, options: { figures: ['cities', 'free', 'tips', 'surface'] } } : block
    );
    expect(isAdjusted(blocks, capabilities)).toBe(false);
  });
});

// SMA-437 (Alexandre, 05/10, validated on 26/11) — the Edit mode's « − » and
// « + » step a widget ONE size down or up through the sizes it may take at its
// formula, in their order, and stop at both ends of the scale: no wrap, Large
// never steps back to Small. A size the list does not hold (D7): « − » leads
// to the largest size served, « + » nowhere.
describe('stepDashboardSize (SMA-437)', () => {
  const THREE = ['small', 'medium', 'large'] as const;
  const FOUR = ['small', 'medium', 'large', 'wide'] as const;

  it('steps one size up and one size down on three sizes: Small ⇄ Medium ⇄ Large', () => {
    expect(stepDashboardSize('small', THREE, 'larger')).toBe('medium');
    expect(stepDashboardSize('medium', THREE, 'larger')).toBe('large');
    expect(stepDashboardSize('large', THREE, 'smaller')).toBe('medium');
    expect(stepDashboardSize('medium', THREE, 'smaller')).toBe('small');
  });

  it('steps one size up and one size down on four sizes, the Full width last: Small ⇄ Medium ⇄ Large ⇄ Full width', () => {
    expect(stepDashboardSize('small', FOUR, 'larger')).toBe('medium');
    expect(stepDashboardSize('medium', FOUR, 'larger')).toBe('large');
    expect(stepDashboardSize('large', FOUR, 'larger')).toBe('wide');
    expect(stepDashboardSize('wide', FOUR, 'smaller')).toBe('large');
    expect(stepDashboardSize('large', FOUR, 'smaller')).toBe('medium');
    expect(stepDashboardSize('medium', FOUR, 'smaller')).toBe('small');
  });

  it('stops at both ends of the scale — null, never a wrap: nothing below Small, nothing above Large on three sizes, nothing above the Full width on four', () => {
    expect(stepDashboardSize('small', THREE, 'smaller')).toBeNull();
    expect(stepDashboardSize('large', THREE, 'larger')).toBeNull();
    expect(stepDashboardSize('small', FOUR, 'smaller')).toBeNull();
    expect(stepDashboardSize('wide', FOUR, 'larger')).toBeNull();
  });

  it('goes nowhere on a one-size list — the Key figures band, which gets no « − » and no « + »', () => {
    expect(stepDashboardSize('wide', ['wide'], 'smaller')).toBeNull();
    expect(stepDashboardSize('wide', ['wide'], 'larger')).toBeNull();
  });

  it('from a size the list does not hold, « − » leads to the largest size served and « + » nowhere (D7)', () => {
    expect(stepDashboardSize('wide', THREE, 'smaller')).toBe('large');
    expect(stepDashboardSize('wide', THREE, 'larger')).toBeNull();
  });
});
