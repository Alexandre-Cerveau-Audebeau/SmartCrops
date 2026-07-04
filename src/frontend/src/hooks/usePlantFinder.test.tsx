import { StrictMode, useEffect } from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import type { Plant } from '../types/Plant';
import type {
  FindPlantsParams,
  PlantFinderResult,
} from '../services/plantApi';

vi.mock('../services/plantApi', () => ({
  findPlants: vi.fn(),
}));

import { EMPTY_FILTERS, PER_PAGE, usePlantFinder } from './usePlantFinder';
import type { UsePlantFinderResult } from './usePlantFinder';
import { findPlants } from '../services/plantApi';

// SMA-9 T1 (SMA-269) — the fetch orchestration lives in usePlantFinder, so
// the replace/append/langRefetch matrix is pinned here IN ISOLATION with
// renderHook. Unlike the component suite (which renders under app chrome and
// tolerates StrictMode noise), these tests run the hook bare and can assert
// EXACT call counts; one dedicated StrictMode test guards the aborted-run /
// prevRef regression.

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function makeListItem(i: number): Plant {
  return {
    id: `id-${i}`,
    scientificName: `Plant ${String(i).padStart(2, '0')}`,
    plantTypeId: 4,
    plantType: { id: 4, name: 'Ornamental', description: null },
    sunExposure: null,
    waterNeeds: null,
  } as unknown as Plant;
}

const makeMany = (n: number) =>
  Array.from({ length: n }, (_, i) => makeListItem(i));

// Serves PER_PAGE-item pages out of `catalog`, mirroring the finder contract.
function pageOf(
  catalog: Plant[],
  page: number,
  overrides: Partial<PlantFinderResult> = {}
): PlantFinderResult {
  return {
    items: catalog.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    found: catalog.length,
    page,
    perPage: PER_PAGE,
    facetCounts: [],
    ...overrides,
  };
}

function mockCatalog(catalog: Plant[]) {
  vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
    Promise.resolve(pageOf(catalog, params.page ?? 1))
  );
}

// SMA-9 T2 — deliberate input-shape change: the single activeType became the
// multi-facet `filters` object; this suite was adapted accordingly (not an
// iso-behavior pass).
const initialInputs = {
  query: '',
  filters: EMPTY_FILTERS,
  language: 'en',
};

function renderFinder(inputs = initialInputs) {
  return renderHook((i) => usePlantFinder(i), { initialProps: inputs });
}

async function loadedFinder(catalog: Plant[] = makeMany(50)) {
  mockCatalog(catalog);
  const view = renderFinder();
  await waitFor(() => expect(view.result.current.initialLoading).toBe(false));
  return view;
}

