import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import { toPng } from 'html-to-image';
import i18n from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';

vi.mock('../services/plantApi', () => ({ fetchPlants: vi.fn() }));
vi.mock('../services/gardenApi', () => ({
  fetchGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));
vi.mock('../services/gardenLayoutApi', () => ({
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));
// The rasterizer is a third-party boundary jsdom cannot run — mocked; the
// real PNG/PDF output belongs to the visual pass.
vi.mock('html-to-image', () => ({ toPng: vi.fn() }));

import GardenPlanner from './GardenPlanner';
import { fetchGarden, updateGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';

// SMA-18 lot 3 — « Exporter le plan », end to end on the page: the header
// button, the anchored panel, the PNG stage (html-to-image on the off-screen
// day-palette grid, layer forced from the draft) and the PDF stage (print
// view + window.print). The on-screen planner is untouched by an export.

const basil = { id: 'p1', scientificName: 'Basilicum fixture' } as Plant;
const maize = { id: 'p2', scientificName: 'Zea mays' } as Plant;

const garden = {
  id: 'g1',
  name: 'Test garden',
} as unknown as Garden;

const layout: GardenLayoutData = {
  width: 2,
  height: 2,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
    gardenType: null,
    lightSchedule: null,
    hemisphere: null,
    latitudeBand: null,
  },
  placements: [
    {
      id: 'pl1',
      plantId: 'p1',
      plantScientificName: null,
      startRow: 0,
      startCol: 0,
      spanRows: 1,
      spanCols: 1,
      notes: null,
    },
    {
      id: 'pl2',
      plantId: 'p1',
      plantScientificName: null,
      startRow: 1,
      startCol: 0,
      spanRows: 1,
      spanCols: 1,
      notes: null,
    },
    {
      id: 'pl3',
      plantId: 'p2',
      plantScientificName: null,
      startRow: 0,
      startCol: 1,
      spanRows: 1,
      spanCols: 1,
      notes: null,
    },
  ],
};

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

let createObjectURL: Mock<(obj: Blob | MediaSource) => string>;
let clickSpy: MockInstance<() => void>;
let printSpy: MockInstance<() => void>;

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('smartcrops-language', 'en');
  await i18n.changeLanguage('en');
  vi.mocked(fetchGarden).mockResolvedValue(garden);
  vi.mocked(fetchLayout).mockResolvedValue(layout);
  vi.mocked(fetchPlants).mockResolvedValue([basil, maize]);
  createObjectURL = vi.fn(() => 'blob:mock-url');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    }
  );
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  clickSpy.mockRestore();
  printSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Flips the app language mid-test — the GardenPlanner.test.tsx idiom (same
// LanguageProvider mechanics the planner's own menu uses).
function SwitchToFrench() {
  const { setLanguage } = useLanguage();
  return (
    <button type="button" onClick={() => setLanguage('fr')}>
      switch-to-fr
    </button>
  );
}

function renderPlanner() {
  return render(
    <LanguageProvider>
      <SwitchToFrench />
      <MemoryRouter initialEntries={['/gardens/g1/planner']}>
        <Routes>
          <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>
  );
}

async function renderReady() {
  renderPlanner();
  const grid = await screen.findByRole('grid');
  // The catalogue has landed once the plant initials render.
  await screen.findAllByText('B');
  return grid;
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  return screen.getByRole('dialog', { name: 'Export the plan' });
}

const follows = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('GardenPlanner export (SMA-18 lot 3)', () => {
  // CodeRabbit #266 round 1 (F4): `t` changes identity on a locale switch;
  // the completion callbacks and the job's file name / document title must
  // not follow it, or the stage effects restart mid-export.
  it('a language switch mid-export leaves the PNG job alone: one capture, one download', async () => {
    let resolveCapture!: (dataUrl: string) => void;
    vi.mocked(toPng).mockReturnValue(
      new Promise<string>((resolve) => {
        resolveCapture = resolve;
      })
    );
    await renderReady();
    const dialog = openPanel();
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1));

    // The switch lives outside the open popover (a modal): hidden to AT.
    fireEvent.click(
      screen.getByRole('button', { name: 'switch-to-fr', hidden: true })
    );
    // The page re-rendered in French while the job kept running.
    expect(
      await screen.findByRole('button', { name: 'Export en cours…' })
    ).toBeDisabled();
    expect(toPng).toHaveBeenCalledTimes(1);

    resolveCapture(PNG_DATA_URL);
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(toPng).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('smartcrops-test-garden-plan.png');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Exporter le plan' })
      ).toBeNull()
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('a language switch mid-export leaves the PDF job alone: one print', async () => {
    await renderReady();
    const dialog = openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole('button', { name: 'switch-to-fr', hidden: true })
    );
    expect(
      await screen.findByRole('button', { name: 'Export en cours…' })
    ).toBeDisabled();
    expect(screen.getByTestId('plan-print-view')).toBeInTheDocument();
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('smartcrops-test-garden-plan');

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('plan-print-view')).toBeNull()
    );
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('dialog', { name: 'Exporter le plan' })
    ).toBeNull();
  });

  // CodeRabbit #266 round 1 (F6): the draft can vanish mid-export — Cancel
  // on an unsaved first setup dispatches DISCARD_DRAFT (grid null). The job
  // ends in the same render, the stage unmounts and the panel is neither
  // stuck on "Exporting…" nor left floating without its anchor.
  it('a draft discarded mid-export ends the job, unmounts the stage and closes the panel', async () => {
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: null,
      height: null,
      cellSize: null,
      placements: [],
    });
    vi.mocked(updateGarden).mockResolvedValue(garden);
    renderPlanner();
    const settings = await screen.findByRole('dialog');
    // Dialog defaults: 10 columns × 8 rows, 50cm → an unsaved draft.
    fireEvent.click(within(settings).getByRole('button', { name: 'Save' }));
    const templates = await screen.findByRole('dialog', {
      name: 'Garden templates',
    });
    fireEvent.click(within(templates).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('grid')).toBeInTheDocument();

    const dialog = openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('plan-print-view')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Exporting…' })
    ).toBeDisabled();

    // Reaching the header means leaving the panel first (click-away / Esc);
    // the job keeps running behind it.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Export the plan' })
      ).toBeNull()
    );
    expect(screen.getByTestId('plan-print-view')).toBeInTheDocument();

    // Two Cancel buttons carry the same handler (header + unsaved-changes
    // bar); the bar's is the unambiguous one.
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Cancel',
      })
    );

    await waitFor(() =>
      expect(screen.queryByTestId('plan-print-view')).toBeNull()
    );
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exporting…' })).toBeNull();
    expect(
      screen.queryByRole('dialog', { name: 'Export the plan' })
    ).toBeNull();
    // The first-setup dialog is back for the discarded draft.
    expect(
      await screen.findByRole('heading', { name: 'Garden settings' })
    ).toBeInTheDocument();
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('adds "Export" to the header between "Templates" and "Settings", opening the panel', async () => {
    await renderReady();
    const templates = screen.getByRole('button', { name: 'Templates' });
    const exportBtn = screen.getByRole('button', { name: 'Export' });
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(follows(templates, exportBtn)).toBe(true);
    expect(follows(exportBtn, settings)).toBe(true);
    expect(exportBtn).toHaveAttribute('aria-haspopup', 'dialog');
    expect(exportBtn).toHaveAttribute('aria-expanded', 'false');

    const dialog = openPanel();
    expect(exportBtn).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(dialog).getByRole('radio', { name: /PDF \(A4 landscape\)/ })
    ).toBeChecked();
    expect(within(dialog).getByRole('checkbox')).toBeChecked();
  });

  it('PNG: rasterizes the DRAFT grid off-screen in the day palette with the layer forced on, downloads it, closes the panel — the screen stays untouched', async () => {
    vi.mocked(toPng).mockResolvedValue(PNG_DATA_URL);
    const screenGrid = await renderReady();
    // The on-screen layer is OFF: an export must not depend on it.
    expect(screenGrid.querySelector('[data-exposure]')).toBeNull();

    const dialog = openPanel();
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1));
    const [node, options] = vi.mocked(toPng).mock.calls[0]!;
    expect(options).toMatchObject({ pixelRatio: 2, cacheBust: true });
    expect(options?.backgroundColor).toBeUndefined();
    const stage = node as HTMLElement;
    expect(stage).not.toBe(screenGrid);
    const exported = within(stage).getByRole('grid', { hidden: true });
    const cells = within(exported).getAllByRole('gridcell', { hidden: true });
    expect(cells).toHaveLength(4);
    // The layer was computed for the export alone (screen: none).
    expect(cells[0]).toHaveAttribute('data-exposure', 'full');
    expect(screenGrid.querySelector('[data-exposure]')).toBeNull();
    // Every placement rides the export with its initial (the column axis
    // also reads "B", hence the block selector rather than a text query).
    const initials = Array.from(
      stage.querySelectorAll('[data-plant-block]')
    ).map((block) => block.textContent);
    expect(initials).toEqual(['B', 'B', 'Z']);

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('smartcrops-test-garden-plan.png');
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('image/png');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Export the plan' })
      ).toBeNull()
    );
    expect(screen.queryByTestId('plan-png-stage')).toBeNull();
  });

  it('PNG without the layer: the exported grid carries no exposure tint', async () => {
    vi.mocked(toPng).mockResolvedValue(PNG_DATA_URL);
    await renderReady();
    const dialog = openPanel();
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    );
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1));
    const stage = vi.mocked(toPng).mock.calls[0]![0] as HTMLElement;
    expect(stage.querySelector('[data-exposure]')).toBeNull();
    expect(
      within(stage).getAllByRole('gridcell', { hidden: true })
    ).toHaveLength(4);
  });

  it('PNG failure: toasts the error, keeps the panel open, downloads nothing', async () => {
    vi.mocked(toPng).mockRejectedValue(new Error('boom'));
    await renderReady();
    const dialog = openPanel();
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Image \(PNG, 2×\)/ })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    expect(
      await screen.findByText('The plan export failed. Please try again.')
    ).toBeInTheDocument();
    expect(clickSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Export the plan' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('plan-png-stage')).toBeNull();
    // The form is unlocked again for a retry.
    expect(
      within(dialog).getByRole('button', { name: 'Export' })
    ).toBeEnabled();
  });

  it('PDF (default): mounts the print view — header, meta, layered grid, legend, plant quantities — calls window.print(), unmounts on afterprint', async () => {
    const screenGrid = await renderReady();
    const dialog = openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    const view = screen.getByTestId('plan-print-view');
    expect(
      within(view).getByRole('heading', { level: 1, hidden: true })
    ).toHaveTextContent('Test garden');
    expect(screen.getByTestId('plan-print-meta')).toHaveTextContent(
      '2 × 2 — 1.0m × 1.0m (50cm/cell) — 4/4 active cells (1.0 m²)'
    );
    expect(view).toHaveTextContent(/Exported on /);
    expect(document.title).toBe('smartcrops-test-garden-plan');

    const printed = within(view).getByRole('grid', { hidden: true });
    expect(printed).not.toBe(screenGrid);
    const cells = within(printed).getAllByRole('gridcell', { hidden: true });
    expect(cells[0]).toHaveAttribute('data-exposure', 'full');
    expect(screenGrid.querySelector('[data-exposure]')).toBeNull();
    expect(
      within(view).getByText('Exposure — summer · noon')
    ).toBeInTheDocument();

    const table = within(view).getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Basilicum fixture');
    expect(
      within(rows[1]!).getAllByRole('cell', { hidden: true })[2]
    ).toHaveTextContent('2');
    expect(rows[2]).toHaveTextContent('Zea mays');
    expect(
      within(rows[2]!).getAllByRole('cell', { hidden: true })[2]
    ).toHaveTextContent('1');
    expect(view).toHaveTextContent('SmartCrops · smartcrops.fr');
    expect(
      within(dialog).getByRole('button', { name: 'Exporting…' })
    ).toBeDisabled();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('plan-print-view')).toBeNull()
    );
    expect(
      screen.queryByRole('dialog', { name: 'Export the plan' })
    ).toBeNull();
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('PDF without the layer: no tint on the printed grid and no legend', async () => {
    await renderReady();
    const dialog = openPanel();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    const view = screen.getByTestId('plan-print-view');
    expect(view.querySelector('[data-exposure]')).toBeNull();
    expect(within(view).queryByText('Exposure — summer · noon')).toBeNull();
    expect(
      within(view).getByRole('table', { hidden: true })
    ).toBeInTheDocument();
  });
});
