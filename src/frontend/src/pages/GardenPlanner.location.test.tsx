import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { DashboardWeatherData } from '../types/DashboardWeather';
import type { Garden } from '../types/Garden';
import { linkFixture, locationFixture, weatherFixture } from '../test/fixtures/weather';
import { deferred } from '../test/responses';

vi.mock('../services/plantApi', () => ({ fetchPlants: vi.fn() }));
vi.mock('../services/gardenSettingsApi', () => ({
  openGarden: vi.fn(() => Promise.resolve()),
  saveGardenOrder: vi.fn(),
}));
vi.mock('../services/gardenApi', () => ({
  fetchGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));
vi.mock('../services/gardenLayoutApi', () => ({
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));
// The planner's bounds: a Gardener's catalogue, the 50 × 50 of before.
vi.mock('../services/formulasApi', async () => {
  const { catalogFor } = await import('../test/fixtures/formulas');
  return { fetchFormulas: vi.fn(async () => catalogFor('gardener')) };
});
// Never a real request: the weather service is mocked whole — the aggregate
// the section reads, and the writes of the dialog.
vi.mock('../services/weatherApi', () => ({
  fetchDashboardWeather: vi.fn(),
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

import GardenPlanner from './GardenPlanner';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';
import { clearGardenLocation, fetchDashboardWeather } from '../services/weatherApi';

// SMA-454 — THE CITY OF A GARDEN, FROM ITS PLANNER: « Réglages » carries a
// LOCATION section that says where the garden is and opens the dashboard's
// own location dialog on it — one dialog, several doors: the same target,
// read from the same weather aggregate by the same derivation, the same
// writes, the same re-read after a write, the same honest failures.

const GARDEN = {
  id: 'g1',
  name: 'Terrasse',
  description: null,
  layoutWidth: 2,
  layoutHeight: 2,
  cellSize: '50cm',
  orientation: 'S',
  gardenType: 'terrace',
  lightSchedule: null,
  hemisphere: 'N',
  latitudeBand: 'mid',
} as Garden;

const LAYOUT: GardenLayoutData = {
  width: 2,
  height: 2,
  cellSize: '50cm',
  cellsJson: null,
  config: { orientation: 'S', gardenType: 'terrace', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
  placements: [],
};

const ECULLY = locationFixture({ key: '45.77,4.77', name: 'Écully' });
const LYON = locationFixture({ key: '45.76,4.84', name: 'Lyon' });

/** Terrasse in Écully, its OWN city; Balcon sud reads the profile's, Lyon. */
const ownCity = (): DashboardWeatherData =>
  weatherFixture(
    [ECULLY, LYON],
    [
      linkFixture({ gardenId: 'g1', locationKey: ECULLY.key, source: 'garden' }),
      linkFixture({ gardenId: 'g2', locationKey: LYON.key, source: 'profile' }),
    ]
  );

/** After « Back to the profile city »: Terrasse reads Lyon, the profile's. */
const profileCity = (): DashboardWeatherData =>
  weatherFixture(
    [LYON],
    [
      linkFixture({ gardenId: 'g1', locationKey: LYON.key, source: 'profile' }),
      linkFixture({ gardenId: 'g2', locationKey: LYON.key, source: 'profile' }),
    ]
  );

function renderPlanner() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/gardens/g1/planner']}>
        <Routes>
          <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>
  );
}

/** The planner drawn, then « Réglages » opened: its dialog. */
async function openSettings(name = 'Settings') {
  renderPlanner();
  await screen.findByRole('grid');
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.findByRole('dialog');
}

/** The LOCATION section of the open « Réglages ». */
const section = () => {
  const found = document.querySelector<HTMLElement>('[data-config-location]');
  if (!found) throw new Error('No LOCATION section in « Réglages ».');
  return found;
};

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('smartcrops-language', 'en');
  await i18n.changeLanguage('en');
  vi.mocked(fetchGarden).mockResolvedValue(GARDEN);
  vi.mocked(fetchLayout).mockResolvedValue(LAYOUT);
  vi.mocked(fetchPlants).mockResolvedValue([]);
  vi.mocked(fetchDashboardWeather).mockResolvedValue(ownCity());
  vi.mocked(clearGardenLocation).mockResolvedValue(undefined);
});

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup (vitest's `sequence.hooks = 'stack'`); what it puts
  // back below stays in place until the tree that reads it is gone.
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the planner — the city of a garden in « Réglages » (SMA-454)', () => {
  it('Réglages carries LOCATION, between the orientation and the hemisphere: « loading » until the aggregate lands, then the place the garden reads, and the door', async () => {
    const weather = deferred<DashboardWeatherData>();
    vi.mocked(fetchDashboardWeather).mockReturnValue(weather.promise);
    renderPlanner();
    await screen.findByRole('grid');
    // The aggregate is read for this door, and only while « Réglages » is open.
    expect(fetchDashboardWeather).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = await screen.findByRole('dialog');

    expect(within(section()).getByRole('heading', { level: 3, name: 'LOCATION' })).toBeInTheDocument();
    // In flight: « loading » — never « no place saved » over a place not read yet.
    expect(within(section()).getByText('Loading the current place…')).toBeInTheDocument();
    expect(fetchDashboardWeather).toHaveBeenCalledTimes(1);

    await act(async () => weather.resolve(ownCity()));

    expect(within(section()).getByText('Current place: Écully')).toBeInTheDocument();
    expect(within(section()).getByRole('button', { name: 'Change the location' })).toBeEnabled();
    // Where the dialog's comment keeps the room for geolocation (pre-flight § F.6).
    const orientation = within(settings).getByRole('heading', { level: 3, name: 'ORIENTATION' });
    const hemisphere = within(settings).getByText('HEMISPHERE');
    expect(orientation.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section().compareDocumentPosition(hemisphere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the door opens THE dashboard’s dialog on this garden — « Locate Terrasse », its place, « Back to the profile city » — over « Réglages », which keeps what was typed; closed, the focus is back on the door', async () => {
    const settings = await openSettings();
    await within(section()).findByText('Current place: Écully');
    // Something typed in « Réglages » before the door is taken.
    const columns = within(settings).getByRole('spinbutton', { name: 'Columns' });
    fireEvent.change(columns, { target: { value: '7' } });
    const door = within(section()).getByRole('button', { name: 'Change the location' });
    // As a keyboard does — jsdom gives a clicked button no focus of its own.
    door.focus();

    fireEvent.click(door);

    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });
    expect(within(locate).getByText('Current place: Écully')).toBeInTheDocument();
    expect(within(locate).getByLabelText('City')).toBeInTheDocument();
    expect(within(locate).getByRole('button', { name: 'Back to the profile city' })).toBeInTheDocument();
    expect(within(locate).getByRole('button', { name: 'Use' })).toBeDisabled();

    fireEvent.click(within(locate).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Locate Terrasse' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(door));
    expect(within(settings).getByRole('spinbutton', { name: 'Columns' })).toHaveValue(7);
    expect(clearGardenLocation).not.toHaveBeenCalled();
  });

  it('« Back to the profile city » drops the garden’s own city — the dashboard’s write — then the aggregate is re-read as after a write, and the section says where the garden is now', async () => {
    const reread = deferred<DashboardWeatherData>();
    vi.mocked(fetchDashboardWeather).mockResolvedValueOnce(ownCity()).mockReturnValueOnce(reread.promise);
    await openSettings();
    await within(section()).findByText('Current place: Écully');
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });

    fireEvent.click(within(locate).getByRole('button', { name: 'Back to the profile city' }));

    await waitFor(() => expect(fetchDashboardWeather).toHaveBeenCalledTimes(2));
    expect(clearGardenLocation).toHaveBeenCalledTimes(1);
    expect(clearGardenLocation).toHaveBeenCalledWith('g1');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Locate Terrasse' })).toBeNull());
    // The aggregate on screen predates the write: never the old place while the re-read is out.
    expect(within(section()).getByText('Loading the current place…')).toBeInTheDocument();
    expect(within(section()).queryByText('Current place: Écully')).toBeNull();

    await act(async () => reread.resolve(profileCity()));

    expect(within(section()).getByText('Current place: Lyon')).toBeInTheDocument();
  });

  it('a write the server refuses stays in the dialog, with the dashboard’s honest message — nothing re-read, the place unchanged', async () => {
    vi.mocked(clearGardenLocation).mockRejectedValue(new Error('down'));
    await openSettings();
    await within(section()).findByText('Current place: Écully');
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });

    fireEvent.click(within(locate).getByRole('button', { name: 'Back to the profile city' }));

    expect(await within(locate).findByText('Couldn’t save this place. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Locate Terrasse' })).toBeInTheDocument();
    expect(fetchDashboardWeather).toHaveBeenCalledTimes(1);
    expect(within(locate).getByText('Current place: Écully')).toBeInTheDocument();
  });

  it('an aggregate that cannot be read: the section says the weather is unavailable — never « no place saved » — and the door stays open', async () => {
    vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('down'));
    await openSettings();

    expect(await within(section()).findByText('Weather unavailable — the saved place could not be checked.')).toBeInTheDocument();
    expect(within(section()).queryByText('No place saved yet.')).toBeNull();
    expect(within(section()).getByRole('button', { name: 'Change the location' })).toBeEnabled();
  });

  it('only in « Réglages »: the first setup carries no LOCATION section, and reads no aggregate', async () => {
    vi.mocked(fetchLayout).mockResolvedValue({ ...LAYOUT, width: null, height: null, cellSize: null });
    renderPlanner();

    const setup = await screen.findByRole('dialog');
    expect(within(setup).getByRole('heading', { name: 'Garden settings' })).toBeInTheDocument();
    expect(within(setup).getByText('DIMENSIONS')).toBeInTheDocument();
    expect(document.querySelector('[data-config-location]')).toBeNull();
    expect(fetchDashboardWeather).not.toHaveBeenCalled();
  });

  it('en français : LOCALISATION, « Lieu actuel : Écully », « Modifier la localisation », « Localiser Terrasse »', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    await i18n.changeLanguage('fr');
    await openSettings('Réglages');

    expect(within(section()).getByRole('heading', { level: 3, name: 'LOCALISATION' })).toBeInTheDocument();
    expect(await within(section()).findByText('Lieu actuel : Écully')).toBeInTheDocument();
    fireEvent.click(within(section()).getByRole('button', { name: 'Modifier la localisation' }));

    const locate = await screen.findByRole('dialog', { name: 'Localiser Terrasse' });
    expect(within(locate).getByRole('button', { name: 'Revenir à la ville du profil' })).toBeInTheDocument();
  });
});
