import type { DashboardGardenData, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import { periodToMonths } from '../../../utils/formatPeriod';

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

/** `en-CA` for its numeric, unambiguous parts — never a displayed string. */
const ZONE_LOCALE = 'en-CA';

/**
 * One zone formatter per (locale, zone), built on first use (round 2, F3 —
 * Extension E2), the rule `formatNumber.formatterFor` already keeps for the
 * figures. Constructing an `Intl.DateTimeFormat` is one of the costlier calls
 * of the `Intl` surface, and round 1's C1 moved the month onto one: the block
 * builds one per garden, `monthCalendar` runs on every render of `MonthBlock`,
 * and the Customize gallery renders a thumbnail besides — for a value that
 * changes once a month.
 *
 * The FAILURE is memoised with the success. A zone the runtime does not know
 * throws at construction, and a place whose stored zone is unusable must read
 * as unlocated on every call, not re-throw on every call: `null` is a cached
 * answer here, which is why the map holds `null` rather than being missing.
 */
const zoneFormatters = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormatterFor(locale: string, timeZone: string): Intl.DateTimeFormat | null {
  const key = `${locale}|${timeZone}`;
  const cached = zoneFormatters.get(key);
  if (cached !== undefined) return cached;
  let formatter: Intl.DateTimeFormat | null;
  try {
    formatter = new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month: '2-digit' });
  } catch {
    formatter = null;
  }
  zoneFormatters.set(key, formatter);
  return formatter;
}

/** One month-name formatter per language — the same rule, for the labels. */
const monthFormatters = new Map<string, Intl.DateTimeFormat>();

function monthFormatterFor(language: string): Intl.DateTimeFormat {
  let formatter = monthFormatters.get(language);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language, { month: 'long' });
    monthFormatters.set(language, formatter);
  }
  return formatter;
}

/**
 * The year and month an INSTANT falls in, read in an IANA zone. Null for a
 * zone the runtime does not know — `Intl.DateTimeFormat` throws a `RangeError`
 * on one, and a place whose stored zone is unusable must read as unlocated
 * rather than take the whole widget down.
 *
 * `en-CA` for its numeric, unambiguous parts; the locale is an implementation
 * detail here, never a displayed string — {@link monthLabel} owns those.
 */
export function zonedYearMonthOf(instant: Date, timeZone: string): YearMonth | null {
  const formatter = zoneFormatterFor(ZONE_LOCALE, timeZone);
  if (!formatter) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter.formatToParts(instant);
  } catch {
    return null;
  }
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return Number.isFinite(year) && Number.isFinite(month) ? { year, month } : null;
}

/**
 * The month a place is in NOW — the injected instant rendered in the place's
 * own `timeZone`. Null when the garden reads no place, or when the place
 * carries no usable zone; {@link monthOfGarden} and {@link blockMonth} then
 * fall back to the same injected clock, read locally.
 *
 * Round 1, C1 (Extension `febfc5be` / `137bdf1b`): this used to read
 * `location.localTime`, which is the provider's clock AT FETCH TIME and does
 * not advance. A weather aggregate fetched on 31 August and still held on
 * 1 September answered « August », and the whole widget followed it — header,
 * counters, tinted column — as did the Tailler and Semer tasks. The zone is
 * the durable fact of a place; the timestamp beside it is a photograph. We
 * keep reading the photograph for the WEATHER (a forecast belongs to the hour
 * it was taken, `weatherTime.ts`), never for the calendar.
 */
export function placeMonthOf(
  gardenId: string,
  weather: DashboardWeatherData,
  clock: BrowserClock = browserClock
): YearMonth | null {
  const link = weather.gardens.find((entry) => entry.gardenId === gardenId);
  if (!link?.locationKey) return null;
  const location = weather.locations.find((place) => place.key === link.locationKey);
  if (!location?.timeZone) return null;
  return zonedYearMonthOf(clock(), location.timeZone);
}

/**
 * « This month » for ONE garden (Q10): its place's month when it reads a place
 * with a time zone, the browser's otherwise. The tasks of « À faire » are
 * dated by this — a garden in Sydney prunes in Sydney's month, and on the
 * morning Sydney has already turned the page and Paris has not, the two
 * gardens are honestly in two different months.
 */
export function monthOfGarden(
  garden: DashboardGardenData,
  weather: DashboardWeatherData,
  clock: BrowserClock = browserClock
): YearMonth {
  return placeMonthOf(garden.id, weather, clock) ?? yearMonthOf(clock());
}

