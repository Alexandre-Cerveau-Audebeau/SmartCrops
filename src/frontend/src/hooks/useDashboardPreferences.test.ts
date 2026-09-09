import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_DEBOUNCE_MS,
  useDashboardPreferences,
} from './useDashboardPreferences';
import {
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { presetFor } from '../constants/dashboardPresets';
import type { DashboardPreferences } from '../types/Dashboard';

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
}));

const preferences = (
  overrides: Partial<DashboardPreferences> = {}
): DashboardPreferences => ({
  schemaVersion: 1,
  level: 'gardener',
  isPreset: true,
  blocks: presetFor('gardener'),
  updatedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(fetchDashboardPreferences).mockReset();
  vi.mocked(saveDashboardPreferences).mockReset();
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDashboardPreferences — loading (SMA-336)', () => {
  it('serves the layout the server returned and clears loading', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(
      preferences({ level: 'novice', blocks: presetFor('novice') })
    );

    const { result } = renderHook(() => useDashboardPreferences());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.level).toBe('novice');
    expect(result.current.blocks).toHaveLength(8);
    expect(result.current.loadError).toBe(false);
    expect(result.current.adjusted).toBe(false);
  });

  it('flags the failure, keeps the blocks empty and never throws', async () => {
    vi.mocked(fetchDashboardPreferences).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useDashboardPreferences());

    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.blocks).toEqual([]);
  });

  it('reload() re-runs the fetch and clears a previous error', async () => {
    vi.mocked(fetchDashboardPreferences)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(preferences());

    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loadError).toBe(true));

    act(() => result.current.reload());

    // reload() clears the error and re-shows the skeleton at once; the layout
    // lands when the second fetch settles.
    await waitFor(() => expect(result.current.blocks).toHaveLength(8));
    expect(result.current.loadError).toBe(false);
    expect(fetchDashboardPreferences).toHaveBeenCalledTimes(2);
  });

  it('reports « ajustée » when the loaded layout diverges from its preset', async () => {
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'large';
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(
      preferences({ isPreset: false, blocks })
    );

    const { result } = renderHook(() => useDashboardPreferences());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.adjusted).toBe(true);
  });
});

describe('useDashboardPreferences — deferred saving (SMA-336)', () => {
  it('writes ONCE after the pause, with the last state of a burst', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    const first = presetFor('gardener');
    first[0]!.size = 'small';
    const second = presetFor('gardener');
    second[0]!.size = 'large';

    act(() => result.current.setBlocks(first));
    act(() => result.current.setBlocks(second));
    expect(result.current.saveState).toBe('pending');
    expect(saveDashboardPreferences).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });

    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);
    expect(saveDashboardPreferences).toHaveBeenCalledWith({
      level: 'gardener',
      blocks: second,
    });
    // The resolved PUT is flushed by advancing 0 ms inside act — RTL's async
    // polling would stall under fake timers (the MyGardens toast idiom).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.saveState).toBe('saved');
  });

  it('keeps the local layout and reports the error when the write fails', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    vi.mocked(saveDashboardPreferences).mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const blocks = presetFor('gardener');
    blocks[1]!.size = 'small';
    act(() => result.current.setBlocks(blocks));

    await waitFor(() => expect(result.current.saveState).toBe('error'));
    // The arrangement the user just made is NOT rolled back under them.
    expect(result.current.blocks[1]!.size).toBe('small');
    expect(result.current.adjusted).toBe(true);
  });

  it('choosing a level applies its preset and schedules the write', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setLevel('expert'));

    expect(result.current.level).toBe('expert');
    expect(result.current.blocks).toEqual(presetFor('expert'));
    expect(result.current.adjusted).toBe(false);
    await waitFor(() =>
      expect(saveDashboardPreferences).toHaveBeenCalledWith({
        level: 'expert',
        blocks: presetFor('expert'),
      })
    );
  });

  it('resetToLevel() restores the current level preset and clears « ajustée »', async () => {
    const blocks = presetFor('gardener');
    blocks[0]!.hidden = true;
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(
      preferences({ isPreset: false, blocks })
    );
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.adjusted).toBe(true));

    act(() => result.current.resetToLevel());

    expect(result.current.blocks).toEqual(presetFor('gardener'));
    expect(result.current.adjusted).toBe(false);
    await waitFor(() =>
      expect(saveDashboardPreferences).toHaveBeenCalledWith({
        level: 'gardener',
        blocks: presetFor('gardener'),
      })
    );
  });

  it('writes nothing to localStorage — the layout lives on the server', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setLevel('novice'));

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
