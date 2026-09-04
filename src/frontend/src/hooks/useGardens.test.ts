import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGardens } from './useGardens';
import { fetchGardens } from '../services/gardenApi';
import type { GardenListItem } from '../types/Garden';

vi.mock('../services/gardenApi', () => ({ fetchGardens: vi.fn() }));

const gardenOf = (id: string, name: string): GardenListItem => ({
  id,
  name,
  description: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  plants: [],
});

beforeEach(() => {
  vi.mocked(fetchGardens).mockReset();
});

describe('useGardens (SMA-421)', () => {
  it('loads the list for the given language and clears loading', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenOf('g1', 'Casa Lolo')]);

    const { result } = renderHook(() => useGardens('en'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Casa Lolo']);
    expect(result.current.loadError).toBe(false);
    const [, lang] = vi.mocked(fetchGardens).mock.calls[0]!;
    expect(lang).toBe('en');
  });

  it('exposes the failure and clears loading on rejection', async () => {
    vi.mocked(fetchGardens).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useGardens('en'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe(true);
    expect(result.current.gardens).toEqual([]);
  });

  it('refetch() reloads the same language and keeps the cards up meanwhile', async () => {
    vi.mocked(fetchGardens).mockResolvedValueOnce([gardenOf('g1', 'Before')]);
    const { result } = renderHook(() => useGardens('en'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveSecond!: (gardens: GardenListItem[]) => void;
    vi.mocked(fetchGardens).mockImplementationOnce(
      () =>
        new Promise<GardenListItem[]>((resolve) => {
          resolveSecond = resolve;
        })
    );
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchGardens).toHaveBeenCalledTimes(2));

    // The previous list stays rendered while the refresh is in flight.
    expect(result.current.loading).toBe(false);
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Before']);

    await act(async () => {
      resolveSecond([gardenOf('g1', 'After')]);
    });
    expect(result.current.gardens.map((g) => g.name)).toEqual(['After']);
  });

  it('discards a stale response that resolves after a language switch (the SMA-288 race)', async () => {
    const deferred: Array<(gardens: GardenListItem[]) => void> = [];
    vi.mocked(fetchGardens).mockImplementation(
      () =>
        new Promise<GardenListItem[]>((resolve) => {
          deferred.push(resolve);
        })
    );

    const { result, rerender } = renderHook(
      ({ language }) => useGardens(language),
      { initialProps: { language: 'en' } }
    );
    await waitFor(() => expect(deferred.length).toBe(1));
    rerender({ language: 'fr' });
    await waitFor(() => expect(deferred.length).toBe(2));

    // Newest response lands first...
    await act(async () => {
      deferred[1]!([gardenOf('g2', 'Jardin frais')]);
    });
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Jardin frais']);
    expect(result.current.loading).toBe(false);

    // ...then the STALE first response resolves last: discarded.
    await act(async () => {
      deferred[0]!([gardenOf('g1', 'Vieux jardin')]);
    });
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Jardin frais']);
  });
});

