import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { DashboardBlock, DashboardBlockKey, DashboardLevel, DashboardSize } from '../types/Dashboard';
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

// SMA-437, lot V3-08 — STATISTICS, COUNTS AND THIS MONTH IN THE FULL WIDTH, ON
// THE PAGE (A-14, decided by Alexandre on 28/09): an Expert's layout storing
// one of them at `wide` draws its own Full width, never its Large stretched;
// the Expert's corner handle reaches it; ten lines at rest, then a fold that
// unfolds IN PLACE and WRITES NOTHING (a reading position, not a preference);
// and the page never contradicts itself (A-4) — what a Full width counts is
// what the rest of the page counts, folded or unfolded.

/** Lyon, read by every garden: the Weather widget shows a figure, so the warning is on the page (V1). */
const lyon = (gardens: readonly DashboardGardenData[]): DashboardWeatherData =>
  weatherFixture(
    [locationFixture()],
    gardens.map((garden) => linkFixture({ gardenId: garden.id }))
  );

interface Served {
  gardens?: readonly DashboardGardenData[];
  weather?: DashboardWeatherData;
}

/** The server: the Expert's capabilities, a stored layout — the preset, `key` at `size` — its gardens and its weather. */
function serve(key: DashboardBlockKey, size: DashboardSize, { gardens = sceneGardens, weather = EMPTY_WEATHER_DATA }: Served = {}, level: DashboardLevel = 'expert') {
  const blocks: DashboardBlock[] = presetFor(level).map((block) => (block.key === key ? { ...block, size, hidden: false } : block));
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
  vi.mocked(fetchDashboardWeather).mockResolvedValue(weather);
}

async function renderPage(awaited: string) {
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

/** A widget's card — the frozen design's own `data-widget` handle. */
const card = (key: DashboardBlockKey) => document.querySelector(`[data-widget="${key}"]`) as HTMLElement;

/** The page believes it is 900 px wide or more (`useMediaQuery(up('md'))`), under 1 200. */
const stubWidth900 = () =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('min-width:900px') || query.includes('min-width:600px'),
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
  // Unmount FIRST (PR #300, fix round 1, I1): this hook runs before Testing
  // Library's automatic cleanup (vitest's `sequence.hooks = 'stack'`), and the
  // page SENDS a pending layout save as it unmounts — cleared first, the mocks
  // would record that write for the NEXT test.
  cleanup();
  // The clock a test simulated goes back to the engine's own — after the
  // unmount, which runs on the clock the test ran on.
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Statistics in the Full width, on the page (SMA-437, lot V3-08, S2 — A-14)', () => {
  it('the Expert’s corner handle on Statistics at Large steps to the Full width: one line per garden appears, and the layout is saved with « wide »', async () => {
    stubWidth900();
    serve('stats', 'large');
    await renderPage('Terrasse');
    await enterEditMode();

    fireEvent.click(screen.getByRole('button', { name: 'Change the size of Statistics — currently Large' }));

    expect(await screen.findByRole('button', { name: 'Change the size of Statistics — currently Full width' })).toBeInTheDocument();
    expect(card('stats').querySelector('[data-stats-wide="one-line"]')).not.toBeNull();
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(lastSaved().blocks.find((block) => block.key === 'stats')!.size).toBe('wide');
  });

  it('twelve gardens: ten lines at rest, « Show the 2 other gardens » unfolds them in place, « Show less » folds them — and nothing is written', async () => {
    stubWidth900();
    serve('stats', 'wide', { gardens: gardensTwelve });
    await renderPage('Terrasse');
    const lines = () => [...card('stats').querySelectorAll('[data-stat-row]')].map((row) => row.firstElementChild!.textContent);
    expect(lines()).toHaveLength(10);
    // The debounce's time is ADVANCED, never waited (PR #300, fix round 1,
    // T1): the clock is simulated from the gestures on, once the page has
    // loaded on the real one — `setTimeout` and `clearTimeout` only.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    fireEvent.click(within(card('stats')).getByRole('button', { name: 'Show the 2 other gardens' }));
    expect(lines()).toEqual(gardensTwelve.map((garden) => garden.name));

    fireEvent.click(within(card('stats')).getByRole('button', { name: 'Show less' }));
    expect(lines()).toHaveLength(10);

    // Nothing is written: past the debounce of the layout's save, no PUT.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 100);
    });
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
  });

  it('never contradicts the page (A-4): its chip states the Key figures band’s occupancy, folded and unfolded, and draws no weather figure — the warning is the Weather widget’s (V1)', async () => {
    stubWidth900();
    serve('stats', 'wide', { gardens: gardensTwelve, weather: lyon(gardensTwelve) });
    await renderPage('Terrasse');
    const occupancy = () => card('keyfigures').querySelector('[data-key-figure="occupancy"] [data-key-figure-value]')!.textContent;
    const chip = () => card('stats').querySelector('[data-stats-chip]')!.textContent;

    expect(chip()).toContain(`${occupancy()}% average occupancy`);
    fireEvent.click(within(card('stats')).getByRole('button', { name: 'Show the 2 other gardens' }));
    expect(chip()).toContain(`${occupancy()}% average occupancy`);

    // No weather figure of its own — no node of the weather family in it.
    expect(card('stats').innerHTML).not.toMatch(/data-weather/);
    await waitFor(() => expect(screen.getByRole('note')).toHaveAttribute('data-weather-disclaimer'));
  });
});
