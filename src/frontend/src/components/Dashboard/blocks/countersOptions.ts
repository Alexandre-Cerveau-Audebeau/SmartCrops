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

  const kept = varieties
    .filter((variety) => variety.gardenIds.includes(garden))
    .map((variety) => {
      const own = selected.placements.filter(
        (placement) => placement.plantId === variety.plantId
      );
      return {
        ...variety,
        count: own.length,
        cells: own.reduce(
          (sum, placement) => sum + placement.spanRows * placement.spanCols,
          0
        ),
      };
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
