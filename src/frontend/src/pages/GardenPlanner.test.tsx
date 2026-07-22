import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';
import type { Plant } from '../types/Plant';

vi.mock('../services/plantApi', () => ({ fetchPlants: vi.fn() }));
vi.mock('../services/gardenApi', () => ({
  fetchGarden: vi.fn(),
  updateGarden: vi.fn(),
}));
vi.mock('../services/gardenLayoutApi', () => ({
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));

import GardenPlanner from './GardenPlanner';
import { fetchGarden, updateGarden } from '../services/gardenApi';
import { fetchLayout, saveLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';

// Locks the transient wrong-initial artifact: a placement hydrating before
// the plant catalog used to render the 'U' of the 'Unknown' fallback for
// ~an instant, then self-correct once the catalog landed. Placement initials
// are now gated on the catalog being loaded.

const basil = { id: 'p1', scientificName: 'Basilicum fixture' } as Plant;
const maize = { id: 'p2', scientificName: 'Zea mays' } as Plant;
// Shared by the SMA-193 describes: 90 cm spacing @ 50cm/cell → ceil(90/50) = 2
// → a 2×2 footprint.
const courgette = {
  id: 'p3',
  scientificName: 'Cucurbita fixture',
  xPlantSpacingValue: 90,
  xPlantSpacingUnit: 'cm',
} as Plant;

const garden = {
  id: 'g1',
  name: 'Test garden',
} as unknown as Garden;

// SMA-285: the layout wire carries the config block (all-null here) and no
// plantName — names are rebuilt client-side via the shared resolver.
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
  ],
};

