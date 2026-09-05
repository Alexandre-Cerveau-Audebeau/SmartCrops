import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import GardenPlanner from './GardenPlanner';
import { deleteGarden, fetchGarden, updateGarden } from '../services/gardenApi';
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

beforeEach(async () => {
  localStorage.clear();
  // SMA-393: store 'en' like a returning visitor — the fr default would win otherwise.
  localStorage.setItem('smartcrops-language', 'en');
  // R1: reset the shared i18next singleton too (the Home.test idiom), so a
  // test that flipped to French cannot leak its language into the next one.
  await i18n.changeLanguage('en');
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


// SMA-18 — armed-plant visibility: the sidebar identity chip replaces the
// bare deselect button, and a display-only toolbar indicator keeps the armed
// state visible on EVERY sidebar tab (the reported bug).
describe('GardenPlanner armed-plant visibility (SMA-18)', () => {
  async function renderArmedVisibility() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: [],
    });
    vi.mocked(fetchPlants).mockResolvedValue([courgette, basil]);
    renderPlanner();
    await screen.findByRole('grid');
    const row = await waitFor(() => {
      const el = screen
        .getAllByRole('button')
        .find((b) => within(b).queryAllByText('Cucurbita fixture').length > 0);
      expect(el).toBeTruthy();
      return el!;
    });
    return { row };
  }

  it('arming renders the identity chip (name, badge, X) and the old text button is GONE', async () => {
    const { row } = await renderArmedVisibility();
    expect(screen.queryByTestId('armed-plant-chip')).toBeNull();
    fireEvent.click(row); // arm the courgette
    const chip = screen.getByTestId('armed-plant-chip');
    expect(within(chip).getByText('Cucurbita fixture')).toBeInTheDocument();
    expect(within(chip).getByText('2×2')).toBeInTheDocument();
    expect(
      within(chip).getByRole('button', { name: 'Disarm Cucurbita fixture' })
    ).toBeInTheDocument();
    // The pre-SMA-18 bare text button no longer exists anywhere.
    expect(screen.queryByText('Deselect plant')).toBeNull();
  });

  it('the chip X disarms: chip AND toolbar indicator disappear', async () => {
    const { row } = await renderArmedVisibility();
    fireEvent.click(row);
    expect(screen.getByTestId('armed-plant-indicator')).toBeInTheDocument();
    // R2: the X exists in BOTH surfaces (same aria) — this test drives the
    // sidebar chip's; the indicator's own X has its twin test below.
    fireEvent.click(
      within(screen.getByTestId('armed-plant-chip')).getByRole('button', {
        name: 'Disarm Cucurbita fixture',
      })
    );
    expect(screen.queryByTestId('armed-plant-chip')).toBeNull();
    expect(screen.queryByTestId('armed-plant-indicator')).toBeNull();
  });

  it('the indicator X disarms too, and lives OUTSIDE the status block (R2)', async () => {
    const { row } = await renderArmedVisibility();
    fireEvent.click(row);
    const indicator = screen.getByTestId('armed-plant-indicator');
    // A11y: status announcements stay clean — no button inside the
    // role="status" element; the X is its sibling.
    const status = within(indicator).getByRole('status');
    expect(within(status).queryByRole('button')).toBeNull();
    fireEvent.click(
      within(indicator).getByRole('button', {
        name: 'Disarm Cucurbita fixture',
      })
    );
    expect(screen.queryByTestId('armed-plant-indicator')).toBeNull();
    expect(screen.queryByTestId('armed-plant-chip')).toBeNull();
  });

  it('indicator grammar (SMA-288, R3): hidden while pending, Unknown on a ready catalog missing the armed id', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: [],
    });
    // Per-call controllable promises (the 5.2 R3 mechanism): calls[0] = EN
    // catalog, calls[1] = FR after the locale switch.
    const resolvers: Array<(plants: Plant[]) => void> = [];
    vi.mocked(fetchPlants).mockImplementation(
      () =>
        new Promise<Plant[]>((resolve) => {
          resolvers.push(resolve);
        })
    );
    renderPlanner();
    await screen.findByRole('grid');
    resolvers[0]!([courgette, basil]);
    const row = await waitFor(() => {
      const el = screen
        .getAllByRole('button')
        .find((b) => within(b).queryAllByText('Cucurbita fixture').length > 0);
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(row); // arm the courgette
    expect(screen.getByTestId('armed-plant-indicator')).toBeInTheDocument();

    // Locale switch → catalog PENDING: the indicator hides (null branch) —
    // a blank-name toolbar chip would be odd (settled ruling).
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    expect(screen.queryByTestId('armed-plant-indicator')).toBeNull();

    // FR catalog resolves WITHOUT the armed id → READY-but-missing: the
    // armed state stays visible via the unknown-plant placeholder.
    await waitFor(() => expect(resolvers.length).toBe(2));
    resolvers[1]!([basil]);
    const indicator = await screen.findByTestId('armed-plant-indicator');
    expect(within(indicator).getByText('Inconnue')).toBeInTheDocument();
    expect(within(indicator).getByText('1×1?')).toBeInTheDocument();
    // The sidebar chip grammar is UNTOUCHED: chip mounted, unknown fallback
    // on the ready catalog (SMA-288).
    const chip = screen.getByTestId('armed-plant-chip');
    expect(within(chip).getByText('Inconnue')).toBeInTheDocument();
    // R4 (CR R3 5f2ffa16): the chip's badge mirrors the indicator's
    // placeholder in the ready-but-missing state — 1×1? on BOTH surfaces.
    expect(within(chip).getByText('1×1?')).toBeInTheDocument();
  });

  it('the indicator carries the VISIBLE "Selected plant" prefix (R2)', async () => {
    const { row } = await renderArmedVisibility();
    fireEvent.click(row);
    const indicator = screen.getByTestId('armed-plant-indicator');
    expect(within(indicator).getByText('Selected plant')).toBeInTheDocument();
    expect(within(indicator).getByText('Cucurbita fixture')).toBeInTheDocument();
  });

  it('REPORTED BUG: the toolbar indicator survives switching the sidebar to Infrastructure', async () => {
    const { row } = await renderArmedVisibility();
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('tab', { name: 'Infrastructure' }));
    // The plants tab (and its chip) is gone, but the armed state stays
    // visible in the toolbar — name + footprint + the status aria.
    const indicator = screen.getByTestId('armed-plant-indicator');
    expect(within(indicator).getByText('Cucurbita fixture')).toBeInTheDocument();
    expect(within(indicator).getByText('2×2')).toBeInTheDocument();
    // R2: the visible prefix survives the tab switch too — the meaning is
    // on screen, not aria-only.
    expect(within(indicator).getByText('Selected plant')).toBeInTheDocument();
    expect(
      screen.getByRole('status', {
        name: 'Selected plant: Cucurbita fixture (2×2)',
      })
    ).toBeInTheDocument();
  });

  it('no indicator while nothing is armed; undo/zoom stay functional with it mounted', async () => {
    const { row } = await renderArmedVisibility();
    expect(screen.queryByTestId('armed-plant-indicator')).toBeNull();
    fireEvent.click(row); // arm — the indicator mounts
    expect(screen.getByTestId('armed-plant-indicator')).toBeInTheDocument();
    // The right cluster is intact and functional next to the indicator.
    expect(
      screen.getByRole('button', { name: 'Undo last action' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('120%')).toBeInTheDocument(); // 100% + the 0.2 step
  });
});

