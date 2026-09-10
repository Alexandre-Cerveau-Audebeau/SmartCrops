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

/** The « all gardens » sentinel — the option's default. */
export const COUNTERS_GARDEN_ALL = 'all';

export interface CountersOptions {
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