describe('usePlantFinder', () => {
  it('fetches exactly one page-1 request on mount and exposes the result', async () => {
    const { result } = await loadedFinder();

    // Bare hook, no StrictMode: the count can be exact — ONE fetch.
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
      {
        q: undefined,
        lang: 'en',
        perPage: PER_PAGE,
        plantTypeIds: undefined,
        careLevels: undefined,
        wateringNeedLevels: undefined,
        lifeCycles: undefined,
        growthRates: undefined,
        page: 1,
      },
      expect.anything()
    );
    expect(result.current.items).toHaveLength(PER_PAGE);
    expect(result.current.found).toBe(50);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('exposes the last response facetCounts (T2 seam)', async () => {
    const facetCounts = [
      { field: 'careLevel', counts: [{ value: 'Easy', count: 280 }] },
    ];
    vi.mocked(findPlants).mockResolvedValue(
      pageOf(makeMany(5), 1, { facetCounts })
    );
    const { result } = renderFinder();

    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(result.current.facetCounts).toEqual(facetCounts);
  });

  it('loadMore appends the next page; double-calls collapse to one fetch', async () => {
    const { result } = await loadedFinder();

    // Two synchronous fires (sentinel + button race): the functional setPage
    // caps the advance at ONE page beyond the last fetched context.
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.items).toHaveLength(48));

    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.anything()
    );
    // Appended, not replaced — page 1 items still lead the list.
    expect(result.current.items[0]!.scientificName).toBe('Plant 00');
    expect(result.current.found).toBe(50);
  });

  it('loadMore no-ops while a page is in flight (fetchingRef guard)', async () => {
    const catalog = makeMany(50);
    let releasePage2!: () => void;
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) => {
      if (params.page === 2) {
        return new Promise<PlantFinderResult>((resolve) => {
          releasePage2 = () => resolve(pageOf(catalog, 2));
        });
      }
      return Promise.resolve(pageOf(catalog, params.page ?? 1));
    });
    const { result } = renderFinder();
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    // First call starts the page-2 fetch (act flushes the effect)…
    act(() => result.current.loadMore());
    // …so this one hits the in-flight guard and must be ignored.
    act(() => result.current.loadMore());
    act(() => releasePage2());

    await waitFor(() => expect(result.current.items).toHaveLength(48));
    // mount + ONE page-2 fetch — the guarded call produced nothing.
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(2);
  });

  it('a failed append rolls the page back so the next loadMore retries it', async () => {
    // Without the rollback, a failed page-2 fetch left `page` bumped with
    // prevRef uncommitted; the advance cap then made every retry a same-value
    // setPage → React bail-out → the effect never re-ran and Load more was
    // permanently wedged (only a context change escaped).
    const catalog = makeMany(50);
    let page2Failed = false;
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) => {
      if (params.page === 2 && !page2Failed) {
        page2Failed = true;
        return Promise.reject(new Error('Failed to find plants: 503'));
      }
      return Promise.resolve(pageOf(catalog, params.page ?? 1));
    });
    const { result } = renderFinder();
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    // First append fails: error surfaces, the list keeps page 1 only.
    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.error).toBe('Failed to find plants: 503')
    );
    expect(result.current.items).toHaveLength(24);
    const callsAfterFailure = vi.mocked(findPlants).mock.calls.length;

    // Second loadMore re-advances to the SAME page (exactly one new call),
    // appends it, and the success clears the error.
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(48));
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(callsAfterFailure + 1);
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.anything()
    );
    expect(result.current.error).toBeNull();
  });

  it('a query change replaces from page 1 after the debounce; resetToFirstPage alone refetches nothing', async () => {
    const { result, rerender } = await loadedFinder();
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(48));

    // The caller's handler resets the page alongside the input change. On its
    // own it changes nothing effective (page 1 < last fetched page) — the
    // "nothing changed" branch must keep the current list without a fetch.
    const callsBefore = vi.mocked(findPlants).mock.calls.length;
    act(() => result.current.resetToFirstPage());
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(callsBefore);
    expect(result.current.items).toHaveLength(48);

    vi.useFakeTimers();
    rerender({ ...initialInputs, query: 'lavender' });
    // Typed queries debounce 300ms…
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(callsBefore);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // …then REPLACE from page 1.
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(callsBefore + 1);
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'lavender', page: 1 }),
      expect.anything()
    );
    expect(result.current.items).toHaveLength(24);
  });

  it('a facet change replaces from page 1 immediately (no debounce)', async () => {
    const { result, rerender } = await loadedFinder();

    rerender({
      ...initialInputs,
      filters: { ...EMPTY_FILTERS, plantTypeIds: [4] },
    });
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(2)
    );
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ plantTypeIds: [4], page: 1 }),
      expect.anything()
    );
    await waitFor(() => expect(result.current.items).toHaveLength(24));
  });

  it('multi-value and cross-facet selections are passed through as arrays (OR within, AND across)', async () => {
    const { result, rerender } = await loadedFinder();

    rerender({
      ...initialInputs,
      filters: { ...EMPTY_FILTERS, careLevels: ['Easy', 'Medium'] },
    });
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ careLevels: ['Easy', 'Medium'], page: 1 }),
        expect.anything()
      )
    );
    expect(result.current.activeFilterCount).toBe(2);

    rerender({
      ...initialInputs,
      filters: {
        ...EMPTY_FILTERS,
        careLevels: ['Easy', 'Medium'],
        lifeCycles: ['Annual'],
      },
    });
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          careLevels: ['Easy', 'Medium'],
          lifeCycles: ['Annual'],
        }),
        expect.anything()
      )
    );
    expect(result.current.activeFilterCount).toBe(3);
    expect(result.current.isFiltered).toBe(true);
  });

  it('catalogTotal records the unfiltered catalogue size and survives filtered fetches', async () => {
    const catalogue = makeMany(50);
    const filtered = makeMany(3);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      Promise.resolve(pageOf(params.careLevels ? filtered : catalogue, params.page ?? 1))
    );
    const { result, rerender } = renderFinder();
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    // The mount fetch is always unfiltered — the total is known from page one.
    expect(result.current.catalogTotal).toBe(50);

    rerender({
      ...initialInputs,
      filters: { ...EMPTY_FILTERS, careLevels: ['Easy'] },
    });
    await waitFor(() => expect(result.current.found).toBe(3));
    // Filtered fetches narrow `found` but never touch the catalogue total.
    expect(result.current.catalogTotal).toBe(50);

    rerender(initialInputs);
    await waitFor(() => expect(result.current.found).toBe(50));
    expect(result.current.catalogTotal).toBe(50);
  });

  it('a facet change resets nothing the handlers do not reset — the hook never self-resets the page', async () => {
    // Callers own the page reset (handlers call resetToFirstPage alongside
    // the input change). Pin that the hook itself does not sneak one in: a
    // filters change WITHOUT a reset still replaces from page 1 (context
    // change semantics) in exactly one call.
    const { result, rerender } = await loadedFinder();
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(48));
    const callsBefore = vi.mocked(findPlants).mock.calls.length;

    rerender({
      ...initialInputs,
      filters: { ...EMPTY_FILTERS, careLevels: ['Easy'] },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(24));
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(callsBefore + 1);
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ careLevels: ['Easy'], page: 1 }),
      expect.anything()
    );
  });

  it('a language change refetches exactly the loaded pages (1..N) and preserves the slice (SMA-153)', async () => {
    const { result, rerender } = await loadedFinder();
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(48));
    vi.mocked(findPlants).mockClear();

    rerender({ ...initialInputs, language: 'fr' });

    // Exactly TWO calls — one per loaded page, both in fr, no page 3.
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(2)
    );
    expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'fr', page: 1 }),
      expect.anything()
    );
    expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'fr', page: 2 }),
      expect.anything()
    );
    // Positional replace — no collapse back to one page.
    await waitFor(() => expect(result.current.items).toHaveLength(48));
  });

  it('a 0–1 character query stays match-all — no refetch at all', async () => {
    const { result, rerender } = await loadedFinder();

    // Fake timers (like the debounce test): deterministic by construction —
    // no real-clock sleep that could flake under load.
    vi.useFakeTimers();
    rerender({ ...initialInputs, query: 'l' });
    // effectiveQuery is unchanged (''), so the effect does not even re-run —
    // give any stray debounce a chance to fire before asserting.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(1);
    expect(result.current.items).toHaveLength(24);
  });

  it('a sub-threshold edit keeps the fetched page context: one loadMore appends the NEXT page (guarded reset)', async () => {
    // Pins the hook contract behind the component's guarded reset: a 0↔1-char
    // edit does NOT reset the page (the displayed set is identical), so the
    // page state stays in sync with the fetched context and Load more keeps
    // working. Had the caller reset to page 1 here (pre-fix T4 behavior), the
    // next loadMore would advance 1→2 — a page already fetched — and append
    // NOTHING: a silent no-op wedge.
    const { result, rerender } = await loadedFinder(makeMany(100));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(48));
    const callsBefore = vi.mocked(findPlants).mock.calls.length;

    // The guarded handler forwards the raw query WITHOUT resetToFirstPage().
    rerender({ ...initialInputs, query: 'l' });
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(callsBefore);
    expect(result.current.items).toHaveLength(48);

    // ONE loadMore → ONE fetch, straight to page 3 and appended.
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(72));
    expect(vi.mocked(findPlants)).toHaveBeenCalledTimes(callsBefore + 1);
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3, q: undefined }),
      expect.anything()
    );
  });

  it('surfaces a fetch failure through error and clears it on the next success', async () => {
    // The once-rejection is consumed by the first call (mount); every call
    // after it falls through to the default implementation and succeeds.
    const catalog = makeMany(5);
    vi.mocked(findPlants)
      .mockImplementation((params: FindPlantsParams) =>
        Promise.resolve(pageOf(catalog, params.page ?? 1))
      )
      .mockRejectedValueOnce(new Error('Failed to find plants: 503'));

    const { result, rerender } = renderFinder();
    await waitFor(() =>
      expect(result.current.error).toBe('Failed to find plants: 503')
    );
    expect(result.current.initialLoading).toBe(false);

    // A context change retries (prevRef was never committed for the failed
    // fetch) and a success clears the error.
    rerender({
      ...initialInputs,
      filters: { ...EMPTY_FILTERS, plantTypeIds: [4] },
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.items).toHaveLength(5);
  });

  it('an aborted first run leaves the snapshot uncommitted so the retry still fetches (StrictMode regression guard)', async () => {
    // StrictMode double-invokes the mount effect: run 1 starts a fetch and is
    // aborted by the cleanup before its promise settles; run 2 must still see
    // prevRef === null (uncommitted) and fetch again. With the old
    // commit-at-entry bug, run 2 saw "nothing changed" and the hook hung on
    // initialLoading forever. A probe component under render(<StrictMode>) is
    // used instead of renderHook's wrapper option: with the wrapper, this React +
    // RTL combination does NOT double-invoke effects (probed empirically),
    // which would silently void this guard.
    mockCatalog(makeMany(50));
    const latestRef: { current: UsePlantFinderResult | null } = {
      current: null,
    };
    function Probe() {
      const finder = usePlantFinder(initialInputs);
      // Mirrored post-commit (react-hooks/immutability forbids writing an
      // outer variable during render); the waitFor below polls after commits,
      // so effect timing is enough.
      useEffect(() => {
        latestRef.current = finder;
      });
      return null;
    }
    render(
      <StrictMode>
        <Probe />
      </StrictMode>
    );

    await waitFor(() => expect(latestRef.current?.initialLoading).toBe(false));
    expect(latestRef.current?.items).toHaveLength(PER_PAGE);
    expect(latestRef.current?.found).toBe(50);
    // Both effect runs fetched — the aborted one committed nothing.
    expect(vi.mocked(findPlants).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
