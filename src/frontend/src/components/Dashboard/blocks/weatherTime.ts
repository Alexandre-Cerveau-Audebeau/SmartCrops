import type { WeatherDay, WeatherHour, WeatherLocation } from '../../../types/DashboardWeather';
import { capitalizeFirst } from '../../../utils/capitalizeFirst';

/**
 * SMA-336 PR 3b/5 — dates and hours of a PLACE, never of the browser.
 *
 * The provider writes every instant of a place in that place's own local time
 * — `day.date` « 2026-09-12 », `hour.time` and `localTime` « 2026-09-12 14:30 »
 * — so the widget needs no time zone to place a slot (pre-flight § A.2-ter).
 * Two rules follow, and this module is where they are kept:
 *
 * 1. A day is built from its COMPONENTS, `new Date(y, m − 1, d)`, and NEVER
 *    by handing the ISO text « 2026-09-12 » to the Date constructor: the
 *    date-only form parses as UTC midnight, which any browser west of
 *    Greenwich reads back as the evening BEFORE — « Jeu. » would print as
 *    « Mer. » in Montréal. The components form is a local midnight wherever
 *    the browser is, so the weekday is the date's own. `weatherTime.test.ts`
 *    pins this with the clock set west.
 * 2. « Now » is the place's `localTime`, never `new Date()`: at 21:00 in Lyon
 *    the six slots are 21 h … 02 h whatever the reader's clock says.
 *
 * Native `Intl` only — the « no date library » decision of `formatRelativeDate`.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** « yyyy-MM-dd » → a LOCAL midnight, or null when the text is not a date. */
export function parseLocalDate(date: string): Date | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const built = new Date(year, month - 1, day);
  // A rolled-over day (« 2026-02-30 ») is refused rather than silently March.
  return built.getMonth() === month - 1 && built.getDate() === day ? built : null;
}

/** The date, hour and minute of « yyyy-MM-dd HH:mm », or null. */
export function parseLocalDateTime(
  value: string
): { date: string; hour: number; minute: number } | null {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return null;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return parseLocalDate(date) ? { date, hour, minute } : null;
}

/** The place's own « today », from its `localTime`; null when the place has none. */
export function localDateOf(location: WeatherLocation): string | null {
  return location.localTime ? (parseLocalDateTime(location.localTime)?.date ?? null) : null;
}

/** The hour 0..23 of the place's `localTime`; null when unknown. */
export function localHourOf(location: WeatherLocation): number | null {
  return location.localTime ? (parseLocalDateTime(location.localTime)?.hour ?? null) : null;
}

/**
 * « Sam. » / « Sat » — `Intl.DateTimeFormat(lang, { weekday: 'short' })` on
 * the date's own local midnight, capitalised the way the artboard writes it
 * (« Mar. », « Jeu. »).
 */
export function weekdayShort(date: string, language: string): string | null {
  const built = parseLocalDate(date);
  if (!built) return null;
  return capitalizeFirst(
    new Intl.DateTimeFormat(language, { weekday: 'short' }).format(built)
  );
}

/** « jeudi » / « Thursday » — for the chips and the tasks (« Vent fort jeudi »). */
export function weekdayLong(date: string, language: string): string | null {
  const built = parseLocalDate(date);
  if (!built) return null;
  return new Intl.DateTimeFormat(language, { weekday: 'long' }).format(built);
}

/**
 * « 13 h » / « 1 PM » — the hour of a slot, in the language's own notation,
 * from the slot's local components.
 */
export function hourLabel(time: string, language: string): string | null {
  const parts = parseLocalDateTime(time);
  if (!parts) return null;
  // A UTC sentinel, formatted IN UTC (round 1, G9 — GitHub 4008082551). Built
  // as a browser-local date, a slot the PLACE wrote as « 02:00 » does not
  // exist on the day the BROWSER's zone springs forward, and `setHours(2)`
  // normalised it to 03:00 — one wrong label among the six, once a year, in
  // another zone than the place's. UTC has no gap, and the date of the
  // sentinel is irrelevant: only the hour and the minute are printed.
  const built = new Date(Date.UTC(2000, 0, 1, parts.hour, parts.minute));
  return new Intl.DateTimeFormat(language, { hour: 'numeric', timeZone: 'UTC' }).format(built);
}

/** The hour 0..23 written in a slot's own `time`, or null. */
export function hourOf(hour: WeatherHour): number | null {
  return parseLocalDateTime(hour.time)?.hour ?? null;
}

/**
 * The `count` consecutive slots from the place's current hour, over
 * `days[0].hours ∪ days[1].hours` — the second day is why the server sends 48
 * hours: at 21 h the six slots are 21, 22, 23, 00, 01, 02 (pre-flight § D.2).
 *
 * The comparison is on the provider's own fixed « yyyy-MM-dd HH:mm » text,
 * which orders lexicographically as it orders in time — no Date is built.
 * Without a `localTime` the first `count` slots of the day are shown.
 */
export function upcomingHours(location: WeatherLocation, count = 6): WeatherHour[] {
  const pool = [...(location.days[0]?.hours ?? []), ...(location.days[1]?.hours ?? [])].sort(
    (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)
  );
  const now = location.localTime ? parseLocalDateTime(location.localTime) : null;
  if (!now) return pool.slice(0, count);
  const floor = `${now.date} ${String(now.hour).padStart(2, '0')}:00`;
  return pool.filter((hour) => hour.time >= floor).slice(0, count);
}

/**
 * The scale of the WEEK — the lowest minimum and the highest maximum over the
 * days — on which every min–max bar of the widget is drawn (`_spec.md` § 6:
 * « barre min–max épaisse 8 px sur l'échelle 9° → 29° »). Null without a day.
 */
export function weekScale(days: readonly WeatherDay[]): { min: number; max: number } | null {
  if (days.length === 0) return null;
  return {
    min: Math.min(...days.map((day) => day.minTempC)),
    max: Math.max(...days.map((day) => day.maxTempC)),
  };
}

/**
 * Where a day's bar starts and ends on the week's scale, as the two TRACK
 * masks the artboard lays over the gradient — `left` is the width in per cent
 * of the mask before the bar, `right` the width of the mask after it
 * (`<i style="left: 0; width: 35%">` and `<i style="left: 100%; right: 0">`).
 * A flat week (one temperature all week) draws a full bar.
 */
export function barMasks(
  day: WeatherDay,
  scale: { min: number; max: number }
): { left: number; right: number } {
  const span = scale.max - scale.min;
  if (span <= 0) return { left: 0, right: 0 };
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return {
    left: clamp(((day.minTempC - scale.min) / span) * 100),
    right: clamp(((scale.max - day.maxTempC) / span) * 100),
  };
}