beforeEach(() => {
  localStorage.clear();
  // jsdom ships no ResizeObserver; the planner observes its scroll container.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Minimal consumer to flip the app language mid-test — same LanguageProvider
// mechanics the planner itself uses (useLanguage().setLanguage). Both
// directions are exposed so round-trip scenarios (fail FR → EN → back to FR)
// can be driven (SMA-288 R2).
function SwitchToFrench() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button type="button" onClick={() => setLanguage('fr')}>
        switch-to-fr
      </button>
      <button type="button" onClick={() => setLanguage('en')}>
        switch-to-en
      </button>
    </>
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

/**
 * SMA-15 R4 (declared adaptation, scope only): plant initials render in the
 * plant-block OVERLAY beside role="grid", inside their shared relative
 * wrapper — letter queries scope to that wrapper (`grid.parentElement`), so
 * the sidebar's avatar initials stay excluded exactly as `within(grid)` did.
 * Every assertion is unchanged; gridcell queries keep `within(grid)`.
 */
const plantArea = (grid: HTMLElement) =>
  within(grid.parentElement as HTMLElement);

describe('GardenPlanner placement initials', () => {
  it('renders no initial while the catalog is loading, then the real one (no "U" flash)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    let resolveCatalog!: (plants: Plant[]) => void;
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve) => {
          resolveCatalog = resolve;
        })
    );

    renderPlanner();

    // Layout hydrates first — the grid is up while the catalog is pending.
    const grid = await screen.findByRole('grid');
    expect(plantArea(grid).queryByText('U')).toBeNull();

    // Catalog lands → the real initial appears, never 'U'.
    resolveCatalog([basil]);
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    expect(plantArea(grid).queryByText('U')).toBeNull();
  });

  it('keeps the Unknown fallback for a plant genuinely absent from the loaded catalog', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([maize]);

    renderPlanner();

    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('U')).toBeInTheDocument()
    );
  });

  it('drops the previous locale catalog on language switch — neutral while pending, never a stale-language name (5.2 R3)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    // Per-call controllable promises: calls[0] = EN catalog, calls[1] = FR.
    const resolvers: Array<(plants: Plant[]) => void> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve) => {
          resolvers.push(resolve);
        })
    );

    renderPlanner();
    const grid = await screen.findByRole('grid');

    // EN catalog resolves — the placement renders its EN-derived initial and
    // the sidebar lists the EN label (positive baseline for the pins below).
    resolvers[0]!([basil]); // no flat commonName -> 'Basilicum fixture' -> 'B'
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    expect(screen.getAllByText('Basilicum fixture').length).toBeGreaterThan(0);

    // Switch to FR while the FR response is DELAYED: the previous locale's
    // catalog must be dropped immediately — neutral cell, never the stale 'B'.
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    // (a) Render-window pin (5.2 R4): synchronously after the switch — before
    // fetch #2 resolves — no render may show the previous locale's names.
    expect(plantArea(grid).queryByText('B')).toBeNull();
    // (b) Sidebar path: no stale-locale label there (nor in the plants
    // section) — pending/empty presentation instead.
    expect(screen.queryAllByText('Basilicum fixture')).toHaveLength(0);
    await waitFor(() => expect(resolvers.length).toBe(2));
    expect(plantArea(grid).queryByText('B')).toBeNull();
    // Pending means NEUTRAL — no unknown-plant fallback initial in either
    // locale ('U' = EN "Unknown", 'I' = FR "Inconnue").
    expect(plantArea(grid).queryByText('U')).toBeNull();
    expect(plantArea(grid).queryByText('I')).toBeNull();

    // FR response lands — the localized name takes over.
    resolvers[1]!([
      { ...basil, commonName: 'framboisier' } as Plant, // -> 'Framboisier' -> 'F'
    ]);
    await waitFor(() =>
      expect(plantArea(grid).getByText('F')).toBeInTheDocument()
    );
    expect(plantArea(grid).queryByText('B')).toBeNull();
  });

  it('a rejected second-locale request never resurrects the previous catalog (5.2 R4)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    const deferred: Array<{
      resolve: (plants: Plant[]) => void;
      reject: (err: Error) => void;
    }> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve, reject) => {
          deferred.push({ resolve, reject });
        })
    );

    renderPlanner();
    const grid = await screen.findByRole('grid');
    deferred[0]!.resolve([basil]);
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(2));
    deferred[1]!.reject(new Error('network down'));

    // (c) Failure path: a failed refetch cannot resurrect the old catalog —
    // the previous locale's names stay gone; pending presentation remains.
    await waitFor(() =>
      expect(screen.queryAllByText('Basilicum fixture')).toHaveLength(0)
    );
    expect(plantArea(grid).queryByText('B')).toBeNull();
  });

  it('surfaces the catalog error with Retry on a real failure, and Retry recovers (SMA-288)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    const deferred: Array<{
      resolve: (plants: Plant[]) => void;
      reject: (err: Error) => void;
    }> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve, reject) => {
          deferred.push({ resolve, reject });
        })
    );

    renderPlanner();
    const grid = await screen.findByRole('grid');

    // Non-abort rejection -> compact error state in the sidebar plants area,
    // and STILL no name anywhere (error must not degrade to stale/unknown).
    deferred[0]!.reject(new Error('network down'));
    expect(
      await screen.findByText("Couldn't load the plant catalog.")
    ).toBeInTheDocument();
    // a11y live region (CR R1): the failure box itself announces (the
    // planner's help banner is ALSO role="alert", so anchor via the text).
    expect(
      screen
        .getByText("Couldn't load the plant catalog.")
        .closest('[role="alert"]')
    ).not.toBeNull();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(plantArea(grid).queryByText('U')).toBeNull();
    expect(screen.queryAllByText('Basilicum fixture')).toHaveLength(0);

    // Retry -> a NEW fetch runs; success clears the error and names appear.
    fireEvent.click(retry);
    await waitFor(() => expect(deferred.length).toBe(2));
    deferred[1]!.resolve([basil]);
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    expect(screen.queryByText("Couldn't load the plant catalog.")).toBeNull();
  });

  it('a stale-language catalog error is inert after a locale switch (SMA-288)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    const deferred: Array<{
      resolve: (plants: Plant[]) => void;
      reject: (err: Error) => void;
    }> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve, reject) => {
          deferred.push({ resolve, reject });
        })
    );

    renderPlanner();
    await screen.findByRole('grid');
    deferred[0]!.reject(new Error('network down'));
    await screen.findByText("Couldn't load the plant catalog.");

    // Locale switch: the EN-keyed error may not leak into the FR cycle — the
    // fresh fetch drives the state (pending, neither error text visible).
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(2));
    expect(
      screen.queryByText("Couldn't load the plant catalog.")
    ).toBeNull();
    expect(
      screen.queryByText('Impossible de charger le catalogue de plantes.')
    ).toBeNull();

    // The FR fetch resolving proves the new cycle owns the state machine.
    deferred[1]!.resolve([
      { ...basil, commonName: 'framboisier' } as Plant,
    ]);
    const grid = screen.getByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('F')).toBeInTheDocument()
    );
  });

  it('returning to a previously failed language shows pending, not the stale error (SMA-288 R2)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    const deferred: Array<{
      resolve: (plants: Plant[]) => void;
      reject: (err: Error) => void;
    }> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve, reject) => {
          deferred.push({ resolve, reject });
        })
    );

    renderPlanner();
    const grid = await screen.findByRole('grid');

    // Fail on FR: switch first, then reject the FR fetch (#2, non-abort).
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(2));
    deferred[1]!.reject(new Error('network down'));
    await screen.findByText('Impossible de charger le catalogue de plantes.');

    // Leave to EN, then RETURN to FR while fetch #4 is still pending: the
    // old FR failure may not resurface — neutral pending until it settles.
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-en' }));
    await waitFor(() => expect(deferred.length).toBe(3));
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(4));
    expect(
      screen.queryByText('Impossible de charger le catalogue de plantes.')
    ).toBeNull();
    expect(
      screen.queryByText("Couldn't load the plant catalog.")
    ).toBeNull();

    // The fresh FR request settles -> names render.
    deferred[3]!.resolve([
      { ...basil, commonName: 'framboisier' } as Plant,
    ]);
    await waitFor(() =>
      expect(plantArea(grid).getByText('F')).toBeInTheDocument()
    );
  });

  it('an aborted catalog request never surfaces the error state (SMA-288)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    const deferred: Array<{
      resolve: (plants: Plant[]) => void;
      reject: (err: Error) => void;
    }> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve, reject) => {
          deferred.push({ resolve, reject });
        })
    );

    renderPlanner();
    await screen.findByRole('grid');

    // Switch FIRST (the cleanup aborts controller #1), THEN reject fetch #1 —
    // the abort path must stay silent: no error text, no Retry.
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(2));
    deferred[0]!.reject(new Error('aborted'));
    await waitFor(() => expect(deferred.length).toBe(2));
    expect(
      screen.queryByText("Couldn't load the plant catalog.")
    ).toBeNull();
    expect(
      screen.queryByText('Impossible de charger le catalogue de plantes.')
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('placement is inert while the catalog is unavailable — an armed selection cannot act invisibly (SMA-288 R3)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    const resolvers: Array<(plants: Plant[]) => void> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve) => {
          resolvers.push(resolve);
        })
    );

    renderPlanner();
    const grid = await screen.findByRole('grid');

    // Catalog ready (EN) -> arm basil from the sidebar list.
    resolvers[0]!([basil]);
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    // Primary AND secondary line both read the scientific name here (no
    // commonName on the fixture), so match with the *AllBy* variant.
    const plantRow = screen
      .getAllByRole('button')
      .find((el) => within(el).queryAllByText('Basilicum fixture').length > 0);
    expect(plantRow).toBeTruthy();
    fireEvent.click(plantRow!);

    // Locale switch -> catalog pending again; the armed raw id survives.
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(resolvers.length).toBe(2));

    // Click an EMPTY active cell in place mode: with the catalog unavailable
    // the click must be a NO-OP (no ADD_PLACEMENT dispatched).
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBe(4); // 2x2 layout, placement at (0,0)
    fireEvent.click(cells[1]!);

    // Catalog recovers (FR) -> exactly ONE placement initial renders: the
    // original at (0,0). A second 'F' would prove the gated click leaked.
    resolvers[1]!([{ ...basil, commonName: 'framboisier' } as Plant]);
    await waitFor(() =>
      expect(plantArea(grid).getAllByText('F')).toHaveLength(1)
    );
  });

  it('persists config through updateGarden when "Réglages" is saved (SMA-17)', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    vi.mocked(updateGarden).mockResolvedValue(garden);

    renderPlanner();
    await screen.findByRole('grid');

    // Open the config dialog from the header, then save (dimensions unchanged,
    // so only the garden-resource config persists — via updateGarden).
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateGarden).toHaveBeenCalledTimes(1));
    const call = vi.mocked(updateGarden).mock.calls[0]!;
    expect(call[0]).toBe('g1');
    // Fourth arg = the config block, with the SMA-17 defaults present.
    expect(call[3]).toMatchObject({ hemisphere: 'N', latitudeBand: 'mid' });
  });

  it('shows the unknown-plant fallback once an EMPTY catalog has resolved (explicit loaded flag, 5.2 R2)', async () => {
    // Length-based pending inference would leave a legitimately empty catalog
    // "pending" forever and suppress the fallback — explicit readiness (the
    // catalog carries its language, derived at render since 5.2 R4) must let
    // the placement degrade to the localized Unknown instead.
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([]);

    renderPlanner();

    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('U')).toBeInTheDocument()
    );
  });
});

