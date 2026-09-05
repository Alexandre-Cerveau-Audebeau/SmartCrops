import { describe, expect, it } from 'vitest';
import {
  footprintFits,
  rectsOverlap,
} from '../pages/gardenPlanner/placementGeometry';
import type { PlannerPlacement } from '../pages/gardenPlanner/plannerReducer';
import {
  GARDEN_TEMPLATE_KEYS,
  GARDEN_TEMPLATES,
  getGardenTemplate,
  TEMPLATE_CELL_SIZE,
  TEMPLATE_COLS,
  TEMPLATE_ROWS,
  templateGrid,
  templatePlacementCount,
  type GardenTemplateKey,
  type TemplatePlacement,
} from './gardenTemplates';
import { isInfrastructureType } from './infrastructure';
import { isSoilType } from './soil';

// SMA-18 lot 2 — the three templates are compile-time constants: these tests
// are the guard the reducer deliberately does NOT run on them (APPLY_TEMPLATE
// trusts the template placements and re-fits only the existing ones).

// Scientific names verified present in the plant table — EXACT strings from
// the pre-flight (§4.1–4.3, DEV database, 536 plants). A template may only
// reference one of these; anything else is a data bug, not a substitution.
const AVAILABLE_SCIENTIFIC_NAMES = [
  // §4.1 Potager
  'Solanum lycopersicum',
  'Ocimum basilicum',
  'Cucurbita pepo',
  'Lactuca sativa',
  'Fragaria × ananassa',
  'Daucus carota',
  'Allium ampeloprasum',
  'Phaseolus vulgaris',
  'Raphanus sativus',
  'Petroselinum crispum',
  // §4.2 Japanese garden
  'Acer palmatum',
  'Acer japonicum',
  'Athyrium filix-femina',
  'Adiantum capillus-veneris',
  'Asplenium scolopendrium',
  'Blechnum spicant',
  'Athyrium vidalii',
  'Bambusa ventricosa',
  'Arundinaria gigantea',
  'Iris germanica',
  // §4.3 Mediterranean
  'Lavandula angustifolia',
  'Lavandula',
  'Olea europaea',
  'Salvia rosmarinus',
  'Thymus vulgaris',
  'Thymus serpyllum',
  'Salvia officinalis',
  'Ficus carica',
  'Agapanthus africanus',
  'Agapanthus',
];

// Server bounds (GardensController: SaveLayoutRequest / SavePlacementRequest)
// and the config dialog's own 2–50 clamp.
const DIALOG_MIN_DIMENSION = 2;
const DIALOG_MAX_DIMENSION = 50;
const SERVER_MAX_SPAN = 20;
const DIALOG_CELL_SIZES = ['25cm', '50cm', '1m'];

const toPlacement = (p: TemplatePlacement, i: number): PlannerPlacement => ({
  id: `tpl-${i}`,
  plantId: p.scientificName,
  startRow: p.row,
  startCol: p.col,
  spanRows: p.spanRows,
  spanCols: p.spanCols,
  notes: null,
});

const templates = [...GARDEN_TEMPLATES];

