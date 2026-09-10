import type { CellData } from '../types/GardenLayout';
import type { InfrastructureType } from './infrastructure';
import type { SoilType } from './soil';

/**
 * Garden templates (SMA-18 lot 2) — PURE data + helpers, no React, no I/O;
 * the structural sibling of ./soil.ts and ./infrastructure.ts. Three
 * ready-made layouts the planner can apply in one undoable step (the
 * reducer's APPLY_TEMPLATE), each composed ONLY from the closed vocabularies
 * the grid already stores (6 infrastructures, 8 soils, active/inactive) and
 * from plants referenced by their EXACT scientific name.
 *
 * WHY SCIENTIFIC NAMES, NOT IDS: plant ids are GUIDs minted at seed/import
 * time (`Guid.NewGuid()` in DataSeeder / BulkImportService), so they differ
 * from one database to the next; the one portable key is `ScientificName`,
 * unique per `IX_Plants_ScientificName_Lower`. The page resolves each name
 * against the loaded catalog (case-insensitively, the index's own rule) when
 * the template is applied; a name the catalog does not carry is omitted and
 * counted, never guessed.
 *
 * WHICH NAMES: every string below was verified present in the plant table
 * (SMA-18 lot 2 pre-flight, §4.1–4.3). Where the mockup's plant does not
 * exist yet, a present species stands in (SMA-427 imports the missing ones):
 * leek → Allium ampeloprasum (Allium porrum absent); dwarf bamboo →
 * Bambusa ventricosa; the Japanese "moss" is the humus SOIL, not a plant;
 * azalea / hosta / pine / oleander / lemon tree / rockrose are left out.
 *
 * FOOTPRINTS ARE FIXED IN THE TEMPLATE (product decision): the placer's
 * spacing→cells rule would make the layout depend on each species' Perenual
 * spacing data, and a template is a drawing, not a suggestion.
 */

/** Every template shares the mockup's canvas: 10 × 6 cells of 50 cm. */
export const TEMPLATE_COLS = 10;
export const TEMPLATE_ROWS = 6;
export const TEMPLATE_CELL_SIZE = '50cm';

export const GARDEN_TEMPLATE_KEYS = [
  'potager',
  'japanese',
  'mediterranean',
] as const;

export type GardenTemplateKey = (typeof GARDEN_TEMPLATE_KEYS)[number];

/** One non-default cell of a template — the sparse CellsJson grammar. */
export interface TemplateCell {
  row: number;
  col: number;
  active?: false;
  soil?: SoilType;
  infrastructure?: InfrastructureType;
}

/** One plant of a template, anchored top-left like PlannerPlacement. */
export interface TemplatePlacement {
  scientificName: string;
  row: number;
  col: number;
  spanRows: number;
  spanCols: number;
}

export interface GardenTemplate {
  key: GardenTemplateKey;
  cols: typeof TEMPLATE_COLS;
  rows: typeof TEMPLATE_ROWS;
  cellSize: typeof TEMPLATE_CELL_SIZE;
  cells: readonly TemplateCell[];
  placements: readonly TemplatePlacement[];
}

/**
 * Anything that can be DRAWN as a plan thumbnail (SMA-336 PR 2/5).
 *
 * `GardenTemplate` satisfies it without a cast — a widening, not a rename. Its
 * `cols`/`rows` are the literal types `10` and `6`, which are assignable to
 * `number`; the reverse is not, so a real garden is a PreviewPlan and a
 * PreviewPlan is not a template. That is exactly the asymmetry we want: the
 * three templates keep their fixed canvas, and a 40 × 30 garden becomes
 * drawable without pretending to be one of them.
 *
 * It deliberately omits `key` and `cellSize`: TemplatePreview reads neither, and
 * a real garden has no template key to offer.
 */
export interface PreviewPlan {
  cols: number;
  rows: number;
  cells: readonly TemplateCell[];
  placements: readonly TemplatePlacement[];
}

// ── Composition helpers (module-private) ─────────────────────────────────────

/** A 1×1 plant at (row, col). */
const plant = (
  scientificName: string,
  row: number,
  col: number
): TemplatePlacement => ({ scientificName, row, col, spanRows: 1, spanCols: 1 });

/** A square plant of `span` cells anchored at (row, col). */
const bigPlant = (
  scientificName: string,
  row: number,
  col: number,
  span: number
): TemplatePlacement => ({
  scientificName,
  row,
  col,
  spanRows: span,
  spanCols: span,
});

