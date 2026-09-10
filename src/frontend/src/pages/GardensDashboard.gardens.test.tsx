import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import { presetFor } from '../constants/dashboardPresets';
import type { GardenListItem } from '../types/Garden';
import type { Plant } from '../types/Plant';

vi.mock('../services/gardenApi', () => ({
  fetchGardens: vi.fn(),
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
}));

import GardensDashboard from './GardensDashboard';
import { deleteGarden, fetchGardens, updateGarden } from '../services/gardenApi';
import {
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

// SMA-336 — the fourteen locks MyGardens.test.tsx held, moved to the widget
// that now carries the list (orchestrator decision R1). What each test asserts
// is unchanged; only WHERE it looks moved, plus one scoping fix: the page now
// holds seven other widgets, so "no preview line" is checked INSIDE the
// Gardens widget instead of across the whole document.
//
// SMA-6 locks: the card counter counts DISTINCT PLACED plants (the DTO's
// `plants` array), and preview names go through the shared Library resolver.

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

/** The Gardens widget — the frozen design's own `data-widget` handle. */
const gardensWidget = () =>
  document.querySelector('[data-widget="gardens"]') as HTMLElement;

beforeEach(() => {
  // Gardener preset: Gardens in Large, i.e. the full card list.
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'gardener',
    isPreset: true,
    blocks: presetFor('gardener'),
    updatedAt: null,
  });
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <GardensDashboard />
      </MemoryRouter>
    </LanguageProvider>
  );
}

describe('Gardens widget cards (SMA-6 / SMA-155, moved by SMA-336)', () => {
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
    // Scoped to the widget: the seven invitation widgets carry commas of their
    // own, so the original document-wide query no longer means anything.
    expect(within(gardensWidget()).queryByText(/,/)).toBeNull();
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
          <GardensDashboard />
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
    await waitFor(() => expect(screen.queryByText('Vieux jardin')).toBeNull());
    expect(screen.getByText('Jardin frais')).toBeInTheDocument();
  });
});

