import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../types/DashboardWeather';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { linkFixture, locationFixture, weatherFixture } from '../test/fixtures/weather';
import { gardens as sceneGardens, gardensTwelve } from '../test/layout/scenes';
import { SAVE_DEBOUNCE_MS } from '../hooks/useDashboardPreferences';
import type { DashboardBlock, DashboardLevel, DashboardSize } from '../types/Dashboard';
import type { DashboardGardenData } from '../types/DashboardData';

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

vi.mock('../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

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

import { fetchDashboardWeather } from '../services/weatherApi';
import { fetchProfile } from '../services/profileApi';
import { fetchFormulas } from '../services/formulasApi';
import GardensDashboard from './GardensDashboard';
import { fetchDashboardData, fetchDashboardPreferences, saveDashboardPreferences } from '../services/dashboardApi';

// SMA-448, lot F5-b — THE FULL WIDTH OF THE GARDENS WIDGET ON THE PAGE (V3-03,
// V3-04; contract v3 § 4.7 a; A-N11): the Expert's corner handle steps Large →
// Full width, and the page draws the seven-column table; the Gardener's handle
// never reaches it — a right the served capabilities carry and the server
// refuses (R8), never a difference of interface alone. In it, the settings of
// lot F5-a hold (the count, « + N autres jardins » unfolding in place, the
// search, the sorts), and the page never contradicts itself (A-4): the MÉTÉO
// column reads the page's own weather state, and the warning is on the page
// whenever a weather figure is.

/** The twelve names in the order « Derniers ouverts » lists them (their modification descends with the index). */
const TWELVE = gardensTwelve.map((garden) => garden.name);
const ANNECY = '45.90,6.13';

/** Lyon read by two gardens, Annecy by the third: two cities on one account. */
const twoCities = (): DashboardWeatherData =>
  weatherFixture(
    [
      locationFixture(),
      locationFixture({ key: ANNECY, name: 'Annecy', current: { ...locationFixture().current!, tempC: 21 } }),
    ],
    [
      linkFixture({ gardenId: 'g1' }),
      linkFixture({ gardenId: 'g2' }),
      linkFixture({ gardenId: 'g3', locationKey: ANNECY, source: 'garden' }),
    ]
  );

/** The Gardens widget — the frozen design's own `data-widget` handle. */
const widget = () => document.querySelector('[data-widget="gardens"]') as HTMLElement;
/** The table's column headers, in order — the visually hidden « Actions » included. */
const headers = () => [...widget().querySelectorAll('thead th')].map((th) => th.textContent);
/** The garden rows of the table — never the cut rule, which is a row of its own. */
const rows = () => [...widget().querySelectorAll('tbody tr:not([data-gardens-cut])')];
/** The names of the table's rows, top to bottom. */
const rowNames = () => rows().map((row) => row.querySelector('th a')?.textContent ?? '');
/** The rows of the phone's form (A9), top to bottom. */
const phoneRowNames = () =>
  [...widget().querySelectorAll('[data-garden-row]')].map((row) => row.querySelector('a')?.textContent ?? '');
/** The city each row reads, in the MÉTÉO column. */
const tableCities = () => [...widget().querySelectorAll('[data-weather-cell-place]')].map((node) => node.textContent);

interface Served {
  gardens?: readonly DashboardGardenData[];
  options?: Record<string, unknown> | null;
  /** The aggregate the page reads, or the provider failing. */
  weather?: DashboardWeatherData | 'error';
  /** The Weather widget taken off the page in the stored layout. */
  hideWeather?: boolean;
}

/** The server: the account's formula with its capabilities, its stored layout with the Gardens widget at `size`, its gardens and its weather. */
function serve(
  level: DashboardLevel,
  size: DashboardSize,
  { gardens = sceneGardens, options = null, weather = EMPTY_WEATHER_DATA, hideWeather = false }: Served = {}
) {
  const blocks: DashboardBlock[] = presetFor(level).map((block) => {
    if (block.key === 'gardens') return { ...block, size, hidden: false, ...(options ? { options } : {}) };
    if (block.key === 'weather' && hideWeather) return { ...block, hidden: true };
    return block;
  });
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: false,
    formulaChosen: true,
    blocks,
    updatedAt: null,
  });
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor(level, { gardenCount: gardens.length }));
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture([...gardens]));
  if (weather === 'error') vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('provider down'));
  else vi.mocked(fetchDashboardWeather).mockResolvedValue(weather);
}

async function renderPage(awaited = 'Terrasse') {
  render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/gardens']}>
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
  await screen.findAllByText(awaited);
}

