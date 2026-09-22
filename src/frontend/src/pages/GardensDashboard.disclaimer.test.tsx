import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import en from '../i18n/en.json';
import fr from '../i18n/fr.json';
import { LanguageContext, type Language } from '../contexts/languageContextValue';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { createAppTheme } from '../theme';
import { contrast, resolveColor } from '../test/contrast';
import { rulesFor } from '../test/dashboardDom';
import { dashboardFixture, gardenFixture } from '../test/fixtures/dashboard';
import { linkFixture, locationFixture, weatherFixture } from '../test/fixtures/weather';
import { presetFor } from '../constants/dashboardPresets';
import { WEATHER_BEARING_BLOCKS } from '../components/Dashboard/weatherDisclaimer';
import type { DashboardBlockKey } from '../types/Dashboard';
import type { DashboardWeatherData, WeatherStatus } from '../types/DashboardWeather';

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

// NEVER a real provider call: the weather service is mocked whole.
vi.mock('../services/weatherApi', () => ({
  fetchDashboardWeather: vi.fn(),
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

vi.mock('../services/profileApi', () => ({ fetchProfile: vi.fn() }));

import GardensDashboard from './GardensDashboard';
import {
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { fetchDashboardWeather } from '../services/weatherApi';
import { fetchProfile } from '../services/profileApi';

// SMA-387 — the WeatherAPI.com terms of service ask for a clear, prominent
// warning for the end user wherever weather data from the API is shown. The
// page carries ONE, under the grid, as long as at least one place of the
// aggregate carries data a surface draws (« fresh » or « stale ») — and none
// while the aggregate loads, when no place is located, when every place is
// unavailable, or behind a load error, since every surface then shows the
// error and not a figure.

const GARDEN_NAMES = ['Casa Lolo', 'Balcon sud', 'Potager du fond'] as const;
const PLACE_NAMES = ['Lyon', 'Annecy', 'Grenoble'] as const;

/** One located garden per status, each reading a place of its own. */
const aggregateWith = (...statuses: WeatherStatus[]): DashboardWeatherData =>
  weatherFixture(
    statuses.map((status, index) =>
      locationFixture({
        key: `45.7${index},4.84`,
        name: PLACE_NAMES[index]!,
        status,
        ...(status === 'unavailable' ? { current: null, days: [], fetchedAt: null } : {}),
      })
    ),
    statuses.map((_, index) =>
      linkFixture({ gardenId: `g${index + 1}`, locationKey: `45.7${index},4.84`, source: 'garden' })
    )
  );

/** A garden that is not located, and no profile default: nothing to show. */
const unlocatedAggregate = (): DashboardWeatherData =>
  weatherFixture([], [linkFixture({ gardenId: 'g1', locationKey: null, source: null })]);

/** The dashboard's gardens and the weather aggregate, one garden per place. */
function serve(weather: DashboardWeatherData) {
  vi.mocked(fetchDashboardData).mockResolvedValue(
    dashboardFixture(
      weather.gardens.map((link, index) =>
        gardenFixture({ id: link.gardenId, name: GARDEN_NAMES[index]! })
      )
    )
  );
  vi.mocked(fetchDashboardWeather).mockResolvedValue(weather);
}

async function renderPage(language: Language = 'fr', mode: 'light' | 'dark' = 'light') {
  // The language through the context the page reads AND through i18next
  // itself — the two sources the page consults, aligned before the render.
  await i18next.changeLanguage(language);
  const theme = createAppTheme(mode);
  render(
    <ThemeProvider theme={theme}>
      <LanguageContext.Provider value={{ language, setLanguage: () => {} }}>
        <UnitSystemProvider>
          <MemoryRouter>
            <GardensDashboard />
          </MemoryRouter>
        </UnitSystemProvider>
      </LanguageContext.Provider>
    </ThemeProvider>
  );
  return { theme };
}

/** The aggregate has landed: the Weather widget left its skeleton. */
const weatherLanded = () =>
  waitFor(() => {
    expect(fetchDashboardWeather).toHaveBeenCalled();
    expect(document.querySelector('[data-weather-skeleton]')).toBeNull();
  });

/** The warning's own nodes — `role="note"` is asserted separately. */
const disclaimers = () => document.querySelectorAll('[data-weather-disclaimer]');

// Review round 1, G1 (GitHub 4067551264): the warning follows the VISIBLE
// weather, and never less. The layout is the stored one — `hidden: true`
// through the preferences, the customization tests' pattern.

/** The widgets that stay on the page beside the weather-bearing ones. */
const SHOWN_BESIDE: readonly DashboardBlockKey[] = ['gardens', 'month', 'counters', 'stats'];

/**
 * A stored Gardener layout with exactly `visible` of the three weather-bearing
 * widgets on the page, the four of `SHOWN_BESIDE` shown and Harvest hidden as
 * the preset has it.
 */
function serveLayoutShowing(visible: readonly DashboardBlockKey[]) {
  const bearing: readonly DashboardBlockKey[] = WEATHER_BEARING_BLOCKS;
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'gardener',
    isPreset: false,
    blocks: presetFor('gardener').map((block) => ({
      ...block,
      hidden: bearing.includes(block.key)
        ? !visible.includes(block.key)
        : !SHOWN_BESIDE.includes(block.key),
    })),
    updatedAt: null,
  });
}

/** The keys of the widgets the grid rendered. */
const renderedWidgets = () =>
  [...document.querySelectorAll('[data-widget]')].map((node) => node.getAttribute('data-widget'));

/**
 * Every node a weather figure is drawn in: the three weather-bearing widgets,
 * the Weather widget's inner surfaces, the Gardens table's MÉTÉO column and
 * cells, and the weather-fed lines of To-do and Tips. If a future change draws
 * weather somewhere else, the list — and the visibility rule — must grow.
 */
const WEATHER_FIGURE_SELECTORS = [
  '[data-widget="weather"]',
  '[data-widget="todo"]',
  '[data-widget="tips"]',
  '[data-weather-band]',
  '[data-weather-head]',
  '[data-weather-located]',
  '[data-weather-attribution]',
  '[data-weather-skeleton]',
  '[data-weather-column]',
  '[data-weather-cell]',
  '[data-todo-task]',
  '[data-todo-weather-note]',
  '[data-tips-tip]',
  '[data-tips-weather-note]',
] as const;

/** Every rendered node of `WEATHER_FIGURE_SELECTORS` — empty when the page draws no weather. */
const weatherFigures = () =>
  WEATHER_FIGURE_SELECTORS.flatMap((selector) => [...document.querySelectorAll(selector)]);

/**
 * The aggregate held back until the test lands it inside `act`, so the DOM
 * read right after is the one the landed data produced — the only proof of
 * landing when the Weather widget, and its skeleton, are off the page.
 */
function holdWeather() {
  let land!: (weather: DashboardWeatherData) => void;
  vi.mocked(fetchDashboardWeather).mockReturnValue(
    new Promise<DashboardWeatherData>((resolve) => {
      land = resolve;
    })
  );
  return (weather: DashboardWeatherData) =>
    act(async () => {
      land(weather);
    });
}

beforeEach(() => {
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'gardener',
    isPreset: true,
    blocks: presetFor('gardener'),
    updatedAt: null,
  });
  serve(aggregateWith('fresh'));
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  await i18next.changeLanguage('fr');
});

