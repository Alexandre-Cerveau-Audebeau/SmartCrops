import { describe, expect, it } from 'vitest';
import type { PlacementData } from '../services/gardenLayoutApi';
import { serializeCellsJson, type CellData } from '../types/GardenLayout';
import { fitPreview, gardenToPreview, plantInsetPx, TINY_CELL_PX } from './gardenPreview';

// SMA-336 PR 2/5 — the adapter that lets TemplatePreview draw a real garden,
// and the two sizing rules the frozen design fixes (48 px on a card, 2 px in
// the comparison table).

const placement = (over: Partial<PlacementData> = {}): PlacementData => ({
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

describe('gardenToPreview', () => {
  it('carries the grid size, whatever the plan says', () => {
    const plan = gardenToPreview(null, 40, 30, []);

    expect(plan.cols).toBe(40);
    expect(plan.rows).toBe(30);
  });

  it('a garden with no CellsJson draws as an empty full grid', () => {
    const plan = gardenToPreview(null, 3, 2, []);

    // parseCellsJson(null, …) already reads that as every cell active with
    // nothing painted, so there is no sparse entry left to draw.
    expect(plan.cells).toEqual([]);
    expect(plan.placements).toEqual([]);
  });

  it('keeps inactive cells, soils and infrastructures', () => {
    const json = JSON.stringify([
      { row: 0, col: 0, soil: 'humus' },
      { row: 0, col: 1, soil: 'humus', infrastructure: 'wall' },
      { row: 1, col: 0, active: false },
    ]);

    const plan = gardenToPreview(json, 2, 2, []);

    expect(plan.cells).toEqual([
      { row: 0, col: 0, soil: 'humus' },
      { row: 0, col: 1, soil: 'humus', infrastructure: 'wall' },
      { row: 1, col: 0, active: false },
    ]);
  });

  it('round-trips what the thumbnail draws, through serializeCellsJson', () => {
    // The five vectors of GardenLayout.test.ts that the preview has something
    // to show for. An override-only cell is deliberately NOT among them — see
    // the next test.
    const grid: CellData[][] = [
      [
        { active: true },
        { active: false },
        { active: true, soil: 'clay' },
      ],
      [
        { active: true, infrastructure: 'wall' },
        { active: true, soil: 'potting', infrastructure: 'trellis' },
        { active: true },
      ],
    ];
    const json = serializeCellsJson(grid);

    const plan = gardenToPreview(json, 3, 2, []);

    // Every drawable entry of the serialized document comes back, in reading
    // order and with the same values.
    expect(plan.cells).toEqual([
      { row: 0, col: 1, active: false },
      { row: 0, col: 2, soil: 'clay' },
      { row: 1, col: 0, infrastructure: 'wall' },
      { row: 1, col: 1, soil: 'potting', infrastructure: 'trellis' },
    ]);
  });

  it('drops a cell that carries ONLY an exposure override', () => {
    // serializeCellsJson writes it — the planner needs it — but the thumbnail
    // has nothing to draw for an override: it paints soils, infrastructures and
    // inactive cells, not exposure. Keeping the entry would add a cell that
    // renders identically to its neighbours.
    const json = serializeCellsJson([
      [{ active: true, exposureOverride: 'shade' }, { active: true }],
    ]);
    expect(json).not.toBeNull();

    const plan = gardenToPreview(json, 2, 1, []);

    expect(plan.cells).toEqual([]);
  });

  it('survives the malformed documents the parser tolerates', () => {
    // parseCellsJson swallows invalid JSON, drops unknown vocabulary and clamps
    // out-of-grid indices; going through it means the thumbnail inherits all
    // three without repeating any of them.
    expect(gardenToPreview('not json at all', 2, 2, []).cells).toEqual([]);

    const unknown = JSON.stringify([
      { row: 0, col: 0, soil: 'terreau', infrastructure: 'lava' },
      { row: 9, col: 9, soil: 'humus' },
      { row: 0, col: 1, soil: 'potting' },
    ]);
    expect(gardenToPreview(unknown, 2, 2, []).cells).toEqual([
      { row: 0, col: 1, soil: 'potting' },
    ]);
  });

  it('colours placements by plant id, not by the nullable scientific name', () => {
    const plan = gardenToPreview(null, 4, 4, [
      placement({ plantId: 'p-1', plantScientificName: null, startRow: 1, startCol: 2 }),
      placement({ id: 'pl-2', plantId: 'p-2', plantScientificName: null, startRow: 3, startCol: 0 }),
    ]);

    // Two unnamed plants must not share one colour, which is what hashing the
    // empty string would give them.
    expect(plan.placements).toEqual([
      { scientificName: 'p-1', row: 1, col: 2, spanRows: 1, spanCols: 1 },
      { scientificName: 'p-2', row: 3, col: 0, spanRows: 1, spanCols: 1 },
    ]);
  });

  it('keeps a placement footprint', () => {
    const plan = gardenToPreview(null, 10, 10, [
      placement({ startRow: 2, startCol: 3, spanRows: 2, spanCols: 3 }),
    ]);

    expect(plan.placements[0]).toMatchObject({ row: 2, col: 3, spanRows: 2, spanCols: 3 });
  });
});

describe('fitPreview', () => {
  /** What the component will actually draw, gaps and side padding included. */
  const drawnPx = (count: number, fit: { cellPx: number; gapPx: number }) =>
    count * fit.cellPx + fit.gapPx * (count + 1);

  it('fits a 40 x 30 garden into the 48 px thumbnail of a Gardens card', () => {
    const fit = fitPreview(40, 30, 48, 48);

    expect(fit.cellPx).toBeGreaterThanOrEqual(1);
    // It only fits because the gap goes: 40 cells plus 41 one-pixel gaps would
    // be 81 px before a single cell got its pixel.
    expect(fit.gapPx).toBe(0);
    expect(drawnPx(40, fit)).toBeLessThanOrEqual(48);
    expect(drawnPx(30, fit)).toBeLessThanOrEqual(48);
  });

  it('fits a small garden into the same box, and KEEPS its gaps', () => {
    const fit = fitPreview(10, 8, 48, 48);

    expect(fit.gapPx).toBe(1);
    expect(drawnPx(10, fit)).toBeLessThanOrEqual(48);
    expect(drawnPx(8, fit)).toBeLessThanOrEqual(48);
  });

  it('fits the tiny cells the Large comparison table draws', () => {
    // A table identity cell is roughly 106 x 40 px (frozen design).
    const fit = fitPreview(40, 30, 106, 40);

    expect(fit.cellPx).toBeGreaterThanOrEqual(1);
    expect(drawnPx(40, fit)).toBeLessThanOrEqual(106);
    expect(drawnPx(30, fit)).toBeLessThanOrEqual(40);
  });

  it('what it measures is what fits, at every size from a card to a table cell', () => {
    // The circularity this function exists to kill: a gap decided AFTER the
    // cell can always disagree with the cell it was decided from.
    for (const [cols, rows] of [[1, 1], [4, 3], [10, 8], [13, 6], [40, 30], [100, 100]]) {
      for (const [maxW, maxH] of [[48, 48], [106, 40], [240, 160], [16, 16]]) {
        const fit = fitPreview(cols!, rows!, maxW!, maxH!);
        expect(fit.cellPx).toBeGreaterThanOrEqual(1);
        expect([0, 1]).toContain(fit.gapPx);
        // A grid too big for its box still draws, at one pixel per cell; below
        // that there would be nothing to look at.
        if (fit.cellPx > 1) {
          expect(drawnPx(cols!, fit)).toBeLessThanOrEqual(maxW!);
          expect(drawnPx(rows!, fit)).toBeLessThanOrEqual(maxH!);
        }
      }
    }
  });

  it('takes the tighter of the two dimensions', () => {
    // Wide and short box, tall grid: height decides.
    expect(fitPreview(4, 20, 400, 48)).toEqual(fitPreview(4, 20, 4000, 48));
  });

  it('never returns less than one pixel', () => {
    expect(fitPreview(200, 200, 48, 48).cellPx).toBe(1);
    expect(fitPreview(1, 1, 0, 0).cellPx).toBe(1);
  });

  it('returns whole pixels only', () => {
    const fit = fitPreview(7, 3, 100, 100);

    expect(Number.isInteger(fit.cellPx)).toBe(true);
  });

  it('answers one pixel for a grid with no cells rather than dividing by zero', () => {
    expect(fitPreview(0, 0, 48, 48)).toEqual({ cellPx: 1, gapPx: 0 });
    expect(fitPreview(-3, 4, 48, 48)).toEqual({ cellPx: 1, gapPx: 0 });
  });
});

describe('plantInsetPx', () => {
  it('insets a plant block by 2 px at a readable cell size', () => {
    expect(plantInsetPx(16)).toBe(2);
    expect(plantInsetPx(48)).toBe(2);
    expect(plantInsetPx(TINY_CELL_PX)).toBe(2);
  });

  it('drops the inset below 4 px, where 2 px on each side erases the block', () => {
    // The Large comparison table draws 2 px cells: a 1×1 block inset by 2 px on
    // each side would measure 2 − 4 = 0 and the thumbnail would show no
    // planting at all.
    expect(plantInsetPx(3)).toBe(0);
    expect(plantInsetPx(2)).toBe(0);
    expect(plantInsetPx(1)).toBe(0);
  });
});
