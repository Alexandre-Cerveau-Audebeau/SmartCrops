import { afterEach, describe, expect, it } from 'vitest';
import {
  CALENDAR_LANES,
  MONTHS_OF_YEAR,
  blockMonth,
  byActivity,
  byName,
  lanesOf,
  lastMonthOf,
  monthCalendar,
  monthLabel,
  monthOfGarden,
  periodMonthsOf,
  placeMonthOf,
  pruneMonthsOf,
  seasonMonthsOf,
  shiftForHemisphere,
  varietyName,
  yearMonthOf,
  zonedYearMonthOf,
  type BrowserClock,
} from './plantCalendar';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { linkFixture, locationFixture, weatherFixture } from '../../../test/fixtures/weather';
import type { GardenConfig } from '../../../types/Garden';
import { EMPTY_WEATHER_DATA, type WeatherLocation } from '../../../types/DashboardWeather';

// SMA-336 PR 4a/5 — the plant calendar (pre-flight § C, T1, T9, Q9, Q10, Q13).
// The month lists are the forms MEASURED in the catalog: 102 distinct
// `PruningMonths` values, none malformed, unordered and year-wrapping ones
// among them; the legacy tokens and the season words as the ETL stores them.

const config = (hemisphere: string | null): GardenConfig => ({
  orientation: 'S',
  gardenType: null,
  lightSchedule: null,
  hemisphere,
  latitudeBand: 'mid',
});
const north = gardenFixture({ id: 'g1', name: 'Terrasse', config: config('N') });
const south = gardenFixture({ id: 'g2', name: 'Balcon sud', config: config('S') });
const unset = gardenFixture({ id: 'g3', name: 'Potager du fond', config: config(null) });

/** Clocks pinned by the test, built from COMPONENTS — never from a string. */
const september = () => new Date(2026, 8, 15, 10, 30);
const may = () => new Date(2026, 4, 15, 10, 30);

// The app's tsconfig types the browser only (`types: ["vite/client"]`); the
// test runs under Node, whose `process` is what moves the clock. Declared
// minimally, the `weatherTime.test.ts` idiom.
declare const process: { env: Record<string, string | undefined> };

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('pruneMonthsOf — the Perenual month list, as stored', () => {
  it('reads the most common form in calendar order', () => {
    expect(pruneMonthsOf('February,March,April')).toEqual([2, 3, 4]);
  });

  it('orders an UNORDERED list — « March,April,August,May » is stored as such', () => {
    expect(pruneMonthsOf('March,April,August,May')).toEqual([3, 4, 5, 8]);
    expect(pruneMonthsOf('December,March,May')).toEqual([3, 5, 12]);
  });

  it('keeps a year-wrapping list as twelve-month positions, not as a walk', () => {
    expect(pruneMonthsOf('December,January,February,March,April,May')).toEqual([1, 2, 3, 4, 5, 12]);
  });

  it('a single month, a duplicate, stray spaces', () => {
    expect(pruneMonthsOf('May')).toEqual([5]);
    expect(pruneMonthsOf('May,May')).toEqual([5]);
    expect(pruneMonthsOf(' March , April ')).toEqual([3, 4]);
  });

  it('null, blank and an unknown token contribute nothing — no parser of its own', () => {
    expect(pruneMonthsOf(null)).toEqual([]);
    expect(pruneMonthsOf('')).toEqual([]);
    expect(pruneMonthsOf('March,Brumaire')).toEqual([3]);
  });
});

describe('periodMonthsOf / seasonMonthsOf — periodToMonths, untouched', () => {
  it('a range walks from its first month to its last', () => {
    expect(periodMonthsOf('march-may')).toEqual([3, 4, 5]);
  });

  it('a range past December keeps walking — « november-march » is a WALK, not a sort', () => {
    expect(periodMonthsOf('november-march')).toEqual([11, 12, 1, 2, 3]);
  });

  it('« year-round » is every month, a single month is itself, null is nothing', () => {
    expect(periodMonthsOf('year-round')).toEqual([...MONTHS_OF_YEAR]);
    expect(periodMonthsOf('june')).toEqual([6]);
    expect(periodMonthsOf(null)).toEqual([]);
  });

  it('a season word is its northern months; Fall and Autumn are one season', () => {
    expect(seasonMonthsOf('Spring')).toEqual([3, 4, 5]);
    expect(seasonMonthsOf('Summer')).toEqual([6, 7, 8]);
    expect(seasonMonthsOf('Fall')).toEqual([9, 10, 11]);
    expect(seasonMonthsOf('Autumn')).toEqual([9, 10, 11]);
    expect(seasonMonthsOf('Winter')).toEqual([12, 1, 2]);
    expect(seasonMonthsOf(null)).toEqual([]);
  });
});

