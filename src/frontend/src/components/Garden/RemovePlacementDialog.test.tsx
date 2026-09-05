import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import RemovePlacementDialog from './RemovePlacementDialog';

// Anchor (row 2, col 5) → "F3" in the spreadsheet grammar shared with the
// panel's footprint line (cellRef: letter column, 1-based row).
function renderDialog(
  overrides: Partial<Parameters<typeof RemovePlacementDialog>[0]> = {}
) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <RemovePlacementDialog
      open
      plantName="Courgette"
      startRow={2}
      startCol={5}
      spanRows={1}
      spanCols={1}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onCancel, onConfirm };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => vi.clearAllMocks());

describe('RemovePlacementDialog (SMA-18 lot 1)', () => {
  it('names the placement — plant, footprint and the single cell of a 1×1 — and describes itself', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Remove this placement?' });
    expect(
      within(dialog).getByText(
        'Courgette (1×1, cells F3) — this placement will be removed from the grid. The plant stays in the garden list — you can place it again from the sidebar.'
      )
    ).toBeInTheDocument();
    // aria-describedby wiring: the body IS the dialog's accessible description.
    expect(dialog).toHaveAccessibleDescription(/Courgette \(1×1, cells F3\)/);
  });

  it('spells a footprint as a first–last cell range (2×2 anchored at F3 → F3–G4)', () => {
    renderDialog({ spanRows: 2, spanCols: 2 });

    expect(screen.getByText(/\(2×2, cells F3–G4\)/)).toBeInTheDocument();
  });

  it('gives Cancel the initial focus, and Cancel fires onCancel', async () => {
    const { onCancel, onConfirm } = renderDialog();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toHaveFocus());

    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Remove fires onConfirm and nothing else', () => {
    const { onCancel, onConfirm } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape cancels', () => {
    const { onCancel, onConfirm } = renderDialog();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Enter confirms — even while the focus sits on Cancel — and swallows the button activation', () => {
    const { onCancel, onConfirm } = renderDialog();

    // fireEvent returns false when a handler called preventDefault(): that is
    // what stops the focused Cancel button's own native Enter activation.
    const notPrevented = fireEvent.keyDown(
      screen.getByRole('button', { name: 'Cancel' }),
      { key: 'Enter' }
    );
    expect(notPrevented).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('ignores an auto-repeated Enter (a held key must not open-and-confirm in one press)', () => {
    const { onCancel, onConfirm } = renderDialog();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), {
      key: 'Enter',
      repeat: true,
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('carries the French copy (neutral agreement: "sera retiré", "La plante reste")', async () => {
    await i18n.changeLanguage('fr');
    renderDialog({ spanRows: 2, spanCols: 2 });

    const dialog = screen.getByRole('dialog', { name: 'Retirer ce placement ?' });
    expect(
      within(dialog).getByText(
        'Courgette (2×2, cases F3–G4) — ce placement sera retiré de la grille. La plante reste dans la liste du jardin — vous pourrez la replacer depuis la barre latérale.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Retirer' })).toBeInTheDocument();
  });
});
