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
 * - anything else (unknown month, free-form like `"Spring"`, 3+ segments) → the
 *   ORIGINAL `raw` string verbatim, so an unmapped value never shows a raw i18n
 *   key and never throws.
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

export function formatPeriod(raw: string | null | undefined, t: TFunction): string | null {
  if (raw == null) return null;
  const norm = raw.trim().toLowerCase();
  if (norm === '') return null;

  if (norm === 'year-round') return t('periods.yearRound');

  const parts = norm.split('-').map((p) => p.trim());

  if (parts.length === 2 && MONTH_SET.has(parts[0]) && MONTH_SET.has(parts[1])) {
    return t('periods.range', {
      from: t(`periods.months.${parts[0]}`),
      to: t(`periods.months.${parts[1]}`),
    });
  }

  if (parts.length === 1 && MONTH_SET.has(parts[0])) {
    return t(`periods.months.${parts[0]}`);
  }

  // Unknown month / free-form / unexpected shape: show the source verbatim.
  return raw;
}
