import type { PlacementData } from '../../services/gardenLayoutApi';

/**
 * SMA-336 round 4 (C5 — E‴4) — ONE builder for the `PlacementData` fixture.
 *
 * `StatsBlock.test.tsx`, `gardenStats.test.ts` and `gardenPreview.test.ts` each
 * declared an equivalent builder for the same eight-field interface, so adding a
 * field to the wire record meant editing three files that had no reason to know
 * about each other. They are here now, and the three call sites import them.
 *
 * A module rather than a helper exported from one of the three test files:
 * importing a fixture from a `*.test.ts` would run that file's own suite as a
 * side effect of the import.
 */
export const placement = (over: Partial<PlacementData> = {}): PlacementData => ({
  id: 'pl-1',
  plantId: 'plant-1',
  plantScientificName: 'Ocimum basilicum',
  startRow: 0,
  startCol: 0,
  spanRows: 1,
  spanCols: 1,
  notes: null,
  ...over,
});

/**
 * One 1 x 1 plant on a cell.
 *
 * Round 3 (E″9) is why it exists: the occupancy figures derive from the PLAN
 * now, so a test that wants an occupied cell has to place a plant on it rather
 * than declare a count on the transport. The id carries the coordinates so two
 * placements of the same fixture never collide.
 */
export const at = (startRow: number, startCol: number): PlacementData =>
  placement({ id: `pl-${startRow}-${startCol}`, startRow, startCol });