// SMA-17 5.3-D — the exposure layer wired end-to-end: toggle → derived tint +
// legend; presets drive the legend title; indoor gardens tint uniformly from
// the lightSchedule; the per-cell override popover edits the draft and the
// sparse override reaches the save payload; the permanent compass shows the
// garden's facing. HONESTY: an outdoor garden with no blockers (5.4) computes
// to a UNIFORM full-sun tint — the assertions below expect exactly that.
describe('GardenPlanner exposure layer (SMA-17 5.3-D)', () => {
  async function renderReady(gardenFixture: Garden = garden) {
    vi.mocked(fetchGarden).mockResolvedValue(gardenFixture);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    return grid;
  }

  it('toggle ON tints the active cells (uniform full sun outdoors) and shows the legend; OFF hides both', async () => {
    const grid = await renderReady();
    // Layer starts hidden: no tint, no legend.
    expect(within(grid).queryAllByRole('gridcell')).toHaveLength(4);
    expect(document.querySelector('[data-exposure]')).toBeNull();
    expect(screen.queryByText('Exposure — summer · noon')).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    // 2×2 all-active outdoor grid, placement at (0,0): EVERY active cell
    // tints 'full' (uniform, no blockers). Since SMA-15 R4 the plant is an
    // inset overlay BLOCK and no longer paints its cell — the tint applies
    // under it too and shows at the block's inset edges (declared contract
    // update; pre-R4 the placement cell carried no tint attribute).
    const cells = within(grid).getAllByRole('gridcell');
    expect(cells[0]).toHaveAttribute('data-exposure', 'full');
    expect(cells[1]).toHaveAttribute('data-exposure', 'full');
    expect(cells[2]).toHaveAttribute('data-exposure', 'full');
    expect(cells[3]).toHaveAttribute('data-exposure', 'full');
    expect(screen.getByText('Exposure — summer · noon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    expect(document.querySelector('[data-exposure]')).toBeNull();
    expect(screen.queryByText('Exposure — summer · noon')).toBeNull();
  });

  it('presets are disabled while the layer is off and drive the legend title once on', async () => {
    await renderReady();
    expect(screen.getByRole('button', { name: 'Winter' })).toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Winter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Evening' }));
    expect(
      screen.getByText('Exposure — winter · evening')
    ).toBeInTheDocument();
  });

  it('an indoor garden tints uniformly from its lightSchedule (6h → morning)', async () => {
    const indoor = {
      ...garden,
      gardenType: 'indoor',
      lightSchedule: [{ start: '06:00', end: '12:00' }],
    } as Garden;
    const grid = await renderReady(indoor);
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    const cells = within(grid).getAllByRole('gridcell');
    expect(cells[1]).toHaveAttribute('data-exposure', 'morning');
    expect(cells[2]).toHaveAttribute('data-exposure', 'morning');
    expect(cells[3]).toHaveAttribute('data-exposure', 'morning');
  });

  it('the cell popover sets a manual override (tint + dirty + sparse save payload) and Auto clears it', async () => {
    vi.mocked(saveLayout).mockResolvedValue(undefined);
    const grid = await renderReady();
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));

    // Click the empty active cell (0,1) → the labelled popover opens.
    const cells = within(grid).getAllByRole('gridcell');
    fireEvent.click(cells[1]!);
    expect(await screen.findByText('Cell exposure')).toBeInTheDocument();

    // Choose Ombre → the tint updates immediately and the draft is dirty.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Shade' }));
    expect(cells[1]).toHaveAttribute('data-exposure', 'shade');

    // The existing save flow persists the SPARSE override in CellsJson.
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    await waitFor(() => expect(saveLayout).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(saveLayout).mock.calls[0]![1];
    expect(JSON.parse(payload.cellsJson!)).toEqual([
      { row: 0, col: 1, exposureOverride: 'shade' },
    ]);

    // Auto (computed) clears the override — back to the computed full sun.
    fireEvent.click(cells[1]!);
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Auto (computed)' })
    );
    expect(cells[1]).toHaveAttribute('data-exposure', 'full');
  });

  it('renders the permanent compass with the garden facing in its accessible name', async () => {
    await renderReady({ ...garden, orientation: 'E' } as Garden);
    expect(
      screen.getByRole('img', { name: 'Compass — the garden faces E' })
    ).toBeInTheDocument();
  });

  it('undo reverts the last content edit (override → back to computed)', async () => {
    const grid = await renderReady();
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    const cells = within(grid).getAllByRole('gridcell');
    const undo = screen.getByRole('button', { name: 'Undo last action' });
    expect(undo).toBeDisabled(); // no content edit yet

    fireEvent.click(cells[1]!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Shade' }));
    expect(cells[1]).toHaveAttribute('data-exposure', 'shade');

    fireEvent.click(screen.getByRole('button', { name: 'Undo last action' }));
    expect(cells[1]).toHaveAttribute('data-exposure', 'full');
  });
});

// R4 — the help banner's dismissal persists via the versioned localStorage
// key (SMA-302 tracks the rotating-tips successor). localStorage hygiene:
// the file-level beforeEach already clears it.
describe('GardenPlanner help banner persistence (SMA-17 5.3-D R4)', () => {
  const COPY =
    'Click a plant in the sidebar, then click cells to place it. The Exposure layer shows per-cell sunlight — set the time and season in the toolbar.';

  it('is visible with no stored key; dismissing writes the key and survives a remount', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);

    const first = renderPlanner();
    await screen.findByRole('grid');
    expect(screen.getByText(COPY)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(COPY)).toBeNull();
    expect(
      localStorage.getItem('smartcrops.planner.helpBanner.dismissed.v1')
    ).toBe('1');

    first.unmount();
    renderPlanner();
    await screen.findByRole('grid');
    expect(screen.queryByText(COPY)).toBeNull();
  });
});

