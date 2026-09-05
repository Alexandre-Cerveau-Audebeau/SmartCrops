import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import GardenTemplatesDialog from './GardenTemplatesDialog';

function renderDialog(
  overrides: Partial<Parameters<typeof GardenTemplatesDialog>[0]> = {}
) {
  const onClose = vi.fn();
  const onApply = vi.fn();
  render(
    <GardenTemplatesDialog
      open
      catalogReady
      onClose={onClose}
      onApply={onApply}
      {...overrides}
    />
  );
  return { onClose, onApply };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => vi.clearAllMocks());

describe('GardenTemplatesDialog (SMA-18 lot 2)', () => {
  it('names itself, lists the three cards (title, description, meta) and the footer note', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Garden templates' });
    expect(dialog).toHaveAccessibleDescription(
      'Start from a ready-made layout — at setup or any time'
    );

    // Each card carries "{title} — {meta}" as its accessible name.
    expect(
      within(dialog)
        .getAllByRole('group')
        .map((card) => card.getAttribute('aria-label'))
    ).toEqual([
      'Vegetable garden — 10 × 6 · 50 cm · 14 plants',
      'Japanese garden — 10 × 6 · 50 cm · 8 plants',
      'Mediterranean — 10 × 6 · 50 cm · 10 plants',
    ]);
    expect(
      within(dialog).getByText(
        'Rows of vegetables, a central path, a water point in the corner.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Moss, a gravel path, stones and a pond.')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Terracotta pots, lavender, an olive tree and gravel.'
      )
    ).toBeInTheDocument();
    // One preview per card, decorative.
    expect(within(dialog).getAllByTestId('template-preview')).toHaveLength(3);
    expect(
      within(dialog).getByText(
        'Applying a template replaces the current layout. Plants already placed are kept when their spot stays free.'
      )
    ).toBeInTheDocument();
  });

  it('"Use this template" fires onApply with the card key, nothing else', () => {
    const { onApply, onClose } = renderDialog();

    const buttons = screen.getAllByRole('button', { name: 'Use this template' });
    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => expect(button).toBeEnabled());

    fireEvent.click(buttons[1]!);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('japanese');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('waits for the catalog: every button disabled under the waiting label', () => {
    const { onApply } = renderDialog({ catalogReady: false });

    expect(
      screen.queryAllByRole('button', { name: 'Use this template' })
    ).toHaveLength(0);
    const waiting = screen.getAllByRole('button', {
      name: 'Loading the library…',
    });
    expect(waiting).toHaveLength(3);
    waiting.forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(waiting[0]!);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('the close button and Escape both close without applying', () => {
    const { onClose, onApply } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('the hovered card takes the filled button; the others stay outlined', () => {
    renderDialog();
    const cards = screen.getAllByRole('group');
    const buttonOf = (card: HTMLElement) =>
      within(card).getByRole('button', { name: 'Use this template' });

    cards.forEach((card) =>
      expect(buttonOf(card)).toHaveClass('MuiButton-outlined')
    );

    fireEvent.mouseEnter(cards[2]!);
    expect(buttonOf(cards[2]!)).toHaveClass('MuiButton-contained');
    expect(buttonOf(cards[0]!)).toHaveClass('MuiButton-outlined');
    expect(buttonOf(cards[1]!)).toHaveClass('MuiButton-outlined');

    fireEvent.mouseLeave(cards[2]!);
    expect(buttonOf(cards[2]!)).toHaveClass('MuiButton-outlined');

    // Keyboard reach does the same: focus inside the card activates it.
    fireEvent.focus(buttonOf(cards[0]!));
    expect(buttonOf(cards[0]!)).toHaveClass('MuiButton-contained');
  });

  it('renders in French', async () => {
    await i18n.changeLanguage('fr');
    renderDialog();

    expect(
      screen.getByRole('dialog', { name: 'Modèles de jardin' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('group').map((card) => card.getAttribute('aria-label'))
    ).toEqual([
      'Potager — 10 × 6 · 50 cm · 14 plantes',
      'Jardin japonais — 10 × 6 · 50 cm · 8 plantes',
      'Méditerranéen — 10 × 6 · 50 cm · 10 plantes',
    ]);
    expect(
      screen.getAllByRole('button', { name: 'Utiliser ce modèle' })
    ).toHaveLength(3);
    expect(
      screen.getByText(
        'Appliquer un modèle remplace la disposition actuelle. Les plantes déjà posées sont conservées si leur place reste libre.'
      )
    ).toBeInTheDocument();
  });
});
