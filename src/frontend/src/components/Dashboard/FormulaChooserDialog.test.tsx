import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { catalogFor } from '../../test/fixtures/formulas';
import { deferred } from '../../test/responses';

vi.mock('../../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

import { fetchFormulas } from '../../services/formulasApi';
import FormulaChooserDialog from './FormulaChooserDialog';

// SMA-448, lot F3, step L5 — the choice screen on its own: what it draws from
// the catalogue, what it does while the catalogue loads or cannot be read,
// and the rules of the screen (contract v3 § 4.2).

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof FormulaChooserDialog>> = {}
) {
  const onClose = vi.fn();
  const onChoose = vi.fn();
  render(
    <MemoryRouter>
      <FormulaChooserDialog
        open
        mandatory={false}
        switching={false}
        refusal={null}
        onClose={onClose}
        onChoose={onChoose}
        {...overrides}
      />
    </MemoryRouter>
  );
  return { onClose, onChoose };
}

const dialog = () => screen.getByRole('dialog', { name: 'Choose your formula' });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor('gardener', { gardenCount: 2 }));
});

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup (vitest's `sequence.hooks = 'stack'`); what it puts
  // back below stays in place until the tree that reads it is gone.
  cleanup();
  vi.clearAllMocks();
});

describe('FormulaChooserDialog — the choice screen (SMA-448, lot F3, L5)', () => {
  it('says it is loading the formulas, then draws the three offers in the catalogue’s order, the current one « Keep »', async () => {
    renderDialog();

    expect(within(dialog()).getByText('Loading the formulas…')).toBeInTheDocument();
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    expect([...document.querySelectorAll('[data-formula-offer]')].map((card) => card.getAttribute('data-formula-offer'))).toEqual([
      'novice',
      'gardener',
      'expert',
    ]);
    expect(within(dialog()).queryByText('Loading the formulas…')).toBeNull();
    expect(fetchFormulas).toHaveBeenCalledTimes(1);
  });

  it('a catalogue that cannot be read: the error and « Try again », which reads again', async () => {
    vi.mocked(fetchFormulas).mockRejectedValueOnce(new Error('down'));
    renderDialog();

    expect(await within(dialog()).findByText('Couldn’t load the formulas.')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: /^Choose/ })).toBeNull();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Try again' }));

    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    expect(fetchFormulas).toHaveBeenCalledTimes(2);
  });

  it('the comparison reads its two limit rows from the catalogue: up to 3 / 10 / no limit gardens, up to 20 × 20 / 50 × 50 / 100 × 100 cells — twelve rows in all, and the phone’s lists say the same', async () => {
    renderDialog();
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });

    const table = within(dialog()).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(12);
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(within(rows[0]!).getByRole('rowheader').textContent).toBe('Number of gardens');
    expect(cells(rows[0]!)).toEqual(['Up to 3', 'Up to 10', 'No limit']);
    expect(within(rows[1]!).getByRole('rowheader').textContent).toBe('Garden size');
    expect(cells(rows[1]!)).toEqual(['Up to 20 × 20 cells', 'Up to 50 × 50 cells', 'Up to 100 × 100 cells']);

    const lists = document.querySelectorAll('[data-formula-compare-list]');
    expect(lists).toHaveLength(3);
    expect(lists[2]!.textContent).toContain('Up to 100 × 100 cells');
    expect(lists[2]!.querySelectorAll('dt')).toHaveLength(12);
  });

  it('« Recommended for you » is the smallest formula that holds the gardens — shown to an account that never chose, hidden when it would advise going down', async () => {
    vi.mocked(fetchFormulas).mockResolvedValueOnce(catalogFor('gardener', { chosen: false, gardenCount: 0 }));
    const first = renderDialog({ mandatory: true });
    await within(dialog()).findByRole('button', { name: 'Choose Novice' });
    expect(document.querySelector('[data-formula-offer="novice"] [data-offer-tag="recommended"]')).not.toBeNull();
    expect(document.querySelector('[data-offer-tag="recommended"]')?.closest('[data-formula-offer]')?.getAttribute('data-formula-offer')).toBe('novice');
    expect(first.onClose).not.toHaveBeenCalled();
  });

  it('with a formula chosen and two gardens on Gardener: no recommendation at all — it would advise going down', async () => {
    renderDialog();
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    expect(document.querySelector('[data-offer-tag="recommended"]')).toBeNull();
  });

  it('mandatory: no close button, Escape and the backdrop do nothing; otherwise the close button and Escape close', async () => {
    const mandatory = renderDialog({ mandatory: true });
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    expect(within(dialog()).queryByRole('button', { name: 'Close without changing formula' })).toBeNull();
    fireEvent.keyDown(dialog(), { key: 'Escape', code: 'Escape' });
    expect(mandatory.onClose).not.toHaveBeenCalled();
  });

  it('closable: the close button and Escape call `onClose`, nothing else', async () => {
    const closable = renderDialog();
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close without changing formula' }));
    expect(closable.onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog(), { key: 'Escape', code: 'Escape' });
    expect(closable.onClose).toHaveBeenCalledTimes(2);
    expect(closable.onChoose).not.toHaveBeenCalled();
  });

  it('while a switch is on the wire every button is inert, the close one too', async () => {
    renderDialog({ switching: true });
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    for (const name of ['Keep Gardener', 'Choose Novice', 'Choose Expert', 'Close without changing formula']) {
      expect(within(dialog()).getByRole('button', { name })).toBeDisabled();
    }
  });

  it('the refusal region is born empty, polite, kept mounted; a session that expired offers to sign in again', async () => {
    renderDialog({ refusal: { kind: 'unauthorized', formula: 'novice', reasons: [] } });
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    const region = within(dialog()).getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Your session has expired. Sign in again to continue.');
    expect(within(dialog()).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    expect(document.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('choosing calls `onChoose` with the formula — « Keep » with the current one', async () => {
    const { onChoose } = renderDialog();
    await within(dialog()).findByRole('button', { name: 'Keep Gardener' });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Choose Expert' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Keep Gardener' }));
    expect(onChoose.mock.calls.map((call) => call[0])).toEqual(['expert', 'gardener']);
  });

  it('dit les offres en français : « 0 € — Gratuit », « Jusqu’à 100 × 100 cases par jardin » pour l’Expert, « Garder Jardinier »', async () => {
    await i18n.changeLanguage('fr');
    renderDialog();
    const fr = screen.getByRole('dialog', { name: 'Choisissez votre formule' });
    await within(fr).findByRole('button', { name: 'Garder Jardinier' });
    expect(within(fr).getAllByText('0 €')).toHaveLength(3);
    expect(document.querySelector('[data-formula-offer="expert"]')!.textContent).toContain('Jusqu’à 100 × 100 cases par jardin');
    expect(document.querySelector('[data-formula-offer="expert"]')!.textContent).toContain('Jardins en nombre illimité');
    expect(within(fr).getByRole('button', { name: 'Fermer sans changer de formule' })).toBeInTheDocument();
    await waitFor(() => expect(within(fr).getByText('Comparer les formules')).toBeInTheDocument());
  });
});

