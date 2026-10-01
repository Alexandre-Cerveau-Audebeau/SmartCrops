import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { DashboardWeatherData } from '../types/DashboardWeather';
import type { Garden } from '../types/Garden';
import { linkFixture, locationFixture, pickFixture, weatherFixture } from '../test/fixtures/weather';
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
import { LOCATION_SEARCH_DEBOUNCE_MS } from '../components/Dashboard/locationTools';
import { fetchGarden, updateGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';
import {
  clearGardenLocation,
  fetchDashboardWeather,
  saveGardenLocation,
  searchLocations,
} from '../services/weatherApi';

// SMA-454 — THE CITY OF A GARDEN, FROM ITS PLANNER: « Réglages » carries a
// LOCATION section that says where the garden is and opens the dashboard's
// own location dialog on it — one dialog, several doors: the same target,
// read from the same weather aggregate by the same derivation, the same
// writes, the same re-read after a write, the same honest failures. So does
// the first setup of a garden without a plan (fix round 1, R2).

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

/** The LOCATION section of the open dialog — « Réglages », or the first setup. */
const section = () => {
  const found = document.querySelector<HTMLElement>('[data-config-location]');
  if (!found) throw new Error('No LOCATION section in the open dialog.');
  return found;
};

/** The layout of a garden without a plan: the planner opens its first setup. */
const NO_PLAN: GardenLayoutData = { ...LAYOUT, width: null, height: null, cellSize: null };

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('smartcrops-language', 'en');
  await i18n.changeLanguage('en');
  // The answers a test queues with `…Once` are dropped here: `clearAllMocks`
  // keeps them, and one a failed test left behind would answer the next
  // test's page.
  vi.mocked(fetchGarden).mockReset();
  vi.mocked(updateGarden).mockReset();
  vi.mocked(fetchDashboardWeather).mockReset();
  vi.mocked(searchLocations).mockReset();
  vi.mocked(saveGardenLocation).mockReset();
  vi.mocked(clearGardenLocation).mockReset();
  vi.mocked(fetchGarden).mockResolvedValue(GARDEN);
  vi.mocked(fetchLayout).mockResolvedValue(LAYOUT);
  vi.mocked(fetchPlants).mockResolvedValue([]);
  vi.mocked(fetchDashboardWeather).mockResolvedValue(ownCity());
  vi.mocked(clearGardenLocation).mockResolvedValue(undefined);
  vi.mocked(saveGardenLocation).mockResolvedValue(undefined);
});

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup (vitest's `sequence.hooks = 'stack'`); what it puts
  // back below stays in place until the tree that reads it is gone.
  cleanup();
  // A test that simulated the clock gives the engine's back — after the
  // unmount, which runs on the clock the test ran on.
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the planner — the city of a garden, in « Réglages » and at its first setup (SMA-454)', () => {
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

  it('the first setup carries LOCATION too (fix round 1, R2), between the orientation and the hemisphere: « loading » until the aggregate lands, then the place the garden reads, and the door — never the danger zone', async () => {
    const weather = deferred<DashboardWeatherData>();
    vi.mocked(fetchDashboardWeather).mockReturnValue(weather.promise);
    vi.mocked(fetchLayout).mockResolvedValue(NO_PLAN);
    renderPlanner();

    // A garden without a plan: its first setup opens by itself, no grid behind it.
    const setup = await screen.findByRole('dialog');
    expect(within(setup).getByRole('heading', { name: 'Garden settings' })).toBeInTheDocument();
    expect(within(setup).getByText('DIMENSIONS')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();

    expect(within(section()).getByRole('heading', { level: 3, name: 'LOCATION' })).toBeInTheDocument();
    // In flight: « loading » — never « no place saved » over a place not read yet.
    expect(within(section()).getByText('Loading the current place…')).toBeInTheDocument();
    expect(fetchDashboardWeather).toHaveBeenCalledTimes(1);

    await act(async () => weather.resolve(ownCity()));

    expect(within(section()).getByText('Current place: Écully')).toBeInTheDocument();
    expect(within(section()).getByRole('button', { name: 'Change the location' })).toBeEnabled();
    const orientation = within(setup).getByRole('heading', { level: 3, name: 'ORIENTATION' });
    const hemisphere = within(setup).getByText('HEMISPHERE');
    expect(orientation.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section().compareDocumentPosition(hemisphere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The danger zone stays « Réglages »' alone: the first setup's Cancel already leaves for the list.
    expect(within(setup).queryByRole('button', { name: 'Delete this garden' })).toBeNull();
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

// SMA-454 — WHAT A CITY CHANGES BESIDE IT. The city is authoritative (fix
// round 1, Alexandre's decision of 01/10/2026): `PUT /api/gardens/{id}/location`
// writes the hemisphere and the latitude band from the city's latitude, always,
// and « Back to the profile city » from the profile's (GardensController
// PutLocation / DeleteLocation). Set from « Réglages », where those two fields
// are, the planner re-reads the garden, and what the re-read brings replaces
// what the open dialog shows — a value chosen in it included.
describe('the planner — a city set from « Réglages » and the exposure it writes (SMA-454)', () => {
  /** Terrasse as a garden of before SMA-17's amendment: no hemisphere, no band stored. */
  const UNSET: Garden = { ...GARDEN, hemisphere: null, latitudeBand: null };
  const SYDNEY = pickFixture({ name: 'Sydney', region: 'New South Wales', country: 'Australia', latitude: -33.87, longitude: 151.21 });

  /**
   * « Sydney » searched and picked in the open location dialog. « Use » stays
   * with the caller, right before the wait for the write: what the write
   * answers then lands inside that wait.
   */
  async function pickSydney(locate: HTMLElement) {
    // The page is loaded: the simulated clock only now (SMA-452) — the search
    // asks the server 400 ms after the last keystroke.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const field = within(locate).getByLabelText('City');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'Sydney' } });
    act(() => {
      vi.advanceTimersByTime(LOCATION_SEARCH_DEBOUNCE_MS);
    });
    // The search's answer lands: its simulated response resolves on the microtask queue.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('option', { name: 'Sydney, New South Wales, Australia' }));
    vi.useRealTimers();
  }

  it('a southern city set from « Réglages » open: the garden is re-read, the hemisphere shown turns « Southern », the band the city wrote replaces one chosen here, and « Save » sends them', async () => {
    const reread = deferred<Garden>();
    // Terrasse as every configured garden is: « N » / « mid » stored.
    vi.mocked(fetchGarden).mockResolvedValueOnce(GARDEN).mockReturnValueOnce(reread.promise);
    vi.mocked(searchLocations).mockResolvedValue([SYDNEY]);
    vi.mocked(updateGarden).mockImplementation(async (id, name, description, config) => ({ ...GARDEN, ...config, id, name, description }));
    const settings = await openSettings();
    await within(section()).findByText('Current place: Écully');
    expect(within(settings).getByRole('radio', { name: 'Northern' })).toBeChecked();
    // A band chosen HERE before the city is set.
    fireEvent.click(within(settings).getByRole('radio', { name: 'High' }));
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });
    await pickSydney(locate);

    fireEvent.click(within(locate).getByRole('button', { name: 'Use' }));

    await waitFor(() => expect(fetchGarden).toHaveBeenCalledTimes(2));
    expect(saveGardenLocation).toHaveBeenCalledWith('g1', SYDNEY);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Locate Terrasse' })).toBeNull());
    // The re-read is still out: nothing has moved yet.
    expect(within(settings).getByRole('radio', { name: 'Northern' })).toBeChecked();
    expect(within(settings).getByRole('radio', { name: 'High' })).toBeChecked();

    // Sydney, 33.87° south: « S » and the temperate band, as the server writes them.
    await act(async () => reread.resolve({ ...GARDEN, hemisphere: 'S', latitudeBand: 'mid' }));

    expect(within(settings).getByRole('radio', { name: 'Southern' })).toBeChecked();
    expect(within(settings).getByRole('radio', { name: 'Mid' })).toBeChecked();
    fireEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateGarden).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateGarden).mock.calls[0]![3]).toMatchObject({ hemisphere: 'S', latitudeBand: 'mid' });
  });

  it('« Back to the profile city » re-reads values already stored, and they still replace a hand choice in the open dialog — the write says so, not a change of value', async () => {
    const reread = deferred<Garden>();
    vi.mocked(fetchGarden).mockResolvedValueOnce(GARDEN).mockReturnValueOnce(reread.promise);
    vi.mocked(updateGarden).mockImplementation(async (id, name, description, config) => ({ ...GARDEN, ...config, id, name, description }));
    const settings = await openSettings();
    await within(section()).findByText('Current place: Écully');
    // Chosen HERE: the south and the sub-polar band.
    fireEvent.click(within(settings).getByRole('radio', { name: 'Southern' }));
    fireEvent.click(within(settings).getByRole('radio', { name: 'High' }));
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });

    fireEvent.click(within(locate).getByRole('button', { name: 'Back to the profile city' }));

    await waitFor(() => expect(fetchGarden).toHaveBeenCalledTimes(2));
    expect(clearGardenLocation).toHaveBeenCalledWith('g1');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Locate Terrasse' })).toBeNull());
    expect(within(settings).getByRole('radio', { name: 'Southern' })).toBeChecked();

    // Lyon, the profile's city, writes « N » / « mid » — what was stored already.
    await act(async () => reread.resolve(GARDEN));

    expect(within(settings).getByRole('radio', { name: 'Northern' })).toBeChecked();
    expect(within(settings).getByRole('radio', { name: 'Mid' })).toBeChecked();
    fireEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateGarden).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateGarden).mock.calls[0]![3]).toMatchObject({ hemisphere: 'N', latitudeBand: 'mid' });
  });

  it('at the first setup too (fix round 1, R2): a southern city set from LOCATION re-reads the garden, the hemisphere shown turns « Southern », and the first setup’s « Save » sends it', async () => {
    const reread = deferred<Garden>();
    vi.mocked(fetchLayout).mockResolvedValue(NO_PLAN);
    vi.mocked(fetchGarden).mockResolvedValueOnce(GARDEN).mockReturnValueOnce(reread.promise);
    vi.mocked(searchLocations).mockResolvedValue([SYDNEY]);
    vi.mocked(updateGarden).mockImplementation(async (id, name, description, config) => ({ ...GARDEN, ...config, id, name, description }));
    renderPlanner();
    const setup = await screen.findByRole('dialog');
    await within(section()).findByText('Current place: Écully');
    expect(within(setup).getByRole('radio', { name: 'Northern' })).toBeChecked();
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });
    await pickSydney(locate);

    fireEvent.click(within(locate).getByRole('button', { name: 'Use' }));

    await waitFor(() => expect(fetchGarden).toHaveBeenCalledTimes(2));
    expect(saveGardenLocation).toHaveBeenCalledWith('g1', SYDNEY);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Locate Terrasse' })).toBeNull());
    expect(within(setup).getByRole('radio', { name: 'Northern' })).toBeChecked();

    await act(async () => reread.resolve({ ...GARDEN, hemisphere: 'S', latitudeBand: 'mid' }));

    expect(within(setup).getByRole('radio', { name: 'Southern' })).toBeChecked();
    fireEvent.click(within(setup).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateGarden).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateGarden).mock.calls[0]![3]).toMatchObject({ hemisphere: 'S', latitudeBand: 'mid' });
  });

  it('a re-read still out never lands over a config save that answered after it — the saved garden stays', async () => {
    const reread = deferred<Garden>();
    vi.mocked(fetchGarden).mockResolvedValueOnce(UNSET).mockReturnValueOnce(reread.promise);
    vi.mocked(updateGarden).mockImplementation(async (id, name, description, config) => ({ ...UNSET, ...config, id, name, description }));
    const settings = await openSettings();
    await within(section()).findByText('Current place: Écully');
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });
    fireEvent.click(within(locate).getByRole('button', { name: 'Back to the profile city' }));
    await waitFor(() => expect(fetchGarden).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Locate Terrasse' })).toBeNull());

    // The user saves « Réglages » while the re-read is out: Southern.
    fireEvent.click(within(settings).getByRole('radio', { name: 'Southern' }));
    fireEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // …then the re-read, sent BEFORE the save, lands with the garden of before.
    await act(async () => reread.resolve(UNSET));

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const reopened = await screen.findByRole('dialog');
    expect(within(reopened).getByRole('radio', { name: 'Southern' })).toBeChecked();
  });

  it('a config save the server refuses leaves the re-read standing — no newer garden answered: the open dialog still shows the hemisphere and the band the city wrote, and the retry sends them', async () => {
    const reread = deferred<Garden>();
    vi.mocked(fetchGarden).mockResolvedValueOnce(UNSET).mockReturnValueOnce(reread.promise);
    vi.mocked(searchLocations).mockResolvedValue([SYDNEY]);
    vi.mocked(updateGarden).mockRejectedValueOnce(new Error('down'));
    const settings = await openSettings();
    await within(section()).findByText('Current place: Écully');
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });
    await pickSydney(locate);
    fireEvent.click(within(locate).getByRole('button', { name: 'Use' }));
    await waitFor(() => expect(fetchGarden).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Locate Terrasse' })).toBeNull());

    // « Save » while the re-read is out — and the server refuses it.
    fireEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    expect(await within(settings).findByText("Couldn't save the garden settings. Please try again.")).toBeInTheDocument();
    expect(within(settings).getByRole('radio', { name: 'Northern' })).toBeChecked();
    // …then the re-read lands: nothing newer answered, so it stands.
    await act(async () => reread.resolve({ ...UNSET, hemisphere: 'S', latitudeBand: 'mid' }));

    expect(within(settings).getByRole('radio', { name: 'Southern' })).toBeChecked();
    vi.mocked(updateGarden).mockImplementation(async (id, name, description, config) => ({ ...UNSET, ...config, id, name, description }));
    fireEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateGarden).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateGarden).mock.calls[1]![3]).toMatchObject({ hemisphere: 'S', latitudeBand: 'mid' });
  });

  it('a re-read still out when the planner goes away is aborted', async () => {
    const reread = deferred<Garden>();
    vi.mocked(fetchGarden).mockResolvedValueOnce(GARDEN).mockReturnValueOnce(reread.promise);
    await openSettings();
    await within(section()).findByText('Current place: Écully');
    fireEvent.click(within(section()).getByRole('button', { name: 'Change the location' }));
    const locate = await screen.findByRole('dialog', { name: 'Locate Terrasse' });
    fireEvent.click(within(locate).getByRole('button', { name: 'Back to the profile city' }));
    await waitFor(() => expect(fetchGarden).toHaveBeenCalledTimes(2));
    const signal = vi.mocked(fetchGarden).mock.calls[1]![1];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);

    cleanup();

    expect(signal!.aborted).toBe(true);
  });
});
