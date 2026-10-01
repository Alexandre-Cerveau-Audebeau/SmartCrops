import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { createAppTheme } from '../../theme';
import { contrast, hex, resolveColor } from '../../test/contrast';
import { rulesFor } from '../../test/dashboardDom';
import { catalogFor } from '../../test/fixtures/formulas';
import { deferred } from '../../test/responses';
import type { DashboardLevel, FormulasCatalog } from '../../types/Dashboard';

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
    // The catalogue HELD, then landed inside `act` (SMA-452 § 12; PR #306,
    // fix round 1, R0): the loading region is emptied by an effect that runs
    // AFTER the commit drawing the offers, and a wait for the offers could
    // end between the two — the read below would find the sentence still there.
    const catalogue = deferred<FormulasCatalog>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(catalogue.promise);
    renderDialog();

    expect(within(dialog()).getByText('Loading the formulas…')).toBeInTheDocument();
    await act(async () => catalogue.resolve(catalogFor('gardener', { gardenCount: 2 })));

    expect(within(dialog()).getByRole('button', { name: 'Keep Gardener' })).toBeInTheDocument();
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
    const catalogue = deferred<FormulasCatalog>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(catalogue.promise);
    renderDialog({ refusal: { kind: 'unauthorized', formula: 'novice', reasons: [] } });
    await act(async () => catalogue.resolve(catalogFor('gardener', { gardenCount: 2 })));

    expect(within(dialog()).getByRole('button', { name: 'Keep Gardener' })).toBeInTheDocument();
    // Two regions on the screen since M5 (SMA-437 review): its loading one,
    // empty once the offers landed, then the refusal's. The catalogue held,
    // then landed inside `act` (SMA-452 § 12; PR #306, fix round 1, R0): the
    // loading one is emptied by an effect that runs after the commit drawing
    // the offers — a wait for them could end before it, and this read lost
    // that race under load.
    const regions = within(dialog()).getAllByRole('status');
    expect(regions).toHaveLength(2);
    expect(regions[0]!.textContent).toBe('');
    const region = regions[1]!;
    expect(region).toHaveAttribute('data-formula-chooser-refusal');
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

