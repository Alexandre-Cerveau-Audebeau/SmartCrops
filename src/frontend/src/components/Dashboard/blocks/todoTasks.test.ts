import { describe, expect, it } from 'vitest';
import {
  TODO_RULES,
  gardensWithoutWeather,
  locationOfGarden,
  todoTasks,
} from './todoTasks';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { placement } from '../../../test/fixtures/placements';
import {
  at,
  dayFixture,
  hourFixture,
  hoursOf,
  linkFixture,
  locationFixture,
  weekFixture,
  weatherFixture,
} from '../../../test/fixtures/weather';
import {
  EMPTY_WEATHER_DATA,
  type DashboardWeatherData,
  type WeatherDay,
} from '../../../types/DashboardWeather';

// SMA-336 PR 3b/5 — the weather tasks (§ F.5, Q9). The fixture: Terrasse in
// Lyon on Saturday 12 September 2026, 14:30 — three basils (Frequent, tolerate
// 8 °C), two sages (Low, unknown tolerance), one fern (nothing known).

const basil = varietyFixture({
  plantId: 'basil',
  commonName: 'Basil',
  wateringNeedLevel: 'Frequent',
  minToleratedTempC: 8,
});
const sage = varietyFixture({
  plantId: 'sage',
  commonName: 'Sage',
  wateringNeedLevel: 'Low',
  minToleratedTempC: null,
});
const fern = varietyFixture({ plantId: 'fern', commonName: 'Fern' });
const varieties = [basil, sage, fern];

const plants = (...specs: Array<[string, number]>) =>
  specs.flatMap(([plantId, count]) =>
    Array.from({ length: count }, (_, i) => placement({ id: `${plantId}-${i}`, plantId, startCol: i }))
  );

const terrasse = gardenFixture({
  id: 'g1',
  name: 'Terrasse',
  placements: plants(['basil', 3], ['sage', 2], ['fern', 1]),
  placementCount: 6,
  varietyCount: 3,
});

const balcon = gardenFixture({ id: 'g2', name: 'Balcon sud', placements: plants(['basil', 1]), placementCount: 1 });