// R4 — the meta chips: gardenType/orientation as soft pills, only when set.
describe('GardenPlanner meta chips (SMA-17 5.3-D R4)', () => {
  it('renders type and facing chips when set, omits them when unset', async () => {
    vi.mocked(fetchGarden).mockResolvedValue({
      ...garden,
      gardenType: 'terrace',
      orientation: 'S',
    } as Garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);

    const first = renderPlanner();
    await screen.findByRole('grid');
    expect(screen.getByText('Terrace')).toBeInTheDocument();
    expect(screen.getByText('Facing S')).toBeInTheDocument();

    // Unset config (the default fixture) → no chips.
    first.unmount();
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    renderPlanner();
    await screen.findByRole('grid');
    expect(screen.queryByText(/^Facing /)).toBeNull();
    expect(screen.queryByText('Terrace')).toBeNull();
  });
});

// F3 lock (develop-store review on ef076f0), RELOCATED with the markup in
// 5.3-D R2: Save/Cancel now live in the PAGE HEADER — while a save is in
// flight, Cancel must be unavailable (a local restore would report "changes
// discarded" while saveLayout still persists the submitted snapshot).
describe('GardenPlanner header save/cancel gating (F3, relocated in R2)', () => {
  it('disables every Cancel and Save while a save is in flight', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    let resolveSave!: () => void;
    vi.mocked(saveLayout).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );

    renderPlanner();
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );

    // Dirty the draft (override via the exposure popover), then save.
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    fireEvent.click(within(grid).getAllByRole('gridcell')[1]!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Shade' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);

    // In flight: the header (and alert) Cancel/Save are all disabled.
    for (const btn of screen.getAllByRole('button', { name: 'Saving...' })) {
      expect(btn).toBeDisabled();
    }
    for (const btn of screen.getAllByRole('button', { name: 'Cancel' })) {
      expect(btn).toBeDisabled();
    }

    resolveSave();
    // R3 (CR accept): settle the pending save — the 'Saving...' state must
    // fully clear before the test ends.
    await waitFor(() =>
      expect(
        screen.queryAllByRole('button', { name: 'Saving...' })
      ).toHaveLength(0)
    );
    expect(saveLayout).toHaveBeenCalledTimes(1);
  });
});