describe('shiftForHemisphere (Q9)', () => {
  it('shifts a southern garden by six months and keeps the order', () => {
    expect(shiftForHemisphere([3, 4, 5], 'S')).toEqual([9, 10, 11]);
    expect(shiftForHemisphere([11, 12, 1, 2, 3], 'S')).toEqual([5, 6, 7, 8, 9]);
    expect(shiftForHemisphere([9, 10, 11], 'S')).toEqual([3, 4, 5]);
  });

  it('reads the catalog as is for a northern garden and for one with NO hemisphere', () => {
    expect(shiftForHemisphere([3, 4, 5], 'N')).toEqual([3, 4, 5]);
    expect(shiftForHemisphere([3, 4, 5], null)).toEqual([3, 4, 5]);
    expect(shiftForHemisphere([3, 4, 5], 'X')).toEqual([3, 4, 5]);
  });

  it('returns a copy, never the input', () => {
    const months = [3, 4];
    expect(shiftForHemisphere(months, 'N')).not.toBe(months);
  });
});

describe('lastMonthOf — the « dernier mois de semis » (Q11)', () => {
  it('is the last element of the walk, past December included', () => {
    expect(lastMonthOf([3, 4, 5])).toBe(5);
    expect(lastMonthOf([11, 12, 1, 2, 3])).toBe(3);
    expect(lastMonthOf([6])).toBe(6);
  });

  it('is nothing for an empty window and for a year-round one', () => {
    expect(lastMonthOf([])).toBeNull();
    expect(lastMonthOf([...MONTHS_OF_YEAR])).toBeNull();
  });
});

describe('lanesOf — one variety read from one garden', () => {
  const tomato = varietyFixture({
    plantId: 'tomato',
    pruningMonths: 'June,July,August',
    sowingPeriod: 'march-may',
    harvestPeriod: 'july-october',
    floweringSeason: 'Summer',
    harvestSeason: 'Fall',
  });

  it('reads the four lanes; harvest takes the legacy token BEFORE the season word', () => {
    expect(lanesOf(tomato, 'N')).toEqual({
      prune: [6, 7, 8],
      sow: [3, 4, 5],
      flower: [6, 7, 8],
      harvest: [7, 8, 9, 10],
    });
  });

  it('falls back to the harvest season when the legacy token is null or blank', () => {
    expect(lanesOf(varietyFixture({ harvestSeason: 'Fall' }), 'N').harvest).toEqual([9, 10, 11]);
    expect(lanesOf(varietyFixture({ harvestPeriod: '  ', harvestSeason: 'Fall' }), 'N').harvest).toEqual([9, 10, 11]);
  });

  it('shifts every lane for a southern garden', () => {
    expect(lanesOf(tomato, 'S')).toEqual({
      prune: [12, 1, 2],
      sow: [9, 10, 11],
      flower: [12, 1, 2],
      harvest: [1, 2, 3, 4],
    });
  });

  it('an undated variety has four empty lanes', () => {
    expect(lanesOf(varietyFixture(), null)).toEqual({ prune: [], sow: [], flower: [], harvest: [] });
  });
});