// SMA-437, the complete review of the v3 (« SMA-437 - revue complète de la
// v3.md », § 7, point 1): the choice screen says what the formulas do. K1 —
// the comparison gave the Expert « three sizes » while five of its widgets
// take the Full width too (`DashboardCapabilities.cs`): its cells are read
// beside the sizes the catalogue serves — the reference file the server is
// tested against —, so a size given or taken away leaves this suite red
// until the text follows. M8 — the Novice offer promised « the area of each
// garden », while its card shows the garden's size in cells (« 10 × 8 ·
// 50 cm », `NoviceGardenCard.tsx`) and never an area. The catalogue HELD,
// then landed inside `act` (SMA-452 § 12).
describe('the choice screen says what the formulas do (SMA-437 review, K1 and M8)', () => {
  const catalogue = catalogFor('gardener', { gardenCount: 2 });

  async function landCatalogue() {
    const held = deferred<FormulasCatalog>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(held.promise);
    renderDialog();
    await act(async () => held.resolve(catalogue));
  }
  const cellsOf = (screenOfChoice: HTMLElement, label: string) => {
    const row = [...screenOfChoice.querySelectorAll('tbody tr')].find((candidate) => candidate.querySelector('th')?.textContent === label);
    return row ? [...row.querySelectorAll('td')].map((cell) => cell.textContent) : ['no such row'];
  };
  const featuresOf = (level: DashboardLevel) =>
    [...document.querySelectorAll(`[data-formula-offer="${level}"] [data-offer-features] li`)].map((line) => line.textContent);
  /** The sizes the catalogue serves a formula's widgets — the Novice has none. */
  const servedSizes = (level: DashboardLevel) => Object.values(catalogue.formulas.find((formula) => formula.key === level)!.sizes);

  it('what the catalogue serves: the Gardener’s widgets take the three sizes and never the Full width; the Expert’s, the three sizes at most, and several the Full width too', () => {
    expect(servedSizes('gardener').length).toBeGreaterThan(0);
    expect(servedSizes('gardener').map((sizes) => sizes?.join(' '))).toEqual(servedSizes('gardener').map(() => 'small medium large'));
    expect(servedSizes('expert').filter((sizes) => sizes?.includes('wide')).length).toBeGreaterThan(1);
    expect(servedSizes('expert').flatMap((sizes) => sizes ?? []).filter((size) => size !== 'wide' && !['small', 'medium', 'large'].includes(size))).toEqual([]);
  });

  it('in English: the comparison says « three sizes » for the Gardener, « three sizes, and Full width » for the Expert; the Novice offer says the size of each garden, never an area', async () => {
    await landCatalogue();

    expect(cellsOf(dialog(), 'Move and resize widgets')).toEqual(['No — there is nothing to set', 'Yes — three sizes', 'Yes — three sizes, and Full width']);
    expect(featuresOf('novice')).toEqual([
      'A simple home page: one card per garden, nothing to set',
      'Each garden’s plan, as a preview',
      'Today’s weather, on each card',
      'Today’s task, on each card',
      'The number of plants and the size of each garden',
    ]);
    expect(dialog().querySelector('[data-formula-offer="novice"]')!.textContent).not.toMatch(/\barea\b/i);
  });

  it('en français : « trois tailles » pour le Jardinier, « trois tailles, et la Pleine largeur » pour l’Expert ; l’offre Novice dit la taille de chaque jardin, jamais une surface', async () => {
    await i18n.changeLanguage('fr');
    await landCatalogue();
    const fr = screen.getByRole('dialog', { name: 'Choisissez votre formule' });

    expect(cellsOf(fr, 'Déplacer et agrandir ses widgets')).toEqual(['Non — il n’y a rien à régler', 'Oui — trois tailles', 'Oui — trois tailles, et la Pleine largeur']);
    expect(featuresOf('novice')).toEqual([
      'Une page d’accueil simple : une carte par jardin, rien à régler',
      'Le plan de chaque jardin, en aperçu',
      'La météo du jour, sur chaque carte',
      'La tâche du jour, sur chaque carte',
      'Le nombre de plantes et la taille de chaque jardin',
    ]);
    expect(fr.querySelector('[data-formula-offer="novice"]')!.textContent).not.toMatch(/surface/i);
  });
});

