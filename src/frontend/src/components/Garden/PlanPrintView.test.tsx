import { act, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import i18n from '../../i18n/i18n';
import { createAppTheme } from '../../theme';
import { getPlannerTokens } from '../../theme/plannerTokens';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import { PlanPrintView, type PlanPrintViewProps } from './PlanPrintView';

// SMA-18 lot 3 — the PDF stage: the print view mounts, calls window.print()
// after two frames, and reports back on afterprint. jsdom has no layout or
// print engine: the on-paper result is checked in the visual pass; here the
// content, the injected @page rule and the lifecycle are pinned.

const grid: CellData[][] = [
  [{ active: true }, { active: true }],
  [{ active: true }, { active: false }],
];
const exposure: (ExposureCategory | null)[][] = [
  ['full', 'morning'],
  ['afternoon', null],
];

const baseProps: PlanPrintViewProps = {
  gardenName: 'Mon potager',
  metaFigures: '2 × 2 — 1.0m × 1.0m (50cm/cell) — 3/4 active cells (0.8 m²)',
  metaTypeChip: 'Terrace',
  metaFacingChip: 'Facing S',
  printedAt: new Date(2026, 8, 6),
  documentTitle: 'smartcrops-mon-potager-plan',
  grid,
  placements: [
    {
      plantId: 'p1',
      startRow: 0,
      startCol: 0,
      spanRows: 1,
      spanCols: 1,
      plantName: 'Basil',
    },
  ],
  cols: 2,
  rows: 2,
  exposure,
  castShadow: null,
  legend: <div data-testid="legend-stub">Legend</div>,
  plants: [
    {
      plantId: 'p1',
      plantName: 'Basil',
      scientificName: 'Ocimum basilicum',
      count: 3,
    },
    { plantId: 'p2', plantName: 'Maize', scientificName: 'Zea mays', count: 1 },
  ],
  onDone: () => {},
};

let printSpy: MockInstance<() => void>;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  document.title = 'Before';
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  printSpy.mockRestore();
  vi.clearAllMocks();
});

function renderView(overrides: Partial<PlanPrintViewProps> = {}) {
  const onDone = vi.fn();
  const utils = render(
    // DARK app theme on purpose: the paper must still use the day palette.
    <ThemeProvider theme={createAppTheme('dark')}>
      <PlanPrintView {...baseProps} onDone={onDone} {...overrides} />
    </ThemeProvider>
  );
  return { ...utils, onDone };
}

