import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import type { GardenListItem } from '../types/Garden';
import type { Plant } from '../types/Plant';

vi.mock('../services/gardenApi', () => ({
  fetchGardens: vi.fn(),
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

import MyGardens from './MyGardens';
import { deleteGarden, fetchGardens } from '../services/gardenApi';

// SMA-6 locks: the card counter counts DISTINCT PLACED plants (the DTO's
// `plants` array), and preview names go through the shared Library resolver
// (localized common name, scientific fallback).

const ivy = {
  id: 'p1',
  scientificName: 'Hedera helix',
  commonName: 'english ivy',
} as Plant;
const fern = {
  id: 'p2',
  scientificName: 'Athyrium vidalii',
  commonName: null,
} as Plant;

const gardenWith = (plants: Plant[]): GardenListItem => ({
  id: 'g1',
  name: 'Casa Lolo',
  description: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  plants,
});

afterEach(() => vi.clearAllMocks());

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <MyGardens />
      </MemoryRouter>
    </LanguageProvider>
  );
}

describe('MyGardens cards (SMA-6 / SMA-155)', () => {
  beforeEach(() => {
    // English-mechanics tests pin a returning EN visitor via the STORED key —
    // since SMA-393 the no-key default is French (LanguageProvider re-applies
    // the stored language on mount).
    localStorage.setItem('smartcrops-language', 'en');
  });

  it('shows the distinct-placed-plants count and resolver-based preview names', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([ivy, fern])]);

    renderPage();

    expect(await screen.findByText('2 plants')).toBeInTheDocument();
    // Preview = localized common name (sentence-cased) + scientific fallback.
    expect(
      screen.getByText('English ivy, Athyrium vidalii')
    ).toBeInTheDocument();
  });

  it('shows 0 plants and no preview line for a garden with no placements', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([])]);

    renderPage();

    expect(await screen.findByText('0 plants')).toBeInTheDocument();
    expect(screen.queryByText(/,/)).toBeNull();
  });

  it('passes the UI language to the gardens fetch (server-localized names)', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(fetchGardens).toHaveBeenCalled());
    const [, lang] = vi.mocked(fetchGardens).mock.calls[0]!;
    expect(lang).toBe('en');
  });

  it('a first visit with no stored choice fetches gardens in French (SMA-393)', async () => {
    localStorage.removeItem('smartcrops-language');
    vi.mocked(fetchGardens).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(fetchGardens).toHaveBeenCalled());
    const [, lang] = vi.mocked(fetchGardens).mock.calls[0]!;
    expect(lang).toBe('fr');
  });

  it('opens a garden card straight into the planner (SMA-285 pin — no detail page)', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([])]);

    renderPage();
    await screen.findByText('Casa Lolo');

    const link = screen.getByRole('link', { name: /Casa Lolo/ });
    expect(link).toHaveAttribute('href', '/gardens/g1/planner');
  });

  it('discards a stale gardens response that resolves after a newer one (SMA-288)', async () => {
    // Minimal consumer to flip the locale mid-test — flipping re-runs the
    // gardens effect, giving two overlapping in-flight loads.
    function SwitchToFrench() {
      const { setLanguage } = useLanguage();
      return (
        <button type="button" onClick={() => setLanguage('fr')}>
          switch-to-fr
        </button>
      );
    }
    const deferred: Array<(gardens: GardenListItem[]) => void> = [];
    vi.mocked(fetchGardens).mockImplementation(
      () =>
        new Promise<GardenListItem[]>((resolve) => {
          deferred.push(resolve);
        })
    );

    render(
      <LanguageProvider>
        <SwitchToFrench />
        <MemoryRouter>
          <MyGardens />
        </MemoryRouter>
      </LanguageProvider>
    );

    // Load #1 (EN) is in flight; the switch starts load #2 (FR).
    await waitFor(() => expect(deferred.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(2));

    // Newest response lands first...
    deferred[1]!([{ ...gardenWith([]), id: 'g2', name: 'Jardin frais' }]);
    expect(await screen.findByText('Jardin frais')).toBeInTheDocument();

    // ...then the STALE first response resolves last: it must be discarded,
    // never overwriting the newer cards.
    deferred[0]!([{ ...gardenWith([]), id: 'g1', name: 'Vieux jardin' }]);
    await waitFor(() =>
      expect(screen.queryByText('Vieux jardin')).toBeNull()
    );
    expect(screen.getByText('Jardin frais')).toBeInTheDocument();
  });
});