describe('the month — of a garden, of the block (Q10)', () => {
  const SYDNEY = '-33.87,151.21';

  /** The default Lyon place, `Europe/Paris`, linked to the given gardens. */
  const lyon = (gardenIds = ['g1'], over: Partial<WeatherLocation> = {}) =>
    weatherFixture(
      [locationFixture(over)],
      gardenIds.map((gardenId) => linkFixture({ gardenId }))
    );

  const sydney = (gardenIds = ['g1']) =>
    weatherFixture(
      [locationFixture({ key: SYDNEY, name: 'Sydney', timeZone: 'Australia/Sydney' })],
      gardenIds.map((gardenId) => linkFixture({ gardenId, locationKey: SYDNEY }))
    );

  /**
   * 31 August 2026, 21:00 UTC — an ABSOLUTE instant, built from components so
   * the runner's own zone never enters (`new Date("…")` is banned here for the
   * same reason it is banned in the source). Europe is still on 31 August;
   * Sydney has already turned the page to 1 September.
   */
  const turn = () => new Date(Date.UTC(2026, 7, 31, 21, 0));

  it('yearMonthOf reads the clock’s own local month', () => {
    expect(yearMonthOf(september())).toEqual({ year: 2026, month: 9 });
  });

  it('zonedYearMonthOf reads ONE instant in each zone, and refuses a zone it does not know', () => {
    expect(zonedYearMonthOf(turn(), 'Europe/Paris')).toEqual({ year: 2026, month: 8 });
    expect(zonedYearMonthOf(turn(), 'Australia/Sydney')).toEqual({ year: 2026, month: 9 });
    expect(zonedYearMonthOf(turn(), 'Pacific/Honolulu')).toEqual({ year: 2026, month: 8 });
    expect(zonedYearMonthOf(turn(), 'Mars/Olympus_Mons')).toBeNull();
  });

  it('a located garden is in its PLACE’s month — the zone decides, not the browser', () => {
    // ONE instant, two zones, two months: nothing here reads the runner's clock.
    expect(placeMonthOf('g1', lyon(), turn)).toEqual({ year: 2026, month: 8 });
    expect(placeMonthOf('g1', sydney(), turn)).toEqual({ year: 2026, month: 9 });
    expect(monthOfGarden(north, sydney(), turn)).toEqual({ year: 2026, month: 9 });
  });

  it('…and it is the month the clock is in NOW, never the one the aggregate was fetched in (round 1, C1)', () => {
    // The photograph says 31 August and the place is stale; the instant is
    // 1 September, 10:00 UTC — noon in Paris. Before the fix the whole widget
    // and both calendar tasks read the photograph and said August.
    const stale = lyon(['g1'], { localTime: '2026-08-31 18:00', status: 'stale' });
    const firstOfSeptember = () => new Date(Date.UTC(2026, 8, 1, 10, 0));
    expect(placeMonthOf('g1', stale, firstOfSeptember)).toEqual({ year: 2026, month: 9 });
    expect(monthOfGarden(north, stale, firstOfSeptember)).toEqual({ year: 2026, month: 9 });
    expect(blockMonth([north], stale, firstOfSeptember)).toEqual({ year: 2026, month: 9 });
    expect(monthCalendar([north], [], stale, firstOfSeptember).month).toEqual({ year: 2026, month: 9 });
  });

  it('an unlocated garden, or a place with no usable zone, is in the browser’s month', () => {
    expect(placeMonthOf('g1', EMPTY_WEATHER_DATA, may)).toBeNull();
    expect(monthOfGarden(north, EMPTY_WEATHER_DATA, may)).toEqual({ year: 2026, month: 5 });
    // The provider could not describe the place: no zone to read the instant in.
    const zoneless = lyon(['g1'], { timeZone: null });
    expect(placeMonthOf('g1', zoneless, may)).toBeNull();
    expect(monthOfGarden(north, zoneless, may)).toEqual({ year: 2026, month: 5 });
    // A stored zone this runtime does not know: unlocated, never a crash.
    const bogus = lyon(['g1'], { timeZone: 'Mars/Olympus_Mons' });
    expect(placeMonthOf('g1', bogus, may)).toBeNull();
    expect(monthOfGarden(north, bogus, may)).toEqual({ year: 2026, month: 5 });
    // A dangling key reads as unlocated.
    const dangling = weatherFixture([], [linkFixture({ gardenId: 'g1', locationKey: '0.00,0.00' })]);
    expect(placeMonthOf('g1', dangling, may)).toBeNull();
  });

  it('reads the instant ONCE for the whole calculation, not once per garden (round 2, C6)', () => {
    // Two gardens of the SAME place, and a clock that advances between two
    // readings the way a real one does: 31 August 23:59:59 in Paris, then
    // 1 September 00:00:00. Read per garden, the two answered two months, the
    // map held two keys, and the block concluded that the places disagreed —
    // falling back to the browser for a state that was in truth unanimous.
    const instants = [
      new Date(Date.UTC(2026, 7, 31, 21, 59, 59)),
      new Date(Date.UTC(2026, 7, 31, 22, 0, 0)),
      // …and somewhere else entirely, so the old fallback cannot be mistaken
      // for the right answer in any runner's zone.
      new Date(Date.UTC(2026, 9, 15, 12, 0)),
    ];
    let reads = 0;
    const ticking: BrowserClock = () => instants[Math.min(reads++, instants.length - 1)]!;

    expect(blockMonth([north, south], lyon(['g1', 'g2']), ticking)).toEqual({ year: 2026, month: 8 });
    expect(reads).toBe(1);
  });

  it('…and the fallback is read from that same instant, never a later one (C6)', () => {
    // Two zones that genuinely disagree — Sydney has turned the page, Honolulu
    // is most of a day behind — so falling back is right. What must not happen
    // is falling back onto a DIFFERENT instant from the one the gardens read.
    const HONOLULU = '21.31,-157.86';
    const opposed = weatherFixture(
      [
        locationFixture({ key: SYDNEY, name: 'Sydney', timeZone: 'Australia/Sydney' }),
        locationFixture({ key: HONOLULU, name: 'Honolulu', timeZone: 'Pacific/Honolulu' }),
      ],
      [
        linkFixture({ gardenId: 'g1', locationKey: SYDNEY }),
        linkFixture({ gardenId: 'g2', locationKey: HONOLULU }),
      ]
    );
    let reads = 0;
    const once: BrowserClock = () => {
      reads += 1;
      return turn();
    };

    expect(blockMonth([north, south], opposed, once)).toEqual(yearMonthOf(turn()));
    expect(reads).toBe(1);
  });

  it('answers the same zone alike every time, and remembers the ones it cannot read (round 2, F3)', () => {
    // The formatter is cached per zone now. What is pinned is the CONTRACT the
    // cache must not break: one zone's answer is never another's, and a zone
    // the runtime refuses answers null on every call rather than throwing on
    // the second — the failure is memoised with the successes.
    expect(zonedYearMonthOf(turn(), 'Australia/Sydney')).toEqual({ year: 2026, month: 9 });
    expect(zonedYearMonthOf(turn(), 'Australia/Sydney')).toEqual({ year: 2026, month: 9 });
    expect(zonedYearMonthOf(turn(), 'Europe/Paris')).toEqual({ year: 2026, month: 8 });
    expect(zonedYearMonthOf(turn(), 'Mars/Olympus_Mons')).toBeNull();
    expect(zonedYearMonthOf(turn(), 'Mars/Olympus_Mons')).toBeNull();
    expect(zonedYearMonthOf(turn(), 'Australia/Sydney')).toEqual({ year: 2026, month: 9 });
  });

  it('the block takes the places’ month when every located garden agrees', () => {
    expect(blockMonth([north, south], sydney(['g1', 'g2']), turn)).toEqual({ year: 2026, month: 9 });
    // One located, one not: the located one decides.
    expect(blockMonth([north, unset], sydney(['g1']), turn)).toEqual({ year: 2026, month: 9 });
  });

  it('…and the browser’s when no garden is located, or when two zones straddle a month end', () => {
    expect(blockMonth([north, south], EMPTY_WEATHER_DATA, may)).toEqual({ year: 2026, month: 5 });
    // Read against the fallback rather than a literal month: the browser's
    // side of this instant is the RUNNER's zone, and the assertion must hold
    // in Paris as in CI's UTC.
    const straddle = weatherFixture(
      [
        locationFixture(),
        locationFixture({ key: SYDNEY, name: 'Sydney', timeZone: 'Australia/Sydney' }),
      ],
      [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g2', locationKey: SYDNEY })]
    );
    expect(blockMonth([north, south], straddle, turn)).toEqual(yearMonthOf(turn()));
  });
});

describe('monthCalendar — the month for every placed variety (T9)', () => {
  const thyme = varietyFixture({
    plantId: 'thyme',
    commonName: 'Thyme',
    count: 3,
    gardenIds: ['g1', 'g2'],
    pruningMonths: 'March,April,September',
  });
  const lettuce = varietyFixture({
    plantId: 'lettuce',
    commonName: 'Lettuce',
    count: 5,
    gardenIds: ['g1'],
    sowingPeriod: 'march-september',
    harvestPeriod: 'june-october',
  });
  const fern = varietyFixture({ plantId: 'fern', commonName: 'Fern', count: 9, gardenIds: ['g1'] });

  it('counts DISTINCT varieties, never placements: a thyme in two gardens is one thyme', () => {
    const calendar = monthCalendar([north, south], [thyme], EMPTY_WEATHER_DATA, september);

    expect(calendar.month).toEqual({ year: 2026, month: 9 });
    expect(calendar.active.prune.map((entry) => entry.variety.plantId)).toEqual(['thyme']);
    expect(calendar.known).toHaveLength(1);
  });

  it('merges the lanes over the gardens holding the variety — a northern AND a southern one (Q9)', () => {
    const [entry] = monthCalendar([north, south], [thyme], EMPTY_WEATHER_DATA, september).known;

    // March, April, September from the terrace; September, October, March from the balcony.
    expect(entry!.lanes.prune).toEqual([3, 4, 9, 10]);
  });

  it('a southern garden alone reads the catalog six months later', () => {
    const balconyThyme = varietyFixture({ plantId: 'thyme', gardenIds: ['g2'], pruningMonths: 'March,April' });
    const inSeptember = monthCalendar([south], [balconyThyme], EMPTY_WEATHER_DATA, september);
    const inMay = monthCalendar([south], [balconyThyme], EMPTY_WEATHER_DATA, may);

    expect(inSeptember.known[0]!.lanes.prune).toEqual([9, 10]);
    expect(inSeptember.active.prune).toHaveLength(1);
    expect(inMay.active.prune).toHaveLength(0);
  });

  it('a garden with NO hemisphere reads the catalog as northern — the exposure engine’s default', () => {
    const potagerThyme = varietyFixture({ plantId: 'thyme', gardenIds: ['g3'], pruningMonths: 'September' });

    expect(monthCalendar([unset], [potagerThyme], EMPTY_WEATHER_DATA, september).active.prune).toHaveLength(1);
  });

  it('a garden the aggregate does not hold reads as northern too', () => {
    const orphan = varietyFixture({ plantId: 'thyme', gardenIds: ['gone'], pruningMonths: 'September' });

    expect(monthCalendar([north], [orphan], EMPTY_WEATHER_DATA, september).active.prune).toHaveLength(1);
  });

  it('a variety with no month in any lane is UNKNOWN — counted for the foot, absent from the grid (D2)', () => {
    const calendar = monthCalendar([north], [thyme, fern], EMPTY_WEATHER_DATA, september);

    expect(calendar.unknown.map((v) => v.plantId)).toEqual(['fern']);
    expect(calendar.known.map((entry) => entry.variety.plantId)).toEqual(['thyme']);
  });

  it('fills the four lanes, sow and harvest from the legacy tokens, flower from the season word', () => {
    const calendar = monthCalendar([north], [lettuce], EMPTY_WEATHER_DATA, september);

    expect(calendar.active.sow.map((e) => e.variety.plantId)).toEqual(['lettuce']);
    expect(calendar.active.harvest.map((e) => e.variety.plantId)).toEqual(['lettuce']);
    expect(calendar.active.prune).toEqual([]);
    expect(calendar.active.flower).toEqual([]);
    const rose = varietyFixture({ plantId: 'rose', gardenIds: ['g2'], floweringSeason: 'Spring' });
    // Spring on the southern balcony is September–November.
    expect(monthCalendar([south], [rose], EMPTY_WEATHER_DATA, september).active.flower).toHaveLength(1);
  });

  it('a year-round sowing window is active every month', () => {
    const radish = varietyFixture({ plantId: 'radish', gardenIds: ['g1'], sowingPeriod: 'year-round' });

    expect(monthCalendar([north], [radish], EMPTY_WEATHER_DATA, may).active.sow).toHaveLength(1);
    expect(monthCalendar([north], [radish], EMPTY_WEATHER_DATA, september).active.sow).toHaveLength(1);
  });

  it('with no variety at all: the month, and nothing else', () => {
    const calendar = monthCalendar([north], [], EMPTY_WEATHER_DATA, september);

    expect(calendar).toEqual({
      month: { year: 2026, month: 9 },
      known: [],
      unknown: [],
      active: { prune: [], sow: [], flower: [], harvest: [] },
    });
  });

  it('orders the grid by NAME, blind to case and to accents (V28)', () => {
    const pruneOne = varietyFixture({ plantId: 'a', commonName: 'Sage', count: 1, gardenIds: ['g1'], pruningMonths: 'September' });
    const harvestFive = varietyFixture({ plantId: 'b', commonName: 'Tomato', count: 5, gardenIds: ['g1'], harvestSeason: 'Fall' });
    const idleNine = varietyFixture({ plantId: 'c', commonName: 'Zinnia', count: 9, gardenIds: ['g1'], pruningMonths: 'March' });
    const pruneThree = varietyFixture({ plantId: 'd', commonName: 'Thyme', count: 3, gardenIds: ['g1'], pruningMonths: 'September' });
    const idleNineToo = varietyFixture({ plantId: 'e', commonName: null, scientificName: 'Aster amellus', count: 9, gardenIds: ['g1'], pruningMonths: 'March' });
    const sowTwo = varietyFixture({ plantId: 'f', commonName: 'Lettuce', count: 2, gardenIds: ['g1'], sowingPeriod: 'august-september' });

    const calendar = monthCalendar(
      [north],
      [pruneOne, harvestFive, idleNine, pruneThree, idleNineToo, sowTwo],
      EMPTY_WEATHER_DATA,
      september
    );

    // Aster amellus, Lettuce, Sage, Thyme, Tomato, Zinnia — the alphabet, and
    // nothing else. « je ne comprends pas l'ordre dans lequel les plantes sont
    // listées »: what the list shows is now what the list is ordered by.
    expect(calendar.known.map((entry) => entry.variety.plantId)).toEqual(['e', 'f', 'a', 'd', 'b', 'c']);

    // Q13 is KEPT as a function — SMA-432 will bind a sort option to it — and
    // it still ranks exactly as it did: active this month in legend order,
    // then the busiest, then the name.
    const q13 = [...calendar.known].sort(byActivity('en'));
    expect(q13.map((entry) => entry.variety.plantId)).toEqual(['d', 'a', 'f', 'b', 'e', 'c']);
    expect(q13.map((entry) => entry.activeLane)).toEqual(['prune', 'prune', 'sow', 'harvest', null, null]);
  });

  it('…and the alphabet is the LANGUAGE’s, with accents and capitals folded in (V28)', () => {
    const entry = (plantId: string, commonName: string) => ({
      variety: varietyFixture({ plantId, commonName }),
      lanes: { prune: [], sow: [], flower: [], harvest: [] },
      known: true,
      activeLane: null,
    });
    // « Échalote » belongs with the E's, not after Z where a code-point
    // comparison puts it; « ÉPINARD » belongs beside « épinard », not before
    // every lower-case name. Both are what `sensitivity: 'base'` buys.
    const names = ['Zinnia', 'échalote', 'ÉPINARD', 'aubergine', 'Épinard'];
    const sorted = names.map((name, index) => entry(`p${index}`, name)).sort(byName('fr'));
    expect(sorted.map((item) => item.variety.commonName)).toEqual([
      'aubergine',
      'échalote',
      'ÉPINARD',
      'Épinard',
      'Zinnia',
    ]);
  });

  it('names a variety by its common name, and by the botanical one when there is none', () => {
    expect(varietyName(varietyFixture({ commonName: 'Basil' }))).toBe('Basil');
    expect(varietyName(varietyFixture({ commonName: null, scientificName: 'Ocimum basilicum' }))).toBe('Ocimum basilicum');
  });

  it('the lanes are the legend’s four, in its order', () => {
    expect(CALENDAR_LANES).toEqual(['prune', 'sow', 'flower', 'harvest']);
  });
});

describe('monthLabel', () => {
  it('names the month in the language’s own notation', () => {
    expect(monthLabel(9, 'fr')).toBe('septembre');
    expect(monthLabel(9, 'en')).toBe('September');
    expect(monthLabel(1, 'fr')).toBe('janvier');
    expect(monthLabel(12, 'en')).toBe('December');
  });

  it('never drifts a month west of Greenwich — the date is built from components', () => {
    // `new Date('2026-09-01')` is UTC midnight, which Los Angeles reads as
    // 31 August, so the label would say « August »: the `weatherTime.ts` rule,
    // applied to months, and run rather than described.
    process.env.TZ = 'America/Los_Angeles';
    expect(monthLabel(9, 'en')).toBe('September');
    expect(monthLabel(1, 'fr')).toBe('janvier');
  });
});
