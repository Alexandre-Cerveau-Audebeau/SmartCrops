import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

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
import { createGarden } from '../services/gardenApi';
import GardensDashboard from './GardensDashboard';
import {
  changeFormula,
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { HttpStatusError } from '../services/httpStatusError';

// SMA-448, PR #297, fix round 1 (A1) — Alexandre, 27/09: « Pourquoi on peut
// quand même switch de formule depuis le menu Personnaliser ? Il faut
// centraliser cette fonctionnalité. » THE CHOICE SCREEN IS THE ONE PLACE
// WHERE THE FORMULA CHANGES. Every other control is a DOOR to it — the chip
// of every formula, the Novice page's foot link, « Voir les formules » of a
// creation the limit refused and of the planner's refusal, and the
// Customize panel's link, which replaces the choice of level the panel had —
// and none of them changes the formula itself: the server is called from the
// screen's buttons, nowhere else.

const PATIENCE = { timeout: 10000 };
const CHOICE = { name: 'Choose your formula' };

function serve(level: DashboardLevel, gardenCount = 2) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: true,
    formulaChosen: true,
    blocks: presetFor(level),
    updatedAt: null,
  });
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor(level, { chosen: true, gardenCount }));
}

function renderPage(state: { formulas?: boolean } | null = null) {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={[{ pathname: '/gardens', state }]}>
          <Routes>
            <Route path="/gardens" element={<GardensDashboard />} />
          </Routes>
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

/** The screen open, the server untouched: a door, not a switch. */
async function expectTheScreenOpenAndNothingSwitched() {
  const dialog = await screen.findByRole('dialog', CHOICE, PATIENCE);
  expect(await within(dialog).findAllByRole('button', { name: /^(Choose|Keep) / }, PATIENCE)).toHaveLength(3);
  expect(changeFormula).not.toHaveBeenCalled();
  return dialog;
}

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
  vi.mocked(changeFormula).mockResolvedValue(undefined);
});

afterEach(() => {
  // Unmount FIRST (SMA-452, the rule of PR #300's I1): this hook runs before
  // Testing Library's automatic cleanup (vitest's `sequence.hooks = 'stack'`),
  // and the page sends its pending layout save as it unmounts — cleared first,
  // the mocks would record that write for the next test.
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('every door leads to the choice screen, and none changes the formula itself (SMA-448, PR #297, fix round 1, A1)', () => {
  it.each(['novice', 'gardener', 'expert'] as const)('%s: the chip of the header', async (level) => {
    serve(level);
    renderPage();
    const name = { novice: 'Novice', gardener: 'Gardener', expert: 'Expert' }[level];

    fireEvent.click(await screen.findByRole('button', { name: `${name} view — change formula` }, PATIENCE));

    await expectTheScreenOpenAndNothingSwitched();
  });

  it('the Novice page’s foot link', async () => {
    serve('novice', 1);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Switch to the Gardener formula →' }, PATIENCE));

    await expectTheScreenOpenAndNothingSwitched();
  });

  it('« See the formulas » of a creation the limit refused', async () => {
    serve('novice', 3);
    vi.mocked(createGarden).mockRejectedValue(
      new HttpStatusError('Request failed (403)', 403, { status: 403, code: 'formula.gardenLimit', formula: 'novice', limit: 3, current: 3 })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Create Garden' }, PATIENCE));
    const creation = await screen.findByRole('dialog', { name: 'Create a new garden' });
    fireEvent.change(within(creation).getByLabelText(/Name/), { target: { value: 'Quatrième' } });
    fireEvent.click(within(creation).getByRole('button', { name: 'Create' }));

    fireEvent.click(await within(creation).findByRole('button', { name: 'See the formulas' }, PATIENCE));

    await expectTheScreenOpenAndNothingSwitched();
  });

  it('the planner’s « See the formulas », which arrives here with the formulas in its state', async () => {
    serve('novice', 1);
    renderPage({ formulas: true });

    await expectTheScreenOpenAndNothingSwitched();
  });

  it.each(['gardener', 'expert'] as const)('%s: the Customize panel holds no choice of formula — its « Change formula » link opens the screen, and the focus returns to the link when the screen closes', async (level) => {
    serve(level);
    renderPage();
    const customize = await screen.findByRole('button', { name: 'Customize' }, PATIENCE);
    await waitFor(() => expect(customize).toBeEnabled());
    fireEvent.click(customize);
    const panel = await screen.findByRole('dialog', { name: 'Customize' }, PATIENCE);

    // No level to choose, anywhere in the panel: the formula is named, not chosen, here.
    expect(within(panel).queryAllByRole('radio')).toEqual([]);
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
    expect(within(panel).getByText(level === 'gardener' ? 'Gardener' : 'Expert')).toBeInTheDocument();
    const link = within(panel).getByRole('button', { name: 'Change formula' });
    expect(link).toHaveAttribute('aria-haspopup', 'dialog');

    link.focus();
    fireEvent.click(link);
    const dialog = await expectTheScreenOpenAndNothingSwitched();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close without changing formula' }));

    await waitFor(() => expect(screen.queryByRole('dialog', CHOICE)).toBeNull(), PATIENCE);
    expect(screen.getByRole('dialog', { name: 'Customize' })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(link), PATIENCE);
  });

  it('the screen is the one place that switches: from the panel’s link, choosing Expert calls the server once, the page becomes the Expert’s, the panel still open on it', async () => {
    serve('gardener');
    renderPage();
    const customize = await screen.findByRole('button', { name: 'Customize' }, PATIENCE);
    await waitFor(() => expect(customize).toBeEnabled());
    fireEvent.click(customize);
    const panel = await screen.findByRole('dialog', { name: 'Customize' }, PATIENCE);
    fireEvent.click(within(panel).getByRole('button', { name: 'Change formula' }));
    const dialog = await expectTheScreenOpenAndNothingSwitched();
    // What the server holds once the account is Expert.
    serve('expert');

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Expert' }, PATIENCE));

    await waitFor(() => expect(changeFormula).toHaveBeenCalledTimes(1));
    expect(changeFormula).toHaveBeenCalledWith('expert');
    await waitFor(() => expect(screen.queryByRole('dialog', CHOICE)).toBeNull(), PATIENCE);
    expect(await screen.findByText('Expert view', {}, PATIENCE)).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Customize' })).getByText('Expert')).toBeInTheDocument();
  });
});
