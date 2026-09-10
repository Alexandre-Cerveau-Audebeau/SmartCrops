import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import { presetFor } from '../constants/dashboardPresets';
import type {
  DashboardData,
  DashboardGardenData,
} from '../types/DashboardData';

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

import GardensDashboard from './GardensDashboard';
import {
  createGarden,
  deleteGarden,
  updateGarden,
} from '../services/gardenApi';
import {
  fetchDashboardData,
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

// SMA-336 PR 2/5 — the widget reads the transport aggregate now, so the
// fixture builds ITS shape. What each test asserts is unchanged wherever the
// widget still shows the same thing; the three cases that named a card's
// preview line moved with the Large body, which is a table.
const gardenWith = (
  varieties: number,
  over: Partial<DashboardGardenData> = {}
): DashboardGardenData => ({
  id: 'g1',
  name: 'Casa Lolo',
  description: null,
  width: 4,
  height: 3,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
    gardenType: null,
    lightSchedule: null,
    hemisphere: 'N',
    latitudeBand: 'mid',
  },
  updatedAt: '2026-05-01T00:00:00Z',
  placements: [],
  placementCount: varieties,
  varietyCount: varieties,
  occupiedCells: varieties,
  isEdible: varieties > 0 ? false : null,
  ...over,
});

const dashboardWith = (gardens: DashboardGardenData[]): DashboardData => ({
  gardens,
  varieties: [],
  totals: {
    gardenCount: gardens.length,
    placementCount: gardens.reduce((sum, g) => sum + g.placementCount, 0),
    varietyCount: gardens.reduce((sum, g) => sum + g.varietyCount, 0),
    catalogPlantCount: 536,
  },
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

  // REWRITTEN by SMA-336 PR 2/5, and these are the only two of the twenty-two.
  // The Gardens widget is Large at the Gardener preset, and Large is now the
  // comparison table: it states plants and varieties in its own column instead
  // of a chip and a preview line. What is asserted — the counts are the DISTINCT
  // placed plants, and an empty garden says zero rather than nothing — is the
  // lock SMA-6 set and it survives verbatim.
  it('states the placement count and the DISTINCT variety count', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([gardenWith(2, { placementCount: 5, varietyCount: 2 })])
    );

    renderPage();

    await screen.findByText('Casa Lolo');
    const widget = within(gardensWidget());
    expect(widget.getByText('5')).toBeInTheDocument();
    expect(widget.getByText('2 var.')).toBeInTheDocument();
  });

  it('says zero for a garden with no placement, rather than leaving the cell blank', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(0)]));

    renderPage();

    await screen.findByText('Casa Lolo');
    const widget = within(gardensWidget());
    expect(widget.getByText('0')).toBeInTheDocument();
    expect(widget.getByText('0 var.')).toBeInTheDocument();
  });

  it('passes the UI language to the gardens fetch (server-localized names)', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([]));

    renderPage();

    await waitFor(() => expect(fetchDashboardData).toHaveBeenCalled());
    const [lang] = vi.mocked(fetchDashboardData).mock.calls[0]!;
    expect(lang).toBe('en');
  });

  it('a first visit with no stored choice fetches gardens in French (SMA-393)', async () => {
    localStorage.removeItem('smartcrops-language');
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([]));

    renderPage();

    await waitFor(() => expect(fetchDashboardData).toHaveBeenCalled());
    const [lang] = vi.mocked(fetchDashboardData).mock.calls[0]!;
    expect(lang).toBe('fr');
  });

  it('opens a garden card straight into the planner (SMA-285 pin — no detail page)', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(0)]));

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
    const deferred: Array<(data: DashboardData) => void> = [];
    vi.mocked(fetchDashboardData).mockImplementation(
      () =>
        new Promise<DashboardData>((resolve) => {
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
    deferred[1]!(dashboardWith([gardenWith(0, { id: 'g2', name: 'Jardin frais' })]));
    expect(await screen.findByText('Jardin frais')).toBeInTheDocument();

    // ...then the STALE first response resolves last: it must be discarded,
    // never overwriting the newer cards.
    deferred[0]!(dashboardWith([gardenWith(0, { id: 'g1', name: 'Vieux jardin' })]));
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
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(2)]));
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
    await waitFor(() => expect(fetchDashboardData).toHaveBeenCalledTimes(2));
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
    expect(fetchDashboardData).toHaveBeenCalledTimes(1);
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
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([]));
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
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([]));
    renderPage();

    await waitFor(() => expect(fetchDashboardData).toHaveBeenCalled());
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
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(2)]));
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
    await waitFor(() => expect(fetchDashboardData).toHaveBeenCalledTimes(2));
  });
});