// ── SMA-18 lot 1: the card's delete goes through the type-the-name dialog ──
// The list DTO only knows the DISTINCT placed plants, so that is the one
// count the body names here; the toast rides the page's own Snackbar, fed
// either by this dialog or by the planner's router state.
describe('MyGardens delete flow (SMA-18 lot 1)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(deleteGarden).mockReset();
  });

  async function openDeleteDialog() {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([ivy, fern])]);
    renderPage();
    await screen.findByText('Casa Lolo');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Casa Lolo' }));
    return await screen.findByRole('dialog', { name: 'Delete this garden?' });
  }

  it('opens the type-the-name dialog from the card, naming the distinct plants', async () => {
    const dialog = await openDeleteDialog();

    expect(
      within(dialog).getByText(
        '“Casa Lolo” — its grid and its 2 plants will be permanently deleted.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Delete garden' })
    ).toBeDisabled();
    expect(deleteGarden).not.toHaveBeenCalled();
  });

  it('deletes once the name is typed, refetches the list and toasts', async () => {
    vi.mocked(deleteGarden).mockResolvedValue(undefined);
    const dialog = await openDeleteDialog();

    fireEvent.change(
      within(dialog).getByLabelText('Type the garden name to confirm'),
      { target: { value: 'casa lolo' } }
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete garden' }));

    await waitFor(() => expect(deleteGarden).toHaveBeenCalledWith('g1'));
    // The list is re-fetched (the initial load + the post-delete refresh).
    await waitFor(() => expect(fetchGardens).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Garden deleted')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete this garden?' })).toBeNull()
    );
  });

  it('keeps the dialog open with an inline error when the deletion fails', async () => {
    vi.mocked(deleteGarden).mockRejectedValueOnce(new Error('boom'));
    const dialog = await openDeleteDialog();

    fireEvent.change(
      within(dialog).getByLabelText('Type the garden name to confirm'),
      { target: { value: 'Casa Lolo' } }
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete garden' }));

    expect(
      await within(dialog).findByText("Couldn't delete the garden. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Delete this garden?' })).toBeInTheDocument();
    expect(fetchGardens).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Garden deleted')).toBeNull();
  });

  it('Cancel closes without deleting', async () => {
    const dialog = await openDeleteDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete this garden?' })).toBeNull()
    );
    expect(deleteGarden).not.toHaveBeenCalled();
    expect(screen.getByText('Casa Lolo')).toBeInTheDocument();
  });

  it('toasts on arrival from the planner (router state) and erases that state with a replace that keeps the URL (search + hash)', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([]);
    // Probe: what the router currently holds as location.state and as URL.
    function StateProbe() {
      const location = useLocation();
      return (
        <div>
          <div>state:{JSON.stringify(location.state)}</div>
          <div>
            url:{location.pathname}
            {location.search}
            {location.hash}
          </div>
        </div>
      );
    }
    render(
      <LanguageProvider>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/gardens',
              search: '?sort=name',
              hash: '#top',
              state: { toast: 'gardenDeleted' },
            },
          ]}
        >
          <StateProbe />
          <Routes>
            <Route path="/gardens" element={<MyGardens />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );

    expect(await screen.findByText('Garden deleted')).toBeInTheDocument();
    // Consumed once: a refresh (or a back/forward) would find no state to replay.
    await waitFor(() => expect(screen.getByText('state:null')).toBeInTheDocument());
    // …and ONLY the state went: the replace kept the query and the fragment
    // (review round 1 — a future filter / sort / deep link must survive).
    expect(screen.getByText('url:/gardens?sort=name#top')).toBeInTheDocument();
  });

  it('shows no toast on a plain visit', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(fetchGardens).toHaveBeenCalled());
    expect(screen.queryByText('Garden deleted')).toBeNull();
  });
});

// ── SMA-18 lot 1 (review round): the dialog through its close transition, and
// the toast through a second deletion.
describe('MyGardens delete flow — transitions (SMA-18 lot 1)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(deleteGarden).mockReset();
  });

  it('keeps the garden name, count and a DISARMED button while the dialog fades out', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([ivy, fern])]);
    renderPage();
    await screen.findByText('Casa Lolo');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Casa Lolo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this garden?' });
    fireEvent.change(
      within(dialog).getByLabelText('Type the garden name to confirm'),
      { target: { value: 'Casa Lolo' } }
    );
    expect(within(dialog).getByRole('button', { name: 'Delete garden' })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    // Same tick, mid-transition: the copy has NOT collapsed to an empty name
    // / 0 plants, and the (reset) field no longer matches — the destructive
    // button is disarmed, never re-armed by '' === ''.
    expect(
      screen.getByText(
        '“Casa Lolo” — its grid and its 2 plants will be permanently deleted.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete garden', hidden: true })
    ).toBeDisabled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete this garden?' })).toBeNull()
    );
    expect(deleteGarden).not.toHaveBeenCalled();
  });

  it('a second deletion inside the first toast window gets a FULL window of its own', async () => {
    vi.mocked(deleteGarden).mockResolvedValue(undefined);
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([ivy, fern])]);
    renderPage();
    await screen.findByText('Casa Lolo');

    // Synchronous driver (fake timers below would stall RTL's async polling):
    // the resolved DELETE and the refetch are flushed by advancing 0 ms inside
    // act (the planner's idiom). Confirmed with ENTER, not a click: a click
    // would reach the Snackbar's ClickAwayListener, close the toast and let
    // the success re-open it — which re-arms the timer on its own and would
    // mask the remount this test pins.
    const deleteCasaLolo = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Casa Lolo' }));
      const dialog = screen.getByRole('dialog', { name: 'Delete this garden?' });
      const input = within(dialog).getByLabelText(
        'Type the garden name to confirm'
      );
      fireEvent.change(input, { target: { value: 'Casa Lolo' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    };
    // A timer-driven state flip is applied at the END of its act block and
    // the Snackbar's exit transition then needs its own tick: every "gone?"
    // check advances once past the window and once more for the exit.
    const advance = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    vi.useFakeTimers();
    try {
      await deleteCasaLolo(); // t = 0 — toast #1, window ends at 6 s
      expect(screen.getByText('Garden deleted')).toBeInTheDocument();

      await advance(5_500); // t = 5.5 s (the dialog's exit is long done)
      await deleteCasaLolo(); // toast #2 remounted — its window ends at 11.5 s

      // t = 9 s: past the FIRST window and its exit — still up ONLY because
      // the remount armed a fresh timer.
      await advance(3_000);
      await advance(500);
      expect(screen.getByText('Garden deleted')).toBeInTheDocument();

      // t = 12.5 s: past the SECOND window and its exit — gone.
      await advance(3_000);
      await advance(500);
      expect(screen.queryByText('Garden deleted')).toBeNull();
      expect(deleteGarden).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
