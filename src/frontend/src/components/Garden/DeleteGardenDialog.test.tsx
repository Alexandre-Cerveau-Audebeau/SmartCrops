import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';

vi.mock('../../services/gardenApi', () => ({ deleteGarden: vi.fn() }));

import DeleteGardenDialog from './DeleteGardenDialog';
import { deleteGarden } from '../../services/gardenApi';

function renderDialog(
  overrides: Partial<Parameters<typeof DeleteGardenDialog>[0]> = {}
) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const view = render(
    <DeleteGardenDialog
      open
      gardenId="g1"
      gardenName="Casa Lolo"
      summary={{ kind: 'planner', placements: 3, infrastructures: 2 }}
      onClose={onClose}
      onDeleted={onDeleted}
      {...overrides}
    />
  );
  return { onClose, onDeleted, ...view };
}

const nameInput = () =>
  screen.getByLabelText('Type the garden name to confirm');
const confirmButton = () =>
  screen.getByRole('button', { name: 'Delete garden' });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.mocked(deleteGarden).mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('DeleteGardenDialog (SMA-18 lot 1) — copy', () => {
  it('names the planner draft consequences with plurals on both counts, and describes itself', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Delete this garden?' });
    expect(
      within(dialog).getByText(
        '“Casa Lolo” — its grid, 3 placements and 2 infrastructure items will be permanently deleted.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription(/3 placements and 2 infrastructure items/);
  });

  it('uses the singular for a single placement and a single infrastructure item', () => {
    renderDialog({
      summary: { kind: 'planner', placements: 1, infrastructures: 1 },
    });

    expect(
      screen.getByText(
        '“Casa Lolo” — its grid, 1 placement and 1 infrastructure item will be permanently deleted.'
      )
    ).toBeInTheDocument();
  });

  it('names only the distinct plants in the list context (plural and singular)', () => {
    const { rerender } = renderDialog({ summary: { kind: 'list', plants: 2 } });
    expect(
      screen.getByText(
        '“Casa Lolo” — its grid and its 2 plants will be permanently deleted.'
      )
    ).toBeInTheDocument();

    rerender(
      <DeleteGardenDialog
        open
        gardenId="g1"
        gardenName="Casa Lolo"
        summary={{ kind: 'list', plants: 1 }}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        '“Casa Lolo” — its grid and 1 plant will be permanently deleted.'
      )
    ).toBeInTheDocument();
  });

  it('names no count at all when no grid is loaded', () => {
    renderDialog({ summary: { kind: 'unknown' } });

    expect(
      screen.getByText(
        '“Casa Lolo” — its grid and all its contents will be permanently deleted.'
      )
    ).toBeInTheDocument();
  });

  it('carries the French copy', async () => {
    await i18n.changeLanguage('fr');
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Supprimer ce jardin ?' });
    expect(
      within(dialog).getByText(
        '« Casa Lolo » — sa grille, 3 placements et 2 infrastructures seront définitivement supprimés.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Cette action est irréversible.')).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText('Saisissez le nom du jardin pour confirmer')
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Supprimer le jardin' })
    ).toBeDisabled();
  });
});

