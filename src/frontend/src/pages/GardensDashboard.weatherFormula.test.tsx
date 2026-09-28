import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture, gardenFixture } from '../test/fixtures/dashboard';
import { dayFixture, hoursOf, linkFixture, locationFixture, weatherFixture, weekFixture } from '../test/fixtures/weather';
import { gardens as sceneGardens, varieties as sceneVarieties } from '../test/layout/scenes';
import { todoTasks } from '../components/Dashboard/blocks/todoTasks';
import type { DashboardLevel, DashboardSize } from '../types/Dashboard';
import type { DashboardWeatherData } from '../types/DashboardWeather';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/dashboardApi')>()),
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
  changeFormula: vi.fn(),
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

// SMA-448, lot F4 — THE WEATHER BY FORMULA (V3-02; contract v3 § 4.6): the
// page reads the served capabilities and hands the Weather widget the number
// of cities its formula shows — ONE, fixed, for the Gardener, with the honest
// line that names the cities left out; every one for the Expert, with the
// tabs. A difference of interface, never of data (R8's written exception):
// the aggregate is the same, and the Gardens table's MÉTÉO column keeps each
// garden's own city under both formulas.

const GARDENS = [
  gardenFixture({ id: 'g1', name: 'Terrasse' }),
  gardenFixture({ id: 'g2', name: 'Balcon sud' }),
  gardenFixture({ id: 'g3', name: 'Potager du fond' }),
];
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

/**
 * The server: the account's formula with its capabilities, its stored layout
 * with the Weather widget at `weatherSize`, the catalogue the choice screen
 * reads, the gardens and the aggregate.
 */
function serve(level: DashboardLevel, weatherSize: DashboardSize, weather: DashboardWeatherData = twoCities()) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: false,
    formulaChosen: true,
    blocks: presetFor(level).map((block) =>
      block.key === 'weather' ? { ...block, size: weatherSize, hidden: false } : block
    ),
    updatedAt: null,
  });
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor(level, { gardenCount: GARDENS.length }));
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture(GARDENS));
  vi.mocked(fetchDashboardWeather).mockResolvedValue(weather);
}

