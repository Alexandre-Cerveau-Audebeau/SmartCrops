/**
 * SMA-414 — date helpers for the admin dashboard. Native `Intl` only (no
 * date library, by decision): relative wording through
 * `Intl.RelativeTimeFormat(language, { numeric: 'auto' })` up to
 * {@link RELATIVE_WINDOW_DAYS}, a short localized date beyond.
 */

export const RELATIVE_WINDOW_DAYS = 30;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `'long'` → « il y a 4 jours » ; `'short'` → « il y a 4 j » (mobile cards). */
export type RelativeStyle = 'long' | 'short';

/** Whole days elapsed from `date` to `now` (negative when `date` is ahead). */
export function daysBetween(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

/** True when {@link formatRelativeDate} would answer with relative wording. */
export function isWithinRelativeWindow(date: Date, now: Date): boolean {
  return daysBetween(date, now) <= RELATIVE_WINDOW_DAYS;
}

/** « 12 juin » / "Jun 12". */
export function formatShortDate(date: Date, language: string): string {
  return date.toLocaleDateString(language, { day: 'numeric', month: 'short' });
}

/** « 30 août 2026 » / "August 30, 2026". */
export function formatLongDate(date: Date, language: string): string {
  return date.toLocaleDateString(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** « lundi 31 août, 22:40 » / "Monday, August 31, 10:40 PM" — the meta line. */
export function formatDateTimeMeta(date: Date, language: string): string {
  const day = date.toLocaleDateString(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const time = date.toLocaleTimeString(language, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day}, ${time}`;
}

/**
 * Relative wording up to 30 days (minutes → hours → days → weeks from 14
 * days), then the short date. `numeric: 'auto'` yields « hier » / "yesterday"
 * for one day, « aujourd'hui » for a date ahead of `now` (clock skew).
 */
export function formatRelativeDate(
  date: Date,
  now: Date,
  language: string,
  style: RelativeStyle = 'long'
): string {
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / DAY_MS);
  if (days > RELATIVE_WINDOW_DAYS) return formatShortDate(date, language);

  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style });
  if (diffMs < 0) return rtf.format(0, 'day');
  if (days >= 14) return rtf.format(-Math.floor(days / 7), 'week');
  if (days >= 1) return rtf.format(-days, 'day');
  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours >= 1) return rtf.format(-hours, 'hour');
  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes >= 1) return rtf.format(-minutes, 'minute');
  return rtf.format(0, 'second');
}