describe('DeleteGardenDialog (SMA-18 lot 1) — brake and request', () => {
  it('keeps Delete garden disabled until the typed name matches (trimmed, case-insensitive)', () => {
    renderDialog();

    const input = nameInput();
    expect(input).toHaveAttribute('placeholder', 'Casa Lolo');
    expect(input).toHaveValue('');
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Casa' } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(input, { target: { value: '  casa LOLO ' } });
    expect(confirmButton()).toBeEnabled();
  });

  it('Enter is gated on the match: a no-op before, the deletion after', async () => {
    vi.mocked(deleteGarden).mockResolvedValue(undefined);
    const { onDeleted } = renderDialog();

    const input = nameInput();
    fireEvent.change(input, { target: { value: 'Casa' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(deleteGarden).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Casa Lolo' } });
    // Armed: the handler takes the key (preventDefault → fireEvent false).
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
    await waitFor(() => expect(deleteGarden).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('Enter on the focused Cancel button never deletes — the button keeps its own activation', () => {
    const { onDeleted } = renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'Casa Lolo' } });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    // Not intercepted (fireEvent true): the browser's native Enter activation
    // of the focused Cancel button proceeds, and nothing was deleted.
    expect(fireEvent.keyDown(cancel, { key: 'Enter' })).toBe(true);
    expect(deleteGarden).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('ignores an auto-repeated Enter in the field', () => {
    renderDialog();

    const input = nameInput();
    fireEvent.change(input, { target: { value: 'Casa Lolo' } });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    expect(deleteGarden).not.toHaveBeenCalled();
  });

  it('an empty target name never arms the button (an empty field must not match an empty name)', () => {
    renderDialog({ gardenName: '' });

    expect(nameInput()).toHaveValue('');
    expect(confirmButton()).toBeDisabled();
    fireEvent.change(nameInput(), { target: { value: '   ' } });
    expect(confirmButton()).toBeDisabled();
    expect(fireEvent.keyDown(nameInput(), { key: 'Enter' })).toBe(true);
    expect(deleteGarden).not.toHaveBeenCalled();
  });

  it('the button deletes once and reports onDeleted without closing through onClose', async () => {
    vi.mocked(deleteGarden).mockResolvedValue(undefined);
    const { onClose, onDeleted } = renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'Casa Lolo' } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deleteGarden).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refuses Escape and Cancel while the request is pending, then completes', async () => {
    let resolveDelete!: () => void;
    vi.mocked(deleteGarden).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    const { onClose, onDeleted } = renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'Casa Lolo' } });
    fireEvent.click(confirmButton());

    // In flight: both exits are refused, the field and buttons are frozen.
    await waitFor(() => expect(confirmButton()).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(nameInput()).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    // A second Enter must not fire a second request either.
    fireEvent.keyDown(nameInput(), { key: 'Enter' });
    expect(deleteGarden).toHaveBeenCalledTimes(1);

    resolveDelete();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the error inside the dialog and stays open, armed for a retry, when the API fails', async () => {
    vi.mocked(deleteGarden).mockRejectedValueOnce(new Error('boom'));
    const { onClose, onDeleted } = renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'Casa Lolo' } });
    fireEvent.click(confirmButton());

    expect(
      await screen.findByText("Couldn't delete the garden. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The typed value survives and the button is armed again.
    expect(nameInput()).toHaveValue('Casa Lolo');
    expect(confirmButton()).toBeEnabled();
  });

  it('Escape and Cancel close through onClose, and a re-open starts from an empty field', () => {
    const { onClose, onDeleted, rerender } = renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'Casa Lolo' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(deleteGarden).not.toHaveBeenCalled();

    // The parent closes and re-opens the same instance: the brake is re-armed.
    const props = {
      gardenId: 'g1',
      gardenName: 'Casa Lolo',
      summary: { kind: 'planner', placements: 3, infrastructures: 2 } as const,
      onClose,
      onDeleted,
    };
    rerender(<DeleteGardenDialog open={false} {...props} />);
    rerender(<DeleteGardenDialog open {...props} />);
    expect(nameInput()).toHaveValue('');
    expect(confirmButton()).toBeDisabled();
  });
});

// ── Review round 1 ──────────────────────────────────────────────────────────
describe('DeleteGardenDialog (SMA-18 lot 1, round 1) — focus and parent-driven close', () => {
  it('gives the name field the initial focus (typing the name is the first expected gesture)', async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByLabelText('Type the garden name to confirm')).toHaveFocus()
    );
  });

  it('a parent-driven close (open → false) resets the typed name and the error, so a re-open starts clean', async () => {
    vi.mocked(deleteGarden).mockRejectedValueOnce(new Error('boom'));
    const { onClose, onDeleted, rerender } = renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'Casa Lolo' } });
    fireEvent.click(confirmButton());
    expect(
      await screen.findByText("Couldn't delete the garden. Please try again.")
    ).toBeInTheDocument();
    expect(nameInput()).toHaveValue('Casa Lolo');

    // The parent closes the dialog ITSELF — no Escape, no Cancel, so the
    // handleClose reset never ran. The closing edge must reset both states.
    const props = {
      gardenId: 'g1',
      gardenName: 'Casa Lolo',
      summary: { kind: 'planner', placements: 3, infrastructures: 2 } as const,
      onClose,
      onDeleted,
    };
    rerender(<DeleteGardenDialog open={false} {...props} />);
    rerender(<DeleteGardenDialog open {...props} />);

    expect(nameInput()).toHaveValue('');
    expect(
      screen.queryByText("Couldn't delete the garden. Please try again.")
    ).toBeNull();
    expect(confirmButton()).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
