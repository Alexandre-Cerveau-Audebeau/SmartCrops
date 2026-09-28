import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../types/DashboardWeather';
import { gardens as sceneGardens, varieties as sceneVarieties, weatherAll } from '../test/layout/scenes';
import { dayFixture, hoursOf, linkFixture, locationFixture, weatherFixture, weekFixture } from '../test/fixtures/weather';
import { gardenAdvice } from '../components/Dashboard/blocks/gardenAdvice';
import { monthCalendar } from '../components/Dashboard/blocks/plantCalendar';
import { todoTasks } from '../components/Dashboard/blocks/todoTasks';
import { gardenViewOf } from '../utils/gardenStats';
import type { KeyFigure } from '../components/Dashboard/blocks/keyFiguresOptions';
import type { DashboardBlock } from '../types/Dashboard';
import type { DashboardData } from '../types/DashboardData';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
}));

// Never a real provider call: the weather service is mocked whole.
vi.mock('../services/weatherApi', () => ({
  fetchDashboardWeather: vi.fn(),
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

vi.mock('../services/profileApi', () => ({ fetchProfile: vi.fn() }));

import { fetchDashboardWeather } from '../services/weatherApi';
import { fetchProfile } from '../services/profileApi';
import GardensDashboard from './GardensDashboard';
import { fetchDashboardData, fetchDashboardPreferences, saveDashboardPreferences } from '../services/dashboardApi';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';

// SMA-437 lot 1, PR B, round 1, É8 — A PAGE NEVER CONTRADICTS ITSELF: the Key
// figures band reads the weather the page reads. Each tile that depends on the
// weather says what the widget showing the same information says — « À faire
// aujourd'hui » as `TodoBlock`, « Conseils » as `TipsBlock`, « Jardins
// localisés » and « Villes » as the MÉTÉO column of the Gardens table, the
// « ce mois-ci » lanes as `MonthBlock` — through the real `useDashboardWeather`
// hook, in the five states the weather really takes on the page.
//
// Round 2, É8 — and what they say is TRUE: while the page's weather is in
// FAILURE, no derived figure reads it. The last aggregate the hook keeps across
// a failed refresh (E2 b of ③b) names the stored place in the location dialog
// and the Weather gear panel; it is never counted — not by the band, not by
// the To-do, Tips or This month widgets, which say « Météo indisponible ».

/** The harness's scene: three gardens, sixteen varieties, 64 placements, every garden in Écully. */
const DATA: DashboardData = {
  gardens: sceneGardens,
  varieties: sceneVarieties,
  totals: { gardenCount: 3, placementCount: 64, varietyCount: 16, catalogPlantCount: 536 },
};

/** Mid-September at noon UTC — the same month in every zone the suite runs in (`GardensDashboard.test.tsx`). */
const FROZEN_NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

/** No garden has a city, and no profile default. */
const nowhere = (): DashboardWeatherData =>
  weatherFixture(
    [],
    sceneGardens.map((garden) => linkFixture({ gardenId: garden.id, locationKey: null, source: null }))
  );

/**
 * An Expert page showing the band with `figures`, and beside it the widgets
 * that show the same information — To-do and Tips in Medium (their count chip
 * and their weather note) or in Large (where their whole lists are drawn),
 * This month in Small (its three counts), Weather and Gardens in Large (the
 * MÉTÉO column).
 */
function serve(figures: KeyFigure[], size: 'medium' | 'large' = 'medium', weatherSize: 'large' | 'wide' = 'large') {
  const blocks: DashboardBlock[] = [
    { key: 'keyfigures', size: 'wide', hidden: false, options: { figures } },
    { key: 'todo', size, hidden: false },
    { key: 'tips', size, hidden: false },
    { key: 'month', size: 'small', hidden: false },
    { key: 'weather', size: weatherSize, hidden: false },
    { key: 'gardens', size: 'large', hidden: false },
    { key: 'counters', size: 'large', hidden: true },
    { key: 'stats', size: 'large', hidden: true },
    { key: 'harvest', size: 'large', hidden: true },
  ];
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'expert',
    capabilities: capabilitiesFor('expert'),
    isPreset: false,
    formulaChosen: true,
    blocks,
    updatedAt: null,
  });
}

/** The one passive re-fetch a test can ask of the page: a language switch, which `useDashboardWeather(language)` follows. */
function LanguageProbe() {
  const { setLanguage } = useLanguage();
  return (
    <button type="button" onClick={() => setLanguage('fr')}>
      switch-language-probe
    </button>
  );
}

function renderPage() {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          <GardensDashboard />
          <LanguageProbe />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

/** A tile of the band: its value and its sub-line, as drawn. */
function tile(figure: KeyFigure) {
  const node = document.querySelector(`[data-key-figure="${figure}"]`);
  if (!node) throw new Error(`No tile ${figure}`);
  return {
    value: node.querySelector('[data-key-figure-value]')?.textContent ?? null,
    sub: node.querySelector('[data-key-figure-sub]')?.textContent ?? null,
  };
}

/** The number a text starts with, or 0 when it states nothing counted (« Rien », « Aucun »). */
const numberIn = (text: string | null) => {
  const found = /\d[\d\s\u202f\u00a0]*/.exec(text ?? '');
  return found ? Number(found[0].replace(/\D/g, '')) : 0;
};

const widget = (key: string) => {
  const node = document.querySelector(`[data-widget="${key}"]`);
  if (!node) throw new Error(`No widget ${key}`);
  return node as HTMLElement;
};

/** What the To-do widget shows: its count (its chip; none drawn is none), its weather note, its city invitation. */
const todoWidget = () => ({
  count: numberIn(widget('todo').querySelector('[data-todo-chip]')?.textContent ?? null),
  note: widget('todo').querySelector('[data-todo-weather-note]') !== null,
  invite: widget('todo').querySelector('[data-todo-invite]') !== null,
});

/** What the Tips widget shows: its count chip and its weather note. */
const tipsWidget = () => ({
  count: numberIn(widget('tips').querySelector('[data-tips-chip]')?.textContent ?? null),
  note: widget('tips').querySelector('[data-tips-weather-note]') !== null,
});

/** What the MÉTÉO column of the Gardens table shows: the place of each located garden. */
const weatherColumn = () => {
  const places = [...widget('gardens').querySelectorAll('[data-weather-cell-place]')].map((node) => node.textContent);
  return { located: places.length, cities: new Set(places).size };
};

/** What the To-do and Tips widgets count on the scene through `weather` — the plans alone when it is empty. */
const countsThrough = (weather: DashboardWeatherData) => {
  const views = new Map(sceneGardens.map((garden) => [garden.id, gardenViewOf(garden)]));
  return {
    todo: todoTasks(sceneGardens, sceneVarieties, weather).length,
    tips: gardenAdvice(sceneGardens, views, sceneVarieties, weather).tips.length,
  };
};

/** The To-do tasks read from a forecast: watering, and the cold. */
const FORECAST_TASKS = ['water', 'cold', 'frost'];

/** What the two widgets DRAW from a forecast: the To-do rows of a forecast kind, the Tips of the watering kind. */
const drawnFromForecast = () => ({
  tasks: [...widget('todo').querySelectorAll('[data-todo-task]')]
    .map((node) => node.getAttribute('data-todo-task'))
    .filter((kind) => FORECAST_TASKS.includes(kind ?? '')),
  tips: [...widget('tips').querySelectorAll('[data-tips-tip]')]
    .map((node) => node.getAttribute('data-tips-tip'))
    .filter((kind) => kind === 'watering'),
});

/** The three counts of the This month widget — each one drawn, so a missing count never reads as 0. */
const monthWidget = () => {
  const count = (lane: 'prune' | 'sow' | 'harvest') => {
    const node = widget('month').querySelector(`[data-month-count="${lane}"]`);
    if (!node) throw new Error(`The This month widget draws no ${lane} count`);
    return numberIn(node.textContent);
  };
  return { prune: count('prune'), sow: count('sow'), harvest: count('harvest') };
};

/**
 * Weather fetches whose answers the test releases by hand (`GardensDashboard.edit.test.tsx`,
 * round 4, F3): a failed refresh is a promise rejected inside `act`, and the
 * assertions run once its handler HAS run.
 */
function deferredWeather() {
  const pending: Array<{ reject: (error: unknown) => void }> = [];
  vi.mocked(fetchDashboardWeather).mockImplementation(
    () =>
      new Promise<DashboardWeatherData>((_resolve, reject) => {
        pending.push({ reject });
      })
  );
  return pending;
}

type WeatherState = 'first load' | 'ready' | 'failed refresh, aggregate kept' | 'error, nothing kept' | 'no city';

/** The page, in one real state of its weather, with the band showing `figures` — To-do and Tips at `size`. */
async function pageIn(
  state: WeatherState,
  figures: KeyFigure[],
  weather: DashboardWeatherData = weatherAll(),
  size: 'medium' | 'large' = 'medium'
) {
  serve(figures, size);
  if (state === 'first load') vi.mocked(fetchDashboardWeather).mockImplementation(() => new Promise(() => undefined));
  if (state === 'ready' || state === 'failed refresh, aggregate kept') vi.mocked(fetchDashboardWeather).mockResolvedValue(weather);
  if (state === 'error, nothing kept') vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('provider down'));
  if (state === 'no city') vi.mocked(fetchDashboardWeather).mockResolvedValue(nowhere());
  // The failed refresh follows a language switch: the page starts in English
  // and is read in French, like every other state.
  localStorage.setItem('smartcrops-language', state === 'failed refresh, aggregate kept' ? 'en' : 'fr');
  renderPage();
  await waitFor(() => expect(document.querySelector(`[data-key-figure="${figures[0]}"]`)).not.toBeNull());

  if (state === 'ready' || state === 'failed refresh, aggregate kept') {
    await waitFor(() => expect(weatherColumn().located).toBe(3));
  }
  if (state === 'no city') {
    await waitFor(() => expect(widget('todo').querySelector('[data-todo-invite]')).not.toBeNull());
  }
  if (state === 'error, nothing kept') {
    await waitFor(() => expect(widget('todo').querySelector('[data-todo-weather-note]')).not.toBeNull());
  }
  if (state === 'failed refresh, aggregate kept') {
    const pending = deferredWeather();
    fireEvent.click(screen.getByText('switch-language-probe'));
    await waitFor(() => expect(pending.length).toBe(1));
    await act(async () => {
      pending[0]!.reject(new Error('provider down'));
    });
    // Read once the page has re-rendered in French, the failure said.
    await waitFor(() =>
      expect(widget('todo').querySelector('[data-todo-weather-note]')?.textContent).toMatch(/^Météo indisponible/)
    );
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  vi.mocked(fetchDashboardData).mockResolvedValue(DATA);
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

/**
 * The matrix. For each state: what the band's tiles say, and what the widget
 * showing the same information says. The COUNTS agree in every state; « sans
 * la météo » is said wherever the page says its weather is missing — the
 * To-do widget's note (loading, failure) or its city invitation — and nowhere
 * else; and a count reads a forecast only where the page shows one (round 2,
 * É8).
 */
const MATRIX: Array<{
  state: WeatherState;
  /** Whether the To-do and Tips widgets — and the band — count from a forecast: watering and cold tasks, watering tips. */
  forecastCounted: boolean;
  /** The sub-line of « À faire aujourd'hui » and « Conseils » — null: none about the weather. */
  weatherSub: string | null;
  /** What the To-do widget says of the weather. */
  todoSays: 'nothing' | 'note' | 'invite';
  /** Whether the Tips widget says the weather is unavailable. */
  tipsNote: boolean;
  /** « Jardins localisés » and « Villes », and the MÉTÉO column's places. */
  located: [string | null, string | null];
  cities: [string | null, string | null];
  column: { located: number; cities: number };
}> = [
  {
    state: 'first load',
    forecastCounted: false,
    weatherSub: 'sans la météo — en cours de chargement',
    todoSays: 'note',
    tipsNote: false,
    located: ['—', 'sans la météo — en cours de chargement'],
    cities: ['—', 'sans la météo — en cours de chargement'],
    column: { located: 0, cities: 0 },
  },
  {
    state: 'ready',
    forecastCounted: true,
    weatherSub: null,
    todoSays: 'nothing',
    tipsNote: false,
    located: ['3', 'tous vos jardins ont une ville'],
    cities: ['1', 'Écully'],
    column: { located: 3, cities: 1 },
  },
  {
    state: 'failed refresh, aggregate kept',
    forecastCounted: false,
    weatherSub: 'sans la météo — indisponible',
    todoSays: 'note',
    tipsNote: true,
    located: ['—', 'sans la météo — indisponible'],
    cities: ['—', 'sans la météo — indisponible'],
    column: { located: 0, cities: 0 },
  },
  {
    state: 'error, nothing kept',
    forecastCounted: false,
    weatherSub: 'sans la météo — indisponible',
    todoSays: 'note',
    tipsNote: true,
    located: ['—', 'sans la météo — indisponible'],
    cities: ['—', 'sans la météo — indisponible'],
    column: { located: 0, cities: 0 },
  },
  {
    state: 'no city',
    forecastCounted: false,
    weatherSub: 'sans la météo — ajoutez une ville',
    todoSays: 'invite',
    tipsNote: false,
    located: ['Aucun', 'ajoutez une ville'],
    cities: ['Aucune', 'ajoutez une ville'],
    column: { located: 0, cities: 0 },
  },
];

describe('the Key figures band reads the weather the page reads (SMA-437, PR B, round 1, É8)', () => {
  it.each(MATRIX)('$state: « À faire aujourd’hui » as the To-do widget, « Conseils » as the Tips widget, « Jardins localisés » and « Villes » as the MÉTÉO column', async (row) => {
    await pageIn(row.state, ['todo', 'tips', 'located', 'cities']);

    const todo = todoWidget();
    const tips = tipsWidget();
    // The counts: the same on the band and on the widget, in every state.
    expect(numberIn(tile('todo').value), 'À faire aujourd’hui').toBe(todo.count);
    expect(numberIn(tile('tips').value), 'Conseils').toBe(tips.count);
    // …and read from a forecast only where the page shows one (round 2, É8):
    // after a failed refresh, the plans alone — the aggregate kept is counted
    // neither by the band nor by the widgets.
    const counted = countsThrough(row.forecastCounted ? weatherAll() : EMPTY_WEATHER_DATA);
    expect(todo.count, 'À faire aujourd’hui').toBe(counted.todo);
    expect(tips.count, 'Conseils').toBe(counted.tips);
    if (!row.forecastCounted) expect(drawnFromForecast()).toEqual({ tasks: [], tips: [] });

    // What each says of the weather.
    expect(tile('todo').sub, 'À faire aujourd’hui').toBe(row.weatherSub ?? tile('todo').sub);
    expect(tile('tips').sub, 'Conseils').toBe(row.weatherSub ?? tile('tips').sub);
    if (row.weatherSub === null) {
      expect(tile('todo').sub).not.toMatch(/météo/);
      expect(tile('tips').sub).not.toMatch(/météo/);
    }
    expect({ note: todo.note, invite: todo.invite }).toEqual({ note: row.todoSays === 'note', invite: row.todoSays === 'invite' });
    expect(tips.note).toBe(row.tipsNote);

    // « Jardins localisés » and « Villes »: the MÉTÉO column's places.
    expect([tile('located').value, tile('located').sub]).toEqual(row.located);
    expect([tile('cities').value, tile('cities').sub]).toEqual(row.cities);
    expect(weatherColumn()).toEqual(row.column);
    expect(numberIn(tile('located').value)).toBe(weatherColumn().located);
    expect(numberIn(tile('cities').value)).toBe(weatherColumn().cities);
  });

  it('failed refresh, aggregate kept: the last aggregate is not counted on — by the band or by any widget (round 2, É8)', async () => {
    await pageIn('failed refresh, aggregate kept', ['todo', 'tips', 'located', 'cities']);
    // Counted, the kept aggregate would make the To-do and Tips widgets count
    // more than the plans alone: the case is only a proof if it would.
    const kept = countsThrough(weatherAll());
    const plansAlone = countsThrough(EMPTY_WEATHER_DATA);
    expect(kept.todo).not.toBe(plansAlone.todo);
    expect(kept.tips).not.toBe(plansAlone.tips);
    expect(todoWidget().count).toBe(plansAlone.todo);
    expect(tipsWidget().count).toBe(plansAlone.tips);
    expect(numberIn(tile('todo').value)).toBe(plansAlone.todo);
    expect(numberIn(tile('tips').value)).toBe(plansAlone.tips);
  });

  it.each(MATRIX.map((row) => row.state))('%s: the « ce mois-ci » lanes as the This month widget', async (state) => {
    await pageIn(state, ['prune', 'sow', 'harvest', 'flower']);
    const month = monthWidget();
    expect(numberIn(tile('prune').value), 'prune').toBe(month.prune);
    expect(numberIn(tile('sow').value), 'sow').toBe(month.sow);
    expect(numberIn(tile('harvest').value), 'harvest').toBe(month.harvest);
  });

  it('failed refresh, aggregate kept: the lanes read the browser’s month — not the month of a place the page no longer shows (round 2, É8)', async () => {
    // A place already in October while the browser is still in September
    // (UTC+14; the browser at 11:00 UTC on 30 September) — the month
    // `MonthBlock` would read from the aggregate the hook keeps, were it
    // handed to it. The Weather widget shows its failure, not the place: the
    // lanes fall back to the browser's month, as without a city.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 11, 0, 0));
    const kiritimati = locationFixture({
      key: '1.87,-157.36',
      name: 'Kiritimati',
      region: 'Line Islands',
      country: 'Kiribati',
      timeZone: 'Pacific/Kiritimati',
      localTime: '2026-10-01 01:00',
      days: weekFixture(),
    });
    const weather = weatherFixture(
      [kiritimati],
      sceneGardens.map((garden) => linkFixture({ gardenId: garden.id, locationKey: kiritimati.key, source: 'garden' }))
    );
    // The case is only a proof if the two months give different lanes.
    const lanes = (data: DashboardWeatherData) => {
      const { active } = monthCalendar(sceneGardens, sceneVarieties, data);
      return [active.prune.length, active.sow.length, active.harvest.length];
    };
    expect(lanes(weather)).not.toEqual(lanes(EMPTY_WEATHER_DATA));

    await pageIn('failed refresh, aggregate kept', ['prune', 'sow', 'harvest', 'flower'], weather);
    const month = monthWidget();
    expect([month.prune, month.sow, month.harvest]).toEqual(lanes(EMPTY_WEATHER_DATA));
    expect([numberIn(tile('prune').value), numberIn(tile('sow').value), numberIn(tile('harvest').value)]).toEqual(
      lanes(EMPTY_WEATHER_DATA)
    );
  });
});

/**
 * Round 2, É8 — the widgets' notes are TRUE. Whenever the To-do widget says
 * « Météo indisponible — les arrosages ne sont pas planifiés pour l’instant »,
 * its list holds no watering and no cold task; whenever the Tips widget says
 * « Météo indisponible — les conseils d’arrosage ne peuvent pas être vérifiés
 * pour l’instant », it lists no watering tip. In every state of the matrix, on
 * Large cards, where the whole list is drawn.
 */
describe('a widget that says the weather is unavailable counts nothing from it (SMA-437, PR B, round 2, É8)', () => {
  it.each(MATRIX)('$state: no watering or cold task under the To-do note, no watering tip under the Tips note', async (row) => {
    await pageIn(row.state, ['todo', 'tips', 'located', 'cities'], weatherAll(), 'large');
    const todoNote = widget('todo').querySelector('[data-todo-weather-note]');
    const tipsNote = widget('tips').querySelector('[data-tips-weather-note]');
    // The notes are said where the matrix says them — or the invariant would
    // hold by never being put to the test.
    expect(todoNote !== null, 'the To-do note').toBe(row.todoSays === 'note');
    expect(tipsNote !== null, 'the Tips note').toBe(row.tipsNote);
    // Every task and every tip counted is drawn: what is read is the whole list.
    expect(widget('todo').querySelectorAll('[data-todo-task]')).toHaveLength(todoWidget().count);
    expect(widget('tips').querySelectorAll('[data-tips-tip]')).toHaveLength(tipsWidget().count);

    if (todoNote) {
      expect(todoNote.textContent).toBe('Météo indisponible — les arrosages ne sont pas planifiés pour l’instant.');
    }
    if (tipsNote) {
      expect(tipsNote.textContent).toMatch(
        /^Météo indisponible — les conseils d’arrosage ne peuvent pas être vérifiés pour l’instant\./
      );
    }
    // Under each note, nothing read from a forecast — both lists in one look.
    const drawn = drawnFromForecast();
    expect({
      underTheTodoNote: todoNote ? drawn.tasks : [],
      underTheTipsNote: tipsNote ? drawn.tips : [],
    }).toEqual({ underTheTodoNote: [], underTheTipsNote: [] });
  });
});

/**
 * SMA-448, lot F2 — THE NOVICE PAGE reads the weather the page reads: the
 * temperature and the task of the day of each card come through
 * `displayWeather` (A-4), like the band and the widgets. So a card that says
 * « Sans météo » — the aggregate failed, or a refresh failed and the last
 * aggregate is kept — counts nothing from a forecast: no temperature, no
 * watering, no cold; the calendar tasks alone, from the plans. And the
 * weather warning follows the figures (V1): there where a card shows one,
 * absent where none does. In the five states of the matrix.
 */
describe('the Novice page reads the weather the page reads — a card that says the weather is unavailable counts nothing from it (SMA-448, F2)', () => {
  const serveNovice = () =>
    vi.mocked(fetchDashboardPreferences).mockResolvedValue({
      schemaVersion: 1,
      level: 'novice',
      capabilities: capabilitiesFor('novice'),
      isPreset: true,
      formulaChosen: true,
      blocks: presetFor('novice'),
      updatedAt: null,
    });
  const cardsOf = () => [...document.querySelectorAll<HTMLElement>('[data-novice-card]')];
  /** The kind of the task each card shows, in the gardens' order — null for none. */
  const cardTasks = () =>
    cardsOf().map((card) => card.querySelector('[data-novice-task]')?.getAttribute('data-novice-task') ?? null);
  const count = (selector: string) => document.querySelectorAll(selector).length;

  /** The first task of each garden of the scene through `weather` — what its card shows. */
  const firstTasks = (weather: DashboardWeatherData) => {
    const tasks = todoTasks(sceneGardens, sceneVarieties, weather);
    return sceneGardens.map((garden) => tasks.find((task) => task.gardenId === garden.id)?.kind ?? null);
  };

  /** The Novice page, in one real state of its weather. */
  async function noviceIn(state: WeatherState) {
    serveNovice();
    if (state === 'first load') vi.mocked(fetchDashboardWeather).mockImplementation(() => new Promise(() => undefined));
    if (state === 'ready' || state === 'failed refresh, aggregate kept') vi.mocked(fetchDashboardWeather).mockResolvedValue(weatherAll());
    if (state === 'error, nothing kept') vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('provider down'));
    if (state === 'no city') vi.mocked(fetchDashboardWeather).mockResolvedValue(nowhere());
    localStorage.setItem('smartcrops-language', state === 'failed refresh, aggregate kept' ? 'en' : 'fr');
    renderPage();
    await waitFor(() => expect(cardsOf()).toHaveLength(3));

    if (state === 'first load') await waitFor(() => expect(count('[data-novice-weather-loading]')).toBe(3));
    if (state === 'ready' || state === 'failed refresh, aggregate kept') {
      await waitFor(() => expect(count('[data-novice-weather]')).toBe(3));
    }
    if (state === 'no city') await waitFor(() => expect(count('[data-novice-weather-add]')).toBe(3));
    if (state === 'error, nothing kept') await waitFor(() => expect(count('[data-novice-weather-unavailable]')).toBe(3));
    if (state === 'failed refresh, aggregate kept') {
      const pending = deferredWeather();
      fireEvent.click(screen.getByText('switch-language-probe'));
      await waitFor(() => expect(pending.length).toBe(1));
      await act(async () => {
        pending[0]!.reject(new Error('provider down'));
      });
      await waitFor(() => expect(count('[data-novice-weather-unavailable]')).toBe(3));
    }
  }

  it.each(MATRIX)('$state: the cards show a temperature and a forecast task only where the page shows a forecast — and the warning with them', async (row) => {
    await noviceIn(row.state);

    const counted = firstTasks(row.forecastCounted ? weatherAll() : EMPTY_WEATHER_DATA);
    expect(cardTasks()).toEqual(counted);
    expect(count('[data-novice-weather]')).toBe(row.forecastCounted ? 3 : 0);
    if (row.forecastCounted) {
      // The proof bites: through the forecast, a card waters tonight.
      expect(cardTasks()).toContain('water');
    } else {
      expect(cardTasks().filter((kind) => FORECAST_TASKS.includes(kind ?? ''))).toEqual([]);
    }
    expect(document.querySelector('[data-weather-disclaimer]') !== null, 'the weather warning').toBe(row.forecastCounted);
  });

  it('failed refresh, aggregate kept: the last aggregate feeds no card — « Sans météo » on each, the calendar tasks alone (round 2, É8, on the cards)', async () => {
    await noviceIn('failed refresh, aggregate kept');
    // Counted, the kept aggregate would put a watering task on two cards: the
    // case is only a proof if it would.
    expect(firstTasks(weatherAll())).not.toEqual(firstTasks(EMPTY_WEATHER_DATA));
    expect(cardTasks()).toEqual(firstTasks(EMPTY_WEATHER_DATA));
    expect(count('[data-novice-weather]')).toBe(0);
    expect(count('[data-novice-weather-unavailable]')).toBe(3);
    expect(document.querySelector('[data-weather-disclaimer]')).toBeNull();
  });
});

// SMA-448, lot F4, step W4 — A PAGE NEVER CONTRADICTS ITSELF (A-4) on the
// Expert's Full width: the band's « Villes » and « Jardins localisés » are the
// Weather widget's summary and its columns, the MÉTÉO column agrees, and the
// To-do widget's frost task for a garden reads the same forecast the garden's
// own column shows in its band — one source, `displayWeather`.
describe('the band, the Full-width Weather widget and the To-do widget agree (SMA-448, lot F4, W4)', () => {
  /** Écully for Terrasse and Balcon sud; Annecy — frost tonight, −1° — for Potager du fond. */
  const twoCities = (): DashboardWeatherData => {
    const base = weatherAll();
    const annecy = locationFixture({
      key: '45.90,6.13',
      name: 'Annecy',
      days: [
        dayFixture({ date: '2026-09-12', minTempC: -1, maxTempC: 8, hours: hoursOf('2026-09-12', -1, 8) }),
        ...weekFixture().slice(1),
      ],
    });
    return weatherFixture(
      [...base.locations, annecy],
      base.gardens.map((link) => (link.gardenId === 'g3' ? linkFixture({ gardenId: 'g3', locationKey: annecy.key, source: 'garden' }) : link))
    );
  };

  it('« Villes » is the number of columns and « Jardins localisés » the summary’s count; the frost of Annecy is in its column’s band and in the To-do list, for the same garden', async () => {
    serve(['todo', 'tips', 'located', 'cities'], 'large', 'wide');
    vi.mocked(fetchDashboardWeather).mockResolvedValue(twoCities());
    localStorage.setItem('smartcrops-language', 'fr');
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-key-figure="cities"]')).not.toBeNull());
    await waitFor(() => expect(weatherColumn().located).toBe(3));

    const columns = [...widget('weather').querySelectorAll('[data-weather-cities] > [data-weather-city]')];
    expect(columns).toHaveLength(2);
    expect(widget('weather').querySelector('[data-weather-summary]')).toHaveTextContent('2 villes · 3 jardins');
    expect(numberIn(tile('cities').value)).toBe(columns.length);
    expect(tile('cities').sub).toBe('Écully, Annecy');
    expect(numberIn(tile('located').value)).toBe(3);
    expect(weatherColumn()).toEqual({ located: 3, cities: 2 });

    // The same forecast, drawn twice and never in disagreement: Annecy's
    // column says frost tonight, and the To-do lists the frost task of the
    // garden in Annecy — Potager du fond — with the same minimum.
    expect(columns[1]!.querySelector('[data-weather-city-name]')).toHaveTextContent('Annecy');
    expect(columns[1]!.querySelector('[data-weather-band]')).toHaveTextContent('Gel possible cette nuit');
    expect(columns[0]!.querySelector('[data-weather-band]')).not.toHaveTextContent('Gel possible cette nuit');
    const frost = [...widget('todo').querySelectorAll('[data-todo-task="frost"]')];
    expect(frost).toHaveLength(1);
    // The one frost task of the scene is Potager du fond's — its placements, its city's minimum.
    const expected = todoTasks(sceneGardens, sceneVarieties, twoCities()).find((task) => task.kind === 'frost')!;
    expect(expected.gardenId).toBe('g3');
    expect(frost[0]).toHaveTextContent(`${expected.count} plantes`);
    expect(frost[0]).toHaveTextContent('-1°');
    expect(numberIn(tile('todo').value)).toBe(todoWidget().count);
  });
});