/** Enters the Edit mode from the header, as a user does. */
async function enterEditMode() {
  const edit = await screen.findByRole('button', { name: 'Edit' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  await screen.findByRole('button', { name: 'Done' });
}

/** The layout the page last wrote. */
const lastSaved = () => vi.mocked(saveDashboardPreferences).mock.calls.at(-1)![0];

/** The page believes it is under 600 px: `useMediaQuery(down('sm'))` answers true. */
const stubPhone = () =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width:599.95px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the Full width of the Gardens widget, a right of the Expert (SMA-448, lot F5-b — A-N11, R8)', () => {
  it('the Expert’s corner handle on Gardens at Large steps to the Full width: the seven columns appear, and the layout is saved with « wide »', async () => {
    serve('expert', 'large');
    await renderPage();
    await enterEditMode();

    fireEvent.click(screen.getByRole('button', { name: 'Change the size of Gardens — currently Large' }));

    expect(await screen.findByRole('button', { name: 'Change the size of Gardens — currently Full width' })).toBeInTheDocument();
    expect(headers()).toEqual(['Garden', 'Type', 'Plants', 'Occupancy', 'Exposure', 'Weather', 'Actions']);
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(lastSaved().blocks.find((block) => block.key === 'gardens')!.size).toBe('wide');
  });

  it('the Gardener’s corner handle on Gardens at Large steps to Small — the Full width is never offered, by the interface as by the server', async () => {
    serve('gardener', 'large');
    await renderPage();
    await enterEditMode();

    fireEvent.click(screen.getByRole('button', { name: 'Change the size of Gardens — currently Large' }));

    expect(await screen.findByRole('button', { name: 'Change the size of Gardens — currently Small' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change the size of Gardens — currently Full width' })).toBeNull();
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(lastSaved().blocks.find((block) => block.key === 'gardens')!.size).toBe('small');
  });

  it('an Expert’s stored layout with Gardens in the Full width draws the seven-column table — and the Gardens widget is the only one in that size on the page beside the band', async () => {
    serve('expert', 'wide');
    await renderPage();

    expect(headers()).toEqual(['Garden', 'Type', 'Plants', 'Occupancy', 'Exposure', 'Weather', 'Actions']);
    expect(within(widget()).getByRole('link', { name: 'Open Terrasse' })).toBeInTheDocument();
    expect(widget().querySelector('[data-gardens-wide]')).not.toBeNull();
  });
});

// SMA-448, lot F5-b, step W3 — THE SETTINGS OF LOT F5-a HOLD IN THE FULL WIDTH
// on the page (V3-04; A-N3, A-N4, A-N23): the count as the cap, « + N autres
// jardins » unfolding in place under the rule « Beyond the N shown » and
// writing nothing, the search while a garden is hidden, the five sorts and the
// Expert's custom order.
describe('the settings of lot F5-a hold in the Full width (SMA-448, lot F5-b, W3 — A-N4, A-N23)', () => {
  it('twelve gardens: the eight first by default, « + 4 more gardens », the sort in the foot, the search', async () => {
    serve('expert', 'wide', { gardens: gardensTwelve });
    await renderPage();

    expect(rowNames()).toEqual(TWELVE.slice(0, 8));
    expect(widget().querySelector('[data-gardens-cut]')).toBeNull();
    const more = within(widget()).getByRole('button', { name: '+ 4 more gardens' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(within(widget()).getByText('Sorted by last opened')).toBeInTheDocument();
    expect(within(widget()).getByRole('textbox', { name: 'Search a garden' })).toBeInTheDocument();
  });

  it('unfolds the table IN PLACE under the rule « Beyond the 8 shown », folds it back — and writes NOTHING (A-N23)', async () => {
    serve('expert', 'wide', { gardens: gardensTwelve });
    await renderPage();

    fireEvent.click(within(widget()).getByRole('button', { name: '+ 4 more gardens' }));

    expect(rowNames()).toEqual(TWELVE);
    expect(widget().querySelector('[data-gardens-cut]')).toHaveTextContent('Beyond the 8 shown');
    // The rule sits between the eighth garden and the ninth.
    const all = [...widget().querySelectorAll('tbody tr')];
    expect(all.findIndex((row) => row.hasAttribute('data-gardens-cut'))).toBe(8);
    const less = within(widget()).getByRole('button', { name: 'Show 8 gardens' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    expect(within(widget()).getByRole('textbox', { name: 'Search a garden' })).toBeInTheDocument();

    fireEvent.click(less);
    expect(rowNames()).toEqual(TWELVE.slice(0, 8));
    expect(widget().querySelector('[data-gardens-cut]')).toBeNull();

    // Nothing is written: past the debounce of the layout's save, no PUT.
    await act(() => new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100)));
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
  });

  it('a stored count of five and the alphabetical sort: five rows A to Z, « + 7 more gardens », « Sorted alphabetically »', async () => {
    serve('expert', 'wide', { gardens: gardensTwelve, options: { count: 5, sort: 'name' } });
    await renderPage('Bac à fleurs');

    expect(rowNames()).toEqual(['Bac à fleurs', 'Balcon sud', 'Carré aromatique', 'Grand verger', 'Haie fruitière']);
    expect(within(widget()).getByRole('button', { name: '+ 7 more gardens' })).toBeInTheDocument();
    expect(within(widget()).getByText('Sorted alphabetically')).toBeInTheDocument();
  });

  it('the search finds the hidden gardens too, marks the one beyond the cut, and says the count', async () => {
    serve('expert', 'wide', { gardens: gardensTwelve });
    await renderPage();

    fireEvent.change(within(widget()).getByRole('textbox', { name: 'Search a garden' }), { target: { value: 'VERGÉR' } });

    expect(rowNames()).toEqual(['Grand verger', 'Verger bas']);
    expect([...widget().querySelectorAll('[data-garden-beyond]')].map((node) => node.textContent)).toEqual(['beyond the 8 shown']);
    expect(within(widget()).getByRole('status')).toHaveTextContent('2 gardens of 12 contain “VERGÉR”');
    expect(within(widget()).queryByRole('button', { name: /more garden/ })).toBeNull();
    expect(widget().querySelector('[data-gardens-cut]')).toBeNull();
  });

  it('« custom », « all »: the unranked gardens at the head, newest first, then by place — « In your order », every row, no « + N »', async () => {
    serve('expert', 'wide', { gardens: gardensTwelve, options: { sort: 'custom', count: 'all' } });
    await renderPage();

    const names = rowNames();
    expect(names.slice(0, 9)).toEqual([...TWELVE.slice(3)].reverse());
    expect(names.slice(9)).toEqual(['Balcon sud', 'Serre nord', 'Terrasse']);
    expect(within(widget()).getByText('In your order')).toBeInTheDocument();
    expect(within(widget()).queryByRole('button', { name: /more garden/ })).toBeNull();
    expect(within(widget()).queryByRole('textbox', { name: 'Search a garden' })).toBeNull();
  });

  it('on a phone: the rows of the A9 form, five by default, « + 7 more gardens » unfolding them all in place', async () => {
    stubPhone();
    serve('expert', 'wide', { gardens: gardensTwelve });
    await renderPage();

    expect(widget().querySelector('table')).toBeNull();
    expect(phoneRowNames()).toEqual(TWELVE.slice(0, 5));

    fireEvent.click(within(widget()).getByRole('button', { name: '+ 7 more gardens' }));

    expect(phoneRowNames()).toEqual(TWELVE);
    expect(within(widget()).getByRole('button', { name: 'Show 5 gardens' })).toHaveAttribute('aria-expanded', 'true');
  });
});

// SMA-448, lot F5-b, step W3 — A PAGE NEVER CONTRADICTS ITSELF (A-4, V1) in the
// Full width: the MÉTÉO column reads the SAME aggregate the Weather widget
// draws, through the page's one weather state — ready, in error, or off the
// page —, and the warning is there whenever a weather figure is.
describe('the MÉTÉO column of the Full width follows the page’s weather (SMA-448, lot F5-b, W3 — A-4, V1)', () => {
  it('weather ready: each row reads its garden’s own city, and the warning is on the page', async () => {
    serve('expert', 'wide', { weather: twoCities() });
    await renderPage();

    await waitFor(() => expect(tableCities()).toEqual(['Lyon', 'Lyon', 'Annecy']));
    expect(headers()).toContain('Weather');
    expect(screen.getByRole('note')).toHaveAttribute('data-weather-disclaimer');
  });

  it('weather in error: every cell says « No weather », no figure is invented, and there is no warning', async () => {
    serve('expert', 'wide', { weather: 'error' });
    await renderPage();

    await waitFor(() => expect(within(widget()).getAllByText('No weather')).toHaveLength(3));
    expect(tableCities()).toEqual([]);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('the Weather widget off the page: no MÉTÉO column — six columns, the actions included', async () => {
    serve('expert', 'wide', { weather: twoCities(), hideWeather: true });
    await renderPage();

    expect(headers()).toEqual(['Garden', 'Type', 'Plants', 'Occupancy', 'Exposure', 'Actions']);
    expect(widget().querySelector('[data-weather-column]')).toBeNull();
  });
});
