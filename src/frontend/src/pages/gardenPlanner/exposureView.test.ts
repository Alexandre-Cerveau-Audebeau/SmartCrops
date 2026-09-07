import { describe, expect, it } from 'vitest';
import type { CellData } from '../../types/GardenLayout';
import type { Blocker } from '../../utils/exposure';
import { computeExposureView } from './exposureView';

// SMA-18 lot 3 — the planner's derived exposure layers, extracted from the
// page so the plan export can force the same computation past the screen's
// `needExposure` gate. Pins the aggregate cells, the SMA-309 moment triplet
// and the cast-shadow overlay (null when nothing casts).

const openGrid: CellData[][] = [
  [{ active: true }, { active: false }],
  [{ active: true, exposureOverride: 'shade' }, { active: true }],
];

describe('computeExposureView', () => {
  it('returns the aggregate categories (overrides applied, inactive = null) and no cast layer when nothing casts', () => {
    const view = computeExposureView({
      grid: openGrid,
      rows: 2,
      cols: 2,
      garden: null,
      blockers: [],
      season: 'summer',
      moment: 'noon',
      castsShadow: false,
    });
    expect(view.cells).toEqual([
      ['full', null],
      ['shade', 'full'],
    ]);
    // The override cell carries no triplet (SMA-309: the label would contradict it).
    expect(view.momentsLit?.[1]?.[0]).toBeNull();
    expect(view.momentsLit?.[0]?.[0]).toEqual({
      morning: true,
      noon: true,
      evening: true,
    });
    expect(view.cast).toBeNull();
  });

  it('adds the moment pass (shadowed cells) when something casts', () => {
    // One column, a tall blocker at the bottom (south-facing garden: the
    // noon sun sits at the bottom edge, the shadow climbs two cells).
    const column: CellData[][] = [
      [{ active: true }],
      [{ active: true }],
      [{ active: true, infrastructure: 'wall' }],
    ];
    const blockers: Blocker[] = [
      {
        row: 2,
        col: 0,
        spanRows: 1,
        spanCols: 1,
        heightCategory: 'tall',
        blocksLight: true,
      },
    ];
    const view = computeExposureView({
      grid: column,
      rows: 3,
      cols: 1,
      garden: null,
      blockers,
      season: 'summer',
      moment: 'noon',
      castsShadow: true,
    });
    expect(view.cells).toEqual([['shade'], ['shade'], ['full']]);
    expect(view.cast).toEqual([[true], [true], [false]]);
  });

  it('applies the garden config (an indoor schedule tints uniformly, nothing casts)', () => {
    const view = computeExposureView({
      grid: openGrid,
      rows: 2,
      cols: 2,
      garden: {
        id: 'g',
        name: 'Indoor',
        gardenType: 'indoor',
        lightSchedule: [{ start: '06:00', end: '12:00' }],
      },
      blockers: [],
      season: 'winter',
      moment: 'evening',
      castsShadow: false,
    });
    expect(view.cells).toEqual([
      ['morning', null],
      ['shade', 'morning'],
    ]);
    expect(view.cast).toBeNull();
  });
});