// SMA-448 — the line of the Terms on the choice screen (« SMA-448 - CGU et
// confidentialité - texte final.md », § 4.1; Alexandre, 28/09 and 30/09):
// under the lead, on the MANDATORY screen only — the screen shown once, where
// article 10 of the Terms says the change is announced —, « read them »
// opening the Terms in a new tab, the choice left in view. The catalogue
// HELD (SMA-452 § 12): the line stands in the header, drawn before the
// offers — said while they load, still said once they landed inside `act`;
// its absence on the screen the chip reopens is read with the offers drawn.
describe('the line of the Terms on the choice screen (SMA-448)', () => {
  const lineOf = (screenOfChoice: HTMLElement) => screenOfChoice.querySelector<HTMLElement>('[data-formula-choice-terms]');

  function holdCatalogue() {
    const catalogue = deferred<Awaited<ReturnType<typeof fetchFormulas>>>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(catalogue.promise);
    return catalogue;
  }

  it('mandatory: the line under the lead, while the offers load and once they landed — « read them » leads to /terms, in a new tab', async () => {
    const catalogue = holdCatalogue();
    renderDialog({ mandatory: true });

    const lead = within(dialog()).getByText('Three ways to garden with SmartCrops. All are free for now, and you can change at any time.');
    expect(document.querySelector('[data-formula-offer]')).toBeNull();
    expect(lineOf(dialog())?.textContent).toBe('Our Terms of Use and our Privacy Policy evolve with the formulas — read them (new tab)');
    expect(lead.nextElementSibling).toBe(lineOf(dialog()));

    await act(async () => catalogue.resolve(catalogFor('gardener', { chosen: false, gardenCount: 0 })));

    expect(within(dialog()).getByRole('button', { name: 'Choose Novice' })).toBeInTheDocument();
    expect(lead.nextElementSibling).toBe(lineOf(dialog()));
    // The name by a pattern, the words by the link's text: jsdom does not
    // blockify the off-screen span (`position: absolute`) and the name's
    // library trims each element's text, so it joins « read them(new tab) »;
    // a browser keeps the separator the link's text holds.
    const link = within(dialog()).getByRole('link', { name: /read them.*new tab/i });
    expect(link.textContent).toBe('read them (new tab)');
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(lineOf(dialog())).toContainElement(link);
  });

  it('closable — the screen the chip reopens: no line, with the offers drawn', async () => {
    const catalogue = holdCatalogue();
    renderDialog();
    await act(async () => catalogue.resolve(catalogFor('gardener', { gardenCount: 2 })));

    expect(within(dialog()).getByRole('button', { name: 'Keep Gardener' })).toBeInTheDocument();
    expect(lineOf(dialog())).toBeNull();
    expect(within(dialog()).queryByRole('link', { name: /read them/i })).toBeNull();
    expect(dialog().textContent).not.toContain('Terms of Use');
  });

  it('en français, obligatoire : la ligne sous l’accroche — « les lire » mène à /terms, en nouvel onglet', async () => {
    await i18n.changeLanguage('fr');
    const catalogue = holdCatalogue();
    renderDialog({ mandatory: true });
    await act(async () => catalogue.resolve(catalogFor('gardener', { chosen: false, gardenCount: 0 })));

    const fr = screen.getByRole('dialog', { name: 'Choisissez votre formule' });
    expect(within(fr).getByRole('button', { name: 'Choisir Novice' })).toBeInTheDocument();
    const lead = within(fr).getByText('Trois façons de jardiner avec SmartCrops. Toutes sont gratuites pour le moment, et vous pourrez en changer à tout moment.');
    expect(lineOf(fr)?.textContent).toBe('Nos conditions d’utilisation et notre politique de confidentialité évoluent avec les formules — les lire (nouvel onglet)');
    expect(lead.nextElementSibling).toBe(lineOf(fr));
    const link = within(fr).getByRole('link', { name: /les lire.*nouvel onglet/i });
    expect(link.textContent).toBe('les lire (nouvel onglet)');
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
