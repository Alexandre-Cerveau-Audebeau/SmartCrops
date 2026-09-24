import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../types/DashboardWeather';
import { gardens as sceneGardens, varieties as sceneVarieties, weatherAll } from '../test/layout/scenes';
import { linkFixture, locationFixture, weatherFixture, weekFixture } from '../test/fixtures/weather';
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

// SMA-437 lot 1, PR B, round 1, É8 — A PAGE NEVER CONTRADICTS ITSELF: the Key
// figures band reads the weather the page reads. Each tile that depends on the
// weather says what the widget showing the same information says — « À faire
// aujourd'hui » as `TodoBlock`, « Conseils » as `TipsBlock`, « Jardins
// localisés » and « Villes » as the MÉTÉO column of the Gardens table, the
// « ce mois-ci » lanes as `MonthBlock` — through the real `useDashboardWeather`
// hook, in the five states the weather really takes on the page.

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
 * and their weather note), This month in Small (its three counts), Weather and
 * Gardens in Large (the MÉTÉO column).
 */
function serve(figures: KeyFigure[]) {
  const blocks: DashboardBlock[] = [
    { key: 'keyfigures', size: 'wide', hidden: false, options: { figures } },
    { key: 'todo', size: 'medium', hidden: false },
    { key: 'tips', size: 'medium', hidden: false },
    { key: 'month', size: 'small', hidden: false },
    { key: 'weather', size: 'large', hidden: false },
    { key: 'gardens', size: 'large', hidden: false },
    { key: 'counters', size: 'large', hidden: true },
    { key: 'stats', size: 'large', hidden: true },
    { key: 'harvest', size: 'large', hidden: true },
  ];
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'expert',
    isPreset: false,
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

/** The page, in one real state of its weather, with the band showing `figures`. */
async function pageIn(state: WeatherState, figures: KeyFigure[], weather: DashboardWeatherData = weatherAll()) {
  serve(figures);
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
 * else.
 */
const MATRIX: Array<{
  state: WeatherState;
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
    weatherSub: 'sans la météo — en cours de chargement',
    todoSays: 'note',
    tipsNote: false,
    located: ['—', 'sans la météo — en cours de chargement'],
    cities: ['—', 'sans la météo — en cours de chargement'],
    column: { located: 0, cities: 0 },
  },
  {
    state: 'ready',
    weatherSub: null,
    todoSays: 'nothing',
    tipsNote: false,
    located: ['3', 'tous vos jardins ont une ville'],
    cities: ['1', 'Écully'],
    column: { located: 3, cities: 1 },
  },
  {
    state: 'failed refresh, aggregate kept',
    weatherSub: 'sans la météo — indisponible',
    todoSays: 'note',
    tipsNote: true,
    located: ['—', 'sans la météo — indisponible'],
    cities: ['—', 'sans la météo — indisponible'],
    column: { located: 0, cities: 0 },
  },
  {
    state: 'error, nothing kept',
    weatherSub: 'sans la météo — indisponible',
    todoSays: 'note',
    tipsNote: true,
    located: ['—', 'sans la météo — indisponible'],
    cities: ['—', 'sans la météo — indisponible'],
    column: { located: 0, cities: 0 },
  },
  {
    state: 'no city',
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

  it('failed refresh, aggregate kept: the forecast the page still shows is counted — the band does not fall back to the plans alone', async () => {
    await pageIn('failed refresh, aggregate kept', ['todo', 'tips', 'located', 'cities']);
    // The kept aggregate is what makes the To-do and Tips widgets count more
    // than the plans alone: the case is only a proof if it does.
    const views = new Map(sceneGardens.map((garden) => [garden.id, gardenViewOf(garden)]));
    const plansAlone = todoTasks(sceneGardens, sceneVarieties, EMPTY_WEATHER_DATA).length;
    const tipsAlone = gardenAdvice(sceneGardens, views, sceneVarieties, EMPTY_WEATHER_DATA).tips.length;
    expect(todoWidget().count).not.toBe(plansAlone);
    expect(tipsWidget().count).not.toBe(tipsAlone);
    expect(numberIn(tile('todo').value)).toBe(todoWidget().count);
    expect(numberIn(tile('tips').value)).toBe(tipsWidget().count);
  });

  it.each(MATRIX.map((row) => row.state))('%s: the « ce mois-ci » lanes as the This month widget', async (state) => {
    await pageIn(state, ['prune', 'sow', 'harvest', 'flower']);
    const month = monthWidget();
    expect(numberIn(tile('prune').value), 'prune').toBe(month.prune);
    expect(numberIn(tile('sow').value), 'sow').toBe(month.sow);
    expect(numberIn(tile('harvest').value), 'harvest').toBe(month.harvest);
  });

  it('failed refresh, aggregate kept: the lanes read the month of the PLACE the page still shows, not the browser’s', async () => {
    // A place already in October while the browser is still in September
    // (UTC+14; the browser at 11:00 UTC on 30 September) — the month
    // `MonthBlock` reads from the aggregate it keeps.
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
    expect([month.prune, month.sow, month.harvest]).toEqual(lanes(weather));
    expect([numberIn(tile('prune').value), numberIn(tile('sow').value), numberIn(tile('harvest').value)]).toEqual(
      lanes(weather)
    );
  });
});
