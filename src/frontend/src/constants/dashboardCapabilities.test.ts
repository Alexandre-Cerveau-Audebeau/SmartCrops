import { describe, expect, it } from 'vitest';
import { hasActionBar, isAdjusted, permitsBlock, presetOf, sizesFor } from './dashboardCapabilities';
import { capabilitiesFor } from '../test/fixtures/formulas';
import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_LEVELS,
  nextDashboardSize,
  type DashboardSize,
  type DashboardSizeList,
} from '../types/Dashboard';

// SMA-437 lot 1, PR A, step A2 (pre-flight D3) — the sizes a widget may take,
// per formula. SMA-448, lot F1, S5: the client READS them from the
// capabilities the server serves with the layout; it no longer holds the
// table. These tests read the served capabilities of each formula — the
// fixture's, which are the reference file's, which is the contract the served
// catalogue is tested against on the server (`FormulasControllerTests`).

/** Every size the handle reaches from `start`, stepping `steps` times. */
function walk(start: DashboardSize, sizes: DashboardSizeList, steps: number): DashboardSize[] {
  const reached: DashboardSize[] = [];
  let size = start;
  for (let step = 0; step < steps; step += 1) {
    size = nextDashboardSize(size, sizes);
    reached.push(size);
  }
  return reached;
}

/** Whether a (widget, formula) is the Key figures band at the Expert formula — the one row of the table that is not Small, Medium, Large. */
const isExpertBand = (key: string, level: string) => key === 'keyfigures' && level === 'expert';

describe('sizesFor — as served: the Key figures band takes the Full width, at the Expert formula, and nothing else does', () => {
  // SMA-437 lot 1, PR B, step B1 (pre-flight D3): « keyfigures@Expert =
  // [wide] ; tout le reste = [P, M, G] ». The band is the one widget DRAWN in
  // Full width — its only size — and the Expert the one formula that has it
  // (V3-01).
  it('the Key figures band takes ONE size at the Expert formula: the Full width', () => {
    expect(sizesFor('keyfigures', capabilitiesFor('expert'))).toEqual(['wide']);
  });

  it.each(DASHBOARD_LEVELS)('at %s, every other widget of the formula takes Small, Medium and Large, in that order', (level) => {
    const capabilities = capabilitiesFor(level);
    for (const key of capabilities.widgets.filter((candidate) => !isExpertBand(candidate, level))) {
      expect(sizesFor(key, capabilities), `${key} at ${level}`).toEqual(['small', 'medium', 'large']);
    }
  });

  it('no other widget is offered `wide` at any formula — a widget gets it the day its Full-width version is drawn', () => {
    for (const level of DASHBOARD_LEVELS) {
      const capabilities = capabilitiesFor(level);
      for (const key of capabilities.widgets.filter((candidate) => !isExpertBand(candidate, level))) {
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

describe('the corner handle, per formula (A-N11)', () => {
  it('the Gardener’s cycle never passes through the Full width, for any widget, from any size', () => {
    const capabilities = capabilitiesFor('gardener');
    for (const key of capabilities.widgets) {
      const sizes = sizesFor(key, capabilities)!;
      for (const start of sizes) {
        expect(walk(start, sizes, 6), `${key} from ${start}`).not.toContain('wide');
      }
    }
  });

  it('in PR B, the Expert’s cycle of every resizable widget is Small → Medium → Large → Small', () => {
    const capabilities = capabilitiesFor('expert');
    for (const key of capabilities.widgets.filter((candidate) => candidate !== 'keyfigures')) {
      expect(walk('small', sizesFor(key, capabilities)!, 3), key).toEqual(['medium', 'large', 'small']);
    }
  });

  it('the Key figures band has no cycle at all: one size, so no corner handle (A-N11, C28)', () => {
    // `DashboardGrid` draws the grip for a widget with MORE than one size.
    const sizes = sizesFor('keyfigures', capabilitiesFor('expert'))!;
    expect(sizes).toHaveLength(1);
    expect(walk('wide', sizes, 3)).toEqual(['wide', 'wide', 'wide']);
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
