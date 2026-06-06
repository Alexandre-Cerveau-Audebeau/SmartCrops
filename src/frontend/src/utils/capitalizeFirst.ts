/**
 * SMA-120 (display only): capitalise the FIRST character of a value, leaving the
 * rest untouched (sentence case — NOT title-case). Common names from Trefle/Perenual
 * are often lower-case ("trident maple", "érable trident"); title-casing would break
 * French ("Érable Trident" is wrong), so only the first letter is upper-cased and any
 * existing internal capitals are preserved ("Japanese maple" stays as-is).
 *
 * Unicode-safe via the spread operator so a leading accented letter (e.g. "é" → "É")
 * and astral code points are handled correctly. Returns null for null/empty/whitespace.
 */
export function capitalizeFirst(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) return null;
  const chars = [...value];
  if (chars.length === 0) return null;
  return chars[0].toLocaleUpperCase() + chars.slice(1).join('');
}
