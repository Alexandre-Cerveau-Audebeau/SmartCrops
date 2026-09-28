import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogFor } from '../test/fixtures/formulas';

vi.mock('../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

import { fetchFormulas } from '../services/formulasApi';
import { ownFormula, useFormulas } from './useFormulas';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useFormulas (SMA-448, lot F3)', () => {
  it('reads the catalogue once at mount, and names the account’s own formula in it', async () => {
    vi.mocked(fetchFormulas).mockResolvedValue(catalogFor('novice', { gardenCount: 2 }));

    const { result } = renderHook(() => useFormulas());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe(false);
    expect(result.current.catalog?.account.gardenCount).toBe(2);
    expect(ownFormula(result.current.catalog)?.key).toBe('novice');
    expect(ownFormula(result.current.catalog)?.maxGardenSize).toEqual({ width: 20, height: 20 });
    expect(fetchFormulas).toHaveBeenCalledTimes(1);
  });

  it('a catalogue that cannot be read leaves no catalogue and raises the error; reload reads again', async () => {
    vi.mocked(fetchFormulas).mockRejectedValueOnce(new Error('down'));
    vi.mocked(fetchFormulas).mockResolvedValueOnce(catalogFor('gardener'));

    const { result } = renderHook(() => useFormulas());
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.catalog).toBeNull();
    expect(ownFormula(result.current.catalog)).toBeNull();

    act(() => result.current.reload());
    // The CATALOGUE, not `loadError`: `reload` lowers the error at once,
    // before the second read lands — waiting on the error read the catalogue
    // too early on a loaded run (the chain of 27/09, 20:06).
    await waitFor(() => expect(result.current.catalog?.account.formula).toBe('gardener'));
    expect(result.current.loadError).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(fetchFormulas).toHaveBeenCalledTimes(2);
  });
});