describe('GardensDashboard — the weather warning under the grid (SMA-387)', () => {
  it('is shown once, as a note, with the French text of the catalogue, when a place carries fresh data', async () => {
    await renderPage('fr');

    const note = await screen.findByRole('note');
    expect(note).toHaveAttribute('data-weather-disclaimer');
    expect(note.textContent).toBe(fr.dashboard.weatherDisclaimer);
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(disclaimers()).toHaveLength(1);
  });

  it('carries the English text of the catalogue in English', async () => {
    await renderPage('en');

    const note = await screen.findByRole('note');
    expect(note.textContent).toBe(en.dashboard.weatherDisclaimer);
    expect(en.dashboard.weatherDisclaimer).not.toBe(fr.dashboard.weatherDisclaimer);
    expect(screen.getAllByRole('note')).toHaveLength(1);
  });

  it('is shown when the only data on screen is a place’s LAST KNOWN weather (stale beside unavailable)', async () => {
    serve(aggregateWith('unavailable', 'stale'));

    await renderPage('fr');

    await screen.findByRole('note');
    expect(disclaimers()).toHaveLength(1);
  });

  it('sits under the grid, outside every widget, and may wrap — never a nowrap', async () => {
    await renderPage('fr');

    const note = await screen.findByRole('note');
    const widgets = [...document.querySelectorAll('[data-widget]')];
    expect(widgets.length).toBeGreaterThan(0);
    // Every widget precedes the warning in document order: the warning is
    // BELOW the grid, and inside none of its cards.
    for (const widget of widgets) {
      expect(widget.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(note.closest('[data-widget]')).toBeNull();
    const rules = rulesFor(note);
    expect(rules).not.toMatch(/white-space:\s*nowrap/);
    expect(rules).not.toMatch(/(?:^|[{;])width:/);
  });

  it('leaves the Large widget’s own provider credit where it is', async () => {
    // The credit is a line of the Large card only; the Gardener preset serves
    // the widget Medium, so the stored layout puts it Large here.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: presetFor('gardener').map((block) =>
        block.key === 'weather' ? { ...block, size: 'large' } : block
      ),
      updatedAt: null,
    });

    await renderPage('fr');

    const note = await screen.findByRole('note');
    const credit = document.querySelector('[data-weather-attribution]');
    expect(credit).toHaveTextContent('Données météo : WeatherAPI.com');
    expect(credit!.closest('[data-widget="weather"]')).not.toBeNull();
    expect(note.closest('[data-widget="weather"]')).toBeNull();
  });

  it('is absent when no garden is located', async () => {
    serve(unlocatedAggregate());

    await renderPage('fr');

    await weatherLanded();
    expect(screen.queryByRole('note')).toBeNull();
    expect(disclaimers()).toHaveLength(0);
  });

  it('is absent while the aggregate loads', async () => {
    vi.mocked(fetchDashboardWeather).mockReturnValue(new Promise(() => {}));

    await renderPage('fr');

    await screen.findByText('Casa Lolo');
    await waitFor(() => expect(document.querySelector('[data-weather-skeleton]')).not.toBeNull());
    expect(screen.queryByRole('note')).toBeNull();
    expect(disclaimers()).toHaveLength(0);
  });

  it('is absent when every place is unavailable', async () => {
    serve(aggregateWith('unavailable', 'unavailable'));

    await renderPage('fr');

    await weatherLanded();
    expect(screen.queryByRole('note')).toBeNull();
    expect(disclaimers()).toHaveLength(0);
  });

  it('is absent behind a load error: no surface shows a figure then', async () => {
    vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('synthetic'));

    await renderPage('fr');

    expect(await screen.findByText('Impossible de charger la météo.')).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
    expect(disclaimers()).toHaveLength(0);
  });
});

