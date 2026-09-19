import { describe, expect, it } from 'vitest';
import {
  ADVICE_RULES,
  exposureTips,
  gardenAdvice,
  shadedAtOf,
  wateringTips,
  type Tip,
} from './gardenAdvice';
import { todoTasks } from './todoTasks';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { placement } from '../../../test/fixtures/placements';
import {
  dayFixture,
  linkFixture,
  locationFixture,
  weekFixture,
  weatherFixture,
} from '../../../test/fixtures/weather';
import { EMPTY_WEATHER_DATA, type WeatherDay } from '../../../types/DashboardWeather';
import type { DashboardGardenData } from '../../../types/DashboardData';
import { gardenViewOf, type GardenView } from '../../../utils/gardenStats';

// SMA-336 PR 4b/5 — the two families the artboards draw, and the boundary with
// the To-do task of ③b. The plan: a drawn 4 × 3 garden oriented south, in the
// northern hemisphere at mid latitude; with a tall wall on its bottom-left
// cell, the evening sun (west) shadows the two cells east of it and the noon
// sun (south) the two cells above it — the engine's own rules, read, not
// restated (`gardenStats.test.ts` pins the triplets).

/** Sun lovers and shade lovers, at and around the named thresholds. */
const tomato = varietyFixture({
  plantId: 'tomato',
  commonName: 'Tomato',
  sunlightHoursMin: 8,
  sunlightHoursMax: 12,
});
const hydrangea = varietyFixture({
  plantId: 'hydrangea',
  commonName: 'Hydrangea',
  sunlightHoursMin: 4,
  sunlightHoursMax: 6,
});
/** A fern whose maximum the catalog does not know — the honest limit (§ B.1.2). */
const fern = varietyFixture({
  plantId: 'fern',
  commonName: 'Fern',
  sunlightHoursMin: 6,
  sunlightHoursMax: null,
});
/** No sunlight data at all — « sans exposition connue ». */
const mystery = varietyFixture({ plantId: 'mystery', commonName: 'Mystery' });
const basil = varietyFixture({
  plantId: 'basil',
  commonName: 'Basil',
  wateringNeedLevel: 'Frequent',
  sunlightHoursMin: 6,
  sunlightHoursMax: 8,
});
const mint = varietyFixture({ plantId: 'mint', commonName: 'Mint', wateringNeedLevel: 'High' });
const sage = varietyFixture({ plantId: 'sage', commonName: 'Sage', wateringNeedLevel: 'Low' });
const varieties = [tomato, hydrangea, fern, mystery, basil, mint, sage];

const south = (over: Partial<DashboardGardenData> = {}): DashboardGardenData =>
  gardenFixture({
    id: 'g1',
    name: 'Terrasse',
    config: {
      orientation: 'S',
      gardenType: null,
      lightSchedule: null,
      hemisphere: 'N',
      latitudeBand: 'mid',
    },
    ...over,
  });

/** The wall on (2, 0): (2, 1) and (2, 2) are shaded in the evening, (1, 0) and (0, 0) at noon. */
const WALL = JSON.stringify([{ row: 2, col: 0, infrastructure: 'wall' }]);

const walled = (over: Partial<DashboardGardenData> = {}) => south({ cellsJson: WALL, ...over });

const plant = (plantId: string, row: number, col: number) =>
  placement({ id: `${plantId}-${row}-${col}`, plantId, startRow: row, startCol: col });

const viewsOf = (...gardens: DashboardGardenData[]): ReadonlyMap<string, GardenView> =>
  new Map(gardens.map((garden) => [garden.id, gardenViewOf(garden)]));

const view = (garden: DashboardGardenData) => gardenViewOf(garden);

describe('shadedAtOf — when the anchor is shaded', () => {
  it('reads the engine’s triplet when there is one, noon first', () => {
    expect(shadedAtOf('shade', { morning: false, noon: false, evening: true })).toBe('noon');
    expect(shadedAtOf('morning', { morning: true, noon: true, evening: false })).toBe('afternoon');
    expect(shadedAtOf('afternoon', { morning: false, noon: true, evening: true })).toBe('morning');
  });

  it('falls back to the category for a manual override, which has no triplet', () => {
    expect(shadedAtOf('morning', null)).toBe('afternoon');
    expect(shadedAtOf('afternoon', null)).toBe('morning');
    expect(shadedAtOf('shade', null)).toBe('noon');
  });

  it('has nothing to say about a full-sun cell', () => {
    expect(shadedAtOf('full', null)).toBeNull();
    expect(shadedAtOf('full', { morning: true, noon: true, evening: true })).toBeNull();
  });
});