// SMA-193 (5.5 lot 1) — Place mode: spacing-driven footprints from a cell
// click, the collision toast on rejection, and the Escape mode-preservation
// pins from the pre-commit review.
describe('GardenPlanner Place mode + spacing footprints (SMA-193 5.5)', () => {
  // 4×4 empty layout at 50cm/cell: 90 cm spacing → ceil(90/50) = 2 → 2×2.
  const emptyLayout: GardenLayoutData = {
    ...layout,
    width: 4,
    height: 4,
    placements: [],
  };

  async function renderArmed() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(emptyLayout);
    vi.mocked(fetchPlants).mockResolvedValue([courgette]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    const row = await waitFor(() => {
      const el = screen
        .getAllByRole('button')
        .find((b) => within(b).queryAllByText('Cucurbita fixture').length > 0);
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(row); // arms the plant → enters Place mode
    return grid;
  }

  it('a click places the spacing-derived 2×2 footprint (mockup anchor 90cm @ 50cm/cell)', async () => {
    const grid = await renderArmed();
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBe(16);
    fireEvent.click(cells[5]!); // (1,1) — the 2×2 fits rows 1-2 × cols 1-2

    // One block letter, FOUR covered cells carrying the planted aria.
    await waitFor(() =>
      expect(plantArea(grid).getAllByText('C')).toHaveLength(1)
    );
    expect(
      screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(4);
  });

  it('a rejected overlap shows the collision toast and dispatches nothing', async () => {
    const grid = await renderArmed();
    const cells = screen.getAllByRole('gridcell');
    fireEvent.click(cells[5]!); // 2×2 at rows 1-2 × cols 1-2
    await waitFor(() =>
      expect(plantArea(grid).getAllByText('C')).toHaveLength(1)
    );

    // Anchor (0,0) is OUTSIDE the existing footprint (so not a REPLACE) but
    // its 2×2 candidate covers (1,1) → collision. cellRef(1,1) = B2.
    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    await screen.findByText('Collision — overlaps Cucurbita fixture (B2)');
    // No second block, no new planted cells.
    expect(plantArea(grid).getAllByText('C')).toHaveLength(1);
    expect(
      screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(4);
  });

  it('Escape exits Place mode but REMEMBERS the plant; in shape-edit it preserves the mode (R3)', async () => {
    await renderArmed();
    // Armed → the Placer button is enabled. Escape exits to selection with
    // the plant REMEMBERED (R3 grammar): the button STAYS enabled and
    // re-entering works without re-arming from the sidebar.
    expect(screen.getByRole('button', { name: 'Place' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    // The EXIT half (verify-pass pin): aria-pressed flips — this fails if the
    // Escape branch is deleted, unlike the enabled check (true both ways).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    );
    expect(screen.getByRole('button', { name: 'Place' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Place' }));
    // Re-entered place mode: a cell click places again (2×2 from spacing).
    fireEvent.click(screen.getAllByRole('gridcell')[5]!);
    await waitFor(() =>
      expect(
        screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
      ).toHaveLength(4)
    );

    // Shape-edit ON, then Escape: the mode must SURVIVE (pre-5.5 behavior —
    // the review's Escape/Cancel equivalence regression).
    // The FormControlLabel wraps the switch — clicking the label text flips
    // it (the input carries no accessible name of its own).
    fireEvent.click(screen.getByText('Edit shape'));
    expect(
      screen.getByRole('button', { name: 'Select all' })
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.getByRole('button', { name: 'Select all' })
    ).toBeInTheDocument();
  });
});

// SMA-193 R2 — the REPLACE path recomputes the footprint (GitHub Major +
// Extension convergence): a refused replace toasts and dispatches nothing.
describe('GardenPlanner replace recompute (SMA-193 R2)', () => {
  it('replacing a 1×1 with a 2×2 that would collide shows the toast and keeps the original', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: [],
    });
    vi.mocked(fetchPlants).mockResolvedValue([courgette, basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    const rowOf = async (text: string) =>
      await waitFor(() => {
        const el = screen
          .getAllByRole('button')
          .find((b) => within(b).queryAllByText(text).length > 0);
        expect(el).toBeTruthy();
        return el!;
      });

    // Courgette 2×2 at (1,1), then basil 1×1 at (0,0).
    fireEvent.click(await rowOf('Cucurbita fixture'));
    fireEvent.click(screen.getAllByRole('gridcell')[5]!);
    await waitFor(() =>
      expect(plantArea(grid).getAllByText('C')).toHaveLength(1)
    );
    fireEvent.click(await rowOf('Basilicum fixture'));
    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    await waitFor(() =>
      expect(plantArea(grid).getAllByText('B')).toHaveLength(1)
    );

    // Re-arm courgette and click basil's cell: the 2×2 candidate at (0,0)
    // covers (1,1) → refused, toast, basil untouched.
    fireEvent.click(await rowOf('Cucurbita fixture'));
    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    await screen.findByText('Collision — overlaps Cucurbita fixture (B2)');
    expect(plantArea(grid).getAllByText('B')).toHaveLength(1);
    expect(plantArea(grid).getAllByText('C')).toHaveLength(1);
    expect(
      screen.getAllByRole('gridcell', { name: /Basilicum fixture at/ })
    ).toHaveLength(1);
  });

  it('replacing a 1×1 with a fitting 2×2 swaps the plant AND the footprint', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: [
        {
          id: 'pl1',
          plantId: 'p1',
          plantScientificName: null,
          startRow: 1,
          startCol: 1,
          spanRows: 1,
          spanCols: 1,
          notes: null,
        },
      ],
    });
    vi.mocked(fetchPlants).mockResolvedValue([courgette, basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    const row = await waitFor(() => {
      const el = screen
        .getAllByRole('button')
        .find((b) => within(b).queryAllByText('Cucurbita fixture').length > 0);
      expect(el).toBeTruthy();
      return el!;
    });

    // Arm courgette, click the existing basil 1×1 at (1,1): the 2×2 fits
    // (rows 1-2 × cols 1-2, nothing else on the grid) → geometry follows.
    fireEvent.click(row);
    fireEvent.click(screen.getAllByRole('gridcell')[5]!);
    await waitFor(() =>
      expect(
        screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
      ).toHaveLength(4)
    );
    expect(plantArea(grid).queryAllByText('B')).toHaveLength(0);
  });
});

// SMA-193 lot 2 — pointer drag-and-drop: 6px threshold, ghost + hint,
// grid-snapped targets, ADD/MOVE outcomes, Escape/pointercancel teardown.
// Coordinates: desktop cell 58px + 3px gap → 61px track, grid rect at (0,0)
// in jsdom, so cell (r,c) is hit at (c*61+5, r*61+5).
describe('GardenPlanner pointer DnD (SMA-193 lot 2)', () => {
  const at = (row: number, col: number) => ({
    clientX: col * 61 + 5,
    clientY: row * 61 + 5,
  });
  const ghost = () => document.querySelector('[data-dnd-ghost]');

  async function renderDnd(
    opts: {
      placements?: GardenLayoutData['placements'];
    } = {}
  ) {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: opts.placements ?? [],
    });
    vi.mocked(fetchPlants).mockResolvedValue([courgette, basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    const row = await waitFor(() => {
      const el = screen
        .getAllByRole('button')
        .find((b) => within(b).queryAllByText('Cucurbita fixture').length > 0);
      expect(el).toBeTruthy();
      return el!;
    });
    return { grid, row };
  }

  it('below the 6px threshold the gesture stays a click (arm toggle, no ghost)', async () => {
    const { row } = await renderDnd();
    fireEvent.pointerDown(row, { clientX: 5, clientY: 5, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(document, { clientX: 8, clientY: 5, pointerId: 1, isPrimary: true });
    expect(ghost()).toBeNull();
    fireEvent.pointerUp(document, { clientX: 8, clientY: 5, pointerId: 1, isPrimary: true });
    // The click still fires and arms (lot-1 toggle preserved).
    fireEvent.click(row);
    expect(screen.getByRole('button', { name: 'Place' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('crossing the threshold starts the drag: arms the plant, shows ghost + hint', async () => {
    const { row } = await renderDnd();
    fireEvent.pointerDown(row, { clientX: 5, clientY: 5, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(document, { clientX: 30, clientY: 5, pointerId: 1, isPrimary: true });
    const g = ghost();
    expect(g).not.toBeNull();
    expect(g).toHaveAttribute('aria-hidden', 'true');
    expect(g).toHaveTextContent('2×2'); // the N×N chip
    expect(
      screen.getByText('Release to place · Esc to cancel')
    ).toBeInTheDocument();
    // Threshold-crossing armed the plant (Place button live).
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.pointerUp(document, { clientX: 30, clientY: 5, pointerId: 1, isPrimary: true });
  });

  it('a sidebar drag dropped on a free cell places the spacing-derived 2x2', async () => {
    const { grid, row } = await renderDnd();
    fireEvent.pointerDown(row, { clientX: 5, clientY: 5, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(1, 1), pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(document, { ...at(1, 1), pointerId: 1, isPrimary: true });
    // The browser fires a click right after pointerup — simulate it NOW,
    // inside the one-tick swallow window: it must not toggle-disarm.
    fireEvent.click(row);
    await waitFor(() =>
      expect(
        screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
      ).toHaveLength(4)
    );
    expect(
      screen.getByRole('gridcell', {
        name: 'Cucurbita fixture at row 2, column B',
      })
    ).toBeInTheDocument();
    expect(plantArea(grid).getAllByText('C')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('a sidebar drag dropped on an occupied footprint toasts and dispatches nothing', async () => {
    const { grid, row } = await renderDnd({
      placements: [
        {
          id: 'pl-b',
          plantId: 'p1',
          plantScientificName: null,
          startRow: 0,
          startCol: 0,
          spanRows: 1,
          spanCols: 1,
          notes: null,
        },
      ],
    });
    fireEvent.pointerDown(row, { clientX: 200, clientY: 300, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(0, 0), pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(document, { ...at(0, 0), pointerId: 1, isPrimary: true });
    await screen.findByText('Collision — overlaps Basilicum fixture (A1)');
    expect(plantArea(grid).queryAllByText('C')).toHaveLength(0);
    expect(
      screen.getAllByRole('gridcell', { name: /Basilicum fixture at/ })
    ).toHaveLength(1);
  });

  it('dragging an existing placement moves it (MOVE keeps the footprint)', async () => {
    const { row } = await renderDnd({
      placements: [
        {
          id: 'pl-c',
          plantId: 'p3',
          plantScientificName: null,
          startRow: 1,
          startCol: 1,
          spanRows: 2,
          spanCols: 2,
          notes: null,
        },
      ],
    });
    // Enter Place mode (move-drags are Place-mode-only).
    fireEvent.click(row);
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[5]!, { ...at(1, 1), pointerId: 2, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(2, 2), pointerId: 2, isPrimary: true });
    expect(ghost()).not.toBeNull();
    fireEvent.pointerUp(document, { ...at(2, 2), pointerId: 2, isPrimary: true });
    await waitFor(() =>
      expect(
        screen.getByRole('gridcell', {
          name: 'Cucurbita fixture at row 3, column C',
        })
      ).toBeInTheDocument()
    );
    expect(
      screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(4);
  });

  it('a move keeps the placement identity when ANOTHER plant is armed (no mixup)', async () => {
    await renderDnd({
      placements: [
        {
          id: 'pl-c',
          plantId: 'p3',
          plantScientificName: null,
          startRow: 1,
          startCol: 1,
          spanRows: 2,
          spanCols: 2,
          notes: null,
        },
      ],
    });
    // Arm BASIL — not the courgette under the pointer. The move-drag must
    // carry the PLACEMENT's plant, never the armed one (CR identity draft).
    const basilRow = await waitFor(() => {
      const el = screen
        .getAllByRole('button')
        .find((b) => within(b).queryAllByText('Basilicum fixture').length > 0);
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(basilRow); // Place mode on, basil armed (1×1)
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[5]!, { ...at(1, 1), pointerId: 2, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(2, 2), pointerId: 2, isPrimary: true });
    const g = ghost();
    expect(g).not.toBeNull();
    // Ghost identity: Cucurbita's initial + ITS 2×2 chip (armed basil is 1×1).
    expect(g).toHaveTextContent('C');
    expect(g).toHaveTextContent('2×2');
    fireEvent.pointerUp(document, { ...at(2, 2), pointerId: 2, isPrimary: true });
    await waitFor(() =>
      expect(
        screen.getByRole('gridcell', {
          name: 'Cucurbita fixture at row 3, column C',
        })
      ).toBeInTheDocument()
    );
    expect(
      screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(4);
    // Basil was never placed — it stays armed in the sidebar only.
    expect(
      screen.queryAllByRole('gridcell', { name: /Basilicum fixture at/ })
    ).toHaveLength(0);
  });

  it('a refused move toasts and leaves the placement in place', async () => {
    const { row } = await renderDnd({
      placements: [
        {
          id: 'pl-c',
          plantId: 'p3',
          plantScientificName: null,
          startRow: 1,
          startCol: 1,
          spanRows: 2,
          spanCols: 2,
          notes: null,
        },
        {
          id: 'pl-b',
          plantId: 'p1',
          plantScientificName: null,
          startRow: 0,
          startCol: 0,
          spanRows: 1,
          spanCols: 1,
          notes: null,
        },
      ],
    });
    fireEvent.click(row); // Place mode on
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[10]!, { ...at(2, 2), pointerId: 2, isPrimary: true });
    // Anchor (0,0): the 2x2 candidate covers basil at (0,0) → refused.
    fireEvent.pointerMove(document, { ...at(0, 0), pointerId: 2, isPrimary: true });
    fireEvent.pointerUp(document, { ...at(0, 0), pointerId: 2, isPrimary: true });
    await screen.findByText('Collision — overlaps Basilicum fixture (A1)');
    expect(
      screen.getByRole('gridcell', {
        name: 'Cucurbita fixture at row 2, column B',
      })
    ).toBeInTheDocument();
  });

  it('Escape mid-drag cancels the drag ONLY — mode stays, plant stays armed', async () => {
    const { row } = await renderDnd();
    fireEvent.pointerDown(row, { clientX: 5, clientY: 5, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(1, 1), pointerId: 1, isPrimary: true });
    expect(ghost()).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ghost()).toBeNull();
    // Place mode survives (the lot-1 Escape-to-selection did NOT fire).
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // No placement was made.
    expect(
      screen.queryAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(0);
  });

  it('pointercancel cancels like Escape', async () => {
    const { row } = await renderDnd();
    fireEvent.pointerDown(row, { clientX: 5, clientY: 5, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(1, 1), pointerId: 1, isPrimary: true });
    expect(ghost()).not.toBeNull();
    fireEvent.pointerCancel(document, { pointerId: 1, isPrimary: true });
    expect(ghost()).toBeNull();
    expect(
      screen.queryAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(0);
  });

  it('legend shows the DnD entries in Place mode only (with the layer on)', async () => {
    const { row } = await renderDnd();
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    // Selection mode: no DnD swatches.
    expect(screen.queryByTestId('legend-dnd-valid')).toBeNull();
    // Arm → Place mode: both swatches with their §9 labels.
    fireEvent.click(row);
    expect(screen.getByTestId('legend-dnd-valid')).toHaveTextContent(
      'Valid target'
    );
    expect(screen.getByTestId('legend-dnd-collision')).toHaveTextContent(
      'Collision'
    );
  });

  // Lot 3 R2 (product ruling 22 Jul): Place mode opens WITHOUT an armed
  // plant — the armless entry is move-only.
  it('the Placer button opens the mode with nothing armed', async () => {
    await renderDnd();
    const place = screen.getByRole('button', { name: 'Place' });
    expect(place).toBeEnabled();
    fireEvent.click(place);
    expect(place).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves an existing placement in armless Place mode (no arming, no Move button)', async () => {
    await renderDnd({
      placements: [
        {
          id: 'pl-c',
          plantId: 'p3',
          plantScientificName: null,
          startRow: 1,
          startCol: 1,
          spanRows: 2,
          spanCols: 2,
          notes: null,
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place' })); // armless entry
    const cells = screen.getAllByRole('gridcell');
    fireEvent.pointerDown(cells[5]!, { ...at(1, 1), pointerId: 3, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(2, 2), pointerId: 3, isPrimary: true });
    expect(ghost()).not.toBeNull();
    fireEvent.pointerUp(document, { ...at(2, 2), pointerId: 3, isPrimary: true });
    await waitFor(() =>
      expect(
        screen.getByRole('gridcell', {
          name: 'Cucurbita fixture at row 3, column C',
        })
      ).toBeInTheDocument()
    );
    expect(
      screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(4);
  });

  it('clicking an empty cell in armless Place mode places nothing and shows no toast', async () => {
    const { grid } = await renderDnd();
    fireEvent.click(screen.getByRole('button', { name: 'Place' }));
    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    expect(plantArea(grid).queryAllByText('C')).toHaveLength(0);
    expect(
      screen.queryAllByRole('gridcell', { name: /Cucurbita fixture at/ })
    ).toHaveLength(0);
    expect(screen.queryByText(/Collision — overlaps/)).toBeNull();
    expect(screen.queryByText(/footprint doesn't fit/)).toBeNull();
  });

  it('a sidebar drag from armless Place mode still arms and places (lot-2 grammar)', async () => {
    const { row } = await renderDnd();
    fireEvent.click(screen.getByRole('button', { name: 'Place' })); // armless entry
    fireEvent.pointerDown(row, { clientX: 5, clientY: 5, pointerId: 1, isPrimary: true });
    fireEvent.pointerMove(document, { ...at(1, 1), pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(document, { ...at(1, 1), pointerId: 1, isPrimary: true });
    // CR R3: the browser fires a native click on the row right after
    // pointerup — inside the one-tick swallow window it must NOT
    // toggle-disarm the plant the drag just armed.
    fireEvent.click(row);
    await waitFor(() =>
      expect(
        screen.getAllByRole('gridcell', { name: /Cucurbita fixture at/ })
      ).toHaveLength(4)
    );
    // The drag armed the plant (lot-2 threshold-crossing grammar) and the
    // swallowed click left it armed.
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

// SMA-193 lot 3 — footprint panel: the pose-time clamp keeps oversized
// suggestions placeable; the panel steppers then hand the size to the user.
describe('GardenPlanner footprint panel (SMA-193 lot 3)', () => {
  // 300 cm @ 50cm/cell → a 6×6 suggestion, larger than the 4×4 test grid.
  const tree = {
    id: 'p4',
    scientificName: 'Arbor fixture',
    xPlantSpacingValue: 300,
    xPlantSpacingUnit: 'cm',
  } as Plant;

  it('an oversized suggestion poses CLAMPED, then shrinks to 1×1 via the panel', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: [],
    });
    vi.mocked(fetchPlants).mockResolvedValue([tree]);
    renderPlanner();
    await screen.findByRole('grid');
    const row = await waitFor(() => {
      const el = screen
        .getAllByRole('button')
        .find((b) => within(b).queryAllByText('Arbor fixture').length > 0);
      expect(el).toBeTruthy();
      return el!;
    });
    // The sidebar badge keeps the TRUE suggestion.
    expect(within(row).getByText('6×6')).toBeInTheDocument();
    fireEvent.click(row); // arm → Place mode
    fireEvent.click(screen.getAllByRole('gridcell')[0]!); // pose at (0,0)
    // Clamped to the whole 4×4 grid — the tree IS placeable.
    await waitFor(() =>
      expect(
        screen.getAllByRole('gridcell', { name: /Arbor fixture at/ })
      ).toHaveLength(16)
    );
    // Disarm → Selection; select the placement → the panel opens.
    fireEvent.click(row);
    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    const decRows = await screen.findByRole('button', {
      name: 'Decrease rows',
    });
    fireEvent.click(decRows);
    fireEvent.click(decRows);
    fireEvent.click(decRows); // 4 → 1
    const decCols = screen.getByRole('button', { name: 'Decrease columns' });
    fireEvent.click(decCols);
    fireEvent.click(decCols);
    fireEvent.click(decCols); // 4 → 1
    await waitFor(() =>
      expect(
        screen.getAllByRole('gridcell', { name: /Arbor fixture at/ })
      ).toHaveLength(1)
    );
  });

  it('Move arms the placement plant and enters Place mode', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: [
        {
          id: 'pl-c',
          plantId: 'p3',
          plantScientificName: null,
          startRow: 1,
          startCol: 1,
          spanRows: 2,
          spanCols: 2,
          notes: null,
        },
      ],
    });
    vi.mocked(fetchPlants).mockResolvedValue([courgette]);
    renderPlanner();
    await screen.findByRole('grid');
    // Selection mode (hydration default): click a covered cell → panel.
    fireEvent.click(
      await screen.findByRole('gridcell', {
        name: 'Cucurbita fixture at row 2, column B',
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Move' }));
    // The placement's own plant is armed — Place mode is live.
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // CR R3 hardening: aria-pressed alone no longer proves the arming since
    // the armless entry (lot 3 R2) — the SIDEBAR ROW must show the
    // placement's plant as armed.
    const sidebarRow = screen
      .getAllByRole('button')
      .find((b) => within(b).queryAllByText('Cucurbita fixture').length > 0);
    expect(sidebarRow).toBeTruthy();
    expect(sidebarRow).toHaveAttribute('aria-pressed', 'true');
  });
});

