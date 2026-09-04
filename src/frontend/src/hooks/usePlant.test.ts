import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePlant } from './usePlant';
import { HttpStatusError } from '../services/httpStatusError';
import { fetchPlantById } from '../services/plantApi';
import type { Plant } from '../types/Plant';

vi.mock('../services/plantApi', () => ({ fetchPlantById: vi.fn() }));

const plantOf = (id: string, scientificName: string) =>
  ({ id, scientificName }) as Plant;

beforeEach(() => {
  vi.mocked(fetchPlantById).mockReset();
});

describe('usePlant (SMA-421)', () => {
  it('loads the plant and clears loading', async () => {
    vi.mocked(fetchPlantById).mockResolvedValue(plantOf('p1', 'Ocimum basilicum'));

    const { result } = renderHook(() => usePlant('p1', 0));

    expect(result.current.loading).toBe(true);
    expect(result.current.plant).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plant?.scientificName).toBe('Ocimum basilicum');
    expect(result.current.error).toBeNull();
  });

  it('does not fetch without an id and is not loading', () => {
    const { result } = renderHook(() => usePlant(undefined, 0));

    expect(result.current.loading).toBe(false);
    expect(result.current.plant).toBeNull();
    expect(fetchPlantById).not.toHaveBeenCalled();
  });

  it('settles a 404 as not found: no plant, no error', async () => {
    vi.mocked(fetchPlantById).mockRejectedValue(
      new HttpStatusError('Not found', 404)
    );

    const { result } = renderHook(() => usePlant('missing', 0));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plant).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('exposes any other rejection', async () => {
    vi.mocked(fetchPlantById).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePlant('p1', 0));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plant).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('a reloadCounter bump refetches in place and keeps the current plant displayed meanwhile', async () => {
    vi.mocked(fetchPlantById).mockResolvedValueOnce(plantOf('p1', 'Before'));
    const { result, rerender } = renderHook(
      ({ reload }) => usePlant('p1', reload),
      { initialProps: { reload: 0 } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plant?.scientificName).toBe('Before');

    let resolveReload!: (plant: Plant) => void;
    vi.mocked(fetchPlantById).mockImplementationOnce(
      () =>
        new Promise<Plant>((resolve) => {
          resolveReload = resolve;
        })
    );
    rerender({ reload: 1 });
    await waitFor(() => expect(fetchPlantById).toHaveBeenCalledTimes(2));

    // In flight: no spinner, the previous plant is still on screen.
    expect(result.current.loading).toBe(false);
    expect(result.current.plant?.scientificName).toBe('Before');

    await act(async () => {
      resolveReload(plantOf('p1', 'After'));
    });
    expect(result.current.plant?.scientificName).toBe('After');
  });

  it('discards the payload of a run whose cleanup fired (reload superseded)', async () => {
    const deferred: Array<(plant: Plant) => void> = [];
    vi.mocked(fetchPlantById).mockImplementation(
      () =>
        new Promise<Plant>((resolve) => {
          deferred.push(resolve);
        })
    );
    const { result, rerender } = renderHook(
      ({ reload }) => usePlant('p1', reload),
      { initialProps: { reload: 0 } }
    );
    await waitFor(() => expect(deferred.length).toBe(1));
    rerender({ reload: 1 });
    await waitFor(() => expect(deferred.length).toBe(2));

    await act(async () => {
      deferred[1]!(plantOf('p1', 'Fresh'));
    });
    expect(result.current.plant?.scientificName).toBe('Fresh');

    await act(async () => {
      deferred[0]!(plantOf('p1', 'Stale'));
    });
    expect(result.current.plant?.scientificName).toBe('Fresh');
  });
});

// SMA-421 round 1 (F2, Extension Major): the hook is correct on its own —
// a new id on the SAME mount invalidates the settled payload during render.
describe('usePlant — id change on the same mount (SMA-421 R1)', () => {
  it('goes back to loading with no plant when the id changes, then serves the new plant', async () => {
    vi.mocked(fetchPlantById).mockResolvedValueOnce(plantOf('p1', 'First'));
    const { result, rerender } = renderHook(({ id }) => usePlant(id, 0), {
      initialProps: { id: 'p1' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plant?.scientificName).toBe('First');

    let resolveSecond!: (plant: Plant) => void;
    vi.mocked(fetchPlantById).mockImplementationOnce(
      () =>
        new Promise<Plant>((resolve) => {
          resolveSecond = resolve;
        })
    );
    rerender({ id: 'p2' });

    // Synchronously after the id change: loading again, no stale plant.
    expect(result.current.loading).toBe(true);
    expect(result.current.plant).toBeNull();
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(fetchPlantById).toHaveBeenCalledTimes(2));
    expect(fetchPlantById).toHaveBeenLastCalledWith('p2', expect.anything());

    await act(async () => {
      resolveSecond(plantOf('p2', 'Second'));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.plant?.scientificName).toBe('Second');
  });
});