/** Every cell of one full row, painted with the same infrastructure. */
const infraRow = (row: number, infrastructure: InfrastructureType): TemplateCell[] =>
  Array.from({ length: TEMPLATE_COLS }, (_, col) => ({
    row,
    col,
    infrastructure,
  }));

/** Every cell of the rows [from, to], painted with the same soil. */
const soilRows = (from: number, to: number, soil: SoilType): TemplateCell[] => {
  const cells: TemplateCell[] = [];
  for (let row = from; row <= to; row++) {
    for (let col = 0; col < TEMPLATE_COLS; col++) cells.push({ row, col, soil });
  }
  return cells;
};

/**
 * Merge sparse cell layers by (row, col): a later layer's fields land on top
 * of an earlier layer's for the same cell (so "humus everywhere" + "a path
 * here" yields a cell carrying BOTH — the grid stores soil under
 * infrastructure exactly like that, the render masks it). Output is sorted
 * row-major so the definition (and its snapshot) is deterministic.
 */
const mergeCells = (...layers: TemplateCell[][]): TemplateCell[] => {
  const byKey = new Map<string, TemplateCell>();
  for (const layer of layers) {
    for (const cell of layer) {
      const key = `${cell.row}:${cell.col}`;
      byKey.set(key, { ...byKey.get(key), ...cell });
    }
  }
  return [...byKey.values()].sort((a, b) => a.row - b.row || a.col - b.col);
};

// ── The three templates ──────────────────────────────────────────────────────

/**
 * Potager — rows of vegetables above a central horizontal path (row 3, full
 * width), two free beds below it, a water point in the bottom-right corner.
 * 14 plants: tomatoes with their basil companions, lettuces with
 * strawberries, a 2×2 courgette, then a row of roots (carrot, leek, radish).
 */
const POTAGER: GardenTemplate = {
  key: 'potager',
  cols: TEMPLATE_COLS,
  rows: TEMPLATE_ROWS,
  cellSize: TEMPLATE_CELL_SIZE,
  cells: mergeCells(infraRow(3, 'path'), [
    { row: 5, col: 9, infrastructure: 'water' },
  ]),
  placements: [
    plant('Solanum lycopersicum', 0, 0),
    plant('Solanum lycopersicum', 0, 1),
    plant('Solanum lycopersicum', 0, 2),
    plant('Ocimum basilicum', 0, 3),
    plant('Ocimum basilicum', 0, 4),
    bigPlant('Cucurbita pepo', 0, 7, 2),
    plant('Lactuca sativa', 1, 0),
    plant('Lactuca sativa', 1, 1),
    plant('Lactuca sativa', 1, 2),
    plant('Fragaria × ananassa', 1, 3),
    plant('Fragaria × ananassa', 1, 4),
    plant('Daucus carota', 2, 0),
    plant('Allium ampeloprasum', 2, 1),
    plant('Raphanus sativus', 2, 2),
  ],
};

/**
 * Japanese garden — humus ("moss") on every cell, a gravel path winding from
 * left to right between rows 2 and 3, three isolated stones (wall cells), a
 * two-cell pond in the bottom-right corner. 8 plants: a 2×2 Japanese maple
 * in the top-left corner, three ferns along the bottom, two bamboos on the
 * right edge, two irises beside the pond.
 */