// SMA-421 round 1 (F1, GitHub Major): refetch() must invalidate the active
// request SYNCHRONOUSLY — the request id moves in the handler, not when the
// passive effect re-runs — and a failed replacement must not leave the
// previous list on screen.
describe('useGardens — synchronous invalidation (SMA-421 R1)', () => {
  it('ignores a superseded response that lands after refetch() but before the effect re-runs', async () => {
    const deferred: Array<(gardens: GardenListItem[]) => void> = [];
    vi.mocked(fetchGardens).mockImplementation(
      () =>
        new Promise<GardenListItem[]>((resolve) => {
          deferred.push(resolve);
        })
    );
    const { result, rerender } = renderHook(
      ({ language }) => useGardens(language),
      { initialProps: { language: 'en' } }
    );
    await waitFor(() => expect(deferred.length).toBe(1));
    await act(async () => {
      deferred[0]!([gardenOf('g1', 'Displayed')]);
    });
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Displayed']);

    // Request #2 (language switch) is in flight...
    rerender({ language: 'fr' });
    await waitFor(() => expect(deferred.length).toBe(2));

    // ...refetch() is called, and #2 resolves in the window BEFORE the passive
    // effect has re-run (inside the same async act scope, before its flush).
    await act(async () => {
      result.current.refetch();
      deferred[1]!([gardenOf('g2', 'Late and stale')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(deferred.length).toBe(3));

    // The superseded payload never overwrote the displayed list.
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Displayed']);

    await act(async () => {
      deferred[2]!([gardenOf('g3', 'Replacement')]);
    });
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Replacement']);
  });

  it('clears the list and reports the error when the replacement request fails', async () => {
    vi.mocked(fetchGardens).mockResolvedValueOnce([gardenOf('g1', 'Before')]);
    const { result } = renderHook(() => useGardens('en'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Before']);

    vi.mocked(fetchGardens).mockRejectedValueOnce(new Error('boom'));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.loadError).toBe(true));

    // No stale list behind the error.
    expect(result.current.gardens).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

// SMA-421 round 2 (F6, GitHub Major): the in-flight request must be
// invalidated in the COMMIT — a layout effect — so a settlement that lands
// after the language-change render but before the passive effects can no
// longer pass isCurrent(). A real promise never settles inside React's
// synchronous act flush, so that interval is modelled deterministically: the
// pending request is a thenable the test settles from a layout effect
// declared AFTER the hook — same commit as the language change, after the
// hook's own layout effect, before any passive effect.
type SyncDeferred<T> = {
  thenable: Promise<T>;
  resolve: (value: T) => void;
};

function syncDeferred<T>(): SyncDeferred<T> {
  const onFulfilled: Array<(value: T) => unknown> = [];
  const onFinally: Array<() => unknown> = [];
  const thenable = {
    then(f?: (value: T) => unknown) {
      if (f) onFulfilled.push(f);
      return thenable;
    },
    catch() {
      return thenable;
    },
    finally(f?: () => unknown) {
      if (f) onFinally.push(f);
      return thenable;
    },
  };
  return {
    thenable: thenable as unknown as Promise<T>,
    resolve: (value: T) => {
      onFulfilled.forEach((f) => f(value));
      onFinally.forEach((f) => f());
    },
  };
}

describe('useGardens — invalidation in the commit (SMA-421 R2)', () => {
  it('ignores a response that settles after the language-change render but before the passive effect: list and loading intact', async () => {
    // #1 (en) is settled by the test from inside the language-change commit;
    // #2 (fr) stays pending until the end.
    const late = syncDeferred<GardenListItem[]>();
    const fresh: Array<(gardens: GardenListItem[]) => void> = [];
    vi.mocked(fetchGardens)
      .mockImplementationOnce(() => late.thenable)
      .mockImplementation(
        () =>
          new Promise<GardenListItem[]>((resolve) => {
            fresh.push(resolve);
          })
      );

    let settleInCommit = false;
    const { result, rerender } = renderHook(
      ({ language }) => {
        const gardens = useGardens(language);
        // Declared after the hook: runs in the same commit, after the hook's
        // layout effect and before any passive effect.
        useLayoutEffect(() => {
          if (settleInCommit) {
            settleInCommit = false;
            late.resolve([gardenOf('g1', 'Late and stale')]);
          }
        }, [language]);
        return gardens;
      },
      { initialProps: { language: 'en' } }
    );
    await waitFor(() => expect(fetchGardens).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);
    expect(result.current.gardens).toEqual([]);

    settleInCommit = true;
    rerender({ language: 'fr' });

    // The previous language's payload never landed: nothing displayed, still
    // loading, no error — the fr request is the only one that may commit.
    expect(result.current.gardens).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.loadError).toBe(false);
    await waitFor(() => expect(fresh.length).toBe(1));

    await act(async () => {
      fresh[0]!([gardenOf('g2', 'Fresh')]);
    });
    expect(result.current.gardens.map((g) => g.name)).toEqual(['Fresh']);
    expect(result.current.loading).toBe(false);
  });
});
