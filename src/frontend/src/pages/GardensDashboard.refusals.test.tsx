import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { weatherFixture } from '../test/fixtures/weather';
import type { DashboardLevel } from '../types/Dashboard';

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

vi.mock('../services/weatherApi', () => ({
  fetchDashboardWeather: vi.fn(),
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

vi.mock('../services/profileApi', () => ({ fetchProfile: vi.fn() }));

vi.mock('../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

import { fetchDashboardWeather } from '../services/weatherApi';
import { fetchProfile } from '../services/profileApi';
import { fetchFormulas } from '../services/formulasApi';
import GardensDashboard from './GardensDashboard';
import { createGarden } from '../services/gardenApi';
import {
  changeFormula,
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { HttpStatusError } from '../services/httpStatusError';

// SMA-448, lot F3, step L4 (R3-E1) — A REFUSAL AND A FAILURE, EACH ITS OWN
// TRUTH, on the creation of a garden and on the change of formula: a formula's
// refusal says its reasons with a door to the choice of formula; a 401 says the
// session has expired and how to sign in again; a 403 the server did not
// explain says the right is missing; a failure proposes to try again.

function servePreferences(level: DashboardLevel) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: true,
    formulaChosen: true,
    blocks: presetFor(level),
    updatedAt: null,
  });
}

function renderPage() {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/gardens']}>
          <Routes>
            <Route path="/gardens" element={<GardensDashboard />} />
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

/** Opens the creation dialog, names the garden and submits: the dialog, for what it says next. */
async function createAGarden() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Create Garden' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create a new garden' });
  fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: 'Quatrième' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(createGarden).toHaveBeenCalled());
  return dialog;
}

const gardenLimit = () =>
  new HttpStatusError('Request failed (403)', 403, {
    status: 403,
    code: 'formula.gardenLimit',
    formula: 'novice',
    limit: 3,
    current: 3,
  });

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
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture([]));
  vi.mocked(fetchDashboardWeather).mockResolvedValue(weatherFixture([], []));
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor('gardener', { gardenCount: 3 }));
  servePreferences('gardener');
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the creation of a garden — refused or failed, said truthfully (SMA-448, lot F3, L4 — R3-E1)', () => {
  it('a fourth garden refused by the formula: the dialog says the limit and the count, and « See the formulas » opens the choice of formula', async () => {
    vi.mocked(createGarden).mockRejectedValue(gardenLimit());

    const dialog = await createAGarden();

    const said = await within(dialog).findByText(
      'Your Novice formula allows 3 gardens at most, and you already have 3. To create another one, move to a larger formula.'
    );
    expect(said).toBeInTheDocument();
    expect(within(dialog).queryByText('An error occurred. Please try again.')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'See the formulas' }));

    expect(await screen.findByRole('dialog', { name: 'Choose your formula' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create a new garden' })).toBeNull());
  });

  it('a session that expired: the dialog says so, and « Sign in again » leads to the login page — never « try again »', async () => {
    vi.mocked(createGarden).mockRejectedValue(new HttpStatusError('Request failed (401)', 401));

    const dialog = await createAGarden();

    expect(await within(dialog).findByText('Your session has expired. Sign in again to continue.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/try again/i)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in again' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('a right the account lacks — a 403 the server did not explain — says the right, not a retry', async () => {
    vi.mocked(createGarden).mockRejectedValue(new HttpStatusError('Request failed (403)', 403));

    const dialog = await createAGarden();

    expect(await within(dialog).findByText('Your account is not allowed to do this.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'See the formulas' })).toBeNull();
  });

  it('a failure: « An error occurred. Please try again. » as before', async () => {
    vi.mocked(createGarden).mockRejectedValue(new TypeError('Failed to fetch'));

    const dialog = await createAGarden();

    expect(await within(dialog).findByText('An error occurred. Please try again.')).toBeInTheDocument();
  });
});

describe('the change of formula — a session that expired, said where the user chose (R3-E1)', () => {
  it('in the chooser of the Novice page: the region says the session expired, and « Sign in again » is offered', async () => {
    servePreferences('novice');
    vi.mocked(fetchFormulas).mockResolvedValue(catalogFor('novice', { gardenCount: 1 }));
    vi.mocked(changeFormula).mockRejectedValue(new HttpStatusError('Request failed (401)', 401));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Gardener' }));

    const said = await within(dialog).findByText('Your session has expired. Sign in again to continue.');
    expect(said).toHaveAttribute('role', 'status');
    expect(within(dialog).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in again' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  // SMA-448, PR #297, fix round 1 (A1): the panel chooses no formula any more
  // — its link opens the choice screen, where a session that expired is said.
  it('from the Customize panel’s « Change formula »: the same words, the same way back, said on the choice screen', async () => {
    vi.mocked(changeFormula).mockRejectedValue(new HttpStatusError('Request failed (401)', 401));
    renderPage();
    const customize = await screen.findByRole('button', { name: 'Customize' });
    await waitFor(() => expect(customize).toBeEnabled());
    fireEvent.click(customize);
    const panel = await screen.findByRole('dialog', { name: 'Customize' });
    expect(within(panel).queryAllByRole('radio')).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Novice' }));

    const said = await within(dialog).findByText('Your session has expired. Sign in again to continue.');
    expect(said).toHaveAttribute('role', 'status');
    expect(within(dialog).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    expect(screen.queryByText('Changes not saved')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in again' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});