function injectedCss(): string {
  return Array.from(document.head.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');
}

describe('PlanPrintView (SMA-18 lot 3)', () => {
  it('prints name, meta line, date, the read-only grid with the layer, the legend, the plant list with quantities and the footer', async () => {
    renderView();
    const view = await screen.findByTestId('plan-print-view');
    expect(view).toHaveAttribute('data-plan-print-root');
    // Portaled to <body> as a direct child (the print stylesheet hides its siblings).
    expect(view.parentElement).toBe(document.body);

    expect(
      within(view).getByRole('heading', { level: 1, hidden: true })
    ).toHaveTextContent('Mon potager');
    expect(screen.getByTestId('plan-print-meta')).toHaveTextContent(
      '2 × 2 — 1.0m × 1.0m (50cm/cell) — 3/4 active cells (0.8 m²) · Terrace · Facing S'
    );
    expect(view).toHaveTextContent('Exported on September 6, 2026');

    const gridEl = within(view).getByRole('grid', { hidden: true });
    const cells = within(gridEl).getAllByRole('gridcell', { hidden: true });
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveAttribute('data-exposure', 'full');
    expect(cells[0]).toHaveStyle({
      backgroundColor: getPlannerTokens('light').expo.full.fill,
    });
    expect(cells.every((cell) => cell.getAttribute('tabindex') === '-1')).toBe(
      true
    );

    expect(within(view).getByTestId('legend-stub')).toBeInTheDocument();

    const table = within(view).getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(3); // header + 2 plants
    expect(rows[1]).toHaveTextContent('Basil');
    expect(rows[1]).toHaveTextContent('Ocimum basilicum');
    expect(
      within(rows[1]!).getAllByRole('cell', { hidden: true })[2]
    ).toHaveTextContent('3');
    expect(
      within(rows[2]!).getAllByRole('cell', { hidden: true })[2]
    ).toHaveTextContent('1');
    expect(view).toHaveTextContent('Plants in this garden (2)');
    expect(view).toHaveTextContent('SmartCrops · smartcrops.fr');
  });

  it('injects the A4 landscape page rule and calls window.print() once after mounting', async () => {
    renderView();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    // Round 2 (V3 + F7): @page keeps the lateral 12 mm only — its zero
    // top/bottom margin keeps the browser's own header/footer off the sheet —
    // the user-agent body margin is reset (CodeRabbit round 2, Major), and
    // the vertical 12 mm are the table's spacer rows (asserted separately),
    // no longer a root padding.
    expect(injectedCss()).toMatch(
      /@page\s*\{\s*size:\s*A4 landscape;\s*margin:\s*0 12mm;?\s*\}/
    );
    expect(injectedCss()).toMatch(/html,\s*body\s*\{\s*margin:\s*0/);
    expect(injectedCss()).not.toMatch(
      /\[data-plan-print-root\]\s*\{[^}]*padding/
    );
    expect(injectedCss()).toMatch(/print-color-adjust:\s*exact/);
    // The browser's default PDF name while the dialog is open.
    expect(document.title).toBe('smartcrops-mon-potager-plan');
  });

  it('reports back once on afterprint and restores the document title on unmount', async () => {
    const { onDone, unmount } = renderView();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(onDone).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.title).toBe('Before');
    expect(screen.queryByTestId('plan-print-view')).toBeNull();
  });

  // Round 2 (V3 + F7): the browser repeats a table's <thead> and <tfoot> on
  // every printed page — one empty 12 mm row in each is the vertical margin
  // page 2 was missing. jsdom has no paginator: the repetition itself belongs
  // to the control PDF; the structure is pinned here.
  it('frames the sheet with a 12 mm spacer row in <thead> and <tfoot>, the content in <tbody>', async () => {
    renderView();
    const view = await screen.findByTestId('plan-print-view');
    expect(view.tagName).toBe('TABLE');
    const head = view.querySelector(':scope > thead > tr > td');
    const foot = view.querySelector(':scope > tfoot > tr > td');
    expect(head).toBeEmptyDOMElement();
    expect(foot).toBeEmptyDOMElement();
    expect(head).toHaveStyle({ height: '12mm' });
    expect(foot).toHaveStyle({ height: '12mm' });
    const body = view.querySelector(':scope > tbody');
    expect(body).toContainElement(
      within(view).getByRole('heading', { level: 1, hidden: true })
    );
    expect(body).toContainElement(
      within(view).getByRole('table', { hidden: true })
    );
    expect(body).toHaveTextContent('SmartCrops · smartcrops.fr');
  });

  it('prints neither the layer nor the legend when the box is unticked', async () => {
    renderView({ exposure: null, legend: null });
    const view = await screen.findByTestId('plan-print-view');
    expect(view.querySelector('[data-exposure]')).toBeNull();
    expect(screen.queryByTestId('legend-stub')).toBeNull();
    const cells = within(view).getAllByRole('gridcell', { hidden: true });
    expect(cells[0]).toHaveStyle({
      backgroundColor: getPlannerTokens('light').cellOn,
    });
  });

  it('omits the plant section when nothing is placed', async () => {
    renderView({ plants: [] });
    const view = await screen.findByTestId('plan-print-view');
    expect(within(view).queryByRole('table', { hidden: true })).toBeNull();
    expect(view).not.toHaveTextContent('Plants in this garden');
  });

  it('renders the French copy', async () => {
    await i18n.changeLanguage('fr');
    renderView();
    const view = await screen.findByTestId('plan-print-view');
    expect(view).toHaveTextContent('Exporté le 6 septembre 2026');
    expect(view).toHaveTextContent('Plantes dans ce jardin (2)');
    expect(view).toHaveTextContent('Nom scientifique');
    expect(view).toHaveTextContent('Quantité');
  });
});
