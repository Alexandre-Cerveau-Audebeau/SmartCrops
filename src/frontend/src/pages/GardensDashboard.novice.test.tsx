import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { linkFixture, weatherFixture } from '../test/fixtures/weather';
import { gardens as sceneGardens, varieties as sceneVarieties, weatherAll } from '../test/layout/scenes';
import type { DashboardData } from '../types/DashboardData';
import type { DashboardWeatherData } from '../types/DashboardWeather';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
  changeFormula: vi.fn(),
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

// SMA-448, lot F2 (SMA-436) — THE NOVICE PAGE. A formula is a difference of
// capabilities (R1): the Novice's page is not a grid of widgets but one card
// per garden — its plan in a band, its name, its type and size, its plants,
// its task of the day (variant B, Alexandre 22/09 16:39), the weather of ITS
// city (22/09 18:52) — under the header's chip and « Créer un jardin », with
// no « Modifier », no « Personnaliser », no gallery and no compact bar (A-9).
// The page decides on the capabilities the server serves (R8, § C.2 a):
// `weather: gardenCards` — « no widget: the weather of each garden's own
// city, on its card ».

/** The harness's scene: three gardens, sixteen varieties, 64 placements, every garden in Écully. */
const DATA: DashboardData = {
  gardens: sceneGardens,
  varieties: sceneVarieties,
  totals: { gardenCount: 3, placementCount: 64, varietyCount: 16, catalogPlantCount: 536 },
};

/** Mid-September at noon UTC — the same month in every zone the suite runs in. */
const FROZEN_NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

/** No garden has a city, and no profile default. */
const nowhere = (): DashboardWeatherData =>
  weatherFixture(
    [],
    sceneGardens.map((garden) => linkFixture({ gardenId: garden.id, locationKey: null, source: null }))
  );

function serveNovice() {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'novice',
    capabilities: capabilitiesFor('novice'),
    isPreset: true,
    blocks: presetFor('novice'),
    updatedAt: null,
  });
}

function renderPage() {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

/** The cards of the Novice page, in order. */
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-novice-card]')];

/** The card of a garden, by its id. */
const cardOf = (id: string) => {
  const card = document.querySelector<HTMLElement>(`[data-novice-card="${id}"]`);
  if (!card) throw new Error(`No card for the garden ${id}`);
  return card;
};

