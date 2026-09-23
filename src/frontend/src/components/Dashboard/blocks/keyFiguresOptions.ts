/**
 * SMA-437 lot 1, PR B, step B2 (pre-flight D9, D10) — the four figures of the
 * Key figures band, chosen and ordered from its gear (contract § 4.5, A-N23:
 * « on remplace, on n'ajoute ni ne retire jamais »).
 *
 * They live on the band's `DashboardBlock.options` as `{ figures: [...] }`.
 * Reading them back is the one careful place, on the model of
 * `countersOptions`: it is persisted JSON this build may not have written — an
 * older layout, a newer one, a hand-edited row — so the value is checked
 * rather than trusted: FOUR keys, DISTINCT and KNOWN, or the four defaults.
 * The server refuses anything else on write (`DashboardController`,
 * `ValidateKeyFigures`) and passes the stored document through on read; this
 * reader is the half that keeps a page drawable whatever came back.
 *
 * The catalogue and the defaults are pinned literally here and on the server
 * (`DashboardKeyFigures.cs`), and both sides compare theirs to
 * `constants/dashboardLayout.reference.json` — the S2 rule of PR #287.
 */

/**
 * The 22 figures of V3-04, in its catalogue's order (`K_ORDER`) and with its
 * keys, for traceability with the artboard — five groups: « Vos jardins »,
 * « La place », « Ce mois-ci », « Aujourd'hui », « À compléter ».
 */
export const KEY_FIGURES = [
  'gardens',
  'plants',
  'varieties',
  'edible',
  'ornam',
  'surface',
  'active',
  'planted',
  'occupancy',
  'free',
  'freeSun',
  'sunShare',
  'prune',
  'sow',
  'harvest',
  'flower',
  'todo',
  'tips',
  'noplan',
  'noorient',
  'located',
  'cities',
] as const;

export type KeyFigure = (typeof KEY_FIGURES)[number];

/** Always four, never three nor five: the band's four emplacements. */
export const KEY_FIGURES_SHOWN = 4;

/**
 * The four of 23/09 (contract § 4.5, point 3 [A]): cases libres, occupation,
 * variétés distinctes, à faire aujourd'hui — none repeats the header's line.
 */
export const DEFAULT_KEY_FIGURES = ['free', 'occupancy', 'varieties', 'todo'] as const satisfies readonly KeyFigure[];

export function isKeyFigure(value: unknown): value is KeyFigure {
  return typeof value === 'string' && (KEY_FIGURES as readonly string[]).includes(value);
}

export interface KeyFiguresOptions {
  /**
   * Keys another build owns — read by nobody here, replaced by nobody here
   * (the lesson of `countersOptions`, Extension #4-11): the layout PUT
   * replaces the whole options document, so a key this build drops on read
   * is a newer build's setting erased on the next write.
   */
  [key: string]: unknown;
  /** The four figures, in the order the tiles read them: emplacement 1 to 4. */
  figures: KeyFigure[];
}

/** Whether `value` is four distinct known figures. */
function isSelection(value: unknown): value is KeyFigure[] {
  return (
    Array.isArray(value) &&
    value.length === KEY_FIGURES_SHOWN &&
    value.every(isKeyFigure) &&
    new Set(value).size === KEY_FIGURES_SHOWN
  );
}

/**
 * The band's options as the page reads them: the stored four when they are
 * four distinct known figures, the defaults otherwise — and every other key
 * carried as it came. Always a FRESH `figures` array: a caller may reorder it.
 */
export function keyFiguresOptions(options: Record<string, unknown> | null | undefined): KeyFiguresOptions {
  const stored = options?.figures;
  return {
    ...(options ?? {}),
    figures: isSelection(stored) ? [...stored] : [...DEFAULT_KEY_FIGURES],
  };
}