// ── SMA-336 round 4 (E'''2): a dialog that refuses to close has to SAY so out
// loud. `aria-busy` sits on a DISABLED button, which assistive technology does
// not announce, and the spinner is `aria-hidden` — so the pending shape of
// round 3 reached a screen-reader user through nothing at all. Each dialog now
// carries a live region, mounted at all times and empty when idle so the
// announcement is not lost together with the insertion.
describe('Gardens dialogs speak their pending state (SMA-336 round 4)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(updateGarden).mockReset();
    vi.mocked(createGarden).mockReset();
  });

  it('the rename dialog announces that it is saving, and goes quiet after', async () => {
    let resolve: (value: { id: string; name: string }) => void = () => {};
    vi.mocked(updateGarden).mockImplementation(
      () => new Promise((resolveIt) => (resolve = resolveIt))
    );
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(2)]));
    renderPage();
    await screen.findByText('Casa Lolo');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Casa Lolo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit garden' });

    // Already there before the request, and silent. Scoped to the dialog: the
    // page carries dnd-kit's own live region, which is also a `status`.
    const status = within(dialog).getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.textContent).toBe('');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateGarden).toHaveBeenCalled());

    expect(status).toHaveTextContent('Saving...');

    await act(async () => {
      resolve({ id: 'g1', name: 'Casa Lolo' });
      await Promise.resolve();
    });

    // The rename over, the dialog leaves and takes the status with it. Checked
    // on THIS node and on the text: dnd-kit gives the page a `role="status"`
    // live region of its own, so a document-wide query never comes back empty.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit garden' })).toBeNull()
    );
    await waitFor(() => expect(status.isConnected).toBe(false));
    expect(screen.queryByText('Saving...')).toBeNull();
  });

  it('the create dialog announces that it is creating, and disarms Cancel', async () => {
    // The create dialog has carried the same in-flight close guard since round
    // 2 and said nothing about it: Cancel stayed live and silently did nothing.
    let resolve: (value: { id: string; name: string }) => void = () => {};
    vi.mocked(createGarden).mockImplementation(
      () => new Promise((resolveIt) => (resolve = resolveIt))
    );
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(1)]));
    renderPage();
    await screen.findByText('Casa Lolo');

    fireEvent.click(screen.getByRole('button', { name: 'Create Garden' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Create a new garden',
    });
    fireEvent.change(within(dialog).getByLabelText(/^Name/), {
      target: { value: 'Potager' },
    });

    const status = within(dialog).getByRole('status');
    expect(status.textContent).toBe('');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeEnabled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(createGarden).toHaveBeenCalled());

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Creating...');
    expect(cancel).toBeDisabled();
    expect(within(dialog).getByLabelText(/^Name/)).toBeDisabled();

    await act(async () => {
      resolve({ id: 'g2', name: 'Potager' });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Create a new garden' })
      ).toBeNull()
    );
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
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(2)]));
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
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([gardenWith(2)]));
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

