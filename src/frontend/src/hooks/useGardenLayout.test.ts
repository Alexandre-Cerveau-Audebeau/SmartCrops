import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGardenLayout } from './useGardenLayout';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';

vi.mock('../services/gardenApi', () => ({ fetchGarden: vi.fn() }));
vi.mock('../services/gardenLayoutApi', () => ({ fetchLayout: vi.fn() }));

const gardenOf = (id: string): Garden =>
  ({ id, name: `Garden ${id}` }) as unknown as Garden;

const layoutOf = (id: string): GardenLayoutData => ({
  width: 4,
  height: 3,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
    gardenType: null,
    lightSchedule: null,
    hemisphere: null,
    latitudeBand: null,
  },
  placements: [],
  // Tag the payload so the race test can tell which id produced it.
  ...({ tag: id } as object),
});

beforeEach(() => {
  vi.mocked(fetchGarden).mockReset();
  vi.mocked(fetchLayout).mockReset();
});

describe('useGardenLayout (SMA-213)', () => {
  it('loads garden + layout and clears loading', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(gardenOf('a'));
    vi.mocked(fetchLayout).mockResolvedValue(layoutOf('a'));

    const { result } = renderHook(() => useGardenLayout('a'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.garden.id).toBe('a');
    expect(result.current.data?.layout.width).toBe(4);
    expect(result.current.error).toBeNull();
  });

  it('exposes the rejection and clears loading on failure', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(gardenOf('a'));
    vi.mocked(fetchLayout).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useGardenLayout('a'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeNull();
  });

  it('does not fetch without an id and keeps loading (pre-hook behavior)', () => {
    const { result } = renderHook(() => useGardenLayout(undefined));

    expect(result.current.loading).toBe(true);
    expect(vi.mocked(fetchGarden)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchLayout)).not.toHaveBeenCalled();
  });

  it('discards a stale response that resolves after a garden switch (the SMA-213 race)', async () => {
    const layoutResolvers = new Map<string, (l: GardenLayoutData) => void>();
    const gardenResolvers = new Map<string, (g: Garden) => void>();
    const signals = new Map<string, AbortSignal | undefined>();
    vi.mocked(fetchLayout).mockImplementation(
      (id: string, signal?: AbortSignal) => {
        signals.set(id, signal);
        return new Promise<GardenLayoutData>((resolve) => {
          layoutResolvers.set(id, resolve);
        });
      }
    );
    vi.mocked(fetchGarden).mockImplementation(
      (id: string) =>
        new Promise<Garden>((resolve) => {
          gardenResolvers.set(id, resolve);
        })
    );

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useGardenLayout(id),
      { initialProps: { id: 'a' } }
    );

    // Switch gardens while request #1 is still in flight.
    rerender({ id: 'b' });
    expect(signals.get('a')?.aborted).toBe(true);
    expect(signals.get('b')?.aborted).toBe(false);

    // Request #2 (current id) resolves first…
    await act(async () => {
      layoutResolvers.get('b')!(layoutOf('b'));
      gardenResolvers.get('b')!(gardenOf('b'));
    });
    await waitFor(() => expect(result.current.data?.garden.id).toBe('b'));

    // …then the superseded request #1 resolves late: it must be discarded.
    await act(async () => {
      layoutResolvers.get('a')!(layoutOf('a'));
      gardenResolvers.get('a')!(gardenOf('a'));
    });
    expect(result.current.data?.garden.id).toBe('b');
    expect(
      (result.current.data?.layout as GardenLayoutData & { tag?: string }).tag
    ).toBe('b');
    expect(result.current.loading).toBe(false);
  });

  it('clears a previous error when a gardenId change succeeds', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(gardenOf('a'));
    vi.mocked(fetchLayout).mockRejectedValueOnce(new Error('boom'));

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useGardenLayout(id),
      { initialProps: { id: 'a' } }
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    vi.mocked(fetchGarden).mockResolvedValue(gardenOf('b'));
    vi.mocked(fetchLayout).mockResolvedValue(layoutOf('b'));
    rerender({ id: 'b' });

    await waitFor(() => expect(result.current.data?.garden.id).toBe('b'));
    expect(result.current.error).toBeNull();
  });

  it('clears a previous error when refetch() succeeds', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(gardenOf('a'));
    vi.mocked(fetchLayout).mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useGardenLayout('a'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    vi.mocked(fetchLayout).mockResolvedValue(layoutOf('a'));
    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.data?.garden.id).toBe('a'));
    expect(result.current.error).toBeNull();
  });

  it('refetch() reloads the same id', async () => {
    vi.mocked(fetchGarden).mockResolvedValue(gardenOf('a'));
    vi.mocked(fetchLayout).mockResolvedValue(layoutOf('a'));

    const { result } = renderHook(() => useGardenLayout('a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(fetchLayout)).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    await waitFor(() =>
      expect(vi.mocked(fetchLayout)).toHaveBeenCalledTimes(2)
    );
    expect(vi.mocked(fetchLayout)).toHaveBeenLastCalledWith(
      'a',
      expect.any(AbortSignal)
    );
  });
});
