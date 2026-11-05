import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { HttpStatusError } from '../../services/httpStatusError';
import { gardenFixture } from '../../test/fixtures/dashboard';
import type { DashboardGardenData } from '../../types/DashboardData';
import type { Garden } from '../../types/Garden';

vi.mock('../../services/gardenApi', () => ({ updateGarden: vi.fn() }));

import RenameGardenDialog from './RenameGardenDialog';
import { updateGarden } from '../../services/gardenApi';

// SMA-437, review of the v3, M3 — R3-E1 applied to the rename dialog, shared
// by the Gardens widget and the Novice page (lot F2): a rename that did not go
// through is named for what it is — a session that expired and the way to
// sign in again, a right the account lacks, a failure and its retry — the
// dialog open and the typed values kept in every case. No suite of its own
// existed: the widget's and the page's cover the rename that goes through.

const GARDEN = gardenFixture({ id: 'g1', name: 'Casa Lolo', description: 'Sous le tilleul' });

/**
 * The dialog on its route, the login page beside it: where « Sign in again »
 * leads. Mounted CLOSED, then opened on the garden — the fields take its
 * values on the opening edge, as they do under the widget and the page.
 */
function renderDialog() {
  const onClose = vi.fn();
  const onRenamed = vi.fn();
  const tree = (garden: DashboardGardenData | null) => (
    <MemoryRouter initialEntries={['/gardens']}>
      <Routes>
        <Route path="/gardens" element={<RenameGardenDialog garden={garden} onClose={onClose} onRenamed={onRenamed} />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>
  );
  const view = render(tree(null));
  view.rerender(tree(GARDEN));
  return { onClose, onRenamed };
}

const dialog = () => screen.getByRole('dialog', { name: 'Edit garden' });
const nameField = () => within(dialog()).getByLabelText(/Name/);
const saveButton = () => within(dialog()).getByRole('button', { name: 'Save' });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.mocked(updateGarden).mockReset();
});

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup (vitest's `sequence.hooks = 'stack'`); what it puts
  // back below stays in place until the tree that reads it is gone.
  cleanup();
  vi.clearAllMocks();
});

describe('RenameGardenDialog — refused or failed, said truthfully (SMA-437, review of the v3, M3 — R3-E1)', () => {
  it('opens on the garden’s own values, and a rename that went through closes and reports', async () => {
    vi.mocked(updateGarden).mockResolvedValue({ id: 'g1', name: 'Casa Lola' } as Garden);
    const { onClose, onRenamed } = renderDialog();

    expect(nameField()).toHaveValue('Casa Lolo');
    expect(within(dialog()).getByLabelText(/Description/)).toHaveValue('Sous le tilleul');
    fireEvent.change(nameField(), { target: { value: 'Casa Lola' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onRenamed).toHaveBeenCalledTimes(1));
    expect(updateGarden).toHaveBeenCalledWith('g1', 'Casa Lola', 'Sous le tilleul');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a session that expired — 401 — says so, and « Sign in again » leads to the login page — never « try again »', async () => {
    vi.mocked(updateGarden).mockRejectedValue(new HttpStatusError('Request failed (401)', 401));
    const { onClose, onRenamed } = renderDialog();

    fireEvent.change(nameField(), { target: { value: 'Casa Lola' } });
    fireEvent.click(saveButton());

    expect(await within(dialog()).findByText('Your session has expired. Sign in again to continue.')).toBeInTheDocument();
    expect(within(dialog()).queryByText(/try again/i)).toBeNull();
    // Open, the typed value kept.
    expect(nameField()).toHaveValue('Casa Lola');
    expect(onClose).not.toHaveBeenCalled();
    expect(onRenamed).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Sign in again' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('a right the account lacks — a 403 the server did not explain — says the right, not a retry', async () => {
    vi.mocked(updateGarden).mockRejectedValue(new HttpStatusError('Request failed (403)', 403));
    renderDialog();

    fireEvent.click(saveButton());

    expect(await within(dialog()).findByText('Your account is not allowed to do this.')).toBeInTheDocument();
    expect(within(dialog()).queryByText(/try again/i)).toBeNull();
    expect(within(dialog()).queryByRole('button', { name: 'Sign in again' })).toBeNull();
  });

  it.each([
    ['a 503 the server did not explain', new HttpStatusError('Request failed (503)', 503)],
    ['a bare Error — a network that dropped before any status', new TypeError('Failed to fetch')],
  ])('%s: « An error occurred. Please try again. » as before, the Save button the retry', async (_name, error) => {
    vi.mocked(updateGarden).mockRejectedValue(error);
    renderDialog();

    fireEvent.click(saveButton());

    expect(await within(dialog()).findByText('An error occurred. Please try again.')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: 'Sign in again' })).toBeNull();
    expect(saveButton()).toBeEnabled();
  });
});
