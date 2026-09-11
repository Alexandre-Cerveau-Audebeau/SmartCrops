/**
 * SMA-336 PR 2/5, round 1 (G5) — numbers in the language the page is in.
 *
 * `toFixed` and string concatenation both write a number the way JavaScript
 * writes it, not the way the reader's language does: `toFixed(1)` always emits a
 * point, so the French Statistics widget printed « 1.8 m² » where French uses a
 * comma, and a four-digit cell count came out « 1440 » where French groups it as
 * « 1 440 ». `Intl.NumberFormat` is already how the Library formats its range
 * facets (`facetVocabularies.formatRangeValue`); this is the same rule, factored
 * out for the three dashboard widgets that all interpolate figures into i18n
 * strings.
 *
 * Both helpers take the language explicitly rather than reading a global: they
 * are pure, and every dashboard caller already holds `i18n.language`.
 */

/**
 * One formatter per (language, digits), built on first use (round 6, Extension
 * #4-20). Each call used to construct an `Intl.NumberFormat`, and the Gardens
 * table and the Statistics rows format a figure per cell per render.
 * `digits` is the whole option set both helpers vary on, so it is the key.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(
  language: string,
  digits: number,
  style: 'decimal' | 'percent' = 'decimal'
): Intl.NumberFormat {
  const key = `${language}|${digits}|${style}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(language, {
      style,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/** A whole number, grouped for the locale — « 1 440 » in French, « 1,440 » in English. */
export function formatCount(value: number, language: string): string {
  return formatterFor(language, 0).format(value);
}

/**
 * A decimal with exactly `digits` fractional places, in the locale's own
 * notation — « 1,8 » in French, « 1.8 » in English.
 */
export function formatDecimal(
  value: number,
  language: string,
  digits: number
): string {
  return formatterFor(language, digits).format(value);
}

/**
 * A whole percentage, written the way the language writes one (round 7, S46 —
 * Extension #8-8): « 17 % » in French, with the NON-BREAKING space the locale
 * puts before its sign, « 17% » in English, with none. The two widgets that
 * print one concatenated the figure and an ordinary space: neither language's
 * rule, and a break opportunity wherever `nowrap` was not declared.
 *
 * `value` is the percentage itself (0–100), as every caller already holds it;
 * `Intl` takes a ratio.
 */
export function formatPercent(value: number, language: string): string {
  return formatterFor(language, 0, 'percent').format(value / 100);
}
