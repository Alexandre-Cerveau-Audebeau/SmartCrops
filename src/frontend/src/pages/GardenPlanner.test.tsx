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
vi.mock('../services/gardenApi', () => ({ fetchGarden: vi.fn() }));
vi.mock('../services/gardenLayoutApi', () => ({
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));

import GardenPlanner from './GardenPlanner';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import { fetchPlants } from '../services/plantApi';

// Locks the transient wrong-initial artifact: a placement hydrating before
// the plant catalog used to render the 'U' of the 'Unknown' fallback for
// ~an instant, then self-correct once the catalog landed. Placement initials
// are now gated on the catalog being loaded.

const basil = { id: 'p1', scientificName: 'Basilicum fixture' } as Plant;
const maize = { id: 'p2', scientificName: 'Zea mays' } as Plant;

const garden = {
  id: 'g1',
  name: 'Test garden',
  gardenPlants: [],
} as unknown as Garden;

const layout: GardenLayoutData = {
  width: 2,
  height: 2,
  cellSize: '50cm',
  cellsJson: null,
  placements: [
    {
      id: 'pl1',
      plantId: 'p1',
      plantName: null,
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
    expect(within(grid).queryByText('U')).toBeNull();

    // Catalog lands → the real initial appears, never 'U'.
    resolveCatalog([basil]);
    await waitFor(() =>
      expect(within(grid).getByText('B')).toBeInTheDocument()
    );
    expect(within(grid).queryByText('U')).toBeNull();
  });

  it('keeps the Unknown fallback for a plant genuinely absent from the loaded catalog', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(garden);
    vi.mocked(fetchLayout).mockResolvedValue(layout);
    vi.mocked(fetchPlants).mockResolvedValue([maize]);

    renderPlanner();

    const grid = await screen.findByRole('grid');
    await waitFor(() =>
      expect(within(grid).getByText('U')).toBeInTheDocument()
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
      expect(within(grid).getByText('B')).toBeInTheDocument()
    );
    expect(screen.getAllByText('Basilicum fixture').length).toBeGreaterThan(0);

    // Switch to FR while the FR response is DELAYED: the previous locale's
    // catalog must be dropped immediately — neutral cell, never the stale 'B'.
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    // (a) Render-window pin (5.2 R4): synchronously after the switch — before
    // fetch #2 resolves — no render may show the previous locale's names.
    expect(within(grid).queryByText('B')).toBeNull();
    // (b) Sidebar path: no stale-locale label there (nor in the plants
    // section) — pending/empty presentation instead.
    expect(screen.queryAllByText('Basilicum fixture')).toHaveLength(0);
    await waitFor(() => expect(resolvers.length).toBe(2));
    expect(within(grid).queryByText('B')).toBeNull();
    // Pending means NEUTRAL — no unknown-plant fallback initial in either
    // locale ('U' = EN "Unknown", 'I' = FR "Inconnue").
    expect(within(grid).queryByText('U')).toBeNull();
    expect(within(grid).queryByText('I')).toBeNull();

    // FR response lands — the localized name takes over.
    resolvers[1]!([
      { ...basil, commonName: 'framboisier' } as Plant, // -> 'Framboisier' -> 'F'
    ]);
    await waitFor(() =>
      expect(within(grid).getByText('F')).toBeInTheDocument()
    );
    expect(within(grid).queryByText('B')).toBeNull();
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
      expect(within(grid).getByText('B')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(2));
    deferred[1]!.reject(new Error('network down'));

    // (c) Failure path: a failed refetch cannot resurrect the old catalog —
    // the previous locale's names stay gone; pending presentation remains.
    await waitFor(() =>
      expect(screen.queryAllByText('Basilicum fixture')).toHaveLength(0)
    );
    expect(within(grid).queryByText('B')).toBeNull();
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
    expect(within(grid).queryByText('U')).toBeNull();
    expect(screen.queryAllByText('Basilicum fixture')).toHaveLength(0);

    // Retry -> a NEW fetch runs; success clears the error and names appear.
    fireEvent.click(retry);
    await waitFor(() => expect(deferred.length).toBe(2));
    deferred[1]!.resolve([basil]);
    await waitFor(() =>
      expect(within(grid).getByText('B')).toBeInTheDocument()
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
      expect(within(grid).getByText('F')).toBeInTheDocument()
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
      expect(within(grid).getByText('F')).toBeInTheDocument()
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
      expect(within(grid).getByText('B')).toBeInTheDocument()
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
      expect(within(grid).getAllByText('F')).toHaveLength(1)
    );
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
      expect(within(grid).getByText('U')).toBeInTheDocument()
    );
  });
});