/** Lyon with the given days (the artboard's week by default), read by Terrasse; Balcon unlocated. */
const lyon = (days: WeatherDay[] = weekFixture(), localTime = '2026-09-12 14:30'): DashboardWeatherData =>
  weatherFixture(
    [locationFixture({ days, localTime })],
    [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g2', locationKey: null, source: null })]
  );

const dryToday = (over: Partial<WeatherDay> = {}) =>
  dayFixture({ date: '2026-09-12', chanceOfRain: 0, totalPrecipMm: 0, hours: hoursOf('2026-09-12', 16, 29), ...over });

/**
 * The block's two clocks (PR 4a/5, T8): the place's instant for the weather
 * rules, the browser's month for the calendar ones. Both pinned by the test;
 * the browser one defaults to a September that no fixture's calendar reaches,
 * so the weather suites below derive exactly what they did before.
 */
const clock = (place: string | null = null, browser = () => new Date(2026, 8, 15, 10, 30)) => ({
  place: () => place,
  browser,
});

describe('todoTasks — watering tonight', () => {
  it('counts the PLACEMENTS of High and Frequent varieties on a dry day: three basils, not one variety', () => {
    const tasks = todoTasks([terrasse], varieties, lyon([dryToday()]));

    expect(tasks).toEqual([
      expect.objectContaining({
        kind: 'water',
        gardenId: 'g1',
        gardenName: 'Terrasse',
        count: 3,
        date: '2026-09-12',
        today: true,
        tempC: null,
      }),
    ]);
  });

  it('no task when rain is likely, or when the day brings a millimetre', () => {
    expect(todoTasks([terrasse], varieties, lyon([dryToday({ chanceOfRain: 30 })]))).toEqual([]);
    expect(todoTasks([terrasse], varieties, lyon([dryToday({ totalPrecipMm: 1 })]))).toEqual([]);
    expect(todoTasks([terrasse], varieties, lyon([dryToday({ chanceOfRain: 29, totalPrecipMm: 0.9 })]))).toHaveLength(1);
  });

  it('an unknown chance of rain (K3) leaves the rainfall to decide; both unknown → nothing is invented', () => {
    expect(todoTasks([terrasse], varieties, lyon([dryToday({ chanceOfRain: null, totalPrecipMm: 0 })]))).toHaveLength(1);
    expect(todoTasks([terrasse], varieties, lyon([dryToday({ chanceOfRain: null, totalPrecipMm: 2 })]))).toEqual([]);
    expect(todoTasks([terrasse], varieties, lyon([dryToday({ chanceOfRain: null, totalPrecipMm: null })]))).toEqual([]);
  });

  it('« ce soir » is the place’s 18 h–23 h: a wet evening slot cancels the task, a wet noon does not', () => {
    const wet = (time: string) => hourFixture({ time, chanceOfRain: 60, precipMm: 0.5 });

    expect(
      todoTasks([terrasse], varieties, lyon([dryToday({ hours: [wet(at('2026-09-12', 19))] })]))
    ).toEqual([]);
    expect(
      todoTasks([terrasse], varieties, lyon([dryToday({ hours: [wet(at('2026-09-12', 12))] })]))
    ).toHaveLength(1);
  });

  it('no task once the place’s clock has passed the evening — and never the browser’s clock', () => {
    expect(todoTasks([terrasse], varieties, lyon([dryToday()], '2026-09-12 23:00'))).toEqual([]);
    expect(todoTasks([terrasse], varieties, lyon([dryToday()], '2026-09-12 22:59'))).toHaveLength(1);
    // The clock is injectable: the same fixture, the hour pinned by the test.
    expect(todoTasks([terrasse], varieties, lyon([dryToday()]), clock('2026-09-12 23:30'))).toEqual([]);
    expect(todoTasks([terrasse], varieties, lyon([dryToday()]), clock())).toHaveLength(1);
  });

  it('no task without a thirsty variety', () => {
    const sages = gardenFixture({ id: 'g1', name: 'Terrasse', placements: plants(['sage', 4]), placementCount: 4 });

    expect(todoTasks([sages], varieties, lyon([dryToday()]))).toEqual([]);
  });

  it('no watering task when days[0] is not the place’s OWN date — a stale aggregate read after its midnight (G2)', () => {
    // GitHub 4008082494: the same dry Saturday, but the place's clock says
    // Sunday 00:30 — « ce soir » would name an evening that has ended.
    expect(todoTasks([terrasse], varieties, lyon([dryToday()], '2026-09-13 00:30'))).toEqual([]);
    // An unknown clock is trusted, as before.
    expect(todoTasks([terrasse], varieties, lyon([dryToday()], null as unknown as string), clock())).toHaveLength(1);
  });

  it('a STALE place still plans, and every one of its tasks says so (G2, chosen over « no task »)', () => {
    const stale = weatherFixture(
      [locationFixture({ status: 'stale', days: [dryToday({ minTempC: 9 })] })],
      [linkFixture({ gardenId: 'g1' })]
    );

    const tasks = todoTasks([terrasse], varieties, stale);

    expect(tasks.map((t) => t.kind)).toEqual(['water', 'cold']);
    expect(tasks.every((t) => t.stale)).toBe(true);
    expect(todoTasks([terrasse], varieties, lyon([dryToday()])).every((t) => !t.stale)).toBe(true);
  });
});

describe('todoTasks — the cold, two rules (Q9)', () => {
  it('rule (a): the placements whose KNOWN tolerance is within three degrees of a day’s minimum, on the first such day', () => {
    // Basil tolerates 8: at risk from 11 down. The artboard's Thursday (index
    // 3) drops to 9; sages and ferns have no known tolerance and are not counted.
    const tasks = todoTasks([terrasse], varieties, lyon(weekFixture().map((d) => ({ ...d, chanceOfRain: 90 }))));

    expect(tasks).toEqual([
      expect.objectContaining({
        kind: 'cold',
        count: 3,
        date: '2026-09-15',
        today: false,
        tempC: 9,
        dayIndex: 3,
      }),
    ]);
  });

  it('rule (a) at the boundary: tolerance + 3 inclusive', () => {
    const days = [dayFixture({ date: '2026-09-12', minTempC: 11, chanceOfRain: 90 })];
    expect(todoTasks([terrasse], varieties, lyon(days)).map((t) => t.kind)).toEqual(['cold']);

    const warmer = [dayFixture({ date: '2026-09-12', minTempC: 11.5, chanceOfRain: 90 })];
    expect(todoTasks([terrasse], varieties, lyon(warmer))).toEqual([]);
    expect(TODO_RULES.cold.marginC).toBe(3);
  });

  it('rule (a) fires ONLY under the 12 °C ceiling, whatever a plant tolerates (O1)', () => {
    // The case Alexandre read: a tropical plant tolerating 15 °C, a 17 °C
    // evening — « Protéger du froid — 1 plante connue sensible, 17° ce soir »
    // was exact and useless. Above the ceiling nothing is asked.
    const monstera = varietyFixture({ plantId: 'monstera', commonName: 'Monstera', minToleratedTempC: 15 });
    const veranda = gardenFixture({ id: 'g1', name: 'Véranda', placements: plants(['monstera', 1]), placementCount: 1 });
    const day = (minTempC: number) => [dayFixture({ date: '2026-09-12', minTempC, chanceOfRain: 90 })];

    expect(TODO_RULES.cold.maxC).toBe(12);
    expect(todoTasks([veranda], [monstera], lyon(day(17)))).toEqual([]);
    expect(todoTasks([veranda], [monstera], lyon(day(12.5)))).toEqual([]);
    // At the ceiling, inclusive: 12 ≤ 12 and 12 ≤ 15 + 3.
    expect(todoTasks([veranda], [monstera], lyon(day(12)))).toEqual([
      expect.objectContaining({ kind: 'cold', count: 1, tempC: 12, toleranceC: 15 }),
    ]);
  });

  it('rule (a) names the MOST FRAGILE tolerance among the placements it counts', () => {
    // Basil tolerates 8, this sage 12: at 9° both are within their margin, and
    // the sentence says « sensibles sous 12° » — the plant that suffers first.
    const sage12 = varietyFixture({ plantId: 'sage', commonName: 'Sage', minToleratedTempC: 12 });
    const days = [dayFixture({ date: '2026-09-12', minTempC: 9, chanceOfRain: 90 })];

    const [task] = todoTasks([terrasse], [basil, sage12, fern], lyon(days));

    expect(task).toMatchObject({ kind: 'cold', count: 5, toleranceC: 12, tempC: 9 });
    // Watering and frost carry no tolerance.
    expect(todoTasks([terrasse], varieties, lyon([dryToday()]))[0]).toMatchObject({ kind: 'water', toleranceC: null });
  });

  it('rule (b): frost at 0 or under counts EVERY placement, tolerance known or not', () => {
    const days = [
      dayFixture({ date: '2026-09-12', minTempC: 12, chanceOfRain: 90 }),
      dayFixture({ date: '2026-09-13', minTempC: 0, chanceOfRain: 90 }),
    ];

    const tasks = todoTasks([terrasse], varieties, lyon(days));

    expect(tasks).toEqual([
      expect.objectContaining({ kind: 'frost', count: 6, date: '2026-09-13', tempC: 0, dayIndex: 1 }),
    ]);
  });

  it('keeps rule (a) beside the frost only when it fires on an EARLIER day', () => {
    const coldThenFrost = [
      dayFixture({ date: '2026-09-12', minTempC: 9, chanceOfRain: 90 }),
      dayFixture({ date: '2026-09-13', minTempC: -1, chanceOfRain: 90 }),
    ];
    expect(todoTasks([terrasse], varieties, lyon(coldThenFrost)).map((t) => t.kind)).toEqual(['cold', 'frost']);

    const frostFirst = [
      dayFixture({ date: '2026-09-12', minTempC: -1, chanceOfRain: 90 }),
      dayFixture({ date: '2026-09-13', minTempC: 9, chanceOfRain: 90 }),
    ];
    expect(todoTasks([terrasse], varieties, lyon(frostFirst)).map((t) => t.kind)).toEqual(['frost']);
  });

  it('names « today » when the cold day is the place’s own date', () => {
    const days = [dayFixture({ date: '2026-09-12', minTempC: 9, chanceOfRain: 90 })];

    expect(todoTasks([terrasse], varieties, lyon(days))[0]).toMatchObject({ kind: 'cold', today: true });
  });
});

describe('todoTasks — a day before the place’s own today plans NOTHING (round 2, D1)', () => {
  // Extension 19db11e4: the G2 guard of round 1 kept « Arroser ce soir » off a
  // finished day, but the cold and frost loops still picked yesterday FIRST when
  // a stale aggregate is read after the place's midnight. Friday 11th, −1° or
  // 9°, is over on Saturday 12th at 00:30.
  const yesterdayFrost = [
    dayFixture({ date: '2026-09-11', minTempC: -1, chanceOfRain: 90 }),
    dayFixture({ date: '2026-09-12', minTempC: 14, chanceOfRain: 90 }),
  ];
  const yesterdayCold = [
    dayFixture({ date: '2026-09-11', minTempC: 9, chanceOfRain: 90 }),
    dayFixture({ date: '2026-09-12', minTempC: 14, chanceOfRain: 90 }),
  ];

  it('no frost and no cold task on a day that is over', () => {
    expect(todoTasks([terrasse], varieties, lyon(yesterdayFrost, '2026-09-12 00:30'))).toEqual([]);
    expect(todoTasks([terrasse], varieties, lyon(yesterdayCold, '2026-09-12 00:30'))).toEqual([]);
  });

  it('the same days read ON their first date plan normally, on today', () => {
    expect(todoTasks([terrasse], varieties, lyon(yesterdayFrost, '2026-09-11 14:30'))).toEqual([
      expect.objectContaining({ kind: 'frost', date: '2026-09-11', today: true, count: 6 }),
    ]);
    expect(todoTasks([terrasse], varieties, lyon(yesterdayCold, '2026-09-11 14:30'))).toEqual([
      expect.objectContaining({ kind: 'cold', date: '2026-09-11', today: true, count: 3 }),
    ]);
  });

  it('drops the past, not the future: a cold today behind a finished yesterday is still planned', () => {
    const yesterdayThenCold = [
      dayFixture({ date: '2026-09-11', minTempC: 14, chanceOfRain: 90 }),
      dayFixture({ date: '2026-09-12', minTempC: 9, chanceOfRain: 90 }),
    ];

    const tasks = todoTasks([terrasse], varieties, lyon(yesterdayThenCold, '2026-09-12 00:30'));

    expect(tasks).toEqual([
      expect.objectContaining({ kind: 'cold', date: '2026-09-12', today: true, count: 3, dayIndex: 0 }),
    ]);
  });

  it('an unknown clock trusts every day, as before', () => {
    expect(
      todoTasks([terrasse], varieties, lyon(yesterdayFrost, null as unknown as string), clock())
    ).toEqual([expect.objectContaining({ kind: 'frost', date: '2026-09-11' })]);
  });
});

describe('todoTasks — gardens without weather', () => {
  it('produces NO task for an unlocated garden, and names it for the invitation', () => {
    const weather = lyon([dryToday()]);

    const tasks = todoTasks([terrasse, balcon], varieties, weather);

    expect(tasks.map((t) => t.gardenId)).toEqual(['g1']);
    expect(gardensWithoutWeather([terrasse, balcon], weather).map((g) => g.name)).toEqual(['Balcon sud']);
  });

  it('treats a place the provider could not describe as no weather', () => {
    const unavailable = weatherFixture(
      [locationFixture({ status: 'unavailable', current: null, days: [] })],
      [linkFixture({ gardenId: 'g1' })]
    );

    expect(locationOfGarden('g1', unavailable)).toBeNull();
    expect(todoTasks([terrasse], varieties, unavailable)).toEqual([]);
    expect(gardensWithoutWeather([terrasse], unavailable)).toHaveLength(1);
  });

  it('a dangling location key reads as not located', () => {
    const dangling = weatherFixture([], [linkFixture({ gardenId: 'g1', locationKey: '0.00,0.00' })]);

    expect(locationOfGarden('g1', dangling)).toBeNull();
  });

  it('an empty garden has nothing to do', () => {
    const empty = gardenFixture({ id: 'g1', name: 'Terrasse' });

    expect(todoTasks([empty], varieties, lyon([dayFixture({ minTempC: -5 })]))).toEqual([]);
  });
});

describe('todoTasks — order and identity', () => {
  it('lists gardens in order, watering before the cold, with stable ids', () => {
    const balconLocated = weatherFixture(
      [locationFixture({ days: [dryToday({ minTempC: 9 })] })],
      [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g2' })]
    );

    const tasks = todoTasks([terrasse, balcon], varieties, balconLocated);

    expect(tasks.map((t) => t.id)).toEqual([
      'water:g1:2026-09-12:3',
      'cold:g1:2026-09-12:3:8:9',
      'water:g2:2026-09-12:1',
      'cold:g2:2026-09-12:1:8:9',
    ]);
    expect(tasks[2]).toMatchObject({ gardenName: 'Balcon sud', count: 1 });
  });

  it('the id is a digest of the CONTENT: another day, count or minimum is another task (E9 / E10)', () => {
    // Extension 3faf2a17 / dc027747: with `kind:garden` alone, a refresh that
    // moved the cold to Wednesday kept the id, and the box ticked for Tuesday
    // stayed ticked for a task that no longer said the same thing.
    const idOf = (days: WeatherDay[]) => todoTasks([terrasse], varieties, lyon(days)).map((t) => t.id);

    const tuesday = idOf([dayFixture({ date: '2026-09-15', minTempC: 9, chanceOfRain: 90 })]);
    const wednesday = idOf([dayFixture({ date: '2026-09-16', minTempC: 9, chanceOfRain: 90 })]);
    const colder = idOf([dayFixture({ date: '2026-09-15', minTempC: 7, chanceOfRain: 90 })]);
    const frost = idOf([dayFixture({ date: '2026-09-15', minTempC: -1, chanceOfRain: 90 })]);

    expect(tuesday).toEqual(['cold:g1:2026-09-15:3:8:9']);
    expect(wednesday).not.toEqual(tuesday);
    // Turned round in round 2 (D2 — GitHub 4009200258 / Extension 81f75cfb): 7°
    // and 9° are the same three basils under 8°, but the sentence PRINTS the
    // minimum (« 9° mardi soir »), and a box ticked at 9° must not stay ticked
    // once the night reads 7°.
    expect(colder).not.toEqual(tuesday);
    expect(colder).toEqual(['cold:g1:2026-09-15:3:8:7']);
    expect(frost).toEqual(['frost:g1:2026-09-15:6:-1']);
    // The same forecast twice is the same id — a refresh that changes nothing keeps the tick.
    expect(idOf([dayFixture({ date: '2026-09-15', minTempC: 9, chanceOfRain: 90 })])).toEqual(tuesday);
  });
});

// ── SMA-336 PR 4a/5 — the calendar tasks (§ D, T8, Q10, Q11) ───────────────
//
// They read the catalog, not the forecast: a garden with no city prunes too,
// which is why the loop no longer leaves an unlocated garden before the rules
// (constat 18). September 2026 is the month every case below is read in.

const thyme = varietyFixture({
  plantId: 'thyme',
  commonName: 'Thyme',
  wateringNeedLevel: 'Low',
  pruningMonths: 'March,April,September',
});
const rosemary = varietyFixture({
  plantId: 'rosemary',
  commonName: 'Rosemary',
  wateringNeedLevel: 'Low',
  pruningMonths: 'August,September,October',
});
const lettuce = varietyFixture({
  plantId: 'lettuce',
  commonName: 'Lettuce',
  wateringNeedLevel: 'Low',
  sowingPeriod: 'march-september',
});
const radish = varietyFixture({ plantId: 'radish', commonName: 'Radish', sowingPeriod: 'year-round' });
const calendarVarieties = [thyme, rosemary, lettuce, radish, basil, sage, fern];

/** A garden of the given hemisphere, with the given plants. */
const gardenOf = (
  id: string,
  name: string,
  specs: Array<[string, number]>,
  hemisphere: string | null = 'N'
) =>
  gardenFixture({
    id,
    name,
    placements: plants(...specs),
    placementCount: specs.reduce((sum, [, count]) => sum + count, 0),
    config: { orientation: null, gardenType: null, lightSchedule: null, hemisphere, latitudeBand: 'mid' },
  });

describe('todoTasks — « Tailler » and « Semer » (PR 4a/5)', () => {
  it('names the varieties whose pruning months hold the garden’s month, and counts VARIETIES', () => {
    const garden = gardenOf('g1', 'Terrasse', [['thyme', 4], ['rosemary', 2], ['fern', 1]]);

    const tasks = todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock());

    expect(tasks).toEqual([
      expect.objectContaining({
        kind: 'prune',
        gardenId: 'g1',
        gardenName: 'Terrasse',
        // Two varieties — not the six placements the weather tasks count.
        count: 2,
        names: ['Thyme', 'Rosemary'],
        month: { year: 2026, month: 9 },
        date: '2026-09-01',
        today: true,
        tempC: null,
        toleranceC: null,
        stale: false,
      }),
    ]);
  });

  it('lists the varieties in the PLAN’s order, each one once however often it is planted', () => {
    const garden = gardenOf('g1', 'Terrasse', [['rosemary', 1], ['thyme', 3]]);

    expect(todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock())[0]).toMatchObject({
      names: ['Rosemary', 'Thyme'],
      count: 2,
    });
  });

  it('an UNLOCATED garden prunes — and waters nothing (constat 18)', () => {
    // The whole point of splitting the loop: before PR 4a/5 this garden left
    // `todoTasks` before any rule ran.
    const garden = gardenOf('g2', 'Balcon sud', [['thyme', 2], ['basil', 3]]);

    const tasks = todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock());

    expect(tasks.map((task) => task.kind)).toEqual(['prune']);
    expect(gardensWithoutWeather([garden], EMPTY_WEATHER_DATA)).toHaveLength(1);
  });

  it('…and so does a garden whose place the provider could not describe', () => {
    const garden = gardenOf('g1', 'Terrasse', [['thyme', 1]]);
    const unavailable = weatherFixture(
      [locationFixture({ status: 'unavailable', current: null, days: [] })],
      [linkFixture({ gardenId: 'g1' })]
    );

    expect(todoTasks([garden], calendarVarieties, unavailable, clock()).map((t) => t.kind)).toEqual(['prune']);
  });

  it('a located garden whose forecast is entirely in the past still prunes', () => {
    const garden = gardenOf('g1', 'Terrasse', [['thyme', 1]]);
    const yesterdayOnly = weatherFixture(
      [locationFixture({ days: [dayFixture({ date: '2026-09-11' })], localTime: '2026-09-12 14:30' })],
      [linkFixture({ gardenId: 'g1' })]
    );

    expect(todoTasks([garden], calendarVarieties, yesterdayOnly, clock()).map((t) => t.kind)).toEqual(['prune']);
  });

  it('no month of the catalog in the garden’s month, no task', () => {
    const garden = gardenOf('g1', 'Terrasse', [['basil', 3], ['fern', 1]]);

    expect(todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock())).toEqual([]);
    // …and a March-only thyme is idle in September.
    const march = varietyFixture({ plantId: 'thyme', commonName: 'Thyme', pruningMonths: 'March' });
    const thymeGarden = gardenOf('g1', 'Terrasse', [['thyme', 1]]);
    expect(todoTasks([thymeGarden], [march], EMPTY_WEATHER_DATA, clock())).toEqual([]);
  });

  it('« Semer » fires on the LAST month of the window, and only there (Q11)', () => {
    const garden = gardenOf('g1', 'Terrasse', [['lettuce', 2]]);
    const august = () => new Date(2026, 7, 15, 10, 30);

    expect(todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock())).toEqual([
      expect.objectContaining({ kind: 'sow', count: 1, names: ['Lettuce'], month: { year: 2026, month: 9 } }),
    ]);
    // August is inside the window but not its end: nothing is asked.
    expect(todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock(null, august))).toEqual([]);
  });

  it('a year-round window has no last month — « Semer » never fires on it', () => {
    const garden = gardenOf('g1', 'Terrasse', [['radish', 4]]);

    expect(todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock())).toEqual([]);
  });

  it('a southern garden reads the catalog six months on (Q9)', () => {
    // Thyme prunes in March, April and September up north: in the south that
    // is September, October and March — September fires in both, so the case
    // that separates them is a March-only plant.
    const marchThyme = varietyFixture({ plantId: 'thyme', commonName: 'Thyme', pruningMonths: 'March' });
    const north = gardenOf('g1', 'Terrasse', [['thyme', 1]], 'N');
    const south = gardenOf('g2', 'Balcon sud', [['thyme', 1]], 'S');

    expect(todoTasks([north], [marchThyme], EMPTY_WEATHER_DATA, clock())).toEqual([]);
    expect(todoTasks([south], [marchThyme], EMPTY_WEATHER_DATA, clock())).toEqual([
      expect.objectContaining({ kind: 'prune', gardenId: 'g2', month: { year: 2026, month: 9 } }),
    ]);
  });

  it('dates a task in the GARDEN’s month — its place’s ZONE, not the browser’s (Q10, round 1 C1)', () => {
    const septemberThyme = varietyFixture({
      plantId: 'thyme',
      commonName: 'Thyme',
      pruningMonths: 'September',
    });
    /** A place with a zone and nothing else to say: no forecast, no snapshot. */
    const placed = (key: string, timeZone: string) =>
      weatherFixture(
        [locationFixture({ key, timeZone, localTime: null, current: null, days: [] })],
        [linkFixture({ gardenId: 'g1', locationKey: key })]
      );
    const garden = gardenOf('g1', 'Terrasse', [['thyme', 1]]);
    /**
     * 31 August 2026, 21:00 UTC — ONE instant. Sydney has turned the page to
     * September; Honolulu is ten hours behind and still in August. Two zones
     * rather than « the zone against the browser », so the assertion holds in
     * Paris as in CI's UTC.
     */
    const turn = () => new Date(Date.UTC(2026, 7, 31, 21, 0));

    expect(todoTasks([garden], [septemberThyme], placed('-33.87,151.21', 'Australia/Sydney'), clock(null, turn)))
      .toEqual([expect.objectContaining({ kind: 'prune', month: { year: 2026, month: 9 }, date: '2026-09-01' })]);
    expect(
      todoTasks([garden], [septemberThyme], placed('21.31,-157.86', 'Pacific/Honolulu'), clock(null, turn))
    ).toEqual([]);
  });

  it('orders a garden’s tasks water, prune, sow, then the cold (Main.dc.html)', () => {
    const garden = gardenOf('g1', 'Terrasse', [['basil', 3], ['thyme', 1], ['lettuce', 1]]);
    const weather = weatherFixture(
      [locationFixture({ days: [dryToday({ minTempC: 9 })] })],
      [linkFixture({ gardenId: 'g1' })]
    );

    expect(todoTasks([garden], calendarVarieties, weather, clock()).map((task) => task.kind)).toEqual([
      'water',
      'prune',
      'sow',
      'cold',
    ]);
  });

  it('the id carries the month AND the varieties (E9 / E10)', () => {
    const one = gardenOf('g1', 'Terrasse', [['thyme', 1]]);
    const two = gardenOf('g1', 'Terrasse', [['thyme', 1], ['rosemary', 1]]);
    const idOf = (garden: typeof one, browser?: () => Date) =>
      todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock(null, browser)).map((t) => t.id);

    expect(idOf(one)).toEqual(['prune:g1:2026-09:thyme']);
    // Another variety in the sentence is another task.
    expect(idOf(two)).toEqual(['prune:g1:2026-09:thyme|rosemary']);
    // Another month is another task…
    expect(idOf(two, () => new Date(2026, 9, 15, 10, 30))).toEqual(['prune:g1:2026-10:rosemary']);
    // …and the same plan in the same month is the same task, so the tick stays.
    expect(idOf(two)).toEqual(['prune:g1:2026-09:thyme|rosemary']);
  });

  it('…and it carries the ORDER the sentence lists them in (round 1, C5)', () => {
    const thymeFirst = gardenOf('g1', 'Terrasse', [['thyme', 1], ['rosemary', 1]]);
    const rosemaryFirst = gardenOf('g1', 'Terrasse', [['rosemary', 1], ['thyme', 1]]);
    const taskOf = (garden: typeof thymeFirst) =>
      todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock())[0]!;

    // The same two varieties, two plans, two DIFFERENT sentences…
    expect(taskOf(thymeFirst).names).toEqual(['Thyme', 'Rosemary']);
    expect(taskOf(rosemaryFirst).names).toEqual(['Rosemary', 'Thyme']);
    // …so two different tasks: a tick belongs to the sentence it was ticked on.
    expect(taskOf(thymeFirst).id).not.toBe(taskOf(rosemaryFirst).id);
    expect(taskOf(thymeFirst).id).toBe('prune:g1:2026-09:thyme|rosemary');
    expect(taskOf(rosemaryFirst).id).toBe('prune:g1:2026-09:rosemary|thyme');
  });

  it('an empty garden has nothing to prune', () => {
    expect(
      todoTasks([gardenFixture({ id: 'g1', name: 'Terrasse' })], calendarVarieties, EMPTY_WEATHER_DATA, clock())
    ).toEqual([]);
  });

  it('a placement whose variety the aggregate does not carry is skipped, not guessed', () => {
    const garden = gardenOf('g1', 'Terrasse', [['ghost', 2], ['thyme', 1]]);

    expect(todoTasks([garden], calendarVarieties, EMPTY_WEATHER_DATA, clock())[0]).toMatchObject({
      names: ['Thyme'],
      count: 1,
    });
  });
});
