import type {
  DashboardData,
  DashboardGardenData,
  DashboardVarietyData,
} from '../../types/DashboardData';

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

/**
 * ONE builder for the `DashboardVarietyData` fixture (round 7, S18 — Extension
 * #6-15): an edible herb planted once, photo-less, in the default garden. The
 * ten-field record was spelled out beside `gardenFixture`'s callers; a test
 * overrides what it is about.
 */
export const varietyFixture = (
  over: Partial<DashboardVarietyData> = {}
): DashboardVarietyData => ({
  plantId: 'p-1',
  scientificName: 'Ocimum basilicum',
  commonName: 'Basil',
  plantType: 'Herb',
  isEdible: true,
  imageUrl: null,
  imageAttribution: null,
  count: 1,
  cells: 1,
  gardenIds: ['g1'],
  ...over,
});

/**
 * An aggregate whose totals AGREE with its gardens (round 7, S02 — Extension
 * #6-12 / #6-13, #7-21, #8-12): the three dashboard page suites each carried an
 * identical `dashboardWith`, and three copies of one contract are three chances
 * for one to drift into pinning a `placementCount` its gardens do not hold — an
 * aggregate the server never emits, on which every assertion is weaker without
 * anything failing.
 *
 * `varietyCount` is the sum of the per-garden counts, which equals the DISTINCT
 * count the server sends (decision D11) only while no variety spans two
 * gardens — true of every page fixture, which carries `varieties: []`. A test
 * that models an overlap says so through `over.totals`, on the same line it
 * models it.
 */
export const dashboardFixture = (
  gardens: DashboardGardenData[],
  over: Partial<DashboardData> = {}
): DashboardData => ({
  gardens,
  varieties: [],
  totals: {
    gardenCount: gardens.length,
    placementCount: gardens.reduce((sum, g) => sum + g.placementCount, 0),
    varietyCount: gardens.reduce((sum, g) => sum + g.varietyCount, 0),
    catalogPlantCount: 536,
  },
  ...over,
});
