import { describe, expect, it } from 'vitest';
import { placement } from '../test/fixtures/placements';
import { serializeCellsJson, type CellData } from '../types/GardenLayout';
import type { ExposureCategory } from './exposure';
import {
  drawnPx,
  fitPreview,
  fitPreviewBox,
  gardenToPreview,
  plantInsetPx,
  TINY_CELL_PX,
} from './gardenPreview';
import { placementCoverage } from './gardenStats';

// SMA-336 PR 2/5 — the adapter that lets TemplatePreview draw a real garden,
// and the two sizing rules the frozen design fixes (48 px on a card, 2 px in
// the comparison table).

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
      { plantKey: 'p-1', row: 1, col: 2, spanRows: 1, spanCols: 1 },
      { plantKey: 'p-2', row: 3, col: 0, spanRows: 1, spanCols: 1 },
    ]);
  });

  it('keeps a placement footprint', () => {
    const plan = gardenToPreview(null, 10, 10, [
      placement({ startRow: 2, startCol: 3, spanRows: 2, spanCols: 3 }),
    ]);

    expect(plan.placements[0]).toMatchObject({ row: 2, col: 3, spanRows: 2, spanCols: 3 });
  });
});

// ROUND 6 (partie B) — the drawing path clips like the counting path.
describe('gardenToPreview — a footprint never leaves the plan (round 6, B)', () => {
  // `placementCoverage` clips (round 3, E″9) so the occupancy figures derive
  // from a bounded mask; the adapter copied the stored coordinates verbatim,
  // and `TemplatePreview` turned an out-of-grid track into implicit CSS grid
  // tracks that grew the thumbnail past the box it was fitted to.

  it('cuts a footprint that overflows to the RIGHT at the plan’s edge', () => {
    // Anchored at column 3 of 4, three wide: only one column is inside.
    const plan = gardenToPreview(null, 4, 3, [
      placement({ startRow: 0, startCol: 3, spanRows: 1, spanCols: 3 }),
    ]);

    expect(plan.placements).toEqual([
      { plantKey: 'plant-1', row: 0, col: 3, spanRows: 1, spanCols: 1 },
    ]);
  });

  it('cuts a footprint that overflows at the BOTTOM at the plan’s edge', () => {
    // Anchored at row 2 of 3, three tall: only one row is inside.
    const plan = gardenToPreview(null, 4, 3, [
      placement({ startRow: 2, startCol: 0, spanRows: 3, spanCols: 1 }),
    ]);

    expect(plan.placements).toEqual([
      { plantKey: 'plant-1', row: 2, col: 0, spanRows: 1, spanCols: 1 },
    ]);
  });

  it('drops a footprint that lies ENTIRELY outside the plan', () => {
    // Past the right edge, past the bottom edge, and before the origin: none
    // of the three has a cell to draw, and none reaches the grid.
    const plan = gardenToPreview(null, 4, 3, [
      placement({ id: 'right', startRow: 0, startCol: 4, spanRows: 1, spanCols: 2 }),
      placement({ id: 'below', startRow: 3, startCol: 0, spanRows: 2, spanCols: 1 }),
      placement({ id: 'before', startRow: -2, startCol: -2, spanRows: 2, spanCols: 2 }),
    ]);

    expect(plan.placements).toEqual([]);
  });

  it('clamps a footprint anchored before the origin to the origin', () => {
    // Starts one row and one column outside, spans three: two of each are in.
    const plan = gardenToPreview(null, 4, 3, [
      placement({ startRow: -1, startCol: -1, spanRows: 3, spanCols: 3 }),
    ]);

    expect(plan.placements).toEqual([
      { plantKey: 'plant-1', row: 0, col: 0, spanRows: 2, spanCols: 2 },
    ]);
  });

  it('keeps OVERLAPPING footprints both, each clipped on its own', () => {
    // Two plants sharing cells is a stored fact, not a bound to enforce here:
    // the grid stacks them, as the planner draws them. The second one also
    // crosses the right edge and is cut there.
    const plan = gardenToPreview(null, 4, 3, [
      placement({ id: 'a', plantId: 'basil', startRow: 0, startCol: 0, spanRows: 2, spanCols: 2 }),
      placement({ id: 'b', plantId: 'thyme', startRow: 1, startCol: 1, spanRows: 2, spanCols: 4 }),
    ]);

    expect(plan.placements).toEqual([
      { plantKey: 'basil', row: 0, col: 0, spanRows: 2, spanCols: 2 },
      { plantKey: 'thyme', row: 1, col: 1, spanRows: 2, spanCols: 3 },
    ]);
  });

  it('leaves a footprint that fits exactly where it is', () => {
    const plan = gardenToPreview(null, 4, 3, [
      placement({ startRow: 1, startCol: 2, spanRows: 2, spanCols: 2 }),
    ]);

    expect(plan.placements).toEqual([
      { plantKey: 'plant-1', row: 1, col: 2, spanRows: 2, spanCols: 2 },
    ]);
  });

  it('agrees with placementCoverage on what is inside', () => {
    // The two paths must bound the same cells: what the statistics count as
    // occupied is what the thumbnail draws. A 2 × 2 footprint anchored at
    // (2, 3) of a 4 × 3 plan keeps exactly one cell on either path.
    const overflowing = placement({ startRow: 2, startCol: 3, spanRows: 2, spanCols: 2 });
    const plan = gardenToPreview(null, 4, 3, [overflowing]);
    const rated: (ExposureCategory | null)[][] = Array.from({ length: 3 }, () =>
      Array.from({ length: 4 }, () => 'full' as const)
    );
    const coverage = placementCoverage(rated, [overflowing], 3, 4);

    const drawnCells = plan.placements.reduce(
      (sum, p) => sum + p.spanRows * p.spanCols,
      0
    );
    expect(drawnCells).toBe(1);
    expect(coverage.occupiedCells).toBe(1);
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

// ROUND 8 — the overflow half of the canvas finding (Extension #7-16 / #8-9 /
// #9-16), raised in round 7 § 5 and never examined by the six refusals. The
// one-pixel floor is honest about the cell and silent about the box: a plan
// with more columns or rows than the box has pixels was drawn PAST the box.
describe('fitPreviewBox — the thumbnail stays in its box', () => {
  it('a 40 × 30 plan in the 34 × 26 table thumbnail: 40 × 30 px before, 34 × 26 now', () => {
    // Measured before the fix: {1, 0} drew 40 × 30 px, 6 px too wide and 4 px
    // too tall. The grid is the same; it is drawn at 0.85.
    const box = fitPreviewBox(40, 30, 34, 26);

    expect(box).toEqual({
      cellPx: 1,
      gapPx: 0,
      scale: 0.85,
      width: 34,
      height: 26,
    });
    expect(drawnPx(40, box) * box.scale).toBeLessThanOrEqual(34);
    expect(drawnPx(30, box) * box.scale).toBeLessThanOrEqual(26);
  });

  it('the 100 × 100 layout ceiling in a 48 × 48 thumbnail: 100 × 100 px before, 48 × 48 now', () => {
    // The finding's own case: « renders a 100 × 100-pixel grid » in a 48 px
    // bound — 52 px past it on each side. Ten thousand nodes still, at 0.48.
    const box = fitPreviewBox(100, 100, 48, 48);

    expect(box).toEqual({
      cellPx: 1,
      gapPx: 0,
      scale: 0.48,
      width: 48,
      height: 48,
    });
  });

  it('a plan that fits is drawn exactly as before — scale 1, the measured size', () => {
    // 10 × 8 at 3 px with 1 px gaps: 10 × 3 + 11 = 41 by 8 × 3 + 9 = 33.
    expect(fitPreviewBox(10, 8, 48, 48)).toEqual({
      cellPx: 3,
      gapPx: 1,
      scale: 1,
      width: 41,
      height: 33,
    });
    // And the edge: 40 × 30 in exactly 40 × 30 fits at 1 px, unscaled.
    expect(fitPreviewBox(40, 30, 40, 30).scale).toBe(1);
  });

  it('never exceeds the box, at every plan shape the layout contract allows', () => {
    // The product's two boxes (Medium card, Large table cell) and the two the
    // cost measurement uses, against 1..100 × 1..100. Before the fix 8 080 of
    // these shapes overran the Medium card and 8 800 the table cell.
    for (const [maxW, maxH] of [[48, 40], [40, 30], [48, 48], [34, 26]]) {
      for (let cols = 1; cols <= 100; cols++) {
        for (let rows = 1; rows <= 100; rows++) {
          const box = fitPreviewBox(cols, rows, maxW!, maxH!);
          expect(box.width).toBeLessThanOrEqual(maxW!);
          expect(box.height).toBeLessThanOrEqual(maxH!);
          // The drawing is inside the box it reports, on both axes — up to
          // floating-point noise on the deciding axis (`70 × (30 / 70)` is
          // `30.000000000000004`), which is below anything a screen can draw.
          expect(drawnPx(cols, box) * box.scale).toBeLessThanOrEqual(
            box.width + 1e-9
          );
          expect(drawnPx(rows, box) * box.scale).toBeLessThanOrEqual(
            box.height + 1e-9
          );
          // And scaling is only ever a shrink of a grid that did not fit.
          expect(box.scale).toBeLessThanOrEqual(1);
          expect(box.scale).toBeGreaterThan(0);
          if (box.scale < 1) expect(box.cellPx).toBe(1);
        }
      }
    }
  });

  it('keeps the proportion: the tighter axis decides, the other stays in ratio', () => {
    // 60 × 20 in 48 × 40: width decides (0.8), height follows — 48 × 16, not
    // a cropped 48 × 20.
    expect(fitPreviewBox(60, 20, 48, 40)).toMatchObject({
      scale: 0.8,
      width: 48,
      height: 16,
    });
  });

  it('answers a grid with no cells without dividing by zero', () => {
    expect(fitPreviewBox(0, 0, 48, 48)).toEqual({
      cellPx: 1,
      gapPx: 0,
      scale: 1,
      width: 0,
      height: 0,
    });
  });
});

describe('plantInsetPx', () => {
  it('insets a plant block by 2 px at a readable cell size', () => {
    expect(plantInsetPx(16)).toBe(2);
    expect(plantInsetPx(48)).toBe(2);
    // The first size ABOVE the threshold still gets its margin: 5 − 4 = 1 px of
    // block survives, so the rule drops the inset only where it has to.
    expect(plantInsetPx(TINY_CELL_PX + 1)).toBe(2);
  });

  it('drops the inset at and below 4 px, where 2 px on each side erases the block', () => {
    // The Large comparison table draws 2 px cells: a 1×1 block inset by 2 px on
    // each side would measure 2 − 4 = 0 and the thumbnail would show no
    // planting at all.
    expect(plantInsetPx(3)).toBe(0);
    expect(plantInsetPx(2)).toBe(0);
    expect(plantInsetPx(1)).toBe(0);
    // AT the threshold too (round 1, G9): 4 − 2 − 2 = 0 is the same erasure,
    // and the strict comparison let it through at exactly the size the rule was
    // written for.
    expect(plantInsetPx(TINY_CELL_PX)).toBe(0);
  });
});