function renderPage() {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/gardens']}>
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

/** The Weather widget once the aggregate has landed in it — its skeleton gone. */
async function weatherWidget(): Promise<HTMLElement> {
  await waitFor(() => {
    expect(fetchDashboardWeather).toHaveBeenCalled();
    expect(document.querySelector('[data-widget="weather"]')).not.toBeNull();
    expect(document.querySelector('[data-weather-skeleton]')).toBeNull();
  });
  return document.querySelector('[data-widget="weather"]') as HTMLElement;
}

/** The city each row of the Gardens table reads, in the MÉTÉO column. */
const tableCities = () =>
  [...document.querySelectorAll('[data-widget="gardens"] [data-weather-cell-place]')].map((node) => node.textContent);

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
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the Gardener: one fixed city (SMA-448, lot F4, W2 — V3-02 variant B)', () => {
  it('Weather Large: no tabs, Lyon alone, the honest line naming Annecy — while the MÉTÉO column keeps each garden’s own city', async () => {
    serve('gardener', 'large');
    renderPage();
    const card = await weatherWidget();

    expect(within(card).queryByRole('tablist')).toBeNull();
    expect(within(card).queryByRole('tab')).toBeNull();
    expect(card).toHaveAttribute('aria-label', 'Lyon');
    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('24°');
    expect(within(card).queryByText('21°')).toBeNull();
    expect(card.querySelector('[data-weather-honest]')).toHaveTextContent(
      'Your gardens in Annecy are not shown here. See all your cities'
    );

    // R8's exception is a difference of INTERFACE: the table still says
    // where every garden is, the third one in Annecy.
    await waitFor(() => expect(tableCities()).toEqual(['Lyon', 'Lyon', 'Annecy']));
  });

  it('« See all your cities » opens the formula choice screen; closing it gives the focus back to the link', async () => {
    serve('gardener', 'large');
    renderPage();
    const card = await weatherWidget();

    const link = within(card).getByRole('button', { name: 'See all your cities' });
    expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull();
    link.focus();
    fireEvent.click(link);

    const choice = await screen.findByRole('dialog', { name: 'Choose your formula' });
    fireEvent.click(await within(choice).findByRole('button', { name: 'Close without changing formula' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it('Weather Medium: the line without its link; Small: no line — one city, fixed, at every size', async () => {
    serve('gardener', 'medium');
    const medium = renderPage();
    const mediumCard = await weatherWidget();

    expect(within(mediumCard).queryByRole('tablist')).toBeNull();
    expect(mediumCard).toHaveAttribute('aria-label', 'Lyon');
    expect(mediumCard.querySelector('[data-weather-honest]')).toHaveTextContent('Your gardens in Annecy are not shown here.');
    expect(mediumCard.querySelector('[data-weather-honest-link]')).toBeNull();
    medium.unmount();

    serve('gardener', 'small');
    renderPage();
    const smallCard = await weatherWidget();

    expect(within(smallCard).queryByRole('tablist')).toBeNull();
    expect(smallCard).toHaveAttribute('aria-label', 'Lyon');
    expect(within(smallCard).queryByText('Annecy')).toBeNull();
    expect(smallCard.querySelector('[data-weather-honest]')).toBeNull();
  });
});

describe('the Expert: every city (SMA-448, lot F4, W2)', () => {
  it('Weather Large: a tab per city, no honest line — and the same table', async () => {
    serve('expert', 'large');
    renderPage();
    const card = await weatherWidget();

    const tabs = within(within(card).getByRole('tablist', { name: 'Places' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Lyon · 2 gardens', 'Annecy']);
    expect(card.querySelector('[data-weather-honest]')).toBeNull();

    fireEvent.click(tabs[1]!);
    expect(card).toHaveAttribute('aria-label', 'Annecy');
    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('21°');
    await waitFor(() => expect(tableCities()).toEqual(['Lyon', 'Lyon', 'Annecy']));
  });
});

// SMA-448, lot F4, step W3 — the Expert's three forms on the page, as the
// stored layout sizes the widget: the navigator on Medium, the tabs on Large
// (above), and the FULL WIDTH — a size the served capabilities give the
// Expert's Weather alone (A-N11) — every city at once.
describe('the Expert: every city, at every size (SMA-448, lot F4, W3)', () => {
  it('Weather in the Full width: every city at once — the summary, one column per city — and the table agrees', async () => {
    serve('expert', 'wide');
    renderPage();
    const card = await weatherWidget();

    expect(card.querySelector('[data-weather-summary]')).toHaveTextContent('2 cities · 3 gardens');
    const columns = [...card.querySelectorAll('[data-weather-cities] > [data-weather-city]')];
    expect(columns.map((column) => column.querySelector('[data-weather-city-name]')!.textContent)).toEqual(['Lyon', 'Annecy']);
    expect(columns.map((column) => column.querySelector('[data-weather-temperature]')!.textContent)).toEqual(['24°', '21°']);
    expect(within(card).queryByRole('tablist')).toBeNull();
    expect(card.querySelector('[data-weather-honest]')).toBeNull();
    await waitFor(() => expect(tableCities()).toEqual(['Lyon', 'Lyon', 'Annecy']));
  });

  it('Weather Medium: the compact navigator — « 1 / 2 », the next chevron shows Annecy', async () => {
    serve('expert', 'medium');
    renderPage();
    const card = await weatherWidget();

    const group = within(card).getByRole('group', { name: 'Change city' });
    expect(card.querySelector('[data-weather-rank]')).toHaveTextContent('1 / 2');
    expect(card).toHaveAttribute('aria-label', 'Lyon');
    fireEvent.click(within(group).getByRole('button', { name: 'Next city' }));
    expect(card).toHaveAttribute('aria-label', 'Annecy');
    expect(card.querySelector('[data-weather-temperature]')).toHaveTextContent('21°');
    expect(card.querySelector('[data-weather-honest]')).toBeNull();
  });
});

// SMA-448, lot F4, step W4 — A PAGE NEVER CONTRADICTS ITSELF (A-4) under the
// Gardener: the widget shows ONE city, but every derived figure of the page
// still reads every garden's own city through `displayWeather` — the To-do
// widget lists the frost task of the garden in Annecy while the Weather
// widget shows Lyon and says, in its honest line, that Annecy is not shown.
// R8's exception is a difference of interface, never of data.
describe('the Gardener: one city shown, every city read (SMA-448, lot F4, W4)', () => {
  it('the To-do widget lists the frost task of the garden in Annecy; the Weather widget shows Lyon and names Annecy in its honest line; the warning is there', async () => {
    const annecy = locationFixture({
      key: ANNECY,
      name: 'Annecy',
      days: [
        dayFixture({ date: '2026-09-12', minTempC: -1, maxTempC: 8, hours: hoursOf('2026-09-12', -1, 8) }),
        ...weekFixture().slice(1),
      ],
    });
    const weather = weatherFixture(
      [locationFixture(), annecy],
      [
        linkFixture({ gardenId: 'g1' }),
        linkFixture({ gardenId: 'g2' }),
        linkFixture({ gardenId: 'g3', locationKey: ANNECY, source: 'garden' }),
      ]
    );
    // The scene's gardens: Potager du fond (g3) has placements to protect.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue({
      schemaVersion: 1,
      level: 'gardener',
      capabilities: capabilitiesFor('gardener'),
      isPreset: false,
      formulaChosen: true,
      blocks: presetFor('gardener').map((block) =>
        block.key === 'weather' ? { ...block, size: 'large', hidden: false } : block.key === 'todo' ? { ...block, size: 'large', hidden: false } : block
      ),
      updatedAt: null,
    });
    vi.mocked(fetchFormulas).mockResolvedValue(catalogFor('gardener', { gardenCount: sceneGardens.length }));
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture(sceneGardens));
    vi.mocked(fetchDashboardWeather).mockResolvedValue(weather);
    renderPage();
    const card = await weatherWidget();

    expect(card).toHaveAttribute('aria-label', 'Lyon');
    expect(card.querySelector('[data-weather-honest]')).toHaveTextContent('Your gardens in Annecy are not shown here.');
    expect(card.querySelector('[data-weather-band]')).not.toHaveTextContent(/frost/i);

    const todo = document.querySelector('[data-widget="todo"]') as HTMLElement;
    await waitFor(() => expect(todo.querySelectorAll('[data-todo-task="frost"]')).toHaveLength(1));
    // The one frost task of the scene is Potager du fond's — its placements, its city's minimum.
    const expected = todoTasks(sceneGardens, sceneVarieties, weather).find((task) => task.kind === 'frost')!;
    expect(expected.gardenId).toBe('g3');
    expect(todo.querySelector('[data-todo-task="frost"]')).toHaveTextContent(`${expected.count} plants`);
    expect(todo.querySelector('[data-todo-task="frost"]')).toHaveTextContent('-1°');
    expect(screen.getByRole('note')).toHaveAttribute('data-weather-disclaimer');
    await waitFor(() => expect(tableCities()).toEqual(['Lyon', 'Lyon', 'Annecy']));
  });
});
