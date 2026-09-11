import type { DashboardGardenData } from '../../types/DashboardData';

/**
 * SMA-336 round 6 (Extension #4-6) — ONE builder for the `DashboardGardenData`
 * fixture.
 *
 * The sixteen-field record, nested `config` included, was spelled out in four
 * test files; every field the wire contract gains in a later lot of the stack
 * became four compile errors and four near-identical edits. Same reason and same
 * home as `placements.ts` beside it.
 *
 * A drawn 4 × 3 garden at 50 cm with nothing placed — a test overrides what it
 * is about, and the overrides that carry meaning (`orientation: 'S'` for the
 * exposure engine, `isEdible: true` for the ornamental split) stay at their
 * call sites, where a reader looks for them.
 */
export const gardenFixture = (
  over: Partial<DashboardGardenData> = {}
): DashboardGardenData => ({
  id: 'g1',
  name: 'Terrasse',
  description: null,
  width: 4,
  height: 3,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
    gardenType: null,
    lightSchedule: null,
    hemisphere: 'N',
    latitudeBand: 'mid',
  },
  updatedAt: '2026-05-01T00:00:00Z',
  placements: [],
  placementCount: 0,
  varietyCount: 0,
  occupiedCells: 0,
  isEdible: null,
  ...over,
});