describe('gardenTemplates (SMA-18 lot 2)', () => {
  it('exposes the three mockup templates, in card order, on the shared 10 × 6 · 50cm canvas', () => {
    expect(GARDEN_TEMPLATE_KEYS).toEqual(['potager', 'japanese', 'mediterranean']);
    expect(templates.map((t) => t.key)).toEqual([...GARDEN_TEMPLATE_KEYS]);
    for (const template of templates) {
      expect(template.cols).toBe(TEMPLATE_COLS);
      expect(template.rows).toBe(TEMPLATE_ROWS);
      expect(template.cellSize).toBe(TEMPLATE_CELL_SIZE);
    }
    expect(TEMPLATE_COLS).toBe(10);
    expect(TEMPLATE_ROWS).toBe(6);
    expect(TEMPLATE_CELL_SIZE).toBe('50cm');
  });

  it.each(templates)('$key stays within the dialog and server bounds', (template) => {
    expect(template.cols).toBeGreaterThanOrEqual(DIALOG_MIN_DIMENSION);
    expect(template.cols).toBeLessThanOrEqual(DIALOG_MAX_DIMENSION);
    expect(template.rows).toBeGreaterThanOrEqual(DIALOG_MIN_DIMENSION);
    expect(template.rows).toBeLessThanOrEqual(DIALOG_MAX_DIMENSION);
    expect(DIALOG_CELL_SIZES).toContain(template.cellSize);
    for (const placement of template.placements) {
      expect(placement.spanRows).toBeGreaterThanOrEqual(1);
      expect(placement.spanCols).toBeGreaterThanOrEqual(1);
      expect(placement.spanRows).toBeLessThanOrEqual(SERVER_MAX_SPAN);
      expect(placement.spanCols).toBeLessThanOrEqual(SERVER_MAX_SPAN);
      expect(placement.row).toBeGreaterThanOrEqual(0);
      expect(placement.col).toBeGreaterThanOrEqual(0);
      expect(placement.row + placement.spanRows).toBeLessThanOrEqual(template.rows);
      expect(placement.col + placement.spanCols).toBeLessThanOrEqual(template.cols);
    }
  });

  it.each(templates)('$key has no cell outside the grid, none duplicated, and only known vocabularies', (template) => {
    const seen = new Set<string>();
    for (const cell of template.cells) {
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(template.rows);
      expect(cell.col).toBeGreaterThanOrEqual(0);
      expect(cell.col).toBeLessThan(template.cols);
      const key = `${cell.row}:${cell.col}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      if (cell.soil !== undefined) expect(isSoilType(cell.soil)).toBe(true);
      if (cell.infrastructure !== undefined) {
        expect(isInfrastructureType(cell.infrastructure)).toBe(true);
      }
      if (cell.active !== undefined) expect(cell.active).toBe(false);
      // A sparse cell that says nothing is a data smell (the grid would
      // store a default cell for it).
      expect(
        cell.active !== undefined ||
          cell.soil !== undefined ||
          cell.infrastructure !== undefined
      ).toBe(true);
    }
  });

  it.each(templates)('$key has no overlapping footprints', (template) => {
    const rects = template.placements.map((p) => ({
      startRow: p.row,
      startCol: p.col,
      spanRows: p.spanRows,
      spanCols: p.spanCols,
    }));
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        expect(rectsOverlap(rects[a], rects[b])).toBe(false);
      }
    }
  });

  it.each(templates)('$key: every placement fits the derived grid (footprintFits)', (template) => {
    const grid = templateGrid(template);
    const placed: PlannerPlacement[] = [];
    template.placements.forEach((p, i) => {
      const candidate = toPlacement(p, i);
      expect(footprintFits(grid, placed, candidate)).toEqual({ ok: true });
      placed.push(candidate);
    });
  });

  it('counts 14 / 8 / 10 placements — the mockup card figures', () => {
    expect(templatePlacementCount(getGardenTemplate('potager'))).toBe(14);
    expect(templatePlacementCount(getGardenTemplate('japanese'))).toBe(8);
    expect(templatePlacementCount(getGardenTemplate('mediterranean'))).toBe(10);
  });

  it.each(templates)('$key references only plants verified present in the catalog', (template) => {
    for (const placement of template.placements) {
      expect(AVAILABLE_SCIENTIFIC_NAMES).toContain(placement.scientificName);
    }
  });

  it('derives the planner grid the reducer will store — defaults active, sparse cells applied', () => {
    const potager = templateGrid(getGardenTemplate('potager'));
    expect(potager).toHaveLength(6);
    expect(potager[0]).toHaveLength(10);
    // The central path spans the whole width of row 3; the water point sits
    // in the bottom-right corner; every other cell is a plain active cell.
    for (let c = 0; c < 10; c++) {
      expect(potager[3][c]).toEqual({ active: true, infrastructure: 'path' });
    }
    expect(potager[5][9]).toEqual({ active: true, infrastructure: 'water' });
    expect(potager[0][0]).toEqual({ active: true });

    const japanese = templateGrid(getGardenTemplate('japanese'));
    // Humus ("moss") everywhere, including UNDER the gravel path and the
    // stones (the grid stores soil under infrastructure; the render masks it).
    expect(japanese[0][0]).toEqual({ active: true, soil: 'humus' });
    expect(japanese[3][0]).toEqual({
      active: true,
      soil: 'humus',
      infrastructure: 'path',
    });
    expect(japanese[0][3]).toEqual({
      active: true,
      soil: 'humus',
      infrastructure: 'wall',
    });
    expect(japanese[5][8]).toEqual({
      active: true,
      soil: 'humus',
      infrastructure: 'water',
    });

    const mediterranean = templateGrid(getGardenTemplate('mediterranean'));
    // Pots along the first and last rows carry NO soil; gravel in between.
    expect(mediterranean[0][0]).toEqual({ active: true, infrastructure: 'pot' });
    expect(mediterranean[5][9]).toEqual({ active: true, infrastructure: 'pot' });
    expect(mediterranean[1][0]).toEqual({ active: true, soil: 'stony' });
    expect(mediterranean[4][9]).toEqual({ active: true, soil: 'stony' });
  });

  it('templateGrid returns a fresh grid on every call (nothing shared with the constants)', () => {
    const template = getGardenTemplate('potager');
    const a = templateGrid(template);
    const b = templateGrid(template);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a[3][0]).not.toBe(b[3][0]);
  });

  it('getGardenTemplate throws on an unknown key', () => {
    expect(() => getGardenTemplate('bonsai' as GardenTemplateKey)).toThrow(
      'Unknown garden template: bonsai'
    );
  });

  it('matches the pinned definitions (snapshot of the three templates)', () => {
    expect(GARDEN_TEMPLATES).toMatchSnapshot();
  });
});
