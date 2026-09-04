import { beforeEach, describe, expect, it, vi } from 'vitest';
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