const JAPANESE: GardenTemplate = {
  key: 'japanese',
  cols: TEMPLATE_COLS,
  rows: TEMPLATE_ROWS,
  cellSize: TEMPLATE_CELL_SIZE,
  cells: mergeCells(
    soilRows(0, TEMPLATE_ROWS - 1, 'humus'),
    // The winding gravel path: (3,0)→(3,1) up to (2,1)…(2,3) down to
    // (3,3)…(3,5) up to (2,5)…(2,7) down to (3,7)…(3,9).
    [
      { row: 3, col: 0, infrastructure: 'path' },
      { row: 3, col: 1, infrastructure: 'path' },
      { row: 2, col: 1, infrastructure: 'path' },
      { row: 2, col: 2, infrastructure: 'path' },
      { row: 2, col: 3, infrastructure: 'path' },
      { row: 3, col: 3, infrastructure: 'path' },
      { row: 3, col: 4, infrastructure: 'path' },
      { row: 3, col: 5, infrastructure: 'path' },
      { row: 2, col: 5, infrastructure: 'path' },
      { row: 2, col: 6, infrastructure: 'path' },
      { row: 2, col: 7, infrastructure: 'path' },
      { row: 3, col: 7, infrastructure: 'path' },
      { row: 3, col: 8, infrastructure: 'path' },
      { row: 3, col: 9, infrastructure: 'path' },
    ],
    // Three stones.
    [
      { row: 0, col: 3, infrastructure: 'wall' },
      { row: 1, col: 6, infrastructure: 'wall' },
      { row: 5, col: 5, infrastructure: 'wall' },
    ],
    // The pond.
    [
      { row: 5, col: 8, infrastructure: 'water' },
      { row: 5, col: 9, infrastructure: 'water' },
    ]
  ),
  placements: [
    bigPlant('Acer palmatum', 0, 0, 2),
    plant('Athyrium filix-femina', 4, 0),
    plant('Asplenium scolopendrium', 5, 1),
    plant('Blechnum spicant', 4, 2),
    plant('Bambusa ventricosa', 0, 9),
    plant('Bambusa ventricosa', 1, 9),
    plant('Iris germanica', 4, 8),
    plant('Iris germanica', 4, 9),
  ],
};

/**
 * Mediterranean — terracotta pots along the first and last rows, gravel
 * (stony soil) everywhere in between. 10 plants: three lavenders and a thyme
 * potted along the top, two rosemaries and a sage potted along the bottom,
 * a 2×2 olive tree in the middle, a fig and an agapanthus on the gravel.
 * Plants sit ON pot cells on purpose: the placement contract allows a plant
 * over an infrastructure, and a potted plant is what the mockup draws.
 */
const MEDITERRANEAN: GardenTemplate = {
  key: 'mediterranean',
  cols: TEMPLATE_COLS,
  rows: TEMPLATE_ROWS,
  cellSize: TEMPLATE_CELL_SIZE,
  cells: mergeCells(
    soilRows(1, TEMPLATE_ROWS - 2, 'stony'),
    infraRow(0, 'pot'),
    infraRow(TEMPLATE_ROWS - 1, 'pot')
  ),
  placements: [
    plant('Lavandula angustifolia', 0, 1),
    plant('Lavandula angustifolia', 0, 4),
    plant('Lavandula angustifolia', 0, 7),
    plant('Thymus vulgaris', 0, 9),
    plant('Agapanthus africanus', 2, 1),
    bigPlant('Olea europaea', 2, 4, 2),
    plant('Ficus carica', 2, 8),
    plant('Salvia rosmarinus', 5, 2),
    plant('Salvia officinalis', 5, 4),
    plant('Salvia rosmarinus', 5, 7),
  ],
};

/** The three templates, in the mockup's card order. */
export const GARDEN_TEMPLATES: readonly GardenTemplate[] = [
  POTAGER,
  JAPANESE,
  MEDITERRANEAN,
];

/** Look a template up by key. */
export function getGardenTemplate(key: GardenTemplateKey): GardenTemplate {
  const found = GARDEN_TEMPLATES.find((template) => template.key === key);
  if (!found) throw new Error(`Unknown garden template: ${key}`);
  return found;
}

/** The card's "N plants" figure — placements, not species. */
export function templatePlacementCount(template: GardenTemplate): number {
  return template.placements.length;
}

/**
 * Derive the planner grid a template describes: every cell active with no
 * soil and no infrastructure, then the template's sparse cells applied —
 * the same shape parseCellsJson builds from a persisted CellsJson, so
 * APPLY_TEMPLATE hands the reducer exactly what hydration would.
 */
export function templateGrid(template: GardenTemplate): CellData[][] {
  const grid: CellData[][] = Array.from({ length: template.rows }, () =>
    Array.from({ length: template.cols }, () => ({ active: true }))
  );
  for (const cell of template.cells) {
    if (
      cell.row < 0 ||
      cell.row >= template.rows ||
      cell.col < 0 ||
      cell.col >= template.cols
    ) {
      continue;
    }
    grid[cell.row][cell.col] = {
      active: cell.active !== false,
      ...(cell.soil && { soil: cell.soil }),
      ...(cell.infrastructure && { infrastructure: cell.infrastructure }),
    };
  }
  return grid;
}