// ── V10: the description is back on the page.
//
// « Mes Jardins » printed it on every card — clamped to two lines, with a
// « See more » toggle above 80 characters (MyGardens.tsx, deleted by #267). The
// widget carried it on the wire from the first commit of this lot and edited it
// in the rename dialog, and showed it nowhere: a regression against the page it
// replaced, on a field the user can still write.
describe('Gardens widget — the garden description (V10)', () => {
  const described = (description: string | null) =>
    dashboardWith([gardenWith(3, { description })]);

  beforeEach(() => localStorage.setItem('smartcrops-language', 'en'));

  it('shows it under the garden name on the Large table', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(
      described('Le coin sud, refait au printemps.')
    );

    renderPage();

    await screen.findByText('Casa Lolo');
    expect(
      within(gardensWidget()).getByText('Le coin sud, refait au printemps.')
    ).toBeInTheDocument();
  });

  it('is reachable by the keyboard, with the whole text on it', async () => {
    // A truncated line is only honest if the rest is reachable. Two things make
    // it so: the line is in the tab order, and `describeChild` puts the full
    // text on the element itself, which is what a screen reader announces and
    // what the browser shows on focus.
    //
    // MUI's own popper opens on KEYBOARD focus, which jsdom cannot produce:
    // `:focus-visible` is false there even after a real `user-event` Tab, so
    // asserting the popper on focus would assert the test environment rather
    // than the widget. The hover and touch tests below cover the popper; this
    // one covers what a keyboard user actually gets.
    const long =
      'Le coin sud, refait au printemps, avec les tomates contre le mur et ' +
      'la menthe qui déborde du bac depuis deux étés.';
    vi.mocked(fetchDashboardData).mockResolvedValue(described(long));

    renderPage();
    await screen.findByText('Casa Lolo');
    const line = within(gardensWidget()).getByText(long);

    expect(line).toHaveAttribute('tabindex', '0');
    expect(line).toHaveAttribute('title', long);

    const user = userEvent.setup();
    await user.tab();
    let guard = 0;
    while (document.activeElement !== line && guard++ < 40) await user.tab();
    expect(document.activeElement).toBe(line);
  });

  it('opens the tooltip on hover', async () => {
    const text = 'Le coin sud, refait au printemps.';
    vi.mocked(fetchDashboardData).mockResolvedValue(described(text));

    renderPage();
    await screen.findByText('Casa Lolo');

    fireEvent.mouseOver(within(gardensWidget()).getByText(text));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(text);
  });

  it('opens the tooltip on touch, where there is no hover', async () => {
    // Alexandre's decision: on a phone the tooltip is what a long-press opens,
    // and it stays open long enough to read. `enterTouchDelay={0}` is what makes
    // the first touch open it instead of the second.
    const text = 'Balcon plein sud, arrosage tous les deux jours.';
    vi.mocked(fetchDashboardData).mockResolvedValue(described(text));

    renderPage();
    await screen.findByText('Casa Lolo');
    const line = within(gardensWidget()).getByText(text);

    fireEvent.touchStart(line);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(text);
  });

  it('says nothing at all when the garden has no description', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(described(null));

    renderPage();

    await screen.findByText('Casa Lolo');
    const widget = within(gardensWidget());
    expect(widget.queryByRole('tooltip')).toBeNull();
    // The identity cell keeps its dimensions line and nothing stands in for a
    // description that does not exist.
    expect(widget.getByText('4 × 3')).toBeInTheDocument();
  });

  it('is not on the Medium card, where the row is one 44 px line', async () => {
    // The frozen design gives a Medium row five elements — thumbnail, name,
    // counts, type chip, chevron — and the old page had only one card size to
    // compare against. Stated rather than assumed: the full text stays one size
    // away, on the Large table.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue({
      schemaVersion: 1,
      level: 'novice',
      isPreset: true,
      blocks: presetFor('novice'),
      updatedAt: null,
    });
    vi.mocked(fetchDashboardData).mockResolvedValue(
      described('Le coin sud, refait au printemps.')
    );

    renderPage();

    await screen.findByText('Casa Lolo');
    expect(
      within(gardensWidget()).queryByText('Le coin sud, refait au printemps.')
    ).toBeNull();
  });
});

// ── Round 2 ───────────────────────────────────────────────────────────────────
// V8, V11, V12 and the Medium description tooltip. jsdom lays nothing out and
// scrolls nothing, so the layout defects are asserted on the DECLARATIONS a
// browser resolves and on the STRUCTURE that makes them true — a measured width
// would be zero here and would prove nothing either way.

/** The Emotion class of a node, matched by its `css-` prefix, not by position. */
function emotionClass(node: Element): string {
  const found = [...node.classList].find((name) => name.startsWith('css-'));
  if (!found) {
    throw new Error(
      `No Emotion class on <${node.tagName.toLowerCase()} class="${node.className}">`
    );
  }
  return found;
}

/** The stylesheet rules Emotion emitted for a node, joined. */
const rulesFor = (node: Element) =>
  [...document.querySelectorAll('style')]
    .map((tag) => tag.textContent ?? '')
    .filter((text) => text.includes(emotionClass(node)))
    .join(' ');

