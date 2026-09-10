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

/** A whole number, grouped for the locale — « 1 440 » in French, « 1,440 » in English. */
export function formatCount(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
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
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