describe('exposureTips — « préfère le plein soleil »', () => {
  it('fires on a sun lover anchored on a cell shaded in the evening, and says so', () => {
    const garden = walled({ placements: [plant('tomato', 2, 1)] });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([
      {
        id: 'sunLover:g1:tomato:B3:afternoon',
        kind: 'sunLover',
        gardenId: 'g1',
        gardenName: 'Terrasse',
        cell: 'B3',
        names: ['Tomato'],
        plantIds: ['tomato'],
        sunlightHoursMin: 8,
        category: 'morning',
        shadedAt: 'afternoon',
      },
    ]);
  });

  it('is silent on a full-sun anchor — 99 % of the DEV cells at summer · noon', () => {
    const garden = walled({ placements: [plant('tomato', 0, 3)] });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([]);
  });

  it('says « à midi » above the wall, from the triplet, not from a guess', () => {
    const garden = walled({ placements: [plant('tomato', 1, 0)] });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([
      expect.objectContaining({ kind: 'sunLover', cell: 'A2', category: 'shade', shadedAt: 'noon' }),
    ]);
  });

  it('at the threshold: 6 h fires, 5 h does not', () => {
    const six = varietyFixture({ plantId: 'six', sunlightHoursMin: ADVICE_RULES.exposure.sunLoverMinHours });
    const five = varietyFixture({ plantId: 'five', sunlightHoursMin: ADVICE_RULES.exposure.sunLoverMinHours - 1 });
    const garden = walled({ placements: [plant('six', 2, 1), plant('five', 2, 2)] });

    const tips = exposureTips(garden, view(garden), [six, five]);

    expect(tips.map((tip) => tip.plantIds[0])).toEqual(['six']);
  });

  it('ONE tip per variety, on the FIRST anchor that earns it — not on the first anchor rated', () => {
    // Tomatoes in the sun first, then twice in the evening shade: one tip,
    // pointing at the first shaded cell, so « Voir la case B3 → » lands on a
    // cell the sentence is true of.
    const garden = walled({
      placements: [plant('tomato', 0, 3), plant('tomato', 2, 1), plant('tomato', 2, 2)],
    });

    const tips = exposureTips(garden, view(garden), varieties);

    expect(tips).toHaveLength(1);
    expect(tips[0]!.cell).toBe('B3');
  });

  it('keeps a manual override’s word, and still says when', () => {
    const garden = south({
      cellsJson: JSON.stringify([{ row: 0, col: 0, exposureOverride: 'afternoon' }]),
      placements: [plant('tomato', 0, 0)],
    });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([
      expect.objectContaining({ kind: 'sunLover', category: 'afternoon', shadedAt: 'morning' }),
    ]);
  });
});

describe('exposureTips — « préfère la mi-ombre »', () => {
  it('fires on a shade lover anchored in full sun, with both hours for the « Pourquoi »', () => {
    const garden = south({ placements: [plant('hydrangea', 0, 0)] });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([
      {
        id: 'shadeLover:g1:hydrangea:A1',
        kind: 'shadeLover',
        gardenId: 'g1',
        gardenName: 'Terrasse',
        cell: 'A1',
        names: ['Hydrangea'],
        plantIds: ['hydrangea'],
        sunlightHoursMin: 4,
        sunlightHoursMax: 6,
        category: 'full',
      },
    ]);
  });

  it('at the thresholds: max ≤ 6 AND min ≤ 4, and the max must be KNOWN', () => {
    const { shadeLoverMaxHours, shadeLoverMinHours } = ADVICE_RULES.exposure;
    const cases = [
      varietyFixture({ plantId: 'ok', sunlightHoursMin: shadeLoverMinHours, sunlightHoursMax: shadeLoverMaxHours }),
      varietyFixture({ plantId: 'minTooHigh', sunlightHoursMin: shadeLoverMinHours + 1, sunlightHoursMax: shadeLoverMaxHours }),
      varietyFixture({ plantId: 'maxTooHigh', sunlightHoursMin: shadeLoverMinHours, sunlightHoursMax: shadeLoverMaxHours + 1 }),
      // Athyrium vidalii in DEV: a fern, « Part shade, full shade » in the
      // gated text, 6–null in the numbers — unrecognisable, and NOT guessed.
      varietyFixture({ plantId: 'maxUnknown', sunlightHoursMin: 6, sunlightHoursMax: null }),
    ];
    const garden = south({
      placements: cases.map((variety, index) => plant(variety.plantId, 0, index)),
    });

    const tips = exposureTips(garden, view(garden), cases);

    expect(tips.map((tip) => tip.plantIds[0])).toEqual(['ok']);
  });

  it('is silent on a shaded anchor — the plant is where it likes to be', () => {
    const garden = walled({ placements: [plant('hydrangea', 2, 1)] });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([]);
  });
});

