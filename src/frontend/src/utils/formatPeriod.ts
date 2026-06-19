import type { TFunction } from 'i18next';

/**
 * SMA-131 — localise the denormalised EN sowing/harvest period strings shown on
 * the plant detail page. The ETL stores them as lowercase month-range tokens
 * (`"february-may"`, `"june"`) or the literal `"year-round"`; the frontend rendered
 * them raw, leaking English in FR mode.
 *
 * Resolution:
 * - `null`/blank → `null` (caller hides the row).
 * - `"year-round"` → `periods.yearRound`.
 * - `"<month>-<month>"` with BOTH months known → `periods.range` ({{from}}/{{to}}).
 * - single known `"<month>"` → that month.
 * - single known season word (`"spring"`, `"fall"`…) → `periods.seasons.*`
 *   (Perenual stores floweringSeason/harvestSeason this way).
 * - anything else (unknown token, free-form, 3+ segments) → the ORIGINAL `raw`
 *   string verbatim, so an unmapped value never shows a raw i18n key or throws.
 */
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const MONTH_SET: ReadonlySet<string> = new Set(MONTHS);

// Perenual stores floweringSeason/harvestSeason as season words (Spring, Fall…).
// `fall` and `autumn` both map to "Automne" in FR (intentional).
const SEASONS = ['spring', 'summer', 'autumn', 'fall', 'winter'] as const;
const SEASON_SET: ReadonlySet<string> = new Set(SEASONS);

export function formatPeriod(
  raw: string | null | undefined,
  t: TFunction
): string | null {
  if (raw == null) return null;
  const norm = raw.trim().toLowerCase();
  if (norm === '') return null;

  if (norm === 'year-round') return t('periods.yearRound');

  const parts = norm.split('-').map((p) => p.trim());

  if (
    parts.length === 2 &&
    MONTH_SET.has(parts[0]) &&
    MONTH_SET.has(parts[1])
  ) {
    return t('periods.range', {
      from: t(`periods.months.${parts[0]}`),
      to: t(`periods.months.${parts[1]}`),
    });
  }

  if (parts.length === 1 && MONTH_SET.has(parts[0])) {
    return t(`periods.months.${parts[0]}`);
  }

  if (parts.length === 1 && SEASON_SET.has(parts[0])) {
    return t(`periods.seasons.${parts[0]}`);
  }

  // Unknown month/season / free-form / unexpected shape: show the source verbatim.
  return raw;
}

// Season → 1-based month indices (Northern hemisphere). `fall` == `autumn`.
const SEASON_MONTHS: Readonly<Record<string, readonly number[]>> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  fall: [9, 10, 11],
  winter: [12, 1, 2],
};

/**
 * SMA-78 — map a denormalised period/season string to the 1-based month indices
 * (1=Jan … 12=Dec) it covers, for the 12-month seasonal calendar timeline.
 * - `"year-round"` → all 12 months.
 * - `"<month>-<month>"` (EN month names) → inclusive span, wrapping past December
 *   when from > to (e.g. `"november-february"` → 11, 12, 1, 2).
 * - single `"<month>"` → that one month.
 * - season word (spring/summer/autumn/fall/winter) → its months.
 * - `null` / blank / unknown token → `[]` (empty track — caller renders no bar).
 * Pure and unit-agnostic; mirrors {@link formatPeriod}'s parsing rules.
 */
export function periodToMonths(raw: string | null | undefined): number[] {
  if (raw == null) return [];
  const norm = raw.trim().toLowerCase();
  if (norm === '') return [];
  if (norm === 'year-round') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const parts = norm.split('-').map((p) => p.trim());
  const monthIndex = (m: string): number =>
    (MONTHS as readonly string[]).indexOf(m) + 1;

  if (
    parts.length === 2 &&
    MONTH_SET.has(parts[0]) &&
    MONTH_SET.has(parts[1])
  ) {
    const from = monthIndex(parts[0]);
    const to = monthIndex(parts[1]);
    const out: number[] = [];
    let m = from;
    // Inclusive walk from `from` to `to`, wrapping December → January.
    for (let i = 0; i < 12; i++) {
      out.push(m);
      if (m === to) break;
      m = m === 12 ? 1 : m + 1;
    }
    return out;
  }
  if (parts.length === 1 && MONTH_SET.has(parts[0])) {
    return [monthIndex(parts[0])];
  }
  if (parts.length === 1 && SEASON_MONTHS[parts[0]]) {
    return [...SEASON_MONTHS[parts[0]]];
  }
  return [];
}