describe('GardensDashboard — the weather warning follows the visible weather, and never less (SMA-387, G1)', () => {
  it.each(WEATHER_BEARING_BLOCKS)(
    'is shown when « %s » is the only weather-bearing widget on the page',
    async (only) => {
      serveLayoutShowing([only]);

      await renderPage('fr');

      await screen.findByRole('note');
      expect(disclaimers()).toHaveLength(1);
      const rendered = renderedWidgets();
      expect(rendered).toContain(only);
      for (const other of WEATHER_BEARING_BLOCKS) {
        if (other !== only) expect(rendered).not.toContain(other);
      }
      // The guards of the negative case below DO catch weather when it is
      // drawn: the selectors find the widget, and with the Weather widget on
      // the page its figures are in the text — « 24° » now, in the hero and
      // in the MÉTÉO cell.
      expect(weatherFigures().length).toBeGreaterThan(0);
      if (only === 'weather') {
        await waitFor(() => expect(document.body.textContent).toContain('24°'));
        expect(document.body.textContent).toMatch(/\d\s?°/);
      }
    }
  );

  it('reads the DOM the landed aggregate produced: the note is there right after the landing', async () => {
    // The landing mechanism of the negative case below, proven on a positive
    // one: no `findBy`, no `waitFor` — the note is asserted SYNCHRONOUSLY
    // after `act`, so a landing that did not flush would fail here first.
    serveLayoutShowing(['todo']);
    const land = holdWeather();

    await renderPage('fr');
    expect(await screen.findAllByText('Casa Lolo')).not.toHaveLength(0);
    await waitFor(() => expect(fetchDashboardWeather).toHaveBeenCalledTimes(1));
    expect(disclaimers()).toHaveLength(0);

    await land(aggregateWith('fresh'));

    expect(disclaimers()).toHaveLength(1);
    expect(screen.getByRole('note')).toHaveAttribute('data-weather-disclaimer');
  });

  it('is absent when none of the three is on the page — and no weather figure is drawn anywhere', async () => {
    // Gardens, « Ce mois-ci », Counters and Statistics shown, the aggregate
    // landed WITH data (a fresh place, 24° now, 16–29 today): the page shows
    // no weather, so it shows no warning. The second half is the guard: if a
    // future change draws weather outside the three widgets, it turns red
    // and the visibility rule has to be revisited.
    serveLayoutShowing([]);
    const land = holdWeather();

    await renderPage('fr');
    expect(await screen.findAllByText('Casa Lolo')).not.toHaveLength(0);
    await waitFor(() => expect(fetchDashboardWeather).toHaveBeenCalledTimes(1));

    await land(aggregateWith('fresh'));

    const rendered = renderedWidgets();
    expect(rendered).toEqual(expect.arrayContaining([...SHOWN_BESIDE]));
    for (const key of WEATHER_BEARING_BLOCKS) expect(rendered).not.toContain(key);
    expect(screen.queryByRole('note')).toBeNull();
    expect(disclaimers()).toHaveLength(0);
    expect(weatherFigures()).toHaveLength(0);
    expect(document.body.textContent).not.toContain('24°');
    expect(document.body.textContent).not.toMatch(/\d\s?°/);
  });
});

describe.each(['light', 'dark'] as const)(
  'GardensDashboard — the weather warning reads at WCAG AA, %s theme (SMA-387)',
  (mode) => {
    it('declares a colour that reaches 4,5:1 over the page canvas', async () => {
      const { theme } = await renderPage('fr', mode);

      const note = await screen.findByRole('note');
      const canvas = resolveColor(theme.palette.background.default, [255, 255, 255])!;
      const declared = [...rulesFor(note).matchAll(/(?:^|[{;])color:([^;}]+)/g)]
        .map((match) => match[1]!.trim())
        .at(-1);
      expect(declared, 'the warning declares its own colour').toBeDefined();
      const foreground = resolveColor(declared!, canvas);
      expect(foreground, `readable colour « ${declared} »`).not.toBeNull();
      expect(contrast(foreground!, canvas)).toBeGreaterThanOrEqual(4.5);
    });
  }
);