describe('exposureTips — where nothing can be said', () => {
  it('a variety with no sunlight hours gets no tip, whatever its cell', () => {
    const garden = walled({ placements: [plant('mystery', 2, 1)] });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([]);
  });

  it('no tip on a garden whose orientation is unknown (Q6) — the invitation is drawn instead', () => {
    const garden = walled({
      config: { orientation: null, gardenType: null, lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
      placements: [plant('tomato', 2, 1)],
    });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([]);
  });

  it('no tip on an indoor garden (T4): its light is a schedule, not a sun path', () => {
    const garden = south({
      config: { orientation: 'S', gardenType: 'indoor', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
      placements: [plant('tomato', 0, 0)],
    });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([]);
  });

  it('no tip without a plan, and none without a view', () => {
    const garden = south({ width: null, height: null, placements: [plant('tomato', 0, 0)] });

    expect(view(garden).hasPlan).toBe(false);
    expect(exposureTips(garden, view(garden), varieties)).toEqual([]);
    expect(exposureTips(garden, undefined, varieties)).toEqual([]);
  });

  it('a placement the plan has no exposure for is skipped, never defaulted', () => {
    // Anchored outside the plan, and on a switched-off cell: `placementExposure`
    // answers null for both, and null is « nothing to say ».
    const garden = walled({
      cellsJson: JSON.stringify([
        { row: 2, col: 0, infrastructure: 'wall' },
        { row: 2, col: 1, active: false },
      ]),
      placements: [plant('tomato', 5, 5), plant('tomato', 2, 1)],
    });

    expect(exposureTips(garden, view(garden), varieties)).toEqual([]);
  });
});

/** Lyon reads the given days; the garden `g1` is linked to it. */
const lyon = (days: WeatherDay[], over: { localTime?: string; status?: 'fresh' | 'stale' } = {}) =>
  weatherFixture([locationFixture({ days, ...over })], [linkFixture({ gardenId: 'g1' })]);

const day = (date: string, chanceOfRain: number, totalPrecipMm = 0) =>
  dayFixture({ date, chanceOfRain, totalPrecipMm });

/** Saturday 12 dry, Sunday 13 dry, Monday 14 dry (10 %), Tuesday 15 rain (80 %, 6 mm), Wednesday 16 30 %. */
const artboardWeek = () => weekFixture();

describe('wateringTips — « aime une terre toujours fraîche »', () => {
  const terrasse = () =>
    south({ placements: [plant('sage', 0, 0), plant('basil', 0, 1), plant('basil', 0, 2), plant('mint', 1, 0)] });

  it('ONE tip per garden, naming the high-need varieties in the plan’s order and the cell of the first', () => {
    expect(wateringTips(terrasse(), varieties, lyon(artboardWeek()))).toEqual([
      {
        id: 'watering:g1:2026-09-12:3:2026-09-15:basil|mint',
        kind: 'watering',
        gardenId: 'g1',
        gardenName: 'Terrasse',
        // Sage is Low: the cell is the first BASIL's, not the first plant's.
        cell: 'B1',
        names: ['Basil', 'Mint'],
        plantIds: ['basil', 'mint'],
        placeName: 'Lyon',
        dryDays: 3,
        nextRainDay: '2026-09-15',
        stale: false,
      },
    ]);
  });

  it('« pas de pluie prévue cette semaine » when no day known is rainy', () => {
    const dryWeek = ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'].map((date) =>
      day(date, 10)
    );

    expect(wateringTips(terrasse(), varieties, lyon(dryWeek))).toEqual([
      expect.objectContaining({ dryDays: 5, nextRainDay: null, id: 'watering:g1:2026-09-12:5:none:basil|mint' }),
    ]);
  });

  it('rain is the Weather widget’s own word: 60 % or 2 mm, whichever comes first', () => {
    const chance = [day('2026-09-12', 0), day('2026-09-13', 0), day('2026-09-14', 45), day('2026-09-15', 60)];
    const millimetres = [day('2026-09-12', 0), day('2026-09-13', 0), day('2026-09-14', 45, 2)];

    expect(wateringTips(terrasse(), varieties, lyon(chance))[0]?.nextRainDay).toBe('2026-09-15');
    expect(wateringTips(terrasse(), varieties, lyon(millimetres))[0]?.nextRainDay).toBe('2026-09-14');
  });

  it('is SILENT when today is the only dry day — that is the task’s ground', () => {
    const tomorrowRains = [day('2026-09-12', 0), day('2026-09-13', 80, 6)];

    expect(wateringTips(terrasse(), varieties, lyon(tomorrowRains))).toEqual([]);
  });

  it('is silent when today itself is not dry — the spell starts today or not at all', () => {
    const rainThenDry = [day('2026-09-12', 80, 6), day('2026-09-13', 0), day('2026-09-14', 0)];

    expect(wateringTips(terrasse(), varieties, lyon(rainThenDry))).toEqual([]);
  });

  it('a day whose two figures are both unknown is not dry (K3) — the spell stops there', () => {
    const unknownTomorrow = [day('2026-09-12', 0), dayFixture({ date: '2026-09-13', chanceOfRain: null, totalPrecipMm: null })];

    expect(wateringTips(terrasse(), varieties, lyon(unknownTomorrow))).toEqual([]);
  });

  it('is silent on an unlocated garden (Q7) — the To-do block carries that invitation', () => {
    const unlocated = weatherFixture([], [linkFixture({ gardenId: 'g1', locationKey: null, source: null })]);

    expect(wateringTips(terrasse(), varieties, unlocated)).toEqual([]);
    expect(wateringTips(terrasse(), varieties, EMPTY_WEATHER_DATA)).toEqual([]);
  });

  it('is silent on a garden with no high-need variety, and on one with no placement', () => {
    const lowOnly = south({ placements: [plant('sage', 0, 0), plant('tomato', 0, 1)] });

    expect(wateringTips(lowOnly, varieties, lyon(artboardWeek()))).toEqual([]);
    expect(wateringTips(south(), varieties, lyon(artboardWeek()))).toEqual([]);
  });

  it('drops the days before the place’s own today — a stale aggregate read after midnight', () => {
    // Yesterday and today dry, then rain: from the place's today there is ONE
    // dry day, and one dry day is the task's, not the tip's.
    const days = [day('2026-09-11', 0), day('2026-09-12', 0), day('2026-09-13', 80, 6)];

    expect(wateringTips(terrasse(), varieties, lyon(days, { localTime: '2026-09-12 09:00' }))).toEqual([]);
    expect(wateringTips(terrasse(), varieties, lyon(days, { localTime: '2026-09-11 09:00' }))).toHaveLength(1);
  });

  it('says when the forecast is the place’s last known one', () => {
    expect(wateringTips(terrasse(), varieties, lyon(artboardWeek(), { status: 'stale' }))[0]?.stale).toBe(true);
  });

  it('needs a cell to point at: a high-need plant anchored outside the plan gives no tip', () => {
    const outside = south({ placements: [plant('basil', 7, 7)] });

    expect(wateringTips(outside, varieties, lyon(artboardWeek()))).toEqual([]);
  });
});

describe('the boundary with the To-do task (pre-flight § B.2, constat 13)', () => {
  const terrasse = () => south({ placements: [plant('basil', 0, 1), plant('basil', 0, 2), plant('sage', 0, 0)] });

  it('today the only dry day: the TASK speaks, the TIP is silent — no repetition', () => {
    const weather = lyon([day('2026-09-12', 0), day('2026-09-13', 80, 6)]);

    const tasks = todoTasks([terrasse()], varieties, weather);
    const tips = wateringTips(terrasse(), varieties, weather);

    expect(tasks).toEqual([expect.objectContaining({ kind: 'water', count: 2, date: '2026-09-12', today: true })]);
    expect(tips).toEqual([]);
  });

  it('a dry spell: both speak, and they do not say the same thing', () => {
    const weather = lyon(artboardWeek());

    const task = todoTasks([terrasse()], varieties, weather).find((entry) => entry.kind === 'water')!;
    const tip = wateringTips(terrasse(), varieties, weather)[0]!;

    // The task: tonight, a count of PLACEMENTS, no plant named, no cell.
    expect(task.date).toBe('2026-09-12');
    expect(task.today).toBe(true);
    expect(task.count).toBe(2);
    expect(task.names).toEqual([]);
    expect('cell' in task).toBe(false);
    // The tip: the plant, the cell, and the horizon — a day the task never names.
    expect(tip.names).toEqual(['Basil']);
    expect(tip.cell).toBe('B1');
    expect(tip.nextRainDay).toBe('2026-09-15');
    expect(tip.nextRainDay).not.toBe(task.date);
    expect(tip.dryDays).toBeGreaterThanOrEqual(ADVICE_RULES.watering.drySpellMinDays);
  });

  it('the two surfaces agree on what a dry day is: the tip counts with the task’s own predicate', () => {
    // 29 % and 0.9 mm is dry for the task (`TODO_RULES.watering`), so it is
    // dry for the tip; 30 % is not, for either.
    const justDry = [day('2026-09-12', 29, 0.9), day('2026-09-13', 29, 0.9)];
    const justWet = [day('2026-09-12', 29, 0.9), day('2026-09-13', 30, 0)];

    expect(wateringTips(terrasse(), varieties, lyon(justDry))[0]?.dryDays).toBe(2);
    expect(wateringTips(terrasse(), varieties, lyon(justWet))).toEqual([]);
  });
});

describe('gardenAdvice — the whole block, one pass', () => {
  const unoriented = (over: Partial<DashboardGardenData> = {}) =>
    walled({
      id: 'g2',
      name: 'Balcon sud',
      config: { orientation: null, gardenType: null, lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
      ...over,
    });

  it('lists every tip in the gardens’ order, exposure before watering — the chip counts this list', () => {
    const terrasse = walled({
      // Basil on (0, 1), out of the wall's noon shadow: it is a watering case, not an exposure one.
      placements: [plant('tomato', 2, 1), plant('basil', 0, 1), plant('hydrangea', 0, 3)],
    });
    const potager = south({ id: 'g3', name: 'Potager du fond', placements: [plant('hydrangea', 0, 0)] });
    const weather = weatherFixture(
      [locationFixture({ days: artboardWeek() })],
      [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g3', locationKey: null, source: null })]
    );

    const advice = gardenAdvice([terrasse, potager], viewsOf(terrasse, potager), varieties, weather);

    expect(advice.tips.map((tip: Tip) => `${tip.gardenId}:${tip.kind}:${tip.cell}`)).toEqual([
      'g1:sunLover:B3',
      'g1:shadeLover:D1',
      'g1:watering:B1',
      'g3:shadeLover:A1',
    ]);
    expect(advice.byGarden.map((entry) => entry.tips.length)).toEqual([3, 1]);
    expect(advice.tips).toEqual(advice.byGarden.flatMap((entry) => entry.tips));
  });

  it('counts the orientation invitation on gardens WITH placements, outdoors (D2, Q6)', () => {
    const withPlants = unoriented({ placements: [plant('tomato', 2, 1)] });
    const empty = unoriented({ id: 'g4', placements: [] });
    const indoor = unoriented({
      id: 'g5',
      config: { orientation: null, gardenType: 'indoor', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
      placements: [plant('tomato', 0, 0)],
    });

    const advice = gardenAdvice(
      [withPlants, empty, indoor],
      viewsOf(withPlants, empty, indoor),
      varieties,
      EMPTY_WEATHER_DATA
    );

    expect(advice.gardensWithoutOrientation.map((garden) => garden.id)).toEqual(['g2']);
    // …and that garden gets no exposure tip, whatever its cells say.
    expect(advice.byGarden.find((entry) => entry.garden.id === 'g2')!.tips).toEqual([]);
  });

  it('counts the PLACEMENTS whose variety has no sunlight hours — « N plantes sans exposition connue »', () => {
    const terrasse = south({
      placements: [plant('mystery', 0, 0), plant('mystery', 0, 1), plant('tomato', 0, 2)],
    });
    const balcon = unoriented({ placements: [plant('mystery', 0, 0)] });

    const advice = gardenAdvice([terrasse, balcon], viewsOf(terrasse, balcon), varieties, EMPTY_WEATHER_DATA);

    expect(advice.unknownExposure).toBe(3);
  });

  it('a garden without placements is not a subject: no tip, no group, no invitation', () => {
    const empty = unoriented({ placements: [] });

    const advice = gardenAdvice([empty], viewsOf(empty), varieties, EMPTY_WEATHER_DATA);

    expect(advice.byGarden).toEqual([]);
    expect(advice.tips).toEqual([]);
    expect(advice.gardensWithoutOrientation).toEqual([]);
    expect(advice.unknownExposure).toBe(0);
  });

  describe('« rien à signaler » may only be STATED when the garden was checked (T6)', () => {
    const evaluatedOf = (garden: DashboardGardenData, weather = EMPTY_WEATHER_DATA) =>
      gardenAdvice([garden], viewsOf(garden), varieties, weather).byGarden[0]!.evaluated;

    it('true: oriented, outdoors, drawn, and no high-need variety to check the weather for', () => {
      expect(evaluatedOf(south({ placements: [plant('tomato', 0, 0), plant('sage', 0, 1)] }))).toBe(true);
    });

    it('false: a high-need variety and no weather to check it against — silence, not a zero', () => {
      expect(evaluatedOf(south({ placements: [plant('basil', 0, 0)] }))).toBe(false);
    });

    it('true: a high-need variety AND a place with forecast days, even when nothing fires', () => {
      const tomorrowRains = lyon([day('2026-09-12', 0), day('2026-09-13', 80, 6)]);

      expect(evaluatedOf(south({ placements: [plant('basil', 0, 0)] }), tomorrowRains)).toBe(true);
    });

    it('false: a place whose EVERY day precedes its own today — nothing left to count, so nothing was checked (round 3, S-6)', () => {
      // The five artboard days, all before the place's `localTime`: the D1
      // filter leaves the tip nothing to count, and « checked » may not be
      // said of nothing. DEFENSIVE — the transport reads `localTime` and
      // `days` from ONE provider answer and never produces this shape; the
      // module says so where it guards it.
      const thirsty = south({ placements: [plant('basil', 0, 0)] });
      const allPast = lyon(artboardWeek(), { localTime: '2026-09-20 09:00' });

      const advice = gardenAdvice([thirsty], viewsOf(thirsty), varieties, allPast);

      expect(advice.byGarden[0]!.tips).toEqual([]);
      expect(advice.byGarden[0]!.evaluated).toBe(false);
    });

    it('true: the shape the transport DOES produce — day 0 on yesterday, read after the place’s midnight (D1 of ④a) — is checked', () => {
      // One day dropped, two kept: the tip has days to count (and finds one
      // dry day, the task's), so the watering family WAS checked.
      const afterMidnight = lyon([day('2026-09-11', 0), day('2026-09-12', 0), day('2026-09-13', 80, 6)], {
        localTime: '2026-09-12 09:00',
      });

      expect(evaluatedOf(south({ placements: [plant('basil', 0, 0)] }), afterMidnight)).toBe(true);
    });

    it('false: no orientation (the invitation says why), indoor, or no plan', () => {
      expect(evaluatedOf(unoriented({ placements: [plant('sage', 0, 0)] }))).toBe(false);
      expect(
        evaluatedOf(
          south({
            config: { orientation: 'S', gardenType: 'indoor', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
            placements: [plant('sage', 0, 0)],
          })
        )
      ).toBe(false);
      expect(evaluatedOf(south({ width: null, height: null, placements: [plant('sage', 0, 0)] }))).toBe(false);
    });
  });

  it('what DEV shows today (pre-flight § B.1.3): no sun lover on a plan that is all full sun, and no watering without a place', () => {
    // Every active cell of an unobstructed south garden is full sun; the
    // three DEV « mi-ombre » plants are the hydrangea's case, the fern is not
    // recognised (max unknown), and no garden is located.
    const devLike = south({
      placements: [plant('tomato', 0, 0), plant('hydrangea', 0, 1), plant('fern', 0, 2), plant('basil', 1, 0)],
    });

    const advice = gardenAdvice([devLike], viewsOf(devLike), varieties, EMPTY_WEATHER_DATA);

    expect(advice.tips.map((tip) => tip.kind)).toEqual(['shadeLover']);
    expect(advice.byGarden[0]!.evaluated).toBe(false); // basil is high-need and Lyon is not known
  });

  it('the same input answers the same tips twice — no clock anywhere in the chain', () => {
    const terrasse = walled({ placements: [plant('tomato', 2, 1), plant('basil', 0, 0)] });
    const weather = lyon(artboardWeek());

    expect(gardenAdvice([terrasse], viewsOf(terrasse), varieties, weather)).toEqual(
      gardenAdvice([terrasse], viewsOf(terrasse), varieties, weather)
    );
  });
});
