import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA } from '../types/DashboardWeather';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { gardens as sceneGardens } from '../test/layout/scenes';
import type { DashboardBlock, DashboardLevel, DashboardSize } from '../types/Dashboard';

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
// refuses (R8), never a difference of interface alone.

/** The Gardens widget — the frozen design's own `data-widget` handle. */
const widget = () => document.querySelector('[data-widget="gardens"]') as HTMLElement;
/** The table's column headers, in order — the visually hidden « Actions » included. */
const headers = () => [...widget().querySelectorAll('thead th')].map((th) => th.textContent);

/** The server: the account's formula with its capabilities, its stored layout with the Gardens widget at `size`. */
function serve(level: DashboardLevel, size: DashboardSize, options: Record<string, unknown> | null = null) {
  const blocks: DashboardBlock[] = presetFor(level).map((block) =>
    block.key === 'gardens' ? { ...block, size, hidden: false, ...(options ? { options } : {}) } : block
  );
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: false,
    formulaChosen: true,
    blocks,
    updatedAt: null,
  });
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor(level, { gardenCount: sceneGardens.length }));
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture(sceneGardens));
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

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchDashboardWeather).mockResolvedValue(EMPTY_WEATHER_DATA);
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
