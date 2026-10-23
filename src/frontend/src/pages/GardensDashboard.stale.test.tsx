import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { weatherFixture } from '../test/fixtures/weather';
import { deferred } from '../test/responses';
import { SAVE_DEBOUNCE_MS } from '../hooks/useDashboardPreferences';
import type { DashboardLevel, DashboardPreferences } from '../types/Dashboard';

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
import {
  changeFormula,
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { HttpStatusError } from '../services/httpStatusError';

// SMA-437, review of the v3, M11 — THE STALE TAB, on the page: the dashboard
// open at the desk (Gardener) while the phone goes Expert. Back at the desk,
// without a reload, a widget moved sent the Gardener's layout: refused 400 by
// R8, « Modifications non enregistrées », and the next change met the same
// refusal; the choice screen then began by writing that layout too — refused,
// the button seemed to do nothing. Now the refusal is named
// (`formula.stale`), the page re-reads the formula and its layout, and says
// why; a choice made from the stale tab ends on that re-read, the screen
// closed over the fresh page.

const SAID = 'Your formula was changed from another tab or device: the page has been refreshed.';

/** The server: the account's formula, which another device may move; the layout write refuses any other level, as R8 does. */
function serve(level: DashboardLevel) {
  const server = { formula: level };
  vi.mocked(fetchDashboardPreferences).mockImplementation(async () => ({
    schemaVersion: 1,
    level: server.formula,
    capabilities: capabilitiesFor(server.formula),
    isPreset: true,
    formulaChosen: true,
    blocks: presetFor(server.formula),
    updatedAt: null,
  }));
  vi.mocked(saveDashboardPreferences).mockImplementation(async ({ level: written }) => {
    if (written !== server.formula) {
      throw new HttpStatusError('Request failed (409)', 409, { status: 409, code: 'formula.stale', formula: server.formula });
    }
  });
  vi.mocked(fetchFormulas).mockImplementation(async () => catalogFor(server.formula, { gardenCount: 0 }));
  vi.mocked(changeFormula).mockImplementation(async (to) => {
    server.formula = to;
  });
  return server;
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

/** The page up as a Gardener, its Edit mode on: the gestures below write the layout. */
async function openEditMode() {
  const edit = await screen.findByRole('button', { name: 'Edit' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  await screen.findByRole('button', { name: 'Done' });
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
});

afterEach(() => {
  // Unmount FIRST (SMA-452, the rule of PR #300's I1): this hook runs before
  // Testing Library's automatic cleanup (vitest's `sequence.hooks = 'stack'`),
  // and the page sends its pending layout save as it unmounts — cleared first,
  // the mocks would record that write for the next test.
  cleanup();
  // The clock a test faked once its page was up: real again, after the unmount.
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('a tab whose formula changed on another device (SMA-437, review of the v3, M11)', () => {
  it('a layout write refused as stale: the page re-reads the formula and its layout — the Expert’s page —, says why, and retries nothing', async () => {
    const server = serve('gardener');
    renderPage();
    await openEditMode();
    expect(screen.getByRole('button', { name: 'Gardener view — change formula' })).toBeInTheDocument();

    // On the phone, meanwhile: the account goes Expert.
    server.formula = 'expert';

    // The clock faked once the page is up (never before a find): the write
    // leaves when the pause is over; its refusal and the re-read land on the
    // microtasks a 0 ms advance flushes.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Tips' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);
    expect(screen.getByText(SAID)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expert view — change formula' })).toBeInTheDocument();
    expect(screen.queryByText('Changes not saved')).toBeNull();
    // Past another pause: the Gardener's layout is never written again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);
  });

  it('a change of formula from the stale tab: the screen closes over the re-read page, the change is said, and no switch is sent', async () => {
    const server = serve('gardener');
    renderPage();
    await openEditMode();
    server.formula = 'expert';
    // A change whose write is HELD on the wire (SMA-452 § 12): whether its
    // pause ends before or after the choice below, the choice writes it
    // first (S2) and waits for it — and the refusal is released inside
    // `act`, where the test decides, never where a timer races the screen.
    const write = deferred<void>();
    vi.mocked(saveDashboardPreferences).mockReturnValueOnce(write.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Hide Tips' }));

    fireEvent.click(screen.getByRole('button', { name: 'Gardener view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Novice' }));
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalledTimes(1));
    await act(async () => {
      write.reject(new HttpStatusError('Request failed (409)', 409, { status: 409, code: 'formula.stale', formula: 'expert' }));
      await write.promise.catch(() => undefined);
    });

    expect(await screen.findByText(SAID)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull());
    expect(await screen.findByRole('button', { name: 'Expert view — change formula' })).toBeInTheDocument();
    expect(changeFormula).not.toHaveBeenCalled();
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Changes not saved')).toBeNull();
  });

  /** The Customize panel open on the page up as a Gardener. */
  async function openCustomize() {
    const customize = await screen.findByRole('button', { name: 'Customize' });
    await waitFor(() => expect(customize).toBeEnabled());
    fireEvent.click(customize);
    return await screen.findByRole('dialog', { name: 'Customize' });
  }

  // The adversarial re-read of the diff before the PR: the panel stayed live
  // over the re-read, and a change made then was drawn on the layout being
  // replaced and written under the formula left; and the panel's closing on
  // a choice that ended `stale` was claimed, not pinned.
  it('while the page re-reads itself, the Customize panel takes no change — its controls disabled, as during a switch — and comes back live on the fresh page', async () => {
    const server = serve('gardener');
    renderPage();
    const panel = await openCustomize();
    const tips = () => within(panel).getByRole('switch', { name: 'Show — Tips' });
    expect(tips()).toBeEnabled();

    // On the phone, meanwhile: the account goes Expert. The re-read HELD on
    // the wire: the window a change could fall in.
    server.formula = 'expert';
    const reread = deferred<DashboardPreferences>();
    vi.mocked(fetchDashboardPreferences).mockReturnValueOnce(reread.promise);

    vi.useFakeTimers();
    fireEvent.click(tips());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);
    // SMA-457, PR #319, fix round 2 (G1): the notice says the page HAS BEEN
    // refreshed — not while the read is still out; it is read below, once
    // the read has landed.
    expect(screen.queryByText(SAID)).toBeNull();
    expect(tips()).toBeDisabled();

    await act(async () => {
      reread.resolve({
        schemaVersion: 1,
        level: 'expert',
        capabilities: capabilitiesFor('expert'),
        isPreset: true,
        formulaChosen: true,
        blocks: presetFor('expert'),
        updatedAt: null,
      });
      await reread.promise;
    });
    expect(screen.getByText(SAID)).toBeInTheDocument();
    expect(within(panel).getAllByRole('switch')[0]).toBeEnabled();
    // The panel still stands over the page, which MUI hides from assistive technology: the chip is read through it.
    expect(screen.getByRole('button', { name: 'Expert view — change formula', hidden: true })).toBeInTheDocument();
  });

  it('a change of formula asked from the Customize panel: the panel closes with the screen, over the re-read page', async () => {
    const server = serve('gardener');
    renderPage();
    const panel = await openCustomize();
    server.formula = 'expert';
    // A change whose write is HELD (as above): the choice writes it first
    // (S2) and meets the refusal there — released inside `act`.
    const write = deferred<void>();
    vi.mocked(saveDashboardPreferences).mockReturnValueOnce(write.promise);
    fireEvent.click(within(panel).getByRole('switch', { name: 'Show — Tips' }));

    fireEvent.click(within(panel).getByRole('button', { name: 'Change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Novice' }));
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalledTimes(1));
    await act(async () => {
      write.reject(new HttpStatusError('Request failed (409)', 409, { status: 409, code: 'formula.stale', formula: 'expert' }));
      await write.promise.catch(() => undefined);
    });

    expect(await screen.findByText(SAID)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Customize' })).toBeNull());
    expect(await screen.findByRole('button', { name: 'Expert view — change formula' })).toBeInTheDocument();
    expect(changeFormula).not.toHaveBeenCalled();
  });

  // SMA-457, PR #319, fix round 2 — G1 (the GitHub review's outside-diff
  // Minor on the Snackbar's `open`): the notice is a sentence in the past
  // tense, so it follows the read it names — never on the skeletons, never
  // beside the load error, and after a « Try again » that lands.
  it('a stale refusal whose re-read FAILS: the load error and « Try again », no notice — and the retry that lands brings the notice, on the Expert’s page', async () => {
    const LOAD_ERROR = 'Couldn’t load your dashboard.';
    const RETRY = 'Try again';
    const server = serve('gardener');
    renderPage();
    await openEditMode();
    expect(screen.getByRole('button', { name: 'Gardener view — change formula' })).toBeInTheDocument();

    // On the phone, meanwhile: the account goes Expert. The re-read HELD on
    // the wire — and about to fail.
    server.formula = 'expert';
    const reread = deferred<DashboardPreferences>();
    vi.mocked(fetchDashboardPreferences).mockReturnValueOnce(reread.promise);

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Tips' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);

    // The read fails: the page says it could not load and offers « Try
    // again » — and does NOT say it has been refreshed.
    await act(async () => {
      reread.reject(new HttpStatusError('Request failed (503)', 503));
      await reread.promise.catch(() => undefined);
    });
    expect(screen.getByText(LOAD_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RETRY })).toBeInTheDocument();
    expect(screen.queryByText(SAID)).toBeNull();

    // « Try again »: the fake server answers at once — the Expert's page,
    // and the notice, true now.
    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(SAID)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expert view — change formula' })).toBeInTheDocument();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
    // The Gardener's layout is never written again.
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);
  });
});