/** The Gardens table's actions cells: the header cell first, then one per row. */
function actionCells(): HTMLElement[] {
  const table = gardensWidget().querySelector('table');
  if (!table) throw new Error('The Gardens widget is not showing its table');
  return [...table.querySelectorAll('tr')].map((row) => {
    const last = row.lastElementChild;
    if (!last) throw new Error('A table row has no cells at all');
    return last as HTMLElement;
  });
}

async function renderExpert() {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'expert',
    isPreset: true,
    blocks: presetFor('expert'),
    updatedAt: null,
  });
  renderPage();
  // `findAllByText`: at Expert the Statistics widget names the same garden, so
  // the singular query is ambiguous by construction rather than by accident.
  await screen.findAllByText('Casa Lolo');
}

async function renderNovice() {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'novice',
    isPreset: true,
    blocks: presetFor('novice'),
    updatedAt: null,
  });
  renderPage();
  await screen.findAllByText('Casa Lolo');
}

describe('Gardens table — the actions column is frozen to the right (V8)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([gardenWith(3)])
    );
  });

  it('is a COLUMN and not a strip laid over the row', async () => {
    // The whole of Alexandre's constraint rests on this distinction. A sticky
    // cell is laid out as a cell: its width is taken out of the row once, so
    // scrolled fully right it rests at its own place and the last data cell
    // stops just before it. An absolutely positioned strip reserves nothing and
    // would sit on top of the last column at every scroll position.
    renderPage();
    await screen.findByText('Casa Lolo');

    const [header, ...rows] = actionCells();
    expect(header!.tagName).toBe('TH');
    expect(rows).not.toHaveLength(0);
    for (const cell of rows) expect(cell.tagName).toBe('TD');

    for (const cell of actionCells()) {
      const style = getComputedStyle(cell);
      expect(style.position).toBe('sticky');
      expect(style.right).toBe('0px');
    }
  });

  it('declares its width, so the row is laid out around it', async () => {
    renderPage();
    await screen.findByText('Casa Lolo');

    for (const cell of actionCells()) {
      const rules = rulesFor(cell);
      expect(rules).toContain('width:96px');
      expect(rules).toContain('min-width:96px');
    }
  });

  it('is opaque, so the scrolling cells never show through it', async () => {
    // Worst on the dark theme, where the cells that pass underneath carry light
    // text over a dark card. The fill is the card's own paper.
    renderPage();
    await screen.findByText('Casa Lolo');

    for (const cell of actionCells()) {
      const background = getComputedStyle(cell).backgroundColor;
      expect(background).not.toBe('');
      expect(background).not.toBe('transparent');
      expect(background).not.toMatch(/rgba\([^)]*,\s*0\)$/);
    }
  });

  it('separates its borders, so the rules travel with the frozen cells', async () => {
    // Under `border-collapse: collapse` the borders belong to the table rather
    // than to the cell that declares them, so they stay behind when a sticky
    // cell moves.
    renderPage();
    await screen.findByText('Casa Lolo');

    const table = gardensWidget().querySelector('table')!;
    expect(rulesFor(table)).toContain('border-collapse:separate');
  });

  it('keeps both buttons named and reachable, wherever the table is scrolled', async () => {
    // Being sticky is what keeps them ON SCREEN at any scroll offset; being
    // ordinary focusable buttons in the row is what keeps them reachable
    // without scrolling at all.
    renderPage();
    await screen.findByText('Casa Lolo');
    const widget = within(gardensWidget());

    for (const name of ['Edit Casa Lolo', 'Delete Casa Lolo']) {
      const button = widget.getByRole('button', { name });
      expect(button).not.toBeDisabled();
      button.focus();
      expect(document.activeElement).toBe(button);
    }
  });

  it('names its header for a screen reader while hiding it from the eye', async () => {
    renderPage();
    await screen.findByText('Casa Lolo');

    const header = actionCells()[0]!;
    const label = within(header).getByText('Actions');
    const style = getComputedStyle(label);
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('1px');
    expect(style.height).toBe('1px');
    expect(style.overflow).toBe('hidden');
  });
});

