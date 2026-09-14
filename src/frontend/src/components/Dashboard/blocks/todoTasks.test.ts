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
import type { DashboardWeatherData, WeatherDay } from '../../../types/DashboardWeather';

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
    expect(todoTasks([terrasse], varieties, lyon([dryToday()]), () => '2026-09-12 23:30')).toEqual([]);
    expect(todoTasks([terrasse], varieties, lyon([dryToday()]), () => null)).toHaveLength(1);
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
    expect(todoTasks([terrasse], varieties, lyon([dryToday()], null as unknown as string), () => null)).toHaveLength(1);
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
      'cold:g1:2026-09-12:3:8',
      'water:g2:2026-09-12:1',
      'cold:g2:2026-09-12:1:8',
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

    expect(tuesday).toEqual(['cold:g1:2026-09-15:3:8']);
    expect(wednesday).not.toEqual(tuesday);
    expect(colder).toEqual(tuesday); // 7° and 9° are the same three basils under 8° — the same task.
    expect(frost).toEqual(['frost:g1:2026-09-15:6:-1']);
    // The same forecast twice is the same id — a refresh that changes nothing keeps the tick.
    expect(idOf([dayFixture({ date: '2026-09-15', minTempC: 9, chanceOfRain: 90 })])).toEqual(tuesday);
  });
});
