import type { DashboardGardenData, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import { periodToMonths } from '../../../utils/formatPeriod';
import { parseLocalDateTime } from './weatherTime';

/**
 * SMA-336 PR 4a/5 — the plant calendar, PURE: what the catalog says a variety
 * does in which month, and which month « this month » is for a garden and for
 * the block (pre-flight § C, decisions T1, T9, arbitrages Q9, Q10, Q13).
 *
 * ONE source feeds two horizons: `todoTasks` asks it for TODAY's pruning and
 * sowing tasks per garden, `monthCalendar` for the month's counts and grid per
 * variety. Neither re-parses a catalog string: every month list comes from
 * {@link periodToMonths}, the parser the plant detail page already owns (T1 —
 * the server transports the strings verbatim, decision D9), applied token by
 * token to the comma-separated `pruningMonths`. No parser is added here: the
 * 102 forms of that column measured in the pre-flight are all month names.
 *
 * Every catalog source is written for the NORTHERN hemisphere (Perenual's
 * months, the legacy « march-may » tokens, the season words). A garden of the
 * southern hemisphere reads them shifted by six months (Q9); a garden with no
 * hemisphere reads them as they are — the exposure engine's own default
 * (`exposure.ts`, `normalizeHemisphere`).
 */

/** 1 = January … 12 = December. */
export type Month = number;

/** The twelve months, in order — the columns of the Large grid. */
export const MONTHS_OF_YEAR: readonly Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** A month of a year, as the clock of a place or of a browser names it. */
export interface YearMonth {
  year: number;
  month: Month;
}

/**
 * Where « now » comes from when a garden reads no place: the browser's own
 * clock, injected so a test pins the month without touching a fixture — the
 * `LocalClock` rule of `todoTasks.ts`, applied to the calendar. The ONE place
 * of this lot that builds a Date from nothing, and named for it: a pure
 * function never calls `new Date()` on its own.
 */
export type BrowserClock = () => Date;

export const browserClock: BrowserClock = () => new Date();

/** The four lanes of the grid, in the artboard's legend order (`A3Expert.dc.html` l. 337). */
export const CALENDAR_LANES = ['prune', 'sow', 'flower', 'harvest'] as const;

export type CalendarLane = (typeof CALENDAR_LANES)[number];

/** The months a variety spends in each lane — sorted and unique per lane. */
export type LaneMonths = Record<CalendarLane, Month[]>;

/**
 * The months of a comma-separated Perenual list (« February,March,April »,
 * « March,April,August,May », « December,January,February ») — unique, in
 * calendar order, whatever the stored order. A token the parser does not know
 * contributes nothing; null or blank is an empty list.
 */
export function pruneMonthsOf(csv: string | null | undefined): Month[] {
  if (!csv) return [];
  return unique(csv.split(',').flatMap((token) => periodToMonths(token)));
}

/**
 * The months of a legacy catalog token (« march-may », « november-march »,
 * « year-round », « june ») in WALK order — « november-march » is
 * [11, 12, 1, 2, 3], so its last element is the last month of the window. The
 * parsing is {@link periodToMonths}'s, untouched.
 */
export function periodMonthsOf(token: string | null | undefined): Month[] {
  return periodToMonths(token);
}

/**
 * The months of a season word (Spring / Summer / Autumn / Fall / Winter) —
 * {@link periodToMonths} owns the season table (`fall` is `autumn`), so this
 * is the same call under the name the two season fields read it by.
 */
export function seasonMonthsOf(word: string | null | undefined): Month[] {
  return periodToMonths(word);
}

/**
 * A month list read from a garden of the given hemisphere (arbitrage Q9): the
 * catalog is northern, so « S » shifts every month by six; « N », null or
 * anything else reads it as is — the exposure engine's default. The ORDER is
 * preserved, so a walk stays a walk and {@link lastMonthOf} still applies.
 */
export function shiftForHemisphere(months: readonly Month[], hemisphere: string | null): Month[] {
  if (hemisphere !== 'S') return [...months];
  return months.map((month) => ((month + 5) % 12) + 1);
}

/**
 * The LAST month of a window in walk order — the « dernier mois de semis » of
 * the sowing task (Q11). Null for an empty window and for a year-round one:
 * twelve months have no last one.
 */
export function lastMonthOf(window: readonly Month[]): Month | null {
  if (window.length === 0 || window.length >= 12) return null;
  return window[window.length - 1]!;
}

/**
 * The four lanes of a variety, read from a garden of the given hemisphere.
 * `sow` and `harvest` keep the walk order of their token (a last month is a
 * meaningful thing there); `prune` and `flower` are calendar-ordered.
 *
 * Harvest reads the legacy token FIRST and the season word otherwise — the
 * combination the plant detail calendar applies (`LifecycleSection.tsx`).
 */
export function lanesOf(variety: DashboardVarietyData, hemisphere: string | null): LaneMonths {
  const shift = (months: Month[]) => shiftForHemisphere(months, hemisphere);
  return {
    prune: shift(pruneMonthsOf(variety.pruningMonths)),
    sow: shift(periodMonthsOf(variety.sowingPeriod)),
    flower: shift(seasonMonthsOf(variety.floweringSeason)),
    harvest: shift(
      variety.harvestPeriod?.trim()
        ? periodMonthsOf(variety.harvestPeriod)
        : seasonMonthsOf(variety.harvestSeason)
    ),
  };
}

/** The year and month of a Date, in the clock's own local time. */
export function yearMonthOf(date: Date): YearMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** The month a place is in, from its own `localTime`; null when the aggregate has no place or no clock for the garden. */
export function placeMonthOf(gardenId: string, weather: DashboardWeatherData): YearMonth | null {
  const link = weather.gardens.find((entry) => entry.gardenId === gardenId);
  if (!link?.locationKey) return null;
  const location = weather.locations.find((place) => place.key === link.locationKey);
  const stamp = location?.localTime ? parseLocalDateTime(location.localTime) : null;
  if (!stamp) return null;
  const [year, month] = stamp.date.split('-').map(Number);
  return { year: year!, month: month! };
}

/**
 * « This month » for ONE garden (Q10): its place's month when it reads a place
 * with a clock, the browser's otherwise. The tasks of « À faire » are dated by
 * this — a garden in Sydney prunes in Sydney's month.
 */
export function monthOfGarden(
  garden: DashboardGardenData,
  weather: DashboardWeatherData,
  clock: BrowserClock = browserClock
): YearMonth {
  return placeMonthOf(garden.id, weather) ?? yearMonthOf(clock());
}

/**
 * « This month » for the BLOCK (Q10): the places' month when every located
 * garden agrees on one, the browser's otherwise — no located garden, or two
 * places straddling a month end for a few hours. ONE month for the header, the
 * counts and the grid: a calendar with two current months would be two
 * calendars.
 */
export function blockMonth(
  gardens: readonly DashboardGardenData[],
  weather: DashboardWeatherData,
  clock: BrowserClock = browserClock
): YearMonth {
  const placeMonths = new Map<string, YearMonth>();
  for (const garden of gardens) {
    const placed = placeMonthOf(garden.id, weather);
    if (placed) placeMonths.set(`${placed.year}-${placed.month}`, placed);
  }
  if (placeMonths.size === 1) return [...placeMonths.values()][0]!;
  return yearMonthOf(clock());
}

/** One variety of the calendar: its lanes, merged over the gardens that hold it. */
export interface VarietyCalendar {
  variety: DashboardVarietyData;
  lanes: LaneMonths;
  /** True when at least one lane holds a month — the variety HAS a calendar. */
  known: boolean;
  /** The lane it is active in this month, in legend order; null when idle. Drives the Q13 sort. */
  activeLane: CalendarLane | null;
}

/** What `monthCalendar` derives — the ONE source of the chip, the three counters, the names, the grid and the gallery thumbnail. */
export interface MonthCalendar {
  month: YearMonth;
  /** EVERY placed variety with a calendar, in the Q13 order: active this month (prune, sow, flower, harvest), then placements, then name. */
  known: VarietyCalendar[];
  /** The placed varieties no lane knows anything about — « Pas de calendrier connu pour N variétés » (D2: counted, never assumed). */
  unknown: DashboardVarietyData[];
  /** DISTINCT varieties active this month, per lane (`_spec.md` § 7: the counts are varieties, never placements). */
  active: Record<CalendarLane, VarietyCalendar[]>;
}

/** The name a variety is listed and sorted by — the localised common name, the botanical one when there is none. */
export function varietyName(variety: DashboardVarietyData): string {
  return variety.commonName ?? variety.scientificName;
}

/**
 * The calendar of the month for every placed variety (T9).
 *
 * The lanes are read per (variety, garden) — each garden's hemisphere shifts
 * the catalog's northern months (Q9) — and MERGED per variety, since the block
 * is variety-centric: a thyme on a northern terrace and on a southern balcony
 * prunes in both windows. A garden a variety names but the aggregate does not
 * hold reads as northern. The counts are DISTINCT varieties: a basil planted
 * in two gardens is one basil (the D11 rule of the totals).
 */
export function monthCalendar(
  gardens: readonly DashboardGardenData[],
  varieties: readonly DashboardVarietyData[],
  weather: DashboardWeatherData,
  clock: BrowserClock = browserClock
): MonthCalendar {
  const month = blockMonth(gardens, weather, clock);
  const hemisphereOf = new Map(gardens.map((garden) => [garden.id, garden.config.hemisphere]));

  const known: VarietyCalendar[] = [];
  const unknown: DashboardVarietyData[] = [];
  const active: Record<CalendarLane, VarietyCalendar[]> = { prune: [], sow: [], flower: [], harvest: [] };

  for (const variety of varieties) {
    const hemispheres = variety.gardenIds.length > 0
      ? variety.gardenIds.map((id) => hemisphereOf.get(id) ?? null)
      : [null];
    const merged: LaneMonths = { prune: [], sow: [], flower: [], harvest: [] };
    for (const hemisphere of hemispheres) {
      const lanes = lanesOf(variety, hemisphere);
      for (const lane of CALENDAR_LANES) merged[lane].push(...lanes[lane]);
    }
    for (const lane of CALENDAR_LANES) merged[lane] = unique(merged[lane]);

    const isKnown = CALENDAR_LANES.some((lane) => merged[lane].length > 0);
    if (!isKnown) {
      unknown.push(variety);
      continue;
    }
    const activeLane = CALENDAR_LANES.find((lane) => merged[lane].includes(month.month)) ?? null;
    const entry: VarietyCalendar = { variety, lanes: merged, known: true, activeLane };
    known.push(entry);
    for (const lane of CALENDAR_LANES) {
      if (merged[lane].includes(month.month)) active[lane].push(entry);
    }
  }

  // Q13 — active this month first (in legend order), then the busiest, then the name.
  const rank = (entry: VarietyCalendar) =>
    entry.activeLane === null ? CALENDAR_LANES.length : CALENDAR_LANES.indexOf(entry.activeLane);
  known.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.variety.count - a.variety.count ||
      varietyName(a.variety).localeCompare(varietyName(b.variety), undefined, { sensitivity: 'base' })
  );

  return { month, known, unknown, active };
}

/**
 * « septembre » / « September » — the month a sentence or a chip names, in the
 * language's own notation.
 *
 * The date is built from COMPONENTS, never from text: `new Date('2026-09-01')`
 * parses as UTC midnight and reads back as August west of Greenwich — the rule
 * `weatherTime.ts` keeps for weekdays, applied to months. The year is
 * irrelevant to the label but pinned so the same month always formats alike.
 */
export function monthLabel(month: Month, language: string): string {
  return new Intl.DateTimeFormat(language, { month: 'long' }).format(new Date(2000, month - 1, 1));
}

/** Unique months in calendar order. */
function unique(months: readonly Month[]): Month[] {
  return [...new Set(months)].sort((a, b) => a - b);
}
