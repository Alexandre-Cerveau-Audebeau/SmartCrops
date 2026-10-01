import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { weatherFixture } from '../test/fixtures/weather';
import { deferred } from '../test/responses';
import type { DashboardLevel, DashboardPreferences, FormulasCatalog } from '../types/Dashboard';

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

// SMA-437, review of the v3, M4 — the Novice page has no Customize panel and
// no Edit mode: a switch that lands there closes both, so the way back to a
// grid formula starts at rest. Hidden by its condition alone, the panel kept
// `panelOpen` true and came back by itself with the grid — the symptom R2-E1
// fixed for the load error —, and the Edit mode came back with it. Every
// response that decides a step is HELD, then landed inside `act` (SMA-452
// § 12): the reads that follow are proofs, without a bound.
describe('a round trip through the Novice page leaves the Customize panel closed and the Edit mode off (SMA-437, review of the v3, M4)', () => {
  const NAMES = { novice: 'Novice', gardener: 'Gardener', expert: 'Expert' } as const;

  /** The layout the server reads back once the account stands at `level`. */
  const preferencesOf = (level: DashboardLevel): DashboardPreferences => ({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: true,
    formulaChosen: true,
    blocks: presetFor(level),
    updatedAt: null,
  });

  /** The Gardener's grid, its layout held and landed. */
  async function renderTheGardenerGrid() {
    serve('gardener');
    const layout = deferred<DashboardPreferences>();
    vi.mocked(fetchDashboardPreferences).mockReturnValueOnce(layout.promise);
    renderPage();
    await act(async () => layout.resolve(preferencesOf('gardener')));
  }

  /**
   * The choice screen opened by `open`, its catalogue landed (the account at
   * `from`), `to` chosen, and the switch's read-back landed: the page stands
   * at `to`, and the screen has left.
   */
  async function switchThrough(open: () => void, from: DashboardLevel, to: DashboardLevel) {
    const catalogue = deferred<FormulasCatalog>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(catalogue.promise);
    const readBack = deferred<DashboardPreferences>();
    vi.mocked(fetchDashboardPreferences).mockReturnValueOnce(readBack.promise);
    const catalogues = vi.mocked(fetchFormulas).mock.calls.length;
    const reads = vi.mocked(fetchDashboardPreferences).mock.calls.length;

    open();
    // The screen reads its catalogue as it mounts (`useFormulas`): held, it lands now.
    await waitFor(() => expect(fetchFormulas).toHaveBeenCalledTimes(catalogues + 1));
    await act(async () => catalogue.resolve(catalogFor(from, { chosen: true, gardenCount: 2 })));
    fireEvent.click(within(screen.getByRole('dialog', CHOICE)).getByRole('button', { name: `Choose ${NAMES[to]}` }));
    // The switch wrote the layout, switched, and asked for it back: held, it lands now.
    await waitFor(() => expect(fetchDashboardPreferences).toHaveBeenCalledTimes(reads + 1));
    await act(async () => readBack.resolve(preferencesOf(to)));
    expect(changeFormula).toHaveBeenLastCalledWith(to);
    // The screen leaves on MUI's own exit transition — the library's timer, no
    // bound of ours —, and only a screen mounted anew reads the catalogue that
    // the next door needs.
    await waitFor(() => expect(screen.queryByRole('dialog', CHOICE)).toBeNull());
  }

  it('the panel open, its « Change formula » link, Novice, then Gardener from the Novice page’s chip: the grid comes back without the panel', async () => {
    await renderTheGardenerGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    const panel = screen.getByRole('dialog', { name: 'Customize' });

    await switchThrough(() => fireEvent.click(within(panel).getByRole('button', { name: 'Change formula' })), 'gardener', 'novice');
    // The cards page: no panel there.
    expect(screen.queryByRole('dialog', { name: 'Customize' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Novice view — change formula' })).toBeInTheDocument();

    await switchThrough(() => fireEvent.click(screen.getByRole('button', { name: 'Novice view — change formula' })), 'novice', 'gardener');

    expect(screen.queryByRole('dialog', { name: 'Customize' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gardener view — change formula' })).toBeInTheDocument();
  });

  it('the Edit mode on, Novice from the chip, then Gardener from the Novice page’s chip: the grid comes back at rest', async () => {
    await renderTheGardenerGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    await switchThrough(() => fireEvent.click(screen.getByRole('button', { name: 'Gardener view — change formula' })), 'gardener', 'novice');
    await switchThrough(() => fireEvent.click(screen.getByRole('button', { name: 'Novice view — change formula' })), 'novice', 'gardener');

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
