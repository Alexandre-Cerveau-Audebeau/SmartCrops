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
