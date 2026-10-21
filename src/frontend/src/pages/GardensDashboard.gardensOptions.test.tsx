import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { HttpStatusError } from '../services/httpStatusError';
import { EMPTY_WEATHER_DATA } from '../types/DashboardWeather';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture, gardenFixture } from '../test/fixtures/dashboard';
import { SAVE_DEBOUNCE_MS } from '../hooks/useDashboardPreferences';
import type { DashboardBlock, DashboardLevel } from '../types/Dashboard';
import type { DashboardGardenData } from '../types/DashboardData';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/gardenSettingsApi', () => ({
  openGarden: vi.fn(),
  saveGardenOrder: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
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

import { fetchDashboardWeather } from '../services/weatherApi';
import { fetchProfile } from '../services/profileApi';
import { saveGardenOrder } from '../services/gardenSettingsApi';
import GardensDashboard from './GardensDashboard';
import {
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

// SMA-448, lot F5-a — the gear of the Gardens widget (V3-04 § 4; A-N3, A-N4,
// A-N5 — decided by Alexandre on 28/09): the count in a segmented group, the
// sorts the FORMULA serves and no other, and, for the Expert's custom order,
// the complete list — moved by ▲ ▼, written to the garden's own route after
// the pause, said in the panel's own region; « Réinitialiser » leaves the
// order where it is.

const NAMES = ['Terrasse', 'Balcon sud', 'Potager du fond', 'Serre nord', 'Carré aromatique'] as const;

const GARDENS: DashboardGardenData[] = NAMES.map((name, index) =>
  gardenFixture({
    id: `g${index}`,
    name,
    updatedAt: `2026-09-${String(20 - index).padStart(2, '0')}T12:00:00Z`,
    createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
    // Terrasse, Balcon sud and Potager du fond ranked 2, 0, 1; the two others never.
    sortOrder: index === 0 ? 2 : index === 1 ? 0 : index === 2 ? 1 : null,
  })
);

const data = dashboardFixture(GARDENS);

const widget = () => document.querySelector('[data-widget="gardens"]') as HTMLElement;

/** The last layout the debounced save sent. */
const lastSaved = () => {
  const calls = vi.mocked(saveDashboardPreferences).mock.calls;
  return calls[calls.length - 1]![0];
};

const gardensOptionsOf = (blocks: { key: string; options?: Record<string, unknown> | null }[]) =>
  blocks.find((block) => block.key === 'gardens')?.options;

const gardensBlocks = (level: DashboardLevel, options: Record<string, unknown> | null): DashboardBlock[] =>
  presetFor(level).map((block) => (block.key === 'gardens' && options ? { ...block, options } : block));

function renderPage(level: DashboardLevel, options: Record<string, unknown> | null = null) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: false,
    formulaChosen: true,
    blocks: gardensBlocks(level, options),
    updatedAt: null,
  });
  // On its route, with the login page beside it: the way back « Sign in
  // again » offers (SMA-437, review of the v3, M3) has somewhere to lead.
  render(
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

/** Edit mode on, the Gardens gear open: the panel's dialog. */
async function openGardensOptions(level: DashboardLevel, options: Record<string, unknown> | null = null) {
  renderPage(level, options);
  await screen.findAllByText('Terrasse');
  const edit = await screen.findByRole('button', { name: 'Edit' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  await screen.findByRole('button', { name: 'Done' });
  fireEvent.click(screen.getByRole('button', { name: 'Gardens options' }));
  return await screen.findByRole('dialog', { name: 'Gardens Widget options' });
}

beforeEach(() => {
  vi.mocked(fetchDashboardWeather).mockResolvedValue(EMPTY_WEATHER_DATA);
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(saveDashboardPreferences).mockClear();
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(saveGardenOrder).mockReset();
  vi.mocked(saveGardenOrder).mockResolvedValue(undefined);
  vi.mocked(fetchDashboardData).mockResolvedValue(data);
});

afterEach(() => {
  // Unmount FIRST (PR #300, fix round 1, I1): this hook runs before Testing
  // Library's automatic cleanup, and the page sends its pending layout save as
  // it unmounts — cleared first, the mocks recorded that write for the next
  // test (the `beforeEach` above clears that mock again; this hook no longer
  // relies on it). Unmounted here, it is cleared with them.
  cleanup();
  // The clock a test faked once its page was up (the refusals below): real again, after the unmount.
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('the count (A-N4)', () => {
  it('offers 5 · 8 · 10 · All, 8 pressed by default with the default’s help, and writes the choice on the block', async () => {
    const panel = await openGardensOptions('expert');

    const group = within(panel).getByRole('group', { name: 'Number of gardens shown' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['5', '8', '10', 'All']);
    expect(within(group).getByRole('button', { name: '8' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByText(/By default: 8 on a desktop, 5 on a phone/)).toBeInTheDocument();

    fireEvent.click(within(group).getByRole('button', { name: '5' }));

    await waitFor(() => expect(gardensOptionsOf(lastSaved().blocks)).toEqual({ count: 5 }));
    expect(within(panel).getByText(/Your choice — it holds on every screen/)).toBeInTheDocument();
    // The widget behind follows: five of the five, no more button.
    expect(widget().querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('« All » writes "all"; « Back to the default » removes the key and keeps the sort', async () => {
    const panel = await openGardensOptions('expert', { count: 10, sort: 'name' });
    const group = within(panel).getByRole('group', { name: 'Number of gardens shown' });
    expect(within(group).getByRole('button', { name: '10' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(group).getByRole('button', { name: 'All' }));
    await waitFor(() => expect(gardensOptionsOf(lastSaved().blocks)).toEqual({ count: 'all', sort: 'name' }));

    fireEvent.click(within(panel).getByRole('button', { name: 'Back to the default' }));
    await waitFor(() => expect(gardensOptionsOf(lastSaved().blocks)).toEqual({ sort: 'name' }));
    expect(within(group).getByRole('button', { name: '8' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the sorts the formula serves (A-N3, R8)', () => {
  it('draws the Gardener’s three — never the creation date nor the custom order', async () => {
    const panel = await openGardensOptions('gardener');

    const radios = within(within(panel).getByRole('radiogroup', { name: 'Gardens sort' })).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(['lastOpened', 'name', 'updated']);
    expect(within(panel).queryByText('Custom order')).toBeNull();
    expect(within(panel).queryByText('Creation date')).toBeNull();
  });

  it('draws the Expert’s five, with each sort’s sense, « Last opened » checked by default, and writes the choice', async () => {
    const panel = await openGardensOptions('expert');

    const group = within(panel).getByRole('radiogroup', { name: 'Gardens sort' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(['lastOpened', 'name', 'created', 'updated', 'custom']);
    expect(within(group).getByRole('radio', { name: /Last opened/ })).toBeChecked();
    expect(within(panel).getByText('a garden never opened ranks by its last change', { exact: false })).toBeInTheDocument();

    fireEvent.click(within(group).getByRole('radio', { name: /Alphabetical/ }));

    await waitFor(() => expect(gardensOptionsOf(lastSaved().blocks)).toEqual({ sort: 'name' }));
    expect(within(widget()).getByText('Sorted alphabetically')).toBeInTheDocument();
  });

  it('does NOT mark the layout « adjusted » (V19)', async () => {
    const panel = await openGardensOptions('expert');
    fireEvent.click(within(panel).getByRole('radio', { name: /Alphabetical/ }));
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());

    expect(screen.queryByText(/adjusted/)).toBeNull();
  });
});

describe('the custom order (A-N5) — the Expert alone', () => {
  it('unfolds the COMPLETE list under « Custom order », the unranked gardens at the head with « New », the rule where the cut falls', async () => {
    const panel = await openGardensOptions('expert', { sort: 'custom', count: 5 });

    expect(within(panel).getByText('Your order — 5 gardens')).toBeInTheDocument();
    const list = within(panel).getByRole('list', { name: 'Your gardens, in your order' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Carré aromatique'),
      expect.stringContaining('Serre nord'),
      expect.stringContaining('Balcon sud'),
      expect.stringContaining('Potager du fond'),
      expect.stringContaining('Terrasse'),
    ]);
    // « New » on the two never ranked, and on them alone.
    expect(rows.map((row) => row.querySelector('[data-gardens-order-new]') !== null)).toEqual([true, true, false, false, false]);
    expect(within(panel).getByText('Your order is kept: switch to another sort and come back, it is intact.')).toBeInTheDocument();
    expect(within(panel).getByText('A garden you create enters at the head of your order.')).toBeInTheDocument();
    // Five shown of five: no rule where the cut falls.
    expect(panel.querySelector('[data-gardens-order-beyond]')).toBeNull();
  });

  it('says where the widget’s cut falls: the rule on the FIRST row beyond the count, and on no other row', async () => {
    // Six gardens under a count of 5 (PR #299, fix round 1, B): a sixth,
    // ranked LAST, so the five shown keep the five names the page waits for.
    const sixth = gardenFixture({
      id: 'g5',
      name: 'Verger bas',
      updatedAt: '2026-09-15T12:00:00Z',
      createdAt: '2026-01-06T12:00:00Z',
      sortOrder: 3,
    });
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture([...GARDENS, sixth]));
    const panel = await openGardensOptions('expert', { sort: 'custom', count: 5 });

    const list = within(panel).getByRole('list', { name: 'Your gardens, in your order' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    // The two never ranked at the head, then the four ranked: « Verger bas »
    // sixth, the first beyond the cut of five — the rule on it, and on it alone.
    expect(rows.map((row) => row.querySelector('[data-gardens-order-beyond]')?.textContent ?? null)).toEqual([
      null,
      null,
      null,
      null,
      null,
      'Beyond the 5 shown in the widget',
    ]);
    expect(rows[5]!.textContent).toContain('Verger bas');
  });

  it('▼ moves a garden, the widget follows at once, the order is written to the garden’s route after the pause — never to the layout — and the region says it', async () => {
    const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
    const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;
    expect(region.textContent).toBe('');

    fireEvent.click(within(panel).getByRole('button', { name: 'Move “Carré aromatique” down' }));

    expect(region.textContent).toBe('“Carré aromatique” moves to 2nd position.');
    const list = within(panel).getByRole('list', { name: 'Your gardens, in your order' });
    expect(within(list).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Serre nord'),
      expect.stringContaining('Carré aromatique'),
      expect.stringContaining('Balcon sud'),
      expect.stringContaining('Potager du fond'),
      expect.stringContaining('Terrasse'),
    ]);
    // The widget behind follows at once.
    const names = [...widget().querySelectorAll('tbody tr th a')].map((a) => a.textContent);
    expect(names).toEqual(['Serre nord', 'Carré aromatique', 'Balcon sud', 'Potager du fond', 'Terrasse']);
    expect(saveGardenOrder).not.toHaveBeenCalled();

    await act(() => new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100)));

    expect(saveGardenOrder).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveGardenOrder).mock.calls[0]![0]).toEqual(['g3', 'g4', 'g1', 'g2', 'g0']);
    await waitFor(() => expect(region.textContent).toBe('Order saved.'));
    // The layout's document never carried the order.
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
  });

  it('says « Order saved. » once, for the write that finished last — a move made while a write is out waits its turn (PR #299, fix round 1, C)', async () => {
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    vi.mocked(saveGardenOrder).mockReturnValueOnce(first).mockResolvedValueOnce(undefined);
    const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
    const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;

    fireEvent.click(within(panel).getByRole('button', { name: 'Move “Carré aromatique” down' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100)));
    expect(saveGardenOrder).toHaveBeenCalledTimes(1);

    // A second move while the first write is still out: it waits its turn — nothing on the wire beside the first, nothing said.
    fireEvent.click(within(panel).getByRole('button', { name: 'Move “Carré aromatique” down' }));
    expect(region.textContent).toBe('“Carré aromatique” moves to 3rd position.');
    await act(() => new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100)));
    expect(saveGardenOrder).toHaveBeenCalledTimes(1);
    expect(region.textContent).toBe('“Carré aromatique” moves to 3rd position.');

    // The first lands: the latest list goes now, and « saved » is said for it, once.
    await act(async () => {
      releaseFirst();
    });
    await waitFor(() => expect(saveGardenOrder).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveGardenOrder).mock.calls[1]![0]).toEqual(['g3', 'g1', 'g4', 'g2', 'g0']);
    await waitFor(() => expect(region.textContent).toBe('Order saved.'));
  });

  // SMA-437, review of the v3, M3 — R3-E1 applied to the order's region: a
  // write that did not go through is said for what it is — a failure and its
  // retry, as before; a formula without the custom order; a session that
  // expired, with the way to sign in again — never « the next change retries »
  // to a user it would mislead. The pause before the write is advanced on a
  // clock faked once the page and the panel are up (never before a find), and
  // the refusal is flushed through the hook's promise chain before the region
  // is read — no wait on a timer.
  describe('a write that did not go through, said for what it is (SMA-437, review of the v3, M3 — R3-E1)', () => {
    /** One move, its write let out after the pause, and its refusal landed. */
    async function moveAndLetTheWriteFail(panel: HTMLElement) {
      vi.useFakeTimers();
      fireEvent.click(within(panel).getByRole('button', { name: 'Move “Carré aromatique” down' }));
      await act(async () => {
        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      });
      expect(saveGardenOrder).toHaveBeenCalledTimes(1);
      await act(async () => {
        for (let hop = 0; hop < 6; hop++) await Promise.resolve();
      });
    }

    const orderKept = (panel: HTMLElement) => {
      const list = within(panel).getByRole('list', { name: 'Your gardens, in your order' });
      expect(within(list).getAllByRole('listitem')[1]!.textContent).toContain('Carré aromatique');
    };

    it('a failure the server did not explain — a 503 — keeps the order on screen and says the next change retries, as before', async () => {
      vi.mocked(saveGardenOrder).mockRejectedValue(new HttpStatusError('Request failed (503)', 503));
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;

      await moveAndLetTheWriteFail(panel);

      expect(region.textContent).toBe('Order not saved — the next change retries.');
      orderKept(panel);
      expect(within(panel).queryByRole('button', { name: 'Sign in again' })).toBeNull();
    });

    it('a bare Error — a network that dropped before any status — says the same', async () => {
      vi.mocked(saveGardenOrder).mockRejectedValue(new TypeError('Failed to fetch'));
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;

      await moveAndLetTheWriteFail(panel);

      expect(region.textContent).toBe('Order not saved — the next change retries.');
      orderKept(panel);
    });

    it('a write the server refuses — 403 formula.gardenOrder — keeps the order on screen and says the formula has no custom order, never a retry', async () => {
      vi.mocked(saveGardenOrder).mockRejectedValue(
        new HttpStatusError('Request failed (403)', 403, { status: 403, code: 'formula.gardenOrder', formula: 'gardener' })
      );
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;

      await moveAndLetTheWriteFail(panel);

      expect(region.textContent).toBe('Order not saved — your Gardener formula does not allow a custom order.');
      expect(region.textContent).not.toMatch(/retries/);
      orderKept(panel);
      expect(within(panel).queryByRole('button', { name: 'Sign in again' })).toBeNull();
    });

    it('a 403 the server did not explain — a right the account lacks — says so, never a retry, and no way to sign in again', async () => {
      vi.mocked(saveGardenOrder).mockRejectedValue(new HttpStatusError('Request failed (403)', 403));
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;

      await moveAndLetTheWriteFail(panel);

      expect(region.textContent).toBe('Your account is not allowed to do this.');
      expect(region.textContent).not.toMatch(/retries/);
      orderKept(panel);
      expect(within(panel).queryByRole('button', { name: 'Sign in again' })).toBeNull();
    });

    it('a session that expired — 401 — says so, and « Sign in again » leads to the login page — never « the next change retries »', async () => {
      vi.mocked(saveGardenOrder).mockRejectedValue(new HttpStatusError('Request failed (401)', 401));
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;

      await moveAndLetTheWriteFail(panel);

      expect(region.textContent).toBe('Your session has expired. Sign in again to continue.');
      expect(region.textContent).not.toMatch(/retries/);
      orderKept(panel);
      fireEvent.click(within(panel).getByRole('button', { name: 'Sign in again' }));
      // `useReconnect` awaits the logout before it navigates: microtasks, flushed here — no timer, the clock is faked.
      await act(async () => {
        for (let hop = 0; hop < 6; hop++) await Promise.resolve();
      });
      expect(screen.getByText('login page')).toBeInTheDocument();
    });

    // SMA-457, PR #319, fix round 1 — S1 (CodeRabbit Extension, draw 1a5247d8,
    // minor): the hook is the page's and outlives the panel. A panel closed and
    // reopened while the hook still holds an 'error' must say it — a failure is
    // the PRESENT until the next move clears it (`schedule`), not the past a
    // « saved » that landed is. The reopened panel is a FRESH mount: the
    // Popover unmounts its content on « Done » (no `keepMounted`), so the region
    // is born empty again and the ref is seeded again.
    /** « Done », the Popover's exit run on the faked clock — the panel UNMOUNTED —, then the gear again: a fresh panel. */
    async function closeAndReopen(panel: HTMLElement): Promise<HTMLElement> {
      fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      // Gone, not hidden: a reopen is a remount, or the test proves nothing.
      expect(screen.queryByRole('dialog', { name: 'Gardens Widget options' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Gardens options' }));
      return screen.getByRole('dialog', { name: 'Gardens Widget options' });
    }

    it('closed and reopened after a 401: the fresh panel says the session expired, and « Sign in again » is there (SMA-457, PR #319, fix round 1 — S1)', async () => {
      vi.mocked(saveGardenOrder).mockRejectedValue(new HttpStatusError('Request failed (401)', 401));
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      await moveAndLetTheWriteFail(panel);
      expect((panel.querySelector('[data-gardens-options-said]') as HTMLElement).textContent).toBe('Your session has expired. Sign in again to continue.');

      const reopened = await closeAndReopen(panel);

      const region = reopened.querySelector('[data-gardens-options-said]') as HTMLElement;
      expect(region.textContent).toBe('Your session has expired. Sign in again to continue.');
      expect(region.textContent).not.toMatch(/retries/);
      expect(within(reopened).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    });

    it('closed and reopened after a 503: the fresh panel says the next change retries, and offers no way to sign in again (S1)', async () => {
      vi.mocked(saveGardenOrder).mockRejectedValue(new HttpStatusError('Request failed (503)', 503));
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      await moveAndLetTheWriteFail(panel);

      const reopened = await closeAndReopen(panel);

      const region = reopened.querySelector('[data-gardens-options-said]') as HTMLElement;
      expect(region.textContent).toBe('Order not saved — the next change retries.');
      expect(within(reopened).queryByRole('button', { name: 'Sign in again' })).toBeNull();
    });

    it('closed and reopened after a write that LANDED: the fresh panel says nothing — the past stays unannounced (S1, the kept half of the rule)', async () => {
      const panel = await openGardensOptions('expert', { sort: 'custom', count: 'all' });
      const region = panel.querySelector('[data-gardens-options-said]') as HTMLElement;
      // The same gestures as `moveAndLetTheWriteFail`, the write let LAND: the proof it did is the sentence.
      vi.useFakeTimers();
      fireEvent.click(within(panel).getByRole('button', { name: 'Move “Carré aromatique” down' }));
      await act(async () => {
        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
      });
      expect(saveGardenOrder).toHaveBeenCalledTimes(1);
      await act(async () => {
        for (let hop = 0; hop < 6; hop++) await Promise.resolve();
      });
      expect(region.textContent).toBe('Order saved.');

      const reopened = await closeAndReopen(panel);

      expect((reopened.querySelector('[data-gardens-options-said]') as HTMLElement).textContent).toBe('');
      expect(within(reopened).queryByRole('button', { name: 'Sign in again' })).toBeNull();
    });
  });

  // SMA-437, lot V3-07, P2 (contract A-17 — Alexandre, 28/09): « Réinitialiser »
  // puts back the LAYOUT alone — the order, the sizes, what is shown — and
  // keeps each widget's settings: the count and the sort stay, as the order
  // of the gardens stays (A-N5). The two say the same thing: a reset puts back
  // a layout, never a setting. This test pinned the reset that erased them.
  it('« Reset » of the layout keeps the count and the sort, and leaves the order where it is', async () => {
    const panel = await openGardensOptions('expert', { sort: 'custom', count: 5 });
    fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));
    // An arrangement for the reset to undo: Tips hidden.
    fireEvent.click(screen.getByRole('button', { name: 'Hide Tips' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset the Expert layout' }));

    // The reset's own write: Tips shown again — then what it carried.
    await waitFor(() => expect(lastSaved().blocks.find((block) => block.key === 'tips')?.hidden).toBe(false));
    expect(gardensOptionsOf(lastSaved().blocks)).toEqual({ sort: 'custom', count: 5 });
    expect(saveGardenOrder).not.toHaveBeenCalled();
  });
});