describe('Gardens table — the plan thumbnail is in the identity cell (V11)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([gardenWith(3)])
    );
  });

  it('at Gardener, where the HARVEST column is off', async () => {
    renderPage();
    await screen.findByText('Casa Lolo');

    expect(
      within(gardensWidget()).getAllByTestId('template-preview')
    ).toHaveLength(1);
  });

  it('at Expert too, where the HARVEST column is on', async () => {
    // The defect, exactly: the thumbnail was tied to `!showHarvestColumn`, so
    // it vanished the moment the Harvest widget joined the page. That condition
    // transcribed a WIDTH arbitration of the frozen design, and V8's frozen
    // actions column is what lifts it.
    await renderExpert();

    expect(
      within(gardensWidget()).getAllByTestId('template-preview')
    ).toHaveLength(1);
  });

  it('sits in the wrapping chip row, which is what makes it affordable', async () => {
    // A wrapping row asks for the width of its widest single item, not for the
    // sum: the thumbnail comes back and the identity column gets NARROWER than
    // it was when the thumbnail sat inline before the name.
    await renderExpert();

    const preview = within(gardensWidget()).getAllByTestId(
      'template-preview'
    )[0]!;
    const row = preview.parentElement?.parentElement;
    expect(row).not.toBeNull();
    expect(rulesFor(row!)).toContain('flex-wrap:wrap');
  });
});