// ── SMA-309: the detail panel leads with the plant ──────────────────────────
// The page's half of the rework: the exposure computation is decoupled from
// layer visibility, notes reach the save payload, and the panel's override
// control keeps the selection alive.
describe('GardenPlanner placement panel (SMA-309)', () => {
  async function selectPlacement() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    // The placement sits at (0,0) — clicking its cell selects it.
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    expect(await screen.findByText('Selected placement')).toBeInTheDocument();
    return grid;
  }

  it('states the anchor cell exposure with the LAYER OFF (the decoupling)', async () => {
    const grid = await selectPlacement();
    // Layer off: no cell carries a tint...
    expect(document.querySelector('[data-exposure]')).toBeNull();
    // ...yet the panel knows the cell is in full sun all day. The 2×2 outdoor
    // fixture has no blockers, so all three moments are lit — the sentence is
    // computed, never guessed.
    expect(screen.getByTestId('summary-exposure')).toHaveTextContent(
      'Full sun — morning, noon, and evening'
    );
    // The layer still paints when toggled on (rendering is what the toggle owns).
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    expect(within(grid).getAllByRole('gridcell')[1]).toHaveAttribute(
      'data-exposure',
      'full'
    );
  });

  it('the panel close button clears the selection', async () => {
    await selectPlacement();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the placement panel' })
    );
    expect(screen.queryByText('Selected placement')).toBeNull();
  });

  it('a note typed in the panel reaches the save payload (dead data no more)', async () => {
    vi.mocked(saveLayout).mockResolvedValue(undefined);
    await selectPlacement();

    const field = screen.getByLabelText('Notes');
    fireEvent.change(field, { target: { value: 'Watered on Tuesday' } });
    // R3: the commit rides the BLUR (fireEvent.click fires no blur, so the
    // synthetic path states it explicitly; the real pointer sequence is
    // pinned by the userEvent test below).
    fireEvent.blur(field);
    // The page's ONE dirty/Save cycle owns it — no auto-save.
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    await waitFor(() => expect(saveLayout).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(saveLayout).mock.calls[0]![1];
    expect(payload.placements[0]!.notes).toBe('Watered on Tuesday');
  });

  it('the REAL pointer sequence blurs before the click: Save right after typing still commits (R3)', async () => {
    vi.mocked(saveLayout).mockResolvedValue(undefined);
    const grid = await selectPlacement();
    // Pre-dirty through another edit (the override idiom): with a note as
    // the ONLY change, Save stays disabled until the field loses focus —
    // typing alone commits nothing by design (declared R3 consequence).
    fireEvent.click(screen.getByRole('button', { name: /Adjust exposure/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Shade' }));
    expect(grid).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Notes'));
    await user.keyboard('Mulched on Friday');
    // No manual blur: userEvent replays the full browser sequence, where
    // pressing a button blurs the focused field BEFORE the click lands.
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    await waitFor(() => expect(saveLayout).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(saveLayout).mock.calls[0]![1];
    expect(payload.placements[0]!.notes).toBe('Mulched on Friday');
  });

  it('after an Undo the field shows the reverted note — nothing resurrects (R3)', async () => {
    await selectPlacement();
    const field = screen.getByLabelText('Notes');
    fireEvent.change(field, { target: { value: 'Ephemeral' } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole('button', { name: 'Undo last action' }));
    // The reducer reverted placement.notes to null; the draft must follow —
    // the pre-R3 gate kept 'Ephemeral' in the textarea, and the next
    // keystroke resurrected it into the save payload.
    expect(field).toHaveValue('');
  });

  it('a committed note discarded by Cancel does not resurrect on re-select (R3)', async () => {
    const grid = await selectPlacement();
    const field = screen.getByLabelText('Notes');
    fireEvent.change(field, { target: { value: 'Draft to discard' } });
    fireEvent.blur(field);
    // handleCancel clears the SELECTION too (5.5 review lineage) — the panel
    // unmounts, so the Cancel scenario resolves through a clean remount (the
    // in-place external-change resync is pinned at the unit level and by the
    // Undo test above).
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Cancel',
      })
    );
    expect(screen.queryByText('Selected placement')).toBeNull();
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    expect(await screen.findByLabelText('Notes')).toHaveValue('');
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
  });

  it('Escape abandons an uncommitted draft — nothing commits, nothing resurrects (R3)', async () => {
    const grid = await selectPlacement();
    const field = screen.getByLabelText('Notes');
    field.focus();
    fireEvent.change(field, { target: { value: 'Typed then Escape' } });
    // No blur: Escape tears the panel down through the window keydown path.
    // The uncommitted draft is ABANDONED by design (declared R3): a flush
    // here would also fire on Cancel's unmount, where it would re-commit the
    // just-discarded text onto the restored state.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Selected placement')).toBeNull();
    // Nothing was committed: the page is clean and a re-select starts from
    // the committed (empty) note.
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    expect(await screen.findByLabelText('Notes')).toHaveValue('');
  });

  it('the panel override applies UNDER the placement and keeps the panel mounted', async () => {
    const grid = await selectPlacement();
    fireEvent.click(screen.getByRole('button', { name: /Adjust exposure/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Shade' }));

    // The panel is STILL there (the cell-click path clears the selection; this
    // one must not), and the override landed on the occupied anchor cell —
    // which the pre-SMA-309 reducer guard refused outright.
    expect(screen.getByText('Selected placement')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    expect(within(grid).getAllByRole('gridcell')[0]).toHaveAttribute(
      'data-exposure',
      'shade'
    );
    // With an override in force the triplet is withheld: the label states the
    // category alone rather than a sun path that no longer describes the cell.
    const row = screen.getByTestId('summary-exposure');
    expect(row).toHaveTextContent('Shade');
    expect(row).not.toHaveTextContent('morning');
  });
});

// ── SMA-309 R2: the page keeps still ────────────────────────────────────────
// The unsaved-changes banner leaves the document flow for a viewport-anchored
// bar (zero layout shift by construction, visible while scrolling), and the
// transient save/removal/collision feedback moves onto the app's snackbar
// mechanism — the Alerts themselves (severity, actions, announcement) are
// unchanged, only their positioning is.
describe('GardenPlanner floating unsaved-changes bar + toasts (SMA-309 R2)', () => {
  async function renderDirty() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    // Clean: no bar anywhere.
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
    // Dirty the draft (the header-gating spec's idiom: an override via the
    // exposure popover).
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    fireEvent.click(within(grid).getAllByRole('gridcell')[1]!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Shade' }));
    return grid;
  }

  it('the bar appears OUT of the document flow when dirty, and stays announced', async () => {
    await renderDirty();
    const bar = screen.getByTestId('dirty-bar');
    // Fixed = removed from the flow: its appearance cannot push content down.
    expect(bar).toHaveStyle({ position: 'fixed' });
    // The announcement moved WITH the Alert, not away from it.
    expect(within(bar).getByRole('alert')).toHaveTextContent(
      'You have unsaved changes'
    );
  });

  it('Cancel from the bar discards, and the report rides the fixed toast', async () => {
    await renderDirty();
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Cancel',
      })
    );
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
    const toast = await screen.findByText('Changes discarded');
    // The toast occupies no flow space either — same defect, same fix.
    expect(toast.closest('.MuiSnackbar-root')).toHaveStyle({
      position: 'fixed',
    });
  });

  it('Save from the bar persists; the success toast is fixed and dismissable', async () => {
    vi.mocked(saveLayout).mockResolvedValue(undefined);
    await renderDirty();
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Save',
      })
    );
    await waitFor(() => expect(saveLayout).toHaveBeenCalledTimes(1));
    const toast = await screen.findByText('Layout saved successfully.');
    expect(toast.closest('.MuiSnackbar-root')).toHaveStyle({
      position: 'fixed',
    });
    // Saved → clean → the bar is gone.
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
    // Dismissability survived the migration (the Alert's own X).
    fireEvent.click(
      within(toast.closest('.MuiSnackbar-root') as HTMLElement).getByRole(
        'button',
        { name: 'Close' }
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Layout saved successfully.')).toBeNull()
    );
  });

  it('dismissing a toast keeps its content mounted through the exit (R3, Critical)', async () => {
    await renderDirty();
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Cancel',
      })
    );
    const toast = await screen.findByText('Changes discarded');
    // Dismiss: `message` is null from this render on, but the DISPLAYED copy
    // must survive — the Grow exit clones its child, and an undefined child
    // mid-transition is the crash CodeRabbit flagged.
    fireEvent.click(
      within(toast.closest('.MuiSnackbar-root') as HTMLElement).getByRole(
        'button',
        { name: 'Close' }
      )
    );
    expect(screen.getByText('Changes discarded')).toBeInTheDocument();
    // ...and it leaves cleanly once the exit completes (onExited).
    await waitFor(() =>
      expect(screen.queryByText('Changes discarded')).toBeNull()
    );
  });

  it('the toast rides ABOVE the bar while it is shown, and returns to its place without it (R5)', async () => {
    vi.mocked(saveLayout).mockRejectedValue(new Error('boom'));
    await renderDirty();
    // Failed save: the bar STAYS (still dirty) and the error toast opens on
    // top of the same bottom-centre anchor — the R4 Minor's exact scenario.
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Save',
      })
    );
    const toast = await screen.findByText('Failed to save layout.');
    expect(screen.getByTestId('dirty-bar')).toBeInTheDocument();
    // jsdom: the stubbed ResizeObserver leaves the measured height at 0, so
    // the offset degrades to the 32px gap — still the sx the bar's presence
    // switches on, and pinned to OUR constant rather than a coordinate.
    expect(toast.closest('.MuiSnackbar-root')).toHaveStyle({ bottom: '32px' });
    // Dismiss the error, discard via the bar: the next toast has NO bar under
    // it and sits at the mechanism's own default again.
    fireEvent.click(
      within(toast.closest('.MuiSnackbar-root') as HTMLElement).getByRole(
        'button',
        { name: 'Close' }
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Failed to save layout.')).toBeNull()
    );
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Cancel',
      })
    );
    const discard = await screen.findByText('Changes discarded');
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
    expect(discard.closest('.MuiSnackbar-root')).not.toHaveStyle({
      bottom: '32px',
    });
  });

  it('an error toast survives the Escape key and closes only through its X (R6)', async () => {
    vi.mocked(saveLayout).mockRejectedValue(new Error('boom'));
    await renderDirty();
    fireEvent.click(
      within(screen.getByTestId('dirty-bar')).getByRole('button', {
        name: 'Save',
      })
    );
    const toast = await screen.findByText('Failed to save layout.');
    // Dispatched on DOCUMENT, deliberately (declared adaptation): MUI's
    // escape listener is document-level (useSnackbar registers on document)
    // and the event bubbles on to the planner's own WINDOW handler — one
    // keypress, BOTH consumers, exactly the coexistence the guard records.
    // A window-targeted event would never reach the document listener and
    // the test would pass without the fix.
    fireEvent.keyDown(document, { key: 'Escape' });
    // An IMMEDIATE presence assert would be vacuous: the R3 exit-survival
    // keeps even a DISMISSED toast mounted through the Grow exit. The real
    // claim is that the toast never leaves — the disappearance wait must
    // TIME OUT (proven red against the clickaway-only guard).
    await expect(
      waitFor(
        () =>
          expect(screen.queryByText('Failed to save layout.')).toBeNull(),
        { timeout: 1000 }
      )
    ).rejects.toThrow();
    expect(screen.getByText('Failed to save layout.')).toBeInTheDocument();
    // Its own X remains the ONLY dismissal.
    fireEvent.click(
      within(toast.closest('.MuiSnackbar-root') as HTMLElement).getByRole(
        'button',
        { name: 'Close' }
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Failed to save layout.')).toBeNull()
    );
  });

  it('an error toast persists past the auto-hide window and closes only on dismissal (R3)', async () => {
    vi.mocked(saveLayout).mockRejectedValue(new Error('boom'));
    await renderDirty();
    vi.useFakeTimers();
    try {
      fireEvent.click(
        within(screen.getByTestId('dirty-bar')).getByRole('button', {
          name: 'Save',
        })
      );
      // Flush the rejected save's microtasks, then jump far past the 6s
      // window every OTHER severity auto-hides at (advances wrapped in act:
      // MUI's timers flip React state).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('Failed to save layout.')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(screen.getByText('Failed to save layout.')).toBeInTheDocument();
      // A clickaway must not dismiss it either (workflow-caught): without the
      // reason guard, the user's next click anywhere closed the failure
      // unread through MUI's ClickAwayListener.
      fireEvent.click(document.body);
      expect(screen.getByText('Failed to save layout.')).toBeInTheDocument();
      // Only the explicit dismissal closes it.
      fireEvent.click(
        within(
          screen
            .getByText('Failed to save layout.')
            .closest('.MuiSnackbar-root') as HTMLElement
        ).getByRole('button', { name: 'Close' })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.queryByText('Failed to save layout.')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── SMA-18 lot 1 — the sidebar as a bottom sheet below lg ─────────────────
// jsdom has no matchMedia; MUI's useMediaQuery drives BOTH planner splits
// (sm sizes, lg rail-vs-sheet). The PlantLibrary.test pattern: one blanket
// mock — true = every down() query matches (a phone), absent = none match
// (desktop, this suite's default, which is why the older describes need no
// mock to keep their inline rail).
// R3: the mock is listener-aware and returns a setter — flipping `matches`
// notifies MUI's useMediaQuery subscriptions, so a test can walk the
// viewport across the breakpoint mid-run the way a resized window or a
// rotating tablet does. Callers that never flip just ignore the return.
function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(e: { matches: boolean }) => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addListener: (fn: (e: { matches: boolean }) => void) => {
      listeners.add(fn);
    },
    removeListener: (fn: (e: { matches: boolean }) => void) => {
      listeners.delete(fn);
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      listeners.delete(fn);
    },
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
  };
}

describe('SMA-18 mobile layout — bottom sheet, trigger, toolbar names', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  async function renderLoadedPlanner(plants: Plant[] = [basil]) {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue(plants);
    renderPlanner();
    await screen.findByRole('grid');
  }

  it('below lg the rail is gone; the trigger opens a labelled dialog sheet and close closes it', async () => {
    mockMatchMedia(true);
    await renderLoadedPlanner();

    // The catalogue no longer sits in the page flow above the grid.
    expect(
      screen.queryByRole('textbox', { name: 'Search plants...' })
    ).toBeNull();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );

    // FilterPanel convention: the PAPER is the dialog, named by the sheet
    // title through aria-labelledby.
    const dialog = await screen.findByRole('dialog', {
      name: 'Plants & infrastructure',
    });
    expect(
      within(dialog).getByRole('textbox', { name: 'Search plants...' })
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The trigger returns once the sheet is closed.
    expect(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    ).toBeInTheDocument();
  });

  it('arming a plant from inside the sheet closes it and arms it', async () => {
    mockMatchMedia(true);
    await renderLoadedPlanner();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Plants & infrastructure',
    });

    await user.click(
      within(dialog).getByRole('button', { name: /Basilicum fixture/ })
    );
    // Arming closes the sheet (the next gesture is on the grid)…
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // …and the plant IS armed: the toolbar indicator shows it.
    expect(screen.getByTestId('armed-plant-indicator')).toHaveTextContent(
      'Basilicum fixture'
    );
  });

  it('arming a soil from inside the sheet closes it too', async () => {
    mockMatchMedia(true);
    await renderLoadedPlanner();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Plants & infrastructure',
    });

    await user.click(within(dialog).getByRole('tab', { name: 'Soils' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Potting mix' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the sheet when the layout returns to desktop (GitHub cf65425f)', async () => {
    const mq = mockMatchMedia(true);
    await renderLoadedPlanner();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );
    await screen.findByRole('dialog', { name: 'Plants & infrastructure' });

    // The viewport widens past lg (window resized, tablet rotated): the
    // Drawer unmounts — and its STATE must reset with it.
    act(() => mq.set(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Narrowing again must not reopen the sheet on its own: closed, with
    // the trigger back on screen.
    act(() => mq.set(true));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Plants & infrastructure' })
    ).toBeInTheDocument();
  });

  it('above lg the rail renders inline and no sheet trigger exists', async () => {
    // No matchMedia mock: desktop, the suite default.
    await renderLoadedPlanner();

    expect(
      screen.getByRole('textbox', { name: 'Search plants...' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Plants & infrastructure' })
    ).toBeNull();
  });

  it('every mode button keeps an explicit accessible name while its label is display-gated (mobile)', async () => {
    mockMatchMedia(true);
    await renderLoadedPlanner();

    // The aria-label is unconditional — the same four names resolve on a
    // phone viewport, where the visible label is hidden below sm.
    for (const name of ['Selection', 'Place', 'Infrastructures', 'Soils']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

// ── SMA-18 lot 2 — the planner WORKS under a finger ────────────────────────
// FIX A: paint strokes propagate by COORDINATES (document pointermove +
// pointerToCell), because a touch pointer's implicit capture pins every
// event to the pointerdown cell — neighbours NEVER fire pointerenter. The
// tests below reproduce that reality exactly: pointerdown on the start
// cell, then document-level moves only. FIX B: the touch-action clamp
// exists exactly in paint modes. FIX C: below lg the placement panel is a
// second bottom sheet, mutually exclusive with the catalogue sheet.
// FIX D (SMA-345 item 3): the catalogue tab is page state and survives the
// sheet unmounting.
describe('SMA-18 mobile touch (lot 2)', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  // MOBILE coordinates (R4, GitHub Minor 2955d067): the touch tests run at
  // the breakpoint they claim to cover — cell 30px + GAP_PX.xs 2px → 32px
  // track (the lot-2 originals ran the 61px desktop track, proving the
  // mechanism on geometry a finger never meets). Grid rect at (0,0) in
  // jsdom, cell (r,c) hit at (c*32+5, r*32+5).
  const at = (row: number, col: number) => ({
    clientX: col * 32 + 5,
    clientY: row * 32 + 5,
  });

  async function renderPaintable() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: 4,
      height: 4,
      placements: [],
    });
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    return await screen.findByRole('grid');
  }

  // The touch-paint harness: MOBILE breakpoint, shape edit entered through
  // the SHEET — the only below-lg home of the switch, i.e. the real mobile
  // flow (open, toggle, close). Cells must be (re)queried by the caller
  // AFTER this returns: entering a paint mode swaps the cell elements.
  async function renderPaintableMobile() {
    mockMatchMedia(true);
    const grid = await renderPaintable();
    fireEvent.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Plants & infrastructure',
    });
    fireEvent.click(within(dialog).getByText('Edit shape'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    return grid;
  }

  async function renderWithPlacement() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    await screen.findByRole('grid');
    // Grabbed EARLY on purpose: once a sheet modal opens, MUI marks the
    // page content aria-hidden and role queries stop seeing the grid —
    // the DOM node itself stays valid for fireEvent.
    return await screen.findByRole('gridcell', {
      name: 'Basilicum fixture at row 1, column A',
    });
  }

  it('a TOUCH paint stroke propagates across cells with no pointerenter ever firing (FIX A)', async () => {
    const grid = await renderPaintableMobile();
    const cells = within(grid).getAllByRole('gridcell');
    // The touch reality, byte for byte: implicit capture retargets every
    // event to the START cell, so the stroke is pointerdown there plus
    // document-level pointermoves — the neighbouring cells receive NO
    // pointerenter at any time.
    fireEvent.pointerDown(cells[0]!, { ...at(0, 0), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerMove(document, { ...at(0, 1), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerMove(document, { ...at(0, 2), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerUp(document, { ...at(0, 2), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    // All three traversed cells painted (active → inactive, the toggle
    // polarity locked at the start cell) — not only the first.
    expect(cells[0]).toHaveStyle({ backgroundColor: '#ECEEEA' });
    expect(cells[1]).toHaveStyle({ backgroundColor: '#ECEEEA' });
    expect(cells[2]).toHaveStyle({ backgroundColor: '#ECEEEA' });
    // An untraversed cell keeps the active fill.
    expect(cells[3]).toHaveStyle({ backgroundColor: '#F1F7EE' });
  });

  it('the paint stroke ends at pointerup: later moves paint nothing (FIX A)', async () => {
    const grid = await renderPaintableMobile();
    const cells = within(grid).getAllByRole('gridcell');
    fireEvent.pointerDown(cells[0]!, { ...at(0, 0), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerUp(document, { ...at(0, 0), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    // The finger lifts, then the user pans elsewhere — nothing paints.
    fireEvent.pointerMove(document, { ...at(0, 1), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    expect(cells[1]).toHaveStyle({ backgroundColor: '#F1F7EE' });
  });

  it('a second touch cannot hijack a live stroke: no new START, no polarity flip, its release does not end it (R4)', async () => {
    const grid = await renderPaintableMobile();
    const cells = within(grid).getAllByRole('gridcell');
    // Finger 1 (the index) opens a DEACTIVATING stroke on (0,0).
    fireEvent.pointerDown(cells[0]!, { ...at(0, 0), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    expect(cells[0]).toHaveStyle({ backgroundColor: '#ECEEEA' });
    // A second finger (the resting thumb) lands ON the just-painted cell.
    // Pre-R4 this fired a real PAINT_START: the cell toggled back ACTIVE
    // and the locked polarity flipped to "activate".
    fireEvent.pointerDown(cells[0]!, { ...at(0, 0), pointerId: 2, isPrimary: false, pointerType: 'touch' });
    expect(cells[0]).toHaveStyle({ backgroundColor: '#ECEEEA' }); // no flip
    // The thumb lifts. Pre-R4 the end handlers received no event at all,
    // so ANY release anywhere ended the index's stroke right here.
    fireEvent.pointerUp(document, { ...at(0, 0), pointerId: 2, isPrimary: false, pointerType: 'touch' });
    // The index keeps painting: the stroke survived the intruder.
    fireEvent.pointerMove(document, { ...at(0, 1), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    expect(cells[1]).toHaveStyle({ backgroundColor: '#ECEEEA' });
    // The OWNER's release does end it: later moves paint nothing.
    fireEvent.pointerUp(document, { ...at(0, 1), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerMove(document, { ...at(0, 2), pointerId: 1, isPrimary: true, pointerType: 'touch' });
    expect(cells[2]).toHaveStyle({ backgroundColor: '#F1F7EE' });
  });

  it('the grid root clamps touch-action in a paint mode and not in Selection (FIX B)', async () => {
    // Deliberately the ONE desktop-breakpoint render left here (R4): this
    // pins the touch-action CSS contract on the grid root, which does not
    // vary with the breakpoint — no coordinates involved — and the rail
    // keeps the shape-edit switch directly reachable. Desktop COORDINATE
    // coverage lives in the SMA-193 DnD suite (61px track throughout).
    const grid = await renderPaintable();
    // Selection mode: no clamp — a finger scrolls the grid.
    expect(grid).not.toHaveStyle({ touchAction: 'none' });
    // A paint mode: the clamp is on — the finger paints instead.
    fireEvent.click(screen.getByText('Edit shape'));
    expect(grid).toHaveStyle({ touchAction: 'none' });
  });

  it('selecting a placement opens the panel sheet and closes the catalogue sheet (FIX C)', async () => {
    mockMatchMedia(true);
    const placedCell = await renderWithPlacement();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );
    await screen.findByRole('dialog', { name: 'Plants & infrastructure' });

    // A tap on the placed cell selects it: the catalogue sheet yields the
    // bottom to the panel sheet.
    fireEvent.click(placedCell);
    const panelSheet = await screen.findByRole('dialog', {
      name: 'Selected placement',
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Plants & infrastructure' })
      ).toBeNull()
    );
    // The panel content lives inside the sheet (no lane below lg). The
    // fixture has no common name, so display name AND scientific line both
    // render the scientific string — hence getAllByText.
    expect(
      within(panelSheet).getAllByText('Basilicum fixture').length
    ).toBeGreaterThan(0);

    // Clearing the selection closes it — the title row's X.
    await user.click(
      within(panelSheet).getByRole('button', {
        name: 'Close the placement panel',
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opening the catalogue sheet clears the selection and closes the panel sheet (FIX C)', async () => {
    mockMatchMedia(true);
    const placedCell = await renderWithPlacement();
    const trigger = screen.getByRole('button', {
      name: 'Plants & infrastructure',
    });

    fireEvent.click(placedCell);
    await screen.findByRole('dialog', { name: 'Selected placement' });

    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Plants & infrastructure' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Selected placement' })
      ).toBeNull()
    );
  });

  it('Escape clears the selection and the panel sheet closes with it (FIX C)', async () => {
    mockMatchMedia(true);
    const placedCell = await renderWithPlacement();

    fireEvent.click(placedCell);
    const panelSheet = await screen.findByRole('dialog', {
      name: 'Selected placement',
    });
    // MUI's Modal consumes the press and calls onClose, which carries the
    // full Escape grammar itself (R3) — here, in Selection mode, that is
    // just clearing the selection.
    fireEvent.keyDown(panelSheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Escape on the sheet ALSO leaves Place mode, like the desktop key (R3, Extension fa53c9b5)', async () => {
    mockMatchMedia(true);
    const placedCell = await renderWithPlacement();

    // Armless Place mode (move-only entry, lot 3 R2 ruling) — the case the
    // finding names: placeMode active, placePlantId null.
    fireEvent.click(screen.getByRole('button', { name: 'Place' }));
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // In Place mode a tap on the placed cell SELECTS it (no armed plant) —
    // the panel sheet opens.
    fireEvent.click(placedCell);
    const panelSheet = await screen.findByRole('dialog', {
      name: 'Selected placement',
    });

    // MUI consumes Escape before the window handler ever runs — the sheet's
    // onClose must run the SAME grammar: close AND exit to Selection. The
    // pre-R3 sheet only cleared the selection, so desktop and mobile
    // diverged on half the gesture.
    fireEvent.keyDown(panelSheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Selection' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('the catalogue sheet remembers its tab across close and reopen (FIX D, SMA-345)', async () => {
    mockMatchMedia(true);
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    await screen.findByRole('grid');

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );
    let dialog = await screen.findByRole('dialog', {
      name: 'Plants & infrastructure',
    });
    await user.click(within(dialog).getByRole('tab', { name: 'Soils' }));
    expect(within(dialog).getByRole('tab', { name: 'Soils' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Close and reopen: the Drawer unmounts the sidebar, but the tab is
    // page state now — the nominal gesture (arm, place, reopen, arm again)
    // lands back on SOILS, not PLANTS.
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(
      screen.getByRole('button', { name: 'Plants & infrastructure' })
    );
    dialog = await screen.findByRole('dialog', {
      name: 'Plants & infrastructure',
    });
    expect(within(dialog).getByRole('tab', { name: 'Soils' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // And the SOILS panel is the one on screen.
    expect(
      within(dialog).getByRole('button', { name: 'Potting mix' })
    ).toBeInTheDocument();
  });
});

// ── SMA-18 lot 2 R2 — the in-grid undo/zoom row on phones ─────────────────
// Alexandre's phone pass: reaching zoom meant scrolling up to the toolbar,
// away from the very thing being zoomed. Below sm the undo/zoom cluster
// mounts INSIDE the grid card beside the compass (dictated order: undo ·
// percentage · zoom out · zoom in · compass), anchored to the CARD like the
// compass so it never scrolls away with the grid content. The toolbar's own
// cluster is UNMOUNTED below sm — one control, one accessible name, at any
// viewport. Both clusters are ONE shared component (UndoZoomCluster), so
// handlers, bounds and names cannot drift.
describe('SMA-18 lot 2 R2 — in-grid undo/zoom row (mobile)', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  async function renderMobile() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    return await screen.findByRole('grid');
  }

  it('below sm the row renders in the dictated order and each name resolves to exactly ONE control', async () => {
    mockMatchMedia(true);
    await renderMobile();

    const row = screen.getByTestId('grid-zoom-row');
    // Dictated order, left to right: undo · percentage · zoom out · zoom in
    // (the compass sits to the row's right, §8 corner — separate mount).
    expect(
      Array.from(row.children).map(
        (el) => el.getAttribute('aria-label') ?? el.textContent
      )
    ).toEqual(['Undo last action', '100%', 'Zoom out', 'Zoom in']);

    // The accessible-name resolution: getByRole THROWS on duplicates, so
    // these three lines pin "one control per name" — a future change that
    // remounts the toolbar cluster below sm turns them red.
    expect(
      screen.getByRole('button', { name: 'Undo last action' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
  });

  it('the in-grid magnifiers drive the shared zoom state and disable at the real bounds (50% / 200%)', async () => {
    mockMatchMedia(true);
    await renderMobile();
    const row = screen.getByTestId('grid-zoom-row');
    const zoomOut = within(row).getByRole('button', { name: 'Zoom out' });
    const zoomIn = within(row).getByRole('button', { name: 'Zoom in' });

    // ZOOM_MIN = 0.5 (plannerReducer): 100 → 80 → 60 → 50, then disabled.
    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);
    expect(within(row).getByText('50%')).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();
    expect(zoomIn).toBeEnabled();

    // ZOOM_MAX = 2 (plannerReducer — the constants are the single source;
    // the dictation's "150" does not exist in the code): 50 → … → 200.
    for (let i = 0; i < 8; i++) fireEvent.click(zoomIn);
    expect(within(row).getByText('200%')).toBeInTheDocument();
    expect(zoomIn).toBeDisabled();
    expect(zoomOut).toBeEnabled();
  });

  it('the two clusters read the SAME zoom state: set from the row, read from the toolbar after widening', async () => {
    const mq = mockMatchMedia(true);
    await renderMobile();

    fireEvent.click(
      within(screen.getByTestId('grid-zoom-row')).getByRole('button', {
        name: 'Zoom in',
      })
    );
    expect(
      within(screen.getByTestId('grid-zoom-row')).getByText('120%')
    ).toBeInTheDocument();

    // Widen past sm: the in-grid row unmounts, the toolbar cluster mounts —
    // and shows the SAME 120%, because there is only one zoom state.
    act(() => mq.set(false));
    await waitFor(() =>
      expect(screen.queryByTestId('grid-zoom-row')).toBeNull()
    );
    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Undo last action' })
    ).toBeInTheDocument();
  });

  it('undo works from the in-grid row (override → undone, disabled state tracks history)', async () => {
    mockMatchMedia(true);
    const grid = await renderMobile();
    const row = screen.getByTestId('grid-zoom-row');
    const undo = within(row).getByRole('button', { name: 'Undo last action' });
    expect(undo).toBeDisabled(); // no content edit yet

    // Same content edit as the desktop undo test: a manual cell override.
    fireEvent.click(screen.getByRole('switch', { name: 'Exposure' }));
    const cells = within(grid).getAllByRole('gridcell');
    fireEvent.click(cells[1]!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Shade' }));
    expect(cells[1]).toHaveAttribute('data-exposure', 'shade');
    expect(undo).toBeEnabled();

    fireEvent.click(undo);
    expect(cells[1]).toHaveAttribute('data-exposure', 'full');
    expect(undo).toBeDisabled(); // history empty again
  });

  it('above sm no in-grid row renders and the toolbar keeps its single cluster', async () => {
    // No matchMedia mock: desktop, the suite default.
    await renderMobile();
    expect(screen.queryByTestId('grid-zoom-row')).toBeNull();
    // Singular getByRole = the toolbar's cluster is the only name holder.
    expect(
      screen.getByRole('button', { name: 'Undo last action' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
  });
});

// SMA-421 (S5): the reducer is hydrated during render on the snapshot's
// identity. The no-layout branch — a garden whose layout carries no
// dimensions yet — must open the first-setup dialog instead of a grid.
describe('GardenPlanner first setup (SMA-421 S5)', () => {
  it('opens the setup dialog, and no grid, when the garden has no layout dimensions yet', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: null,
      height: null,
      cellSize: null,
      placements: [],
    });
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Garden settings' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});

// SMA-421 (S6): the load-failure toast is raised during render on the
// error's identity. Its text is resolved once, at failure time, and is not
// re-resolved when the language changes — the pre-hook catch's behavior.
describe('GardenPlanner load failure toast (SMA-421 S6)', () => {
  it('shows the load-failure toast once, in the failure-time language, across a later language switch', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockRejectedValue(new Error('boom'));
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();

    expect(
      await screen.findByText('Failed to save layout.')
    ).toBeInTheDocument();

    // A language switch re-renders the page; the same failure must not toast
    // again nor be re-resolved into the French copy.
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    // The page title (no garden loaded → planner.title) follows the locale.
    await screen.findByText('Planificateur de jardin');
    expect(screen.getAllByText('Failed to save layout.')).toHaveLength(1);
    expect(screen.queryByText("Impossible d'enregistrer le plan.")).toBeNull();
  });
});

// SMA-421 (S7): the removal toast and the selection clear react to the
// reducer's transient removal event during render (adjust on removedSeq).
describe('GardenPlanner removal toast (SMA-421 S7)', () => {
  it('toasts the evicted count and clears the selection when a row removal drops a placement', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    // 3 rows: the reducer refuses to remove below 2, and the placement sits
    // on row 1 (startRow 0), so removing the top row evicts it.
    vi.mocked(fetchLayout).mockResolvedValue({ ...layout, height: 3 });
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );

    // Select the placement, then enter shape edit (which keeps the selection).
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    expect(await screen.findByText('Selected placement')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Edit shape'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove top row' }));

    expect(
      await screen.findByText('1 plant was removed (out of bounds)')
    ).toBeInTheDocument();
    expect(screen.queryByText('Selected placement')).toBeNull();
    expect(plantArea(grid).queryByText('B')).toBeNull();
  });
});

// ── SMA-18 lot 1: "Retirer du plan" asks first ─────────────────────────────
// The panel button opens a confirmation; the confirm runs the pre-existing
// REMOVE_PLACEMENT dispatch (history/undo untouched, still no toast). The
// dialog asks about the LIVE selection: it keeps it while open and never
// dispatches for a selection that vanished underneath it.
describe('GardenPlanner remove-placement confirmation (SMA-18 lot 1)', () => {
  async function selectFixturePlacement() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    expect(await screen.findByText('Selected placement')).toBeInTheDocument();
    return grid;
  }

  async function openRemoveDialog() {
    const grid = await selectFixturePlacement();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from plan' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove this placement?',
    });
    return { grid, dialog };
  }

  it('the panel button opens the dialog, which names the placement and keeps the selection', async () => {
    const { grid, dialog } = await openRemoveDialog();

    expect(
      within(dialog).getByText(
        /^Basilicum fixture \(1×1, cells A1\) — this placement will be removed from the grid\./
      )
    ).toBeInTheDocument();
    // Nothing happened yet: the placement is still on the grid, the panel is
    // still mounted underneath (selection kept), the draft is still clean.
    expect(plantArea(grid).getByText('B')).toBeInTheDocument();
    expect(screen.getByText('Selected placement')).toBeInTheDocument();
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
  });

  it('Remove runs the existing removal: placement gone, dialog closed, draft dirty, undo armed', async () => {
    const { grid, dialog } = await openRemoveDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(plantArea(grid).queryByText('B')).toBeNull();
    expect(screen.queryByText('Selected placement')).toBeNull();
    // Same aftermath as before the dialog existed: history pushed, dirty.
    expect(await screen.findByTestId('dirty-bar')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Undo last action' })
    ).toBeEnabled();
  });

  it('Cancel keeps the placement and the selection', async () => {
    const { grid, dialog } = await openRemoveDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(plantArea(grid).getByText('B')).toBeInTheDocument();
    expect(screen.getByText('Selected placement')).toBeInTheDocument();
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
  });

  it('a selection that vanishes under the open dialog closes it without any dispatch', async () => {
    const { grid } = await openRemoveDialog();

    // The page-level Escape grammar clears the selection out from under the
    // dialog (dispatched on window, i.e. past MUI's modal Escape handling).
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Selected placement')).toBeNull();
    // No phantom REMOVE_PLACEMENT: the placement stays, nothing to undo.
    expect(plantArea(grid).getByText('B')).toBeInTheDocument();
    expect(screen.queryByTestId('dirty-bar')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Undo last action' })
    ).toBeDisabled();
    // And the dialog does not re-surface for the next selection.
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    expect(await screen.findByText('Selected placement')).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Remove this placement?' })
    ).toBeNull();
  });
});

// ── SMA-18 lot 1: Danger zone in "Réglages" → type-the-name deletion ───────
// Routed variant (the Profile.test idiom): asserting "the user actually LEFT
// the planner" needs a real route to land on. The stub also echoes the router
// state the list page reads for its toast.
describe('GardenPlanner danger zone (SMA-18 lot 1)', () => {
  function GardensStub() {
    const location = useLocation();
    return <div>GARDENS:{JSON.stringify(location.state)}</div>;
  }

  function renderPlannerWithRoutes() {
    return render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/gardens/g1/planner']}>
          <Routes>
            <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
            <Route path="/gardens" element={<GardensStub />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
  }

  async function openDeleteDialog() {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlannerWithRoutes();
    await screen.findByRole('grid');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = await screen.findByRole('dialog');
    expect(within(settings).getByText('Danger zone')).toBeInTheDocument();
    fireEvent.click(
      within(settings).getByRole('button', { name: 'Delete this garden' })
    );
    return await screen.findByRole('dialog', { name: 'Delete this garden?' });
  }

  it('the Danger zone hands over from Réglages to the type-the-name dialog, naming the draft', async () => {
    const dialog = await openDeleteDialog();

    // Réglages closed — genuinely unmounted, not merely aria-hidden under the
    // confirmation (hence `hidden: true`, which looks past MUI's aria-hidden
    // on the sibling modal roots).
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Garden settings', hidden: true })
      ).toBeNull()
    );
    // The fixture layout: one placement, no painted infrastructure.
    expect(
      within(dialog).getByText(
        '“Test garden” — its grid, 1 placement and 0 infrastructure items will be permanently deleted.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Delete garden' })
    ).toBeDisabled();
    expect(deleteGarden).not.toHaveBeenCalled();
  });

  it('a confirmed deletion leaves for the gardens list with the toast state', async () => {
    vi.mocked(deleteGarden).mockResolvedValue(undefined);
    const dialog = await openDeleteDialog();

    fireEvent.change(
      within(dialog).getByLabelText('Type the garden name to confirm'),
      { target: { value: 'Test garden' } }
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete garden' })
    );

    await waitFor(() => expect(deleteGarden).toHaveBeenCalledWith('g1'));
    expect(
      await screen.findByText('GARDENS:{"toast":"gardenDeleted"}')
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('a failed deletion keeps the planner and the dialog, with the error inline', async () => {
    vi.mocked(deleteGarden).mockRejectedValueOnce(new Error('boom'));
    const dialog = await openDeleteDialog();

    fireEvent.change(
      within(dialog).getByLabelText('Type the garden name to confirm'),
      { target: { value: 'Test garden' } }
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
    expect(screen.queryByText(/^GARDENS:/)).toBeNull();
  });

  it('Cancel returns to the planner without deleting', async () => {
    const dialog = await openDeleteDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(deleteGarden).not.toHaveBeenCalled();
  });

  it('first setup never shows the Danger zone', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      width: null,
      height: null,
      cellSize: null,
      placements: [],
    });
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    renderPlanner();

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Garden settings' })
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('Danger zone')).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Delete this garden' })
    ).toBeNull();
  });
});

// ── SMA-18 lot 1 (review round): S1/S2 made observable ─────────────────────
// The body must count the DRAFT (not the saved layout) and infrastructure
// BLOCKS (not painted cells): a two-cell fence is one item, and a placement
// removed in the unsaved draft is already gone from the count.
describe('GardenPlanner danger zone — draft and block counts (SMA-18 lot 1)', () => {
  function GardensStub() {
    const location = useLocation();
    return <div>GARDENS:{JSON.stringify(location.state)}</div>;
  }

  it('counts a two-cell fence as ONE infrastructure item and a draft-removed placement as gone', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      // Bottom row painted with one contiguous fence: 2 cells, 1 block.
      cellsJson: JSON.stringify([
        { row: 1, col: 0, infrastructure: 'fence' },
        { row: 1, col: 1, infrastructure: 'fence' },
      ]),
    });
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/gardens/g1/planner']}>
          <Routes>
            <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
            <Route path="/gardens" element={<GardensStub />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );

    // Saved layout: 1 placement. Remove it in the DRAFT (unsaved).
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    await screen.findByText('Selected placement');
    fireEvent.click(screen.getByRole('button', { name: 'Remove from plan' }));
    const removeDialog = await screen.findByRole('dialog', {
      name: 'Remove this placement?',
    });
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('dirty-bar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = await screen.findByRole('dialog');
    fireEvent.click(
      within(settings).getByRole('button', { name: 'Delete this garden' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Delete this garden?' });

    expect(
      within(dialog).getByText(
        '“Test garden” — its grid, 0 placements and 1 infrastructure item will be permanently deleted.'
      )
    ).toBeInTheDocument();
  });

  // Round 1 F3': the counts are a SNAPSHOT taken at opening — they hold
  // through the closing fade (a count gated on the open flag would already
  // read "0 infrastructure items" mid-transition), and a re-open reads the
  // draft afresh at that moment.
  it('snapshots the counts at opening: unchanged through the closing fade, re-read from the draft on re-open', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue({
      ...layout,
      // Saved: 1 placement (the fixture) + one contiguous 2-cell fence (1 block).
      cellsJson: JSON.stringify([
        { row: 1, col: 0, infrastructure: 'fence' },
        { row: 1, col: 1, infrastructure: 'fence' },
      ]),
    });
    vi.mocked(fetchPlants).mockResolvedValue([basil]);
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/gardens/g1/planner']}>
          <Routes>
            <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
            <Route path="/gardens" element={<GardensStub />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(plantArea(grid).getByText('B')).toBeInTheDocument()
    );
    const openDeleteDialog = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      const settings = await screen.findByRole('dialog');
      fireEvent.click(
        within(settings).getByRole('button', { name: 'Delete this garden' })
      );
      return await screen.findByRole('dialog', { name: 'Delete this garden?' });
    };
    const bodyAtFirstOpening =
      '“Test garden” — its grid, 1 placement and 1 infrastructure item will be permanently deleted.';

    const first = await openDeleteDialog();
    expect(within(first).getByText(bodyAtFirstOpening)).toBeInTheDocument();

    fireEvent.click(within(first).getByRole('button', { name: 'Cancel' }));
    // Same tick, mid-transition: the copy has NOT moved.
    expect(screen.getByText(bodyAtFirstOpening)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete this garden?' })
      ).toBeNull()
    );

    // Change the DRAFT (remove the placement, unsaved), then re-open: the
    // snapshot is taken again at THIS opening and reads the current draft —
    // neither the saved layout nor the previous snapshot.
    fireEvent.click(within(grid).getAllByRole('gridcell')[0]!);
    await screen.findByText('Selected placement');
    fireEvent.click(screen.getByRole('button', { name: 'Remove from plan' }));
    const removeDialog = await screen.findByRole('dialog', {
      name: 'Remove this placement?',
    });
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('dirty-bar')).toBeInTheDocument();

    const second = await openDeleteDialog();
    expect(
      within(second).getByText(
        '“Test garden” — its grid, 0 placements and 1 infrastructure item will be permanently deleted.'
      )
    ).toBeInTheDocument();
  });
});
