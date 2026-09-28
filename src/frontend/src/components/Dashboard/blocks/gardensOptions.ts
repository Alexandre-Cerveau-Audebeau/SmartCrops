/**
 * SMA-448, lot F5-a — the settings of the Gardens widget (V3-04; A-N3, A-N4,
 * A-N5, A-N6 — decided by Alexandre on 28/09): how many gardens the widget
 * shows and in which order, stored on its `DashboardBlock.options` as
 * `{ count, sort }`, and the rules the widget applies to them — the five sorts,
 * the cap, the search.
 *
 * Reading the document back is the one careful place, on the model of
 * `countersOptions` and `keyFiguresOptions`: it is persisted JSON this build
 * may not have written, so every value is checked rather than trusted, and
 * every key another build owns is carried as it came. The server refuses what
 * is not of the list or not of the formula on write (`DashboardController`,
 * `ValidateGardens`) and drops it on read (`Readable`); this reader is the half
 * that keeps a page drawable whatever came back — and the SORTS a formula
 * offers come from the served capabilities (`FormulaCapabilities.gardenSorts`),
 * never from a table of this client's (R8).
 */

import {
  DEFAULT_GARDEN_SORT,
  GARDENS_COUNTS,
  GARDENS_COUNT_ALL,
  isGardenSort,
  type GardenSort,
  type GardensCount,
} from '../../../types/Dashboard';
import type { DashboardGardenData } from '../../../types/DashboardData';

export interface GardensOptions {
  /** Keys another build owns — read by nobody here, replaced by nobody here (the lesson of `countersOptions`). */
  [key: string]: unknown;
  /**
   * The number chosen — 5, 8, 10 or « all » — or NULL when the user never
   * chose: the widget then shows its DEFAULT, 8 on a desktop and 5 on a phone
   * (contract v3 § 4.7 d); once chosen, the choice holds on every screen.
   */
  count: GardensCount | null;
  /** The sort, one the formula serves; the default when the stored one is not. */
  sort: GardenSort;
}

/** Whether `value` is 5, 8, 10 or « all ». */
export function isGardensCount(value: unknown): value is GardensCount {
  return (
    value === GARDENS_COUNT_ALL ||
    (typeof value === 'number' && (GARDENS_COUNTS as readonly number[]).includes(value))
  );
}

/**
 * The widget's options as the page reads them: the stored count when it is one
 * of the list, null otherwise; the stored sort when the formula SERVES it, the
 * default otherwise — « Derniers ouverts » when the formula has it, its first
 * sort if not; and every other key carried as it came.
 */
export function gardensOptions(
  options: Record<string, unknown> | null | undefined,
  served: readonly GardenSort[]
): GardensOptions {
  const stored = options?.sort;
  const sort =
    typeof stored === 'string' && isGardenSort(stored) && served.includes(stored)
      ? stored
      : served.includes(DEFAULT_GARDEN_SORT)
        ? DEFAULT_GARDEN_SORT
        : (served[0] ?? DEFAULT_GARDEN_SORT);
  return {
    ...(options ?? {}),
    count: isGardensCount(options?.count) ? options.count : null,
    sort,
  };
}

/** The number the widget shows when the user never chose: 8 on a desktop, 5 on a phone (§ 4.7 d). */
export function defaultGardensCount(phone: boolean): GardensCount {
  return phone ? 5 : 8;
}

/** The cap a count puts on the list — null for « all ». */
export function gardensCap(count: GardensCount): number | null {
  return count === GARDENS_COUNT_ALL ? null : count;
}

/** A wire instant as a number, or −∞ when it cannot be read — the guard of `GardensBlock` (round 7, S30). */
const instant = (value: string | null): number => {
  if (value === null) return -Infinity;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? -Infinity : parsed;
};

/** Newest first on `key`, then by id — a total order, so two renders never disagree. */
const newestFirst =
  (key: (garden: DashboardGardenData) => number) =>
  (a: DashboardGardenData, b: DashboardGardenData): number =>
    key(b) - key(a) || a.id.localeCompare(b.id);

/**
 * « Derniers ouverts »: the last opening, or the last modification for a
 * garden never opened (the fallback of 23/09; A-N6) — reading α of the
 * pre-flight: with the column empty, exactly « dernière modification ».
 */
const byLastOpened = newestFirst((garden) => instant(garden.lastOpenedAt ?? garden.updatedAt));

/** « Date de création »: the most recently created first. */
const byCreated = newestFirst((garden) => instant(garden.createdAt));

/** « Dernière modification »: the most recently modified first. */
const byUpdated = newestFirst((garden) => instant(garden.updatedAt));

/**
 * « Ordre alphabétique »: A to Z, blind to case and to accents — the `byName`
 * rule of the calendar (`sensitivity: 'base'`), the locale the page's own.
 */
const byName =
  (language: string) =>
  (a: DashboardGardenData, b: DashboardGardenData): number =>
    a.name.localeCompare(b.name, language, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/**
 * « Ordre personnalisé » (A-N5): the gardens NOT yet ranked first — a garden
 * created after the order was set enters at the HEAD without any write, the
 * newest of them first —, then by their place, then by creation for two
 * gardens at one place. With a LOCAL order (`order`, the ids the panel is
 * moving, not yet or just written), the same rule reads the ids: absent from
 * the list first, then in the list's order — so a garden created while the
 * panel is open takes the head too, and a deleted id is simply not found.
 */
const byCustom =
  (order: readonly string[] | null) =>
  (a: DashboardGardenData, b: DashboardGardenData): number => {
    const place = (garden: DashboardGardenData): number | null => {
      if (order !== null) {
        const index = order.indexOf(garden.id);
        return index < 0 ? null : index;
      }
      return garden.sortOrder;
    };
    const pa = place(a);
    const pb = place(b);
    if (pa === null && pb === null) return byCreated(a, b);
    if (pa === null) return -1;
    if (pb === null) return 1;
    return pa - pb || byCreated(a, b);
  };

/**
 * The gardens in the order the widget shows them — a FRESH array, the one given
 * untouched. `order` is the page's local custom order, read only under
 * `custom` (see {@link byCustom}).
 */
export function sortGardens(
  gardens: readonly DashboardGardenData[],
  sort: GardenSort,
  language: string,
  order: readonly string[] | null = null
): DashboardGardenData[] {
  const compare = (() => {
    switch (sort) {
      case 'name':
        return byName(language);
      case 'created':
        return byCreated;
      case 'updated':
        return byUpdated;
      case 'custom':
        return byCustom(order);
      case 'lastOpened':
        return byLastOpened;
    }
  })();
  return [...gardens].sort(compare);
}

/** The ids of the gardens in the account's custom order, as the server holds it — what the gear panel lists and moves. */
export function customOrderIds(gardens: readonly DashboardGardenData[], order: readonly string[] | null = null): string[] {
  return sortGardens(gardens, 'custom', 'en', order).map((garden) => garden.id);
}

/**
 * A name as the search reads it: lower-cased, its accents removed (NFD, the
 * combining marks dropped), trimmed — « aveugle aux majuscules et aux
 * accents » (V3-04).
 */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * The gardens whose name contains `query` — ALL of them, the hidden ones
 * included (« hors des N affichés »), in the order given; every garden for an
 * empty query.
 */
export function searchGardens(gardens: readonly DashboardGardenData[], query: string): DashboardGardenData[] {
  const key = searchKey(query);
  if (key.length === 0) return [...gardens];
  return gardens.filter((garden) => searchKey(garden.name).includes(key));
}