describe('Gardens rows — rename and delete at EVERY size (V12)', () => {
  beforeEach(() => {
    localStorage.setItem('smartcrops-language', 'en');
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([gardenWith(3)])
    );
  });

  it('a Medium row carries both buttons — the Novice preset shows this widget in Medium', async () => {
    // The reason this is an amendment to the frozen design and not a bug fix
    // against it: the design gives a Medium row five elements and neither of
    // these two. But Novice is the preset that shows Gardens in Medium, so a
    // Novice account had no way at all to rename or delete a garden.
    await renderNovice();
    const widget = within(gardensWidget());

    expect(
      widget.getByRole('button', { name: 'Edit Casa Lolo' })
    ).toBeInTheDocument();
    expect(
      widget.getByRole('button', { name: 'Delete Casa Lolo' })
    ).toBeInTheDocument();
    // Still the Medium list, not the Large table.
    expect(gardensWidget().querySelector('table')).toBeNull();
  });

  it('opens the rename dialog from a Medium row', async () => {
    await renderNovice();

    fireEvent.click(
      within(gardensWidget()).getByRole('button', { name: 'Edit Casa Lolo' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Casa Lolo'
    );
  });

  it('opens the type-the-name delete dialog from a Medium row', async () => {
    await renderNovice();

    fireEvent.click(
      within(gardensWidget()).getByRole('button', { name: 'Delete Casa Lolo' })
    );

    expect(
      await screen.findByRole('dialog', { name: 'Delete this garden?' })
    ).toBeInTheDocument();
  });

  it('puts them OUTSIDE the row link — a button inside an anchor is invalid', async () => {
    await renderNovice();
    const widget = within(gardensWidget());

    const link = widget.getByRole('link', { name: 'Open Casa Lolo' });
    for (const name of ['Edit Casa Lolo', 'Delete Casa Lolo']) {
      expect(link.contains(widget.getByRole('button', { name }))).toBe(false);
    }
  });

  it.each([
    ['medium', renderNovice],
    ['large', renderExpert],
  ])(
    'at %s the trailing group is rename, delete, chevron — in that order',
    async (_size, renderAt) => {
      // Alexandre's requirement: the buttons keep the same place whatever the
      // widget's size, so resizing never moves them under the cursor.
      await renderAt();

      const group = gardensWidget().querySelector('[data-row-actions]');
      expect(group).not.toBeNull();

      const buttons = [...group!.querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label')
      );
      expect(buttons).toEqual(['Edit Casa Lolo', 'Delete Casa Lolo']);
      expect(group!.lastElementChild).toHaveAttribute(
        'data-testid',
        'ChevronRightIcon'
      );
    }
  );
});

describe('Gardens Medium row — the description, for zero pixels', () => {
  const describedGarden = (description: string | null) =>
    dashboardWith([gardenWith(3, { description })]);

  beforeEach(() => localStorage.setItem('smartcrops-language', 'en'));

  it('rides the row link as a tooltip, adding no line', async () => {
    const text = 'Le coin sud, refait au printemps.';
    vi.mocked(fetchDashboardData).mockResolvedValue(describedGarden(text));

    await renderNovice();
    const widget = within(gardensWidget());

    // Not printed anywhere: a Medium row is one 44 px line and has none to give.
    expect(widget.queryByText(text)).toBeNull();
    // `describeChild` writes it into the link's own `title`, which is what
    // makes it the link's accessible DESCRIPTION rather than a stray attribute
    // on a node no assistive technology stops on.
    expect(
      widget.getByRole('link', { name: 'Open Casa Lolo' })
    ).toHaveAttribute('title', text);
  });

  it('is reachable by the keyboard — the row link is the tab stop that carries it', async () => {
    // MUI's popper opens on KEYBOARD focus, which jsdom cannot produce:
    // `:focus-visible` is false there even after a real `user-event` Tab (round
    // 1 probed it). What a keyboard user gets is asserted instead — the link is
    // in the tab order and carries the whole text.
    const text = 'Balcon plein sud, arrosage tous les deux jours.';
    vi.mocked(fetchDashboardData).mockResolvedValue(describedGarden(text));

    await renderNovice();
    const link = within(gardensWidget()).getByRole('link', {
      name: 'Open Casa Lolo',
    });

    const user = userEvent.setup();
    await user.tab();
    let guard = 0;
    while (document.activeElement !== link && guard++ < 40) await user.tab();
    expect(document.activeElement).toBe(link);
    expect(link).toHaveAttribute('title', text);
  });

  it('opens on hover', async () => {
    const text = 'Le coin sud, refait au printemps.';
    vi.mocked(fetchDashboardData).mockResolvedValue(describedGarden(text));

    await renderNovice();

    fireEvent.mouseOver(
      within(gardensWidget()).getByRole('link', { name: 'Open Casa Lolo' })
    );

    expect(await screen.findByRole('tooltip')).toHaveTextContent(text);
  });

  it('opens on touch, where there is no hover', async () => {
    const text = 'Balcon plein sud, arrosage tous les deux jours.';
    vi.mocked(fetchDashboardData).mockResolvedValue(describedGarden(text));

    await renderNovice();

    fireEvent.touchStart(
      within(gardensWidget()).getByRole('link', { name: 'Open Casa Lolo' })
    );

    expect(await screen.findByRole('tooltip')).toHaveTextContent(text);
  });

  it('says nothing at all when the garden has no description', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(describedGarden(null));

    await renderNovice();
    const link = within(gardensWidget()).getByRole('link', {
      name: 'Open Casa Lolo',
    });

    // An empty `Tooltip` still wraps its child and still writes an empty
    // `title`; « no description » has to mean no tooltip at all.
    expect(link).not.toHaveAttribute('title');
    fireEvent.mouseOver(link);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

// ── The two smaller observations that came with V8 ────────────────────────────
// Only ONE of them is a defect of its own. The MÉTÉO column reading « Bientô »
// / « So » is the horizontal overflow itself, seen at the scrollport's edge:
// the marker declares `white-space: nowrap` and an inline-block's own minimum
// width, so nothing inside the cell truncates it — it was simply the last thing
// on screen before the table ran off the card. It is answered by V8 (the row is
// reachable, and the frozen column no longer forces a horizontal hunt for the
// buttons), not by a change to the cell. The percentage is a real defect.

describe('The occupancy figure never breaks in two', () => {
  beforeEach(() => localStorage.setItem('smartcrops-language', 'en'));

  it('declares nowrap, so « 10 % » stays on one line in an 84 px cell', async () => {
    // The space between the figure and the sign is an ordinary one, so a
    // squeezed OCCUPATION column was free to wrap there — and a percentage
    // split over two lines is not a percentage. Asserted on the declaration:
    // jsdom lays nothing out, so a measured line count would be zero here.
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([
        gardenWith(3, {
          cellsJson: JSON.stringify(
            Array.from({ length: 12 }, () => ({ soil: 'soil' }))
          ),
        }),
      ])
    );

    renderPage();
    await screen.findAllByText('Casa Lolo');

    const figure = within(gardensWidget()).getByText(/^\d+ %$/);
    expect(rulesFor(figure)).toContain('white-space:nowrap');
  });
});
