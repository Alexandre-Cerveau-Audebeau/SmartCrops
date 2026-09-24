import { describe, expect, it } from 'vitest';
import { sizesFor } from './dashboardCapabilities';
import {
  DASHBOARD_BLOCK_KEYS,
  DASHBOARD_LEVELS,
  nextDashboardSize,
  type DashboardSize,
} from '../types/Dashboard';

// SMA-437 lot 1, PR A, step A2 (pre-flight D3) — the sizes a widget may take,
// per formula. The twin of the server's `DashboardCapabilitiesTests`: the same
// table, pinned literally on both sides, as the presets are.

/** Every size the handle reaches from `start`, stepping `steps` times. */
function walk(start: DashboardSize, sizes: ReturnType<typeof sizesFor>, steps: number): DashboardSize[] {
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

describe('sizesFor — the table of PR B: the Key figures band takes the Full width, at the Expert formula, and nothing else does', () => {
  // SMA-437 lot 1, PR B, step B1 (pre-flight D3): « keyfigures@Expert =
  // [wide] ; tout le reste = [P, M, G] ». The band is the one widget DRAWN in
  // Full width — its only size — and the Expert the one formula that has it
  // (V3-01). Whether a formula has a widget at all is its preset's to say
  // (D4): the band's rows at the two other formulas are never read, since a
  // layout of theirs never carries it (`dashboardApi.normalize`, and the
  // server's `Merge` and `Validate`).
  it('the Key figures band takes ONE size at the Expert formula: the Full width', () => {
    expect(sizesFor('keyfigures', 'expert')).toEqual(['wide']);
  });

  it.each(DASHBOARD_LEVELS)('at %s, every other widget takes Small, Medium and Large, in that order', (level) => {
    for (const key of DASHBOARD_BLOCK_KEYS.filter((candidate) => !isExpertBand(candidate, level))) {
      expect(sizesFor(key, level), `${key} at ${level}`).toEqual(['small', 'medium', 'large']);
    }
  });

  it('no other widget is offered `wide` at any formula — a widget gets it the day its Full-width version is drawn', () => {
    for (const level of DASHBOARD_LEVELS) {
      for (const key of DASHBOARD_BLOCK_KEYS.filter((candidate) => !isExpertBand(candidate, level))) {
        expect(sizesFor(key, level), `${key} at ${level}`).not.toContain('wide');
      }
    }
  });
});

describe('the corner handle, per formula (A-N11)', () => {
  it('the Gardener’s cycle never passes through the Full width, for any widget, from any size', () => {
    for (const key of DASHBOARD_BLOCK_KEYS) {
      const sizes = sizesFor(key, 'gardener');
      for (const start of sizes) {
        expect(walk(start, sizes, 6), `${key} from ${start}`).not.toContain('wide');
      }
    }
  });

  it('in PR B, the Expert’s cycle of every resizable widget is Small → Medium → Large → Small', () => {
    for (const key of DASHBOARD_BLOCK_KEYS.filter((candidate) => candidate !== 'keyfigures')) {
      expect(walk('small', sizesFor(key, 'expert'), 3), key).toEqual(['medium', 'large', 'small']);
    }
  });

  it('the Key figures band has no cycle at all: one size, so no corner handle (A-N11, C28)', () => {
    // `DashboardGrid` draws the grip for a widget with MORE than one size.
    expect(sizesFor('keyfigures', 'expert')).toHaveLength(1);
    expect(walk('wide', sizesFor('keyfigures', 'expert'), 3)).toEqual(['wide', 'wide', 'wide']);
  });
});