// SMA-437, the complete review of the v3, M10 (§ 4 and § 7, point 1): at
// night the screen every account must pass wrote « — Gratuit » and each
// « Oui » of the comparison in `primary.dark` — 3.41:1 on a card, 2.96:1 on
// an unavailable card and on the table's even rows, under the 4.5:1 of text
// at 14 and 16 px. Each green text's DECLARED colour is held to 4.5:1 on
// both grounds it is drawn on — the card (`background.paper`) and the
// subtle surface (`surfaceSubtle`: an unavailable card, the even rows) —,
// by day and at night: the idiom of the weather warning's suite
// (`GardensDashboard.disclaimer.test.tsx`). The catalogue HELD, then landed
// inside `act`, with Novice unavailable so a card of each ground is drawn.
describe.each(['light', 'dark'] as const)('the choice screen’s green texts read at WCAG AA, %s theme (SMA-437 review, M10)', (mode) => {
  it('« — Free » on every offer and every « Yes » of the comparison hold 4.5:1 on the card and on the subtle surface', async () => {
    const theme = createAppTheme(mode);
    const held = deferred<FormulasCatalog>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(held.promise);
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <FormulaChooserDialog open mandatory={false} switching={false} refusal={null} onClose={vi.fn()} onChoose={vi.fn()} />
        </MemoryRouter>
      </ThemeProvider>
    );
    await act(async () =>
      held.resolve(catalogFor('gardener', { gardenCount: 5, unavailable: { novice: [{ kind: 'gardens', have: 5, limit: 3 }] } }))
    );
    expect(document.querySelector('[data-formula-offer="novice"] [data-offer-tag="unavailable"]')).not.toBeNull();

    const grounds = { card: hex(theme.palette.background.paper), subtle: hex(theme.palette.surfaceSubtle) };
    const declaredColour = (node: Element) =>
      [...rulesFor(node).matchAll(/(?:^|[{;])color:([^;}]+)/g)].map((match) => match[1]!.trim()).at(-1);
    const greens = [
      ...within(dialog()).getAllByText('— Free').map((node) => ({ what: `« — Free » of ${node.closest('[data-formula-offer]')?.getAttribute('data-formula-offer')}`, node })),
      ...[...dialog().querySelectorAll('[data-compare-tone="yes"]')].map((node) => ({ what: `the « ${node.textContent} » cell`, node })),
    ];
    // Three prices; the « yes » cells of the table and of the phone's lists.
    expect(greens.filter(({ what }) => what.startsWith('« — Free »'))).toHaveLength(3);
    expect(greens.length).toBeGreaterThan(3);

    for (const { what, node } of greens) {
      const declared = declaredColour(node);
      expect(declared, `${what} declares its own colour`).toBeDefined();
      for (const [name, ground] of Object.entries(grounds)) {
        const foreground = resolveColor(declared!, ground);
        expect(foreground, `${what}: a readable colour « ${declared} »`).not.toBeNull();
        expect(contrast(foreground!, ground), `${what} « ${declared} » on the ${name} ground`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

// SMA-437, the complete review of the v3, M5 (§ 4 and § 7, point 1): the
// region « Loading the formulas… » was inserted WITH its text — a region
// born filled is not announced — and taken away with the skeletons, so the
// start of the load was rarely said and its end never. Now `useLiveRegion()`:
// mounted with the screen, born empty, the sentence written into it by its
// ref once it is there, emptied when the offers land, kept mounted. What
// tells « written into the mounted region » from « inserted with its text »:
// a mutation whose TARGET is the region itself — React builds a new subtree
// off the document and inserts it whole, so a region born with its text
// never shows one. The catalogue HELD, then landed inside `act`.
describe('the loading region of the choice screen (SMA-437 review, M5)', () => {
  it('is born empty and kept mounted: « Loading the formulas… » written into it once mounted, emptied when the offers land — the same node, polite', async () => {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const held = deferred<FormulasCatalog>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(held.promise);
    try {
      renderDialog();
      records.push(...observer.takeRecords());

      const region = within(dialog()).getByText('Loading the formulas…');
      expect(
        records.some((record) => record.target === region && [...record.addedNodes].some((node) => node.textContent === 'Loading the formulas…')),
        'the sentence is written into the region, never born with it'
      ).toBe(true);
      expect(region).toHaveAttribute('role', 'status');
      expect(region).toHaveAttribute('aria-live', 'polite');

      await act(async () => held.resolve(catalogFor('gardener', { gardenCount: 2 })));

      expect(within(dialog()).getByRole('button', { name: 'Keep Gardener' })).toBeInTheDocument();
      expect(region.isConnected, 'the region stays mounted').toBe(true);
      expect(region.textContent).toBe('');
      expect(within(dialog()).getAllByRole('status')[0]).toBe(region);
    } finally {
      observer.disconnect();
    }
  });

  it('says it again on « Try again »: emptied on the error, the sentence written anew into the same region', async () => {
    const first = deferred<FormulasCatalog>();
    const second = deferred<FormulasCatalog>();
    vi.mocked(fetchFormulas).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderDialog();
    const region = within(dialog()).getByText('Loading the formulas…');

    await act(async () => first.reject(new Error('down')));
    expect(within(dialog()).getByText('Couldn’t load the formulas.')).toBeInTheDocument();
    expect(region.textContent).toBe('');

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Try again' }));
    expect(region.textContent).toBe('Loading the formulas…');
    expect(region.isConnected).toBe(true);

    await act(async () => second.resolve(catalogFor('gardener', { gardenCount: 2 })));
    expect(within(dialog()).getByRole('button', { name: 'Keep Gardener' })).toBeInTheDocument();
    expect(region.textContent).toBe('');
  });
});

// PR #306, fix round 1, D2 (Alexandre's visual pass, 01/10: « il y a 2
// scrollbars sur le côté de l'écran quand ce dialog container s'ouvre ») —
// the screen locks the page under it ITSELF: `disableScrollLock` stays (the
// overlays' rule, `docs/coding-guidelines.md`), and MUI's lock is decided by
// the first overlay of the page (`ModalManager.mount`) — none from the chip,
// none on the mandatory screen. A style written on <html> as the screen
// opens, given back EXACTLY as it closes or unmounts: what stood before —
// nothing, or the lock of an overlay already there, the Customize panel
// left open under it or the creation dialog « Voir les formules » closes —
// stands after. The catalogue held: the lock is the screen's, whatever it
// draws. What the page does in a real engine is read in Chrome
// (`pageLayout.test.tsx`, D2).
describe('the page under the choice screen, locked by the screen itself (PR #306, fix round 1, D2)', () => {
  const page = () => document.documentElement.style;
  const overflow = () => ({ x: page().getPropertyValue('overflow-x'), y: page().getPropertyValue('overflow-y') });

  function renderScreen(open: boolean) {
    vi.mocked(fetchFormulas).mockReturnValue(deferred<FormulasCatalog>().promise);
    const props = { mandatory: false, switching: false, refusal: null, onClose: vi.fn(), onChoose: vi.fn() };
    const screenAt = (isOpen: boolean) => (
      <MemoryRouter>
        <FormulaChooserDialog open={isOpen} {...props} />
      </MemoryRouter>
    );
    const view = render(screenAt(open));
    return { setOpen: (next: boolean) => view.rerender(screenAt(next)), unmount: view.unmount };
  }

  afterEach(() => {
    // Unmount FIRST (SMA-452 § 13): the screen gives back what it wrote as it
    // unmounts; what a test wrote itself is taken away after.
    cleanup();
    page().removeProperty('overflow-x');
    page().removeProperty('overflow-y');
  });

  it('opened, it writes `overflow: hidden` on <html>; closed, it gives back what stood — nothing', () => {
    const screenOf = renderScreen(false);
    expect(overflow()).toEqual({ x: '', y: '' });

    screenOf.setOpen(true);
    expect(overflow()).toEqual({ x: 'hidden', y: 'hidden' });

    screenOf.setOpen(false);
    expect(overflow()).toEqual({ x: '', y: '' });
    expect(page().cssText).toBe('');
  });

  it('over the lock of an overlay already there — MUI’s `overflow: hidden`, the Customize panel’s or the creation dialog’s —, it leaves that lock in place as it closes', () => {
    page().setProperty('overflow-x', 'hidden');
    page().setProperty('overflow-y', 'hidden');
    const screenOf = renderScreen(true);
    expect(overflow()).toEqual({ x: 'hidden', y: 'hidden' });

    screenOf.setOpen(false);
    expect(overflow()).toEqual({ x: 'hidden', y: 'hidden' });
  });

  it('gives back each axis exactly as it stood — a value and its priority, and an axis left unset', () => {
    page().setProperty('overflow-y', 'auto', 'important');
    const screenOf = renderScreen(true);
    expect(overflow()).toEqual({ x: 'hidden', y: 'hidden' });

    screenOf.setOpen(false);
    expect(overflow()).toEqual({ x: '', y: 'auto' });
    expect(page().getPropertyPriority('overflow-y')).toBe('important');
  });

  it('unmounted while open, it gives back what stood', () => {
    const screenOf = renderScreen(true);
    expect(overflow()).toEqual({ x: 'hidden', y: 'hidden' });

    screenOf.unmount();
    expect(overflow()).toEqual({ x: '', y: '' });
  });
});
