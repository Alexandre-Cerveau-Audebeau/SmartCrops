/**
 * SMA-336 PR 2/5 — the two settings the frozen design gives the Counters widget
 * (artboard A8): « Plant photos » and « Garden ».
 *
 * They live on `DashboardBlock.options`, the free-form document PR 1/5 stored
 * and round-tripped without ever writing to it. Reading it back is the one place
 * that has to be careful: it is persisted JSON this build may not have written —
 * an older layout, a newer one, a hand-edited row — so every value is checked
 * rather than trusted, and anything unrecognised falls back to the default.
 */

import type {
  DashboardGardenData,
  DashboardTotals,
  DashboardVarietyData,
} from '../../../types/DashboardData';

/** The « all gardens » sentinel — the option's default. */
export const COUNTERS_GARDEN_ALL = 'all';

export interface CountersOptions {
  /**
   * Keys another build owns (round 6, Extension #4-11) — read by nobody here,
   * replaced by nobody here.
   *
   * The reader validated the two known keys and DROPPED everything else, and
   * both writers persisted that reduced object: a setting a newer build had
   * stored was gone from the server document the moment an older build — a
   * stale tab, the other half of a rolling deploy — touched the widget. The
   * document is free-form by design, so « validate the known keys, carry the
   * rest » is the honest reading of it; the layout PUT replaces the whole
   * options document, which is why carrying has to happen on READ.
   */
  [key: string]: unknown;
  /**
   * Show plant photos instead of colour pastilles.
   *
   * Off by default, and the frozen design draws both states on purpose. Photos
   * are twenty requests to a third party for images served at their original
   * size, and a quarter of the placed varieties have none — so the state that
   * always works is the one a user gets without asking.
   */
  photos: boolean;
  /** A garden id, or {@link COUNTERS_GARDEN_ALL}. */
  garden: string;
}

const DEFAULTS: CountersOptions = {
  photos: false,
  garden: COUNTERS_GARDEN_ALL,
};

export function countersOptions(
  options: Record<string, unknown> | null | undefined
): CountersOptions {
  if (!options) return { ...DEFAULTS };
  return {
    ...options,
    photos: options.photos === true,
    garden:
      typeof options.garden === 'string' && options.garden.length > 0
        ? options.garden
        : DEFAULTS.garden,
  };
}

/**
 * The garden filter that ACTUALLY applies, given the gardens that exist.
 *
 * A stored id whose garden has since been deleted resolves to « all » (round 1,
 * E8). The rule was written twice — `CountersOptionsPanel` for its select,
 * `CountersBlock` for its list — and two owners of one contract have to agree
 * for the select and the rows to describe the same state. It belongs here, next
 * to the reader that already validates this document, and both call sites are a
 * call.
 *
 * Falling back rather than showing nothing is the point on each side: MUI draws
 * an unmatched select value as an empty box the user cannot read, and a list
 * filtered on a garden that is gone is empty with no chip left to clear it.
 */
export function resolveCountersGarden(
  garden: string,
  gardens: readonly { readonly id: string }[]
): string {
  return garden !== COUNTERS_GARDEN_ALL &&
    gardens.some((candidate) => candidate.id === garden)
    ? garden
    : COUNTERS_GARDEN_ALL;
}

/**
 * Everything the Counters widget STATES, resolved once from the stored filter
 * (round 6, partie A).
 *
 * Three findings on two surfaces said the same thing in three places: the
 * garden filter was applied to the LIST and not to the NUMBERS. The header chip
 * printed `totals.varietyCount`, the Small card `totals.placementCount` and
 * `totals.varietyCount`, and every row `variety.count` — all four page-wide by
 * construction — so a widget narrowed to one garden counted every garden in its
 * chip, in its headline and in each « × N », while its list was filtered. The
 * round 5 fix of the gallery thumbnail (C4) had closed one such site on its own;
 * this closes the family: one function derives every figure from the one
 * filter, and no surface can state a number that did not pass through it.
 *
 * What each figure IS under a filter, so no caller has to decide it again:
 *
 * - `garden` — the filter that actually applies, after the deleted-garden
 *   fallback of {@link resolveCountersGarden};
 * - `varieties` — the rows the filter keeps, each with its `count` and `cells`
 *   RE-STATED for that garden alone. The aggregate groups placements by plant
 *   across every garden, so `variety.count` is a page-wide figure; on a filtered
 *   widget a variety planted once here and twice elsewhere must read « × 1 »,
 *   not « × 3 ». The garden's own `placements` are on the wire, and they are the
 *   same rows the server counted, so the figure is derived, never invented;
 * - `placementCount` — the Small card's big number: the garden's own
 *   `placementCount`, which the server computes as `Placements.Count` for that
 *   garden, or the page total;
 * - `varietyCount` — the chip, the « … of 536 in the catalog » line and the
 *   gallery thumbnail: the kept rows' length, so the chip and the list agree
 *   by construction. With no filter it is the aggregate's DISTINCT total
 *   (decision D11), never a sum of per-garden counts.
 *
 * Pure, and owned here beside the reader that validates the document, for the
 * reason `resolveCountersGarden` gives above: two owners of one contract have
 * to agree, and nothing makes them.
 */
