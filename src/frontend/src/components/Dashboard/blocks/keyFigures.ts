import type { TFunction } from 'i18next';
import type { DashboardGardenData, DashboardTotals, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import {
  isEdibleVariety,
  ratedCells,
  sumExposureTallies,
  type GardenView,
} from '../../../utils/gardenStats';
import { formatCount, formatSurface } from '../../../utils/formatNumber';
import { gardenAdvice } from './gardenAdvice';
import { monthCalendar, type CalendarLane } from './plantCalendar';
import { DEFAULT_TODO_CLOCK, gardensWithoutWeather, todoTasks, type TodoClock } from './todoTasks';
import type { KeyFigure } from './keyFiguresOptions';

/**
 * SMA-437 lot 1, PR B, step B3 (pre-flight C.5, D10) — the 22 figures of the
 * Key figures band, each from its source (contract § 4.5, the catalogue of
 * V3-04), computed in the browser from the two aggregates the page already
 * holds: nothing new travels, nothing is invented.
 *
 * ONE module, and it CALLS the widgets' derivations rather than copying one —
 * `todoTasks` for « À faire aujourd'hui » (the To-do block's own chip),
 * `gardenAdvice` for « Conseils » and « Jardins sans orientation »,
 * `monthCalendar` for the four « ce mois-ci », the page's shared `views` for
 * every sum of cells, surface and exposure — the rule the gallery thumbnail
 * already keeps: « nothing is derived twice ». And LAZILY: a derivation runs
 * only when a figure asked for needs it, once per call — the band asks for its
 * four, the gear's catalogue for the 22.
 *
 * What a tile STATES is decided here too, so the band, its catalogue and its
 * gallery thumbnail cannot say two things (R5, contract § 4.5 « les états
 * difficiles »): a measure; a word where the measure is a true zero —
 * « Aucune », « Rien » — never a « 0 » that reads as a figure; a dash where
 * there is nothing to measure — « — », no plan drawn, nothing planted — never
 * a zero of absence; hectares beyond 10 000 m² (A-N16); counts grouped as the
 * language groups them (« 1 284 630 », with its narrow no-break space in
 * French); 0 and 1 in the singular, through i18next's plurals.
 *
 * Arbitrage 4 (23/09): a figure that reads the weather — « À faire
 * aujourd'hui », « Conseils », « Jardins localisés », « Villes » — while the
 * weather aggregate loads, has failed, or leaves a planted garden without a
 * forecast, shows the value computed without what is missing, and a sub-line
 * that says so: « sans la météo — indisponible », « sans la météo — ajoutez
 * une ville »… The calendar tasks and the exposure tips are true without it;
 * hiding them would be the misleading zero.
 *
 * Round 1, É8 — a page never contradicts itself: every figure is computed
 * through the weather the PAGE holds (`useDashboardWeather`'s `data`), the
 * very aggregate the widgets showing the same information read — including
 * the last one kept after a failed refresh (E2 b of ③b), which `TodoBlock`,
 * `TipsBlock` and `MonthBlock` go on counting with. The sub-line follows the
 * page's weather STATE, as those widgets' own notes do.
 */

/**
 * The weather aggregate's state on the page: still loading (nothing read yet),
 * failed (with the last aggregate kept, or nothing — the page's `data` says
 * which), or answered.
 */
export type KeyFiguresWeatherStatus = 'loading' | 'error' | 'ready';

export interface KeyFiguresInput {
  gardens: readonly DashboardGardenData[];
  /** The page's shared views (`useGardenViews`): one engine pass per garden, read by every widget. */
  views: ReadonlyMap<string, GardenView>;
  varieties: readonly DashboardVarietyData[];
  totals: DashboardTotals;
  weather: DashboardWeatherData;
  weatherStatus: KeyFiguresWeatherStatus;
  /** The To-do block's clock — its browser half dates the calendar too. A seam for the tests. */
  clock?: TodoClock;
}

/** What one tile shows, in the page's language. */
export interface KeyFigureTile {
  figure: KeyFigure;
  /** The label, in its catalogue wording (the tile draws it in spaced capitals). */
  label: string;
  /** The figure, formatted — or its word, or its dash (`soft`). */
  value: string;
  /** « sur 31 », « % », « ha », « tâches » — or nothing. */
  unit: string | null;
  /** The line under the value — or nothing. */
  sub: string | null;
  /** « — », « Aucune », « Rien »: a word or a dash in place of a measure, drawn softer (contract § 4.5). */
  soft: boolean;
  /** Everything the tile says, in one sentence, for a screen reader: « Cases libres : 16 426 — où planter la suite ». */
  spoken: string;
}

/** The five groups of the catalogue, in its order (V3-04). */
export const KEY_FIGURE_GROUPS = {
  gardens: ['gardens', 'plants', 'varieties', 'edible', 'ornam'],
  space: ['surface', 'active', 'planted', 'occupancy', 'free', 'freeSun', 'sunShare'],
  month: ['prune', 'sow', 'harvest', 'flower'],
  today: ['todo', 'tips'],
  complete: ['noplan', 'noorient', 'located', 'cities'],
} as const satisfies Record<string, readonly KeyFigure[]>;

/** The i18n namespace of the band. */
const NS = 'dashboard.blocks.keyfigures';

/** A value, before its language: a measure, a true zero said in a word, or nothing to measure. */
type Value =
  | { kind: 'count'; count: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'surface'; m2: number }
  /** A true zero, said in a word — the word agrees with the figure's noun. */
  | { kind: 'none'; word: 'feminine' | 'masculine' | 'nothing' }
  /** Nothing to measure: no plan drawn, nothing planted, the weather not read. */
  | { kind: 'dash' };

/** A translation, before its language: a key under the band's namespace and its options. */
interface Phrase {
  key: string;
  options?: Record<string, unknown>;
}

interface Reading {
  value: Value;
  unit: Phrase | null;
  sub: Phrase | null;
}

/** Why a weather-reading figure was computed without (part of) the weather. */
interface WeatherGap {
  reason: 'loading' | 'unavailable' | 'noCity';
  /** How many planted gardens lack it; null when every one does — or when none is concerned (loading, error). */
  gardens: number | null;
}

/** The sub-line of arbitrage 4 — the proposed letter, validated with this PR. */
function weatherGapPhrase(gap: WeatherGap): Phrase {
  if (gap.gardens === null) return { key: `weather.${gap.reason}` };
  return { key: `weather.some.${gap.reason}`, options: { count: gap.gardens } };
}

const dash = (sub: Phrase | null): Reading => ({ value: { kind: 'dash' }, unit: null, sub });
const none = (word: 'feminine' | 'masculine' | 'nothing', unit: Phrase | null, sub: Phrase | null): Reading => ({
  value: { kind: 'none', word },
  unit,
  sub,
});
const count = (n: number, unit: Phrase | null, sub: Phrase | null): Reading => ({
  value: { kind: 'count', count: n },
  unit,
  sub,
});

const NO_PLAN: Phrase = { key: 'noPlan' };
const NO_PLANT: Phrase = { key: 'noPlant' };

/**
 * The shared intermediates, each computed on first use and kept for the rest
 * of the call — so the band's four figures cost what they read, and the
 * catalogue's 22 cost each derivation once.
 */
function derivations(input: KeyFiguresInput) {
  const memo = new Map<string, unknown>();
  const once = <T>(name: string, compute: () => T): T => {
    if (!memo.has(name)) memo.set(name, compute());
    return memo.get(name) as T;
  };
  const clock = input.clock ?? DEFAULT_TODO_CLOCK;
  // The weather the figures are computed THROUGH: the page's own (round 1,
  // É8). Empty while the first load is out or when a failure kept nothing; the
  // last aggregate after a failed refresh, which the To-do, Tips and This month
  // widgets go on counting with — so a tile and its widget never give two
  // counts on one page. What the tile then SAYS of the weather follows the
  // page's state (`weatherGap`), as the widgets' notes do.
  const weather = input.weather;

  return {
    /** The sums over the gardens that HAVE a plan — the Statistics widget's own filter (`hasPlan`). */
    cells: () =>
      once('cells', () => {
        const planned = input.gardens
          .map((garden) => input.views.get(garden.id))
          .filter((view): view is GardenView => view?.hasPlan === true);
        return {
          active: planned.reduce((sum, view) => sum + view.activeCells, 0),
          occupied: planned.reduce((sum, view) => sum + view.occupiedCells, 0),
          free: planned.reduce((sum, view) => sum + view.freeCells, 0),
          surface: planned.reduce((sum, view) => sum + view.surfaceM2, 0),
          exposure: sumExposureTallies(planned.map((view) => view.exposure)),
          freeExposure: sumExposureTallies(planned.map((view) => view.freeExposure)),
        };
      }),
    calendar: () => once('calendar', () => monthCalendar(input.gardens, input.varieties, weather, clock.browser)),
    todo: () => once('todo', () => todoTasks(input.gardens, input.varieties, weather, clock)),
    advice: () => once('advice', () => gardenAdvice(input.gardens, input.views, input.varieties, weather)),
    /** Why the weather-reading figures went without it, or null when every planted garden read its forecast. */
    weatherGap: () =>
      once('weatherGap', (): WeatherGap | null => {
        if (input.weatherStatus === 'loading') return { reason: 'loading', gardens: null };
        if (input.weatherStatus === 'error') return { reason: 'unavailable', gardens: null };
        const planted = input.gardens.filter((garden) => garden.placements.length > 0);
        // The To-do block's own rule for « Sans la météo de X » — reused, not copied.
        const lacking = gardensWithoutWeather(planted, input.weather);
        if (lacking.length === 0) return null;
        const unlocated = (garden: DashboardGardenData) =>
          !input.weather.gardens.some((link) => link.gardenId === garden.id && link.locationKey !== null);
        // « ajoutez une ville » only when a city is what every one of them lacks.
        const reason = lacking.every(unlocated) ? 'noCity' : 'unavailable';
        return { reason, gardens: lacking.length === planted.length ? null : lacking.length };
      }),
  };
}

type Derivations = ReturnType<typeof derivations>;

/** How many distinct gardens a list of tasks or tips belongs to. */
const gardensOf = (items: readonly { gardenId: string }[]) => new Set(items.map((item) => item.gardenId)).size;

/** The unit « variété » / « variétés » of the four « ce mois-ci ». */
function monthLane(lane: CalendarLane, d: Derivations): Reading {
  const n = d.calendar().active[lane].length;
  return n > 0 ? count(n, { key: 'unit.varieties', options: { count: n } }, null) : none('feminine', null, null);
}

/** Every figure, from its source (contract § 4.5, the « Source exacte » column). */
function read(figure: KeyFigure, input: KeyFiguresInput, d: Derivations): Reading {
  const { gardens, totals, varieties } = input;
  switch (figure) {
    case 'gardens': {
      const ornamental = gardens.filter((garden) => garden.isEdible === false).length;
      return count(
        gardens.length,
        null,
        ornamental > 0
          ? { key: 'figures.gardens.someOrnamental', options: { count: ornamental } }
          : { key: 'figures.gardens.noOrnamental' }
      );
    }
    case 'plants': {
      const n = totals.placementCount;
      return n > 0
        ? count(n, null, { key: 'figures.plants.sub', options: { count: n } })
        : none('feminine', null, { key: 'addPlants' });
    }
    case 'varieties': {
      // DISTINCT — a variety in two gardens counts once (decision D11).
      const n = totals.varietyCount;
      return n > 0
        ? count(n, null, { key: 'figures.varieties.sub', options: { count: n } })
        : none('feminine', null, { key: 'addPlants' });
    }
    case 'edible': {
      const total = totals.varietyCount;
      if (total === 0) return none('feminine', null, NO_PLANT);
      const n = varieties.filter(isEdibleVariety).length;
      const of: Phrase = { key: 'unit.of', options: { total } };
      const sub: Phrase = { key: 'figures.edible.sub' };
      return n > 0 ? count(n, of, sub) : none('feminine', of, sub);
    }
    case 'ornam': {
      // `null` is an EMPTY garden — neither edible nor ornamental — and is not counted.
      const n = gardens.filter((garden) => garden.isEdible === false).length;
      const of: Phrase = { key: 'unit.of', options: { total: gardens.length } };
      const sub: Phrase = { key: 'figures.ornam.sub' };
      return n > 0 ? count(n, of, sub) : none('masculine', of, sub);
    }
    case 'surface': {
      const { surface } = d.cells();
      return surface > 0
        ? { value: { kind: 'surface', m2: surface }, unit: null, sub: { key: 'figures.surface.sub' } }
        : dash(NO_PLAN);
    }
    case 'active': {
      const { active } = d.cells();
      return active > 0 ? count(active, null, { key: 'figures.active.sub', options: { count: active } }) : dash(NO_PLAN);
    }
    case 'planted': {
      const { active, occupied } = d.cells();
      if (active === 0) return dash(NO_PLAN);
      return occupied > 0
        ? count(occupied, null, { key: 'figures.planted.sub', options: { count: occupied } })
        : none('feminine', null, NO_PLANT);
    }
    case 'occupancy': {
      // Σ occupied / Σ active — the Statistics chip's formula, never an average
      // of percentages. Without a planted cell, a dash: the widget's
      // `occupancyPercent()` answers 0 there, and a 0 of absence is not a 0 of
      // measure (contract § 4.5).
      const { active, occupied } = d.cells();
      if (active === 0) return dash(NO_PLAN);
      if (occupied === 0) return dash(NO_PLANT);
      return {
        value: { kind: 'percent', percent: Math.round((Math.min(occupied, active) / active) * 100) },
        unit: { key: 'unit.percent' },
        sub: {
          key: 'figures.occupancy.sub',
          options: { planted: { key: 'figures.occupancy.planted', options: { count: occupied } }, active },
        },
      };
    }
    case 'free': {
      const { active, free } = d.cells();
      if (active === 0) return dash(NO_PLAN);
      return free > 0 ? count(free, null, { key: 'figures.free.sub' }) : none('feminine', null, { key: 'figures.free.full' });
    }
    case 'freeSun': {
      const { active, free, freeExposure } = d.cells();
      if (active === 0) return dash(NO_PLAN);
      if (free === 0) return none('feminine', null, { key: 'figures.free.full' });
      const n = freeExposure.full;
      const sub: Phrase = { key: 'figures.freeSun.sub', options: { count: free } };
      return n > 0 ? count(n, null, sub) : none('feminine', null, sub);
    }
    case 'sunShare': {
      // At the dashboard's fixed moment, summer · noon (D12, V29).
      const { exposure } = d.cells();
      const rated = ratedCells(exposure);
      if (rated === 0) return dash(NO_PLAN);
      return {
        value: { kind: 'percent', percent: Math.round((exposure.full / rated) * 100) },
        unit: { key: 'unit.percent' },
        sub: { key: 'figures.sunShare.sub' },
      };
    }
    case 'prune':
    case 'sow':
    case 'harvest':
    case 'flower':
      return monthLane(figure, d);
    case 'todo': {
      const tasks = d.todo();
      const gap = d.weatherGap();
      const sub = gap
        ? weatherGapPhrase(gap)
        : tasks.length > 0
          ? { key: 'figures.todo.sub', options: { count: gardensOf(tasks) } }
          : { key: 'figures.todo.none' };
      return tasks.length > 0
        ? count(tasks.length, { key: 'unit.tasks', options: { count: tasks.length } }, sub)
        : none('nothing', null, sub);
    }
    case 'tips': {
      const { tips } = d.advice();
      const gap = d.weatherGap();
      const sub = gap
        ? weatherGapPhrase(gap)
        : tips.length > 0
          ? { key: 'figures.tips.sub', options: { count: gardensOf(tips) } }
          : { key: 'figures.tips.none' };
      return tips.length > 0 ? count(tips.length, null, sub) : none('masculine', null, sub);
    }
    case 'noplan': {
      const n = gardens.filter((garden) => !input.views.get(garden.id)?.hasPlan).length;
      return n > 0
        ? count(n, null, { key: 'figures.noplan.sub' })
        : none('masculine', null, { key: 'figures.noplan.none' });
    }
    case 'noorient': {
      const n = d.advice().gardensWithoutOrientation.length;
      return n > 0
        ? count(n, null, { key: 'figures.noorient.sub' })
        : none('masculine', null, { key: 'figures.noorient.none' });
    }
    case 'located': {
      // Read on the weather aggregate's links alone: without its answer, there
      // is nothing to count — a dash, and the reason.
      if (input.weatherStatus !== 'ready') return dash(weatherGapPhrase(d.weatherGap()!));
      const links = input.weather.gardens.filter((link) => gardens.some((garden) => garden.id === link.gardenId));
      const located = links.filter((link) => link.locationKey !== null).length;
      const of: Phrase = { key: 'unit.of', options: { total: gardens.length } };
      const missing = gardens.filter(
        (garden) => !links.some((link) => link.gardenId === garden.id && link.locationKey !== null)
      );
      if (located === 0) return none('masculine', of, { key: 'figures.located.none' });
      const sub: Phrase =
        missing.length === 0
          ? { key: 'figures.located.all', options: { count: gardens.length } }
          : missing.length === 1
            ? { key: 'figures.located.oneMissing', options: { garden: missing[0]!.name } }
            : { key: 'figures.located.someMissing', options: { count: missing.length } };
      return count(located, of, sub);
    }
    case 'cities': {
      if (input.weatherStatus !== 'ready') return dash(weatherGapPhrase(d.weatherGap()!));
      const places = input.weather.locations;
      if (places.length === 0) return none('feminine', null, { key: 'figures.cities.none' });
      const names = places.slice(0, 2).map((place) => place.name).join(', ');
      return count(
        places.length,
        null,
        places.length > 2
          ? { key: 'figures.cities.namesMore', options: { names, count: places.length - 2 } }
          : { key: 'figures.cities.names', options: { names } }
      );
    }
  }
}

/** A phrase in the page's language — its options may themselves be phrases (a fragment with its own plural). */
function say(phrase: Phrase, t: TFunction): string {
  const options: Record<string, unknown> = {};
  for (const [name, option] of Object.entries(phrase.options ?? {})) {
    options[name] =
      typeof option === 'object' && option !== null && 'key' in option ? say(option as Phrase, t) : option;
  }
  return t(`${NS}.${phrase.key}`, options) as string;
}

/** The value's text, and whether it is a word or a dash (`soft`). */
function valueText(value: Value, t: TFunction, language: string): { text: string; unit: string | null; soft: boolean } {
  switch (value.kind) {
    case 'count':
      return { text: formatCount(value.count, language), unit: null, soft: false };
    case 'percent':
      return { text: formatCount(value.percent, language), unit: null, soft: false };
    case 'surface': {
      // « 2,66 ha » beyond 10 000 m², « 42,5 m² » below (A-N16) — the value
      // and its unit apart, drawn at two sizes.
      const surface = formatSurface(value.m2, language);
      return { text: surface.value, unit: t(`${NS}.unit.${surface.unit}`), soft: false };
    }
    case 'none':
      return { text: t(`${NS}.none.${value.word}`), unit: null, soft: true };
    case 'dash':
      return { text: '—', unit: null, soft: true };
  }
}

/**
 * The tiles of `figures`, in their order, in the page's language. Pure: `t`
 * and `language` are the page's (`useTranslation`), so the band, its gear's
 * catalogue and its gallery thumbnail state the same thing.
 */
export function keyFigureTiles(
  figures: readonly KeyFigure[],
  input: KeyFiguresInput,
  t: TFunction,
  language: string
): KeyFigureTile[] {
  const d = derivations(input);
  return figures.map((figure) => {
    const reading = read(figure, input, d);
    const label = t(`${NS}.figures.${figure}.label`);
    const value = valueText(reading.value, t, language);
    const unit = value.unit ?? (reading.unit ? say(reading.unit, t) : null);
    const sub = reading.sub ? say(reading.sub, t) : null;
    const spoken = t(`${NS}.spoken${sub ? 'WithSub' : ''}`, {
      label,
      value: unit ? `${value.text} ${unit}` : value.text,
      sub,
    });
    return { figure, label, value: value.text, unit, sub, soft: value.soft, spoken };
  });
}