/**
 * « This month » for the BLOCK (Q10): the places' month when every located
 * garden agrees on one, the browser's otherwise — no located garden, or two
 * zones straddling a month end for a few hours. ONE month for the header, the
 * counts and the grid: a calendar with two current months would be two
 * calendars.
 *
 * Round 2, C6 (Extension E2 / GitHub `4019229413`) — ONE instant for the whole
 * calculation. The clock used to be passed on and READ once per garden, plus
 * once more at the fallback: N+1 readings for one answer. Two gardens of the
 * SAME zone, read either side of midnight on the last of the month, then
 * answered two different months, the map held two keys, and this concluded
 * that the places disagreed — falling back to the browser for a state that was
 * in truth unanimous. The instant is taken here, once, and handed down frozen;
 * the injected clock keeps its job of pinning that instant in a test.
 */
export function blockMonth(
  gardens: readonly DashboardGardenData[],
  weather: DashboardWeatherData,
  clock: BrowserClock = browserClock
): YearMonth {
  const now = clock();
  const frozen: BrowserClock = () => now;
  const placeMonths = new Map<string, YearMonth>();
  for (const garden of gardens) {
    const placed = placeMonthOf(garden.id, weather, frozen);
    if (placed) placeMonths.set(`${placed.year}-${placed.month}`, placed);
  }
  if (placeMonths.size === 1) return [...placeMonths.values()][0]!;
  return yearMonthOf(now);
}

/** One variety of the calendar: its lanes, merged over the gardens that hold it. */
export interface VarietyCalendar {
  variety: DashboardVarietyData;
  lanes: LaneMonths;
  /** True when at least one lane holds a month — the variety HAS a calendar. */
  known: boolean;
  /** The lane it is active in this month, in legend order; null when idle. What {@link byActivity} ranks by. */
  activeLane: CalendarLane | null;
}

/** What `monthCalendar` derives — the ONE source of the chip, the three counters, the names, the grid and the gallery thumbnail. */
export interface MonthCalendar {
  month: YearMonth;
  /** EVERY placed variety with a calendar, in the V28 order: the name, alphabetically, blind to case and to accents. */
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
 * The DEFAULT order of the grid (round 2, V28): the name, alphabetically,
 * blind to case and to accents.
 *
 * « je ne comprends pas l'ordre dans lequel les plantes sont listées » — and
 * that is the whole argument. {@link byActivity} orders by what each variety
 * is DOING, which is information the reader cannot see in the list itself:
 * the rank is computed from the month, and two rows that look alike can sit
 * ten apart. An alphabetical list is one a reader can navigate without being
 * told the rule, which is what a list of names is for.
 *
 * `sensitivity: 'base'` is what makes « Épinard » sit with the E's and
 * « ÉPINARD » beside « épinard », rather than after Z where a code-point
 * comparison puts them. The locale is the page's own: the order of the
 * alphabet is a property of the language, not of the machine.
 *
 * Ties (two names equal at base sensitivity) keep their input order — the
 * sort is stable since ES2019 — so the list never reshuffles between renders.
 */
export const byName =
  (language?: string) =>
  (a: VarietyCalendar, b: VarietyCalendar): number =>
    varietyName(a.variety).localeCompare(varietyName(b.variety), language, { sensitivity: 'base' });

/**
 * Q13 — active this month first (in legend order), then the busiest, then the
 * name. KEPT, and no longer the default (round 2, V28): SMA-432 will offer it
 * as a value of a sort option, where it is the right answer to « what needs me
 * this month » and the wrong one to « where is my thyme ». It is exported and
 * covered, so the option has a function to bind to rather than a rule to
 * rebuild.
 */
export const byActivity =
  (language?: string) =>
  (a: VarietyCalendar, b: VarietyCalendar): number => {
    const rank = (entry: VarietyCalendar) =>
      entry.activeLane === null ? CALENDAR_LANES.length : CALENDAR_LANES.indexOf(entry.activeLane);
    return rank(a) - rank(b) || b.variety.count - a.variety.count || byName(language)(a, b);
  };

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
  clock: BrowserClock = browserClock,
  /** The page's language, for the alphabet the rows are ordered by (V28). */
  language?: string
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

  // V28 — alphabetical, blind to case and to accents. {@link byActivity} holds
  // the Q13 rule this replaced, for the option SMA-432 will add.
  known.sort(byName(language));

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
  return monthFormatterFor(language).format(new Date(2000, month - 1, 1));
}

/** Unique months in calendar order. */
function unique(months: readonly Month[]): Month[] {
  return [...new Set(months)].sort((a, b) => a - b);
}