// ── SMA-18 lot 1: the card's delete goes through the type-the-name dialog ──
// The list DTO only knows the DISTINCT placed plants, so that is the one
// count the body names here; the toast rides the page's own Snackbar, fed
// either by this dialog or by the planner's router state.
describe('Gardens widget delete flow (SMA-18 lot 1, moved by SMA-336)', () => {
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
    expect(
      within(dialog).getByText('This cannot be undone.')
    ).toBeInTheDocument();
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
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete garden' })
    );

    await waitFor(() => expect(deleteGarden).toHaveBeenCalledWith('g1'));
    // The list is re-fetched (the initial load + the post-delete refresh).
    await waitFor(() => expect(fetchGardens).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Garden deleted')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete this garden?' })
      ).toBeNull()
    );
  });

  it('keeps the dialog open with an inline error when the deletion fails', async () => {
    vi.mocked(deleteGarden).mockRejectedValueOnce(new Error('boom'));
    const dialog = await openDeleteDialog();

    fireEvent.change(
      within(dialog).getByLabelText('Type the garden name to confirm'),
      { target: { value: 'Casa Lolo' } }
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete garden' })
    );

    expect(
      await within(dialog).findByText(
        "Couldn't delete the garden. Please try again."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Delete this garden?' })
    ).toBeInTheDocument();
    expect(fetchGardens).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Garden deleted')).toBeNull();
  });

  it('Cancel closes without deleting', async () => {
    const dialog = await openDeleteDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete this garden?' })
      ).toBeNull()
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
            <Route path="/gardens" element={<GardensDashboard />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );

    expect(await screen.findByText('Garden deleted')).toBeInTheDocument();
    // Consumed once: a refresh (or a back/forward) would find no state to replay.
    await waitFor(() =>
      expect(screen.getByText('state:null')).toBeInTheDocument()
    );
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

// ── SMA-336 round 1 (E9 / G4): the rename error belongs to the dialog it is
// raised in, and leaves with it.
describe('Gardens widget rename errors (SMA-336 round 1)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(updateGarden).mockReset();
  });

  async function openRenameDialog() {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([ivy, fern])]);
    renderPage();
    await screen.findByText('Casa Lolo');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Casa Lolo' }));
    return await screen.findByRole('dialog', { name: 'Edit garden' });
  }

  it('shows a failed rename INSIDE the dialog, not behind it', async () => {
    vi.mocked(updateGarden).mockRejectedValueOnce(new Error('boom'));
    const dialog = await openRenameDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    // The dialog is a modal in a portal: a message on the widget frame sits
    // behind its backdrop, where the user cannot read it.
    const error = await within(dialog).findByText(
      'An error occurred. Please try again.'
    );
    expect(error).toBeInTheDocument();
    expect(within(gardensWidget()).queryByText(
      'An error occurred. Please try again.'
    )).toBeNull();
  });

  it('clears the error when the dialog is cancelled', async () => {
    vi.mocked(updateGarden).mockRejectedValueOnce(new Error('boom'));
    const dialog = await openRenameDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await within(dialog).findByText('An error occurred. Please try again.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit garden' })).toBeNull()
    );
    // Before round 1 the message stayed on the card until the next successful
    // rename — a reported failure with no subject left to explain it.
    expect(
      screen.queryByText('An error occurred. Please try again.')
    ).toBeNull();
  });

  it('clears the error when the dialog is reopened on another garden', async () => {
    vi.mocked(updateGarden).mockRejectedValueOnce(new Error('boom'));
    const dialog = await openRenameDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await within(dialog).findByText('An error occurred. Please try again.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit garden' })).toBeNull()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Casa Lolo' }));

    const reopened = await screen.findByRole('dialog', { name: 'Edit garden' });
    expect(
      within(reopened).queryByText('An error occurred. Please try again.')
    ).toBeNull();
  });

  it('refuses to close while the rename is in flight, and reports its failure', async () => {
    // Round 2 (E'5 / N2). Save is disabled during the request, but Cancel, the
    // backdrop and Escape still reached `closeEditDialog`: the Dialog unmounted
    // with the Alert inside it, and a rename that then failed was reported
    // nowhere. Same close contract as the page's create dialog.
    let reject: (reason: Error) => void = () => {};
    vi.mocked(updateGarden).mockImplementation(
      () => new Promise((_, rejectIt) => (reject = rejectIt))
    );
    const dialog = await openRenameDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateGarden).toHaveBeenCalled());

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

    // PAST the close transition, not in the same tick: MUI keeps a closing
    // Dialog mounted for its 195ms exit, so an assertion fired straight after
    // the click passes whether the handler refused to close or not.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(
      screen.getByRole('dialog', { name: 'Edit garden' })
    ).toBeInTheDocument();

    await act(async () => {
      reject(new Error('boom'));
      await Promise.resolve();
    });

    expect(
      await within(dialog).findByText('An error occurred. Please try again.')
    ).toBeInTheDocument();
    // And once the mutation is over, the dialog closes normally again.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit garden' })).toBeNull()
    );
  });

  it('says it is working while the close is blocked', async () => {
    // Round 3 (N'1): round 2 made the dialog refuse to close during a rename,
    // and left it mute — Cancel still looked live, Save was merely greyed out,
    // and nothing said the dialog was waiting. Same pending shape as
    // DeleteGardenDialog: Cancel disabled, fields disabled, spinner on Save.
    let resolve: (value: { id: string; name: string }) => void = () => {};
    vi.mocked(updateGarden).mockImplementation(
      () => new Promise((resolveIt) => (resolve = resolveIt))
    );
    const dialog = await openRenameDialog();

    const save = within(dialog).getByRole('button', { name: 'Save' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeEnabled();
    expect(save).not.toHaveAttribute('aria-busy', 'true');

    fireEvent.click(save);
    await waitFor(() => expect(updateGarden).toHaveBeenCalled());

    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(save).toBeDisabled();
    expect(cancel).toBeDisabled();
    // The spinner itself is `aria-hidden` — that is the house pattern, and
    // `aria-busy` on the button is what assistive technology reads. Asserted on
    // its class so that deleting the visual indicator cannot leave this green.
    expect(save.querySelector('.MuiCircularProgress-root')).not.toBeNull();
    expect(within(dialog).getByLabelText(/^Name/)).toBeDisabled();
    expect(within(dialog).getByLabelText('Description')).toBeDisabled();

    await act(async () => {
      resolve({ id: 'g1', name: 'Casa Lolo' });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit garden' })).toBeNull()
    );
  });

  it('closes and refetches when the rename succeeds', async () => {
    vi.mocked(updateGarden).mockResolvedValue({ id: 'g1', name: 'Casa Lolo' });
    const dialog = await openRenameDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateGarden).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit garden' })).toBeNull()
    );
    await waitFor(() => expect(fetchGardens).toHaveBeenCalledTimes(2));
  });
});

// ── SMA-18 lot 1 (review round): the dialog through its close transition, and
// the toast through a second deletion.
describe('Gardens widget delete flow — transitions (SMA-18 lot 1, moved by SMA-336)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(deleteGarden).mockReset();
  });

  it('keeps the garden name, count and a DISARMED button while the dialog fades out', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([ivy, fern])]);
    renderPage();
    await screen.findByText('Casa Lolo');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Casa Lolo' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete this garden?',
    });
    fireEvent.change(
      within(dialog).getByLabelText('Type the garden name to confirm'),
      { target: { value: 'Casa Lolo' } }
    );
    expect(
      within(dialog).getByRole('button', { name: 'Delete garden' })
    ).toBeEnabled();

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
      expect(
        screen.queryByRole('dialog', { name: 'Delete this garden?' })
      ).toBeNull()
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
      const dialog = screen.getByRole('dialog', {
        name: 'Delete this garden?',
      });
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
