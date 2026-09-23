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

describe('sizesFor — the table of PR A: no widget has the Full width yet', () => {
  it.each(DASHBOARD_LEVELS)('at %s, every widget takes Small, Medium and Large, in that order', (level) => {
    for (const key of DASHBOARD_BLOCK_KEYS) {
      expect(sizesFor(key, level), `${key} at ${level}`).toEqual(['small', 'medium', 'large']);
    }
  });

  it('no widget is offered `wide` at any formula — a widget gets it the day its Full-width version is drawn', () => {
    for (const level of DASHBOARD_LEVELS) {
      for (const key of DASHBOARD_BLOCK_KEYS) {
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

  it('in PR A, the Expert’s cycle of every resizable widget is Small → Medium → Large → Small', () => {
    for (const key of DASHBOARD_BLOCK_KEYS) {
      expect(walk('small', sizesFor(key, 'expert'), 3), key).toEqual(['medium', 'large', 'small']);
    }
  });
});