export interface CountersFigures {
  garden: string;
  varieties: DashboardVarietyData[];
  placementCount: number;
  varietyCount: number;
}

export function resolveCountersFigures(
  options: Record<string, unknown> | null | undefined,
  gardens: readonly DashboardGardenData[],
  varieties: readonly DashboardVarietyData[],
  totals: DashboardTotals
): CountersFigures {
  const garden = resolveCountersGarden(countersOptions(options).garden, gardens);

  if (garden === COUNTERS_GARDEN_ALL) {
    return {
      garden,
      varieties: [...varieties],
      placementCount: totals.placementCount,
      varietyCount: totals.varietyCount,
    };
  }

  // Resolved above, so the garden exists; the guard keeps the function total
  // rather than trusting the resolver from a distance.
  const selected = gardens.find((candidate) => candidate.id === garden);
  if (!selected) {
    return {
      garden: COUNTERS_GARDEN_ALL,
      varieties: [...varieties],
      placementCount: totals.placementCount,
      varietyCount: totals.varietyCount,
    };
  }

  // ONE pass over the garden's placements, grouped by plant (round 7 — the
  // 🟠 Major inline of `556f0d0` and Extension #6-10 / #6-11, S16): each kept
  // variety scanned the whole array, so the resolver was O(varieties ×
  // placements), on every render by design, over an aggregate that carries
  // no ceiling. The map is read once per variety instead: linear in both.
  const byPlant = new Map<string, { count: number; cells: number }>();
  for (const placement of selected.placements) {
    const entry = byPlant.get(placement.plantId) ?? { count: 0, cells: 0 };
    entry.count += 1;
    entry.cells += placement.spanRows * placement.spanCols;
    byPlant.set(placement.plantId, entry);
  }

  const kept = varieties
    .filter((variety) => variety.gardenIds.includes(garden))
    .map((variety) => {
      const own = byPlant.get(variety.plantId) ?? { count: 0, cells: 0 };
      return { ...variety, count: own.count, cells: own.cells };
    });

  return {
    garden,
    varieties: kept,
    placementCount: selected.placementCount,
    varietyCount: kept.length,
  };
}

/**
 * Data LINES each size of the Counters widget may show — the density lock of
 * the frozen design (`_spec.md` § 4: « Un Moyen montre au plus 6 lignes », « Un
 * Grand montre au plus 10 lignes »).
 *
 * Lines, not varieties: eight varieties are four lines in two columns and eight
 * in one, which is the whole of V9. Section titles, group headings, footers and
 * « +N » links are explicitly outside the count — they belong to the card's
 * frame, not to the list.
 *
 * Here rather than in `CountersBlock.tsx` so the widget file exports components
 * only (react-refresh), and so a test can assert the lock without importing the
 * component.
 */
export const COUNTERS_LINE_CAP = { medium: 6, large: 10 } as const;

/**
 * What each size LISTS before « +N », and over how many columns — beside the
 * lock it has to satisfy (round 7, S29 — Extension #7-10). The widget declared
 * these four numbers on its own and never read the cap: the lock held only
 * because 8 / 2 and 19 / 2 happen to fit, and with two sections the worst case
 * is `ceil(edible / c) + ceil(ornamental / c)` — 5 lines for 8 varieties, and
 * exactly 10 for 19 because 19 is odd and the two halves cannot both round up.
 * That parity argument sat in nobody's code. `worstCaseLines` states it, and
 * one test holds these numbers to the cap.
 *
 * Medium: `_spec.md` § 4, « Compteurs 4 × 2 = 8 variétés + « +18 variétés » »
 * — two columns of four (V9: eight in ONE column were eight lines on a card
 * that allows six). Large: « les 19 potagères en deux colonnes ».
 */
export const COUNTERS_LIST = {
  medium: { varieties: 8, columns: 2 },
  large: { varieties: 19, columns: 2 },
} as const;

/**
 * The most data lines `varieties` rows can take over `columns` when they are
 * split into two sections that each round their last row up.
 *
 * The maximum over every split, computed as such (round 8 — Extension #9-15).
 * Round 7 wrote the two-column answer in closed form —
 * `ceil(v / c) + (v % c === 0 ? 1 : 0)` — and that form is exact ONLY for two
 * columns: over three, five varieties split 1 / 4 take 1 + 2 = 3 lines where
 * it said 2, and for zero varieties it said 1 line. Both sizes the product
 * has are two columns, so nothing on screen was wrong; the exported function
 * promised the general case and did not keep it. The loop below is the
 * definition itself: a section of `first` rows and one of the rest, each
 * rounding its last line up, over every `first` from none to all. At most
 * twenty varieties, so the cost is nothing.
 */
export const worstCaseLines = (varieties: number, columns: number): number => {
  let lines = 0;
  for (let first = 0; first <= varieties; first++) {
    lines = Math.max(
      lines,
      Math.ceil(first / columns) + Math.ceil((varieties - first) / columns)
    );
  }
  return lines;
};