/** The warning's own nodes. */
const disclaimers = () => document.querySelectorAll('[data-weather-disclaimer]');

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
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
  vi.mocked(fetchDashboardWeather).mockResolvedValue(weatherAll());
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  serveNovice();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the Novice page — one card per garden, not the grid (SMA-448 lot F2, SMA-436)', () => {
  it('draws one card per garden and no widget: no grid, no « Edit », no « Customize », no compact bar — the chip and « Create Garden » stay', async () => {
    renderPage();

    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(document.querySelectorAll('[data-widget]')).toHaveLength(0);
    expect(document.querySelector('[data-dashboard-grid]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Customize' })).toBeNull();
    expect(document.querySelector('[data-page-actions]')).toBeNull();
    expect(document.querySelector('[data-compact-bar]')).toBeNull();
    expect(screen.getByText('Novice view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Garden' })).toBeInTheDocument();
  });

  it('lists the cards, each named by its garden — an h2 whose link opens the planner — in the gardens’ order', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'Your gardens' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const headings = within(list).getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['Terrasse', 'Balcon sud', 'Potager du fond']);
    expect(within(headings[0]!).getByRole('link', { name: 'Terrasse' })).toHaveAttribute('href', '/gardens/g1/planner');
    // Every widget title of the grid was an h2 too: on this page the h2s are the gardens, and nothing else.
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });

  it('says on each card its type and size, its plants and — when it has one — its task of the day, which reads « To do: »', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const terrasse = cardOf('g1');
    expect(within(terrasse).getByText('Terrace · 10 × 8 · 50 cm')).toBeInTheDocument();
    expect(within(terrasse).getByText('21 plants')).toBeInTheDocument();
    // The plants, in the plan's order, four then « +N ».
    expect(within(terrasse).getByText('tomate, basilic, hortensia, thym +4')).toBeInTheDocument();
    // The first task of the day of THIS garden — watering tonight, 9 placements of high need.
    expect(terrasse.querySelector('[data-novice-task="water"]')).toHaveTextContent(
      'To do: Water tonight — 9 plants with high needs, no rain expected'
    );

    const balcon = cardOf('g2');
    expect(within(balcon).getByText('Balcony · 12 × 4 · 25 cm')).toBeInTheDocument();
    expect(within(balcon).getByText('Ornamental')).toBeInTheDocument();
    expect(within(balcon).getByText('9 plants')).toBeInTheDocument();
    // No task today for the ornamental balcony: no band at all, never an empty one.
    expect(balcon.querySelector('[data-novice-task]')).toBeNull();
  });

  it('shows on each card the temperature of its garden’s own city — and the weather warning under the cards (SMA-387, V1)', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    await waitFor(() => expect(document.querySelectorAll('[data-novice-weather]')).toHaveLength(3));
    expect(within(cardOf('g1')).getByText('24° · Écully')).toBeInTheDocument();
    const note = await screen.findByRole('note');
    expect(note).toHaveAttribute('data-weather-disclaimer');
    expect(disclaimers()).toHaveLength(1);
    // Under the cards, outside every one of them.
    for (const card of cards()) {
      expect(card.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(note.closest('[data-novice-card]')).toBeNull();
  });

  it('offers « Add a city » on a card whose garden has no city — and no warning while no card shows a figure', async () => {
    vi.mocked(fetchDashboardWeather).mockResolvedValue(nowhere());
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Add a city for /u })).toHaveLength(3));
    expect(document.querySelectorAll('[data-novice-weather]')).toHaveLength(0);
    expect(screen.queryByRole('note')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d\s?°/u);
  });

  it('carries the rename and delete of every garden, and « Modified … » with the chevron to the planner', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const terrasse = cardOf('g1');
    expect(within(terrasse).getByRole('button', { name: 'Edit Terrasse' })).toBeInTheDocument();
    expect(within(terrasse).getByRole('button', { name: 'Delete Terrasse' })).toBeInTheDocument();
    expect(within(terrasse).getByText(/^Modified /u)).toBeInTheDocument();
    const chevron = terrasse.querySelector('[data-novice-chevron]');
    expect(chevron).toHaveAttribute('href', '/gardens/g1/planner');
    // Decorative: the name is the one link of the card a keyboard reaches.
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron).toHaveAttribute('tabindex', '-1');
  });

  it('with no garden: an invitation to create one, « No garden yet » under the title, no card and no warning', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture([]));
    vi.mocked(fetchDashboardWeather).mockResolvedValue(weatherFixture([], []));
    renderPage();

    const invite = await screen.findByText('You don’t have a garden yet.');
    expect(invite.closest('[data-novice-empty]')).not.toBeNull();
    expect(screen.getByText('No garden yet')).toBeInTheDocument();
    expect(cards()).toHaveLength(0);
    expect(screen.queryByRole('list', { name: 'Your gardens' })).toBeNull();
    // The gesture that resolves the state, inside the invitation — beside the header's own button.
    expect(screen.getAllByRole('button', { name: 'Create Garden' })).toHaveLength(2);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('while the gardens load: skeletons and no card; when they fail: the error and « Try again », never a blank page', async () => {
    vi.mocked(fetchDashboardData).mockReturnValue(new Promise(() => {}));
    const { unmount } = renderPage();

    await screen.findByText('Novice view');
    await waitFor(() => expect(document.querySelectorAll('[data-novice-skeleton]').length).toBeGreaterThan(0));
    expect(cards()).toHaveLength(0);
    unmount();

    vi.mocked(fetchDashboardData).mockRejectedValue(new Error('down'));
    renderPage();

    expect(await screen.findByText('Unable to load gardens. Please try again later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(cards()).toHaveLength(0);
  });
});
