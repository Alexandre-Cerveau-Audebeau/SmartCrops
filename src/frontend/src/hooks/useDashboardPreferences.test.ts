import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_DEBOUNCE_MS,
  useDashboardPreferences,
} from './useDashboardPreferences';
import {
  changeFormula,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { HttpStatusError } from '../services/httpStatusError';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
import type { DashboardBlock, DashboardLevel, DashboardPreferences } from '../types/Dashboard';

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  changeFormula: vi.fn(),
}));

/**
 * The layout the server serves: a formula's preset and its capabilities
 * (SMA-448, S5 — the capabilities come with the layout), unless overridden.
 */
const preferences = (
  overrides: Partial<DashboardPreferences> = {}
): DashboardPreferences => {
  const level = overrides.level ?? 'gardener';
  return {
    schemaVersion: 1,
    level,
    isPreset: true,
    blocks: presetFor(level),
    updatedAt: null,
    capabilities: capabilitiesFor(level),
    ...overrides,
  };
};

/**
 * SMA-448, lot F1 — the server's side of a formula switch, in memory: the
 * contract `FormulaSwitchTests` proves on the real one. A save lands on the
 * account's current layout, at its formula only (R8 — any other level is a
 * 400); a switch archives the current layout under the formula it leaves and
 * brings back the archived layout of the formula it enters, or its preset.
 */
function serveFormulas(formula: DashboardLevel, blocks: DashboardBlock[] | null) {
  const server = {
    formula,
    current: blocks,
    archive: new Map<DashboardLevel, DashboardBlock[]>(),
  };
  vi.mocked(fetchDashboardPreferences).mockImplementation(async () =>
    preferences({
      level: server.formula,
      isPreset: server.current === null,
      blocks: structuredClone(server.current ?? presetFor(server.formula)),
    })
  );
  vi.mocked(saveDashboardPreferences).mockImplementation(async ({ level, blocks: saved }) => {
    if (level !== server.formula) throw new HttpStatusError('Request failed (400)', 400);
    server.current = structuredClone(saved);
  });
  vi.mocked(changeFormula).mockImplementation(async (to) => {
    if (to === server.formula) return;
    if (server.current) server.archive.set(server.formula, server.current);
    server.current = server.archive.get(to) ?? null;
    server.archive.delete(to);
    server.formula = to;
  });
  return server;
}

beforeEach(() => {
  vi.mocked(fetchDashboardPreferences).mockReset();
  vi.mocked(saveDashboardPreferences).mockReset();
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(changeFormula).mockReset();
  vi.mocked(changeFormula).mockResolvedValue(undefined);
});

afterEach(() => {
  // The SINGLE owner of the timer mode (round 3, E″1). Timer mode is
  // file-global state, so a test that installs fake timers must not be the one
  // responsible for taking them down: an assertion that throws first would
  // leave them installed for every later test in the file. Calling it here is
  // safe whether or not a test ever installed them.
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
    // lands when the second fetch settles — the Gardener preset, whole (seven
    // blocks since SMA-448, R1: no Statistics).
    await waitFor(() => expect(result.current.blocks).toHaveLength(presetFor('gardener').length));
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
    // The ordinary write is explicitly non-keepalive and CANCELLABLE since
    // round 2 (E'6 / N4): a teardown write aborts the one it supersedes.
    expect(saveDashboardPreferences).toHaveBeenCalledWith(
      { level: 'gardener', blocks: second },
      false,
      expect.any(AbortSignal)
    );
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

  // SMA-448, lot F1, S5 — choosing a level used to APPLY its preset and write
  // it (« choosing a level applies its preset and schedules the write »): the
  // layout of the level left was gone, its widgets' options with it (V4, F1 of
  // the contract). A level is now the account's FORMULA: choosing one switches
  // it on the server, which archives and restores the layouts, and the hook
  // reads back what the server holds.

  it('V4 — an Expert with four chosen key figures goes Gardener and back: the figures, their order and the arrangement come back', async () => {
    const figures = ['cities', 'free', 'tips', 'surface'];
    const [band, first, ...rest] = presetFor('expert');
    const arranged: DashboardBlock[] = [
      first!,
      { ...band!, options: { figures } },
      ...rest.map((block) => (block.key === 'tips' ? { ...block, size: 'small' as const } : block)),
    ];
    serveFormulas('expert', arranged);
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setLevel('gardener');
    });
    await waitFor(() => expect(result.current.level).toBe('gardener'));
    expect(result.current.blocks).toEqual(presetFor('gardener'));

    await act(async () => {
      await result.current.setLevel('expert');
    });
    await waitFor(() => expect(result.current.level).toBe('expert'));
    expect(result.current.blocks).toEqual(arranged);
    expect(result.current.blocks.find((block) => block.key === 'keyfigures')?.options).toEqual({ figures });
  });

  it('choosing a formula writes the pending layout first, then switches it on the server — it never writes a preset', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // A drag still inside its 700 ms: it must reach the server BEFORE the
    // switch, or the layout archived under the Gardener would miss it.
    const moved = presetFor('gardener');
    moved[0]!.size = 'small';
    act(() => result.current.setBlocks(moved));

    await act(async () => {
      await result.current.setLevel('expert');
    });
    await waitFor(() => expect(result.current.level).toBe('expert'));

    expect(server.archive.get('gardener')).toEqual(moved);
    expect(changeFormula).toHaveBeenCalledWith('expert');
    expect(vi.mocked(saveDashboardPreferences).mock.calls.map((call) => call[0].level)).toEqual(['gardener']);
    expect(result.current.blocks).toEqual(presetFor('expert'));
    expect(result.current.capabilities).toEqual(capabilitiesFor('expert'));
  });

  it('a switch the server refuses (409, a formula too small) leaves the formula and the layout as they were, and says so', async () => {
    serveFormulas('gardener', presetFor('gardener'));
    vi.mocked(changeFormula).mockRejectedValue(new HttpStatusError('Request failed (409)', 409));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setLevel('novice');
    });

    await waitFor(() => expect(result.current.saveState).toBe('error'));
    expect(result.current.level).toBe('gardener');
    expect(result.current.blocks).toEqual(presetFor('gardener'));
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
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
      expect(saveDashboardPreferences).toHaveBeenCalledWith(
        { level: 'gardener', blocks: presetFor('gardener') },
        false,
        expect.any(AbortSignal)
      )
    );
  });

  it('flushes the pending write when the page unmounts mid-debounce', async () => {
    // Round 1 (E10): the one protection against losing the user's last drag on
    // navigation, and a regression there is silent — no error, no failing
    // assertion, just a lost layout. Real timers, so the debounce cannot fire
    // on its own before the unmount.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result, unmount } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const blocks = presetFor('gardener');
    blocks[0]!.size = 'small';
    act(() => result.current.setBlocks(blocks));
    expect(saveDashboardPreferences).not.toHaveBeenCalled();

    unmount();

    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalledTimes(1));
    // The teardown write is keepalive: a plain fetch started at unload may be
    // cancelled with the document (E12).
    expect(saveDashboardPreferences).toHaveBeenCalledWith(
      { level: 'gardener', blocks },
      true
    );
  });

  it('flushes the pending write on pagehide, without waiting for the unmount', async () => {
    // Round 1 (E12): an unmount cleanup never runs for a tab close or a
    // cross-document navigation.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const blocks = presetFor('gardener');
    blocks[1]!.size = 'small';
    act(() => result.current.setBlocks(blocks));
    expect(saveDashboardPreferences).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalledTimes(1));
    expect(saveDashboardPreferences).toHaveBeenCalledWith(
      { level: 'gardener', blocks },
      true
    );
  });

  it('serializes the writes: a slow older PUT cannot land after a newer one', async () => {
    // Round 1 (G8): the endpoint replaces the layout WHOLESALE, so two
    // concurrent PUTs are a lost-update hazard — if the older one reaches the
    // server last, the server keeps the older layout and the user's final
    // arrangement is gone with no error shown.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const settle: Array<() => void> = [];
    vi.mocked(saveDashboardPreferences).mockImplementation(
      () => new Promise<void>((resolve) => settle.push(resolve))
    );

    const first = presetFor('gardener');
    first[0]!.size = 'small';
    const second = presetFor('gardener');
    second[0]!.size = 'large';

    vi.useFakeTimers();
    act(() => result.current.setBlocks(first));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);

    // The first PUT is still in flight when the second change is committed.
    act(() => result.current.setBlocks(second));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });

    // The second write has NOT left: it is chained behind the first.
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);

    settle[0]!();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(saveDashboardPreferences).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveDashboardPreferences).mock.calls[1]![0]).toEqual({
      level: 'gardener',
      blocks: second,
    });
  });

  it('issues the teardown write AT ONCE, without waiting for the PUT in flight', async () => {
    // Round 2 (E'6 / N4). Chaining the keepalive write behind an unsettled PUT
    // only queues a microtask, and a microtask queued while the document
    // unloads is not guaranteed to run: the request is never created, and
    // `keepalive` protects a request that already left, not one never sent.
    // The trigger is ordinary — drag, wait out the debounce, drag again, close
    // the tab while the first PUT is still on the wire.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The first PUT never settles: it stays in flight for the whole test.
    vi.mocked(saveDashboardPreferences).mockImplementation(
      () => new Promise<void>(() => {})
    );

    const first = presetFor('gardener');
    first[0]!.size = 'small';
    const second = presetFor('gardener');
    second[0]!.size = 'large';

    vi.useFakeTimers();
    act(() => result.current.setBlocks(first));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);

    act(() => result.current.setBlocks(second));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // No timer advanced, nothing settled: the teardown write has left already.
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveDashboardPreferences).mock.calls[1]).toEqual([
      { level: 'gardener', blocks: second },
      true,
    ]);
  });

  it('cancels the older writes the teardown write supersedes', async () => {
    // The other half of N4: the endpoint replaces the layout WHOLESALE, so an
    // older PUT landing after the teardown one restores the arrangement the
    // user has just moved past. The one on the wire is aborted, the one still
    // queued behind it is dropped.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const settle: Array<() => void> = [];
    vi.mocked(saveDashboardPreferences).mockImplementation(
      () => new Promise<void>((resolve) => settle.push(resolve))
    );

    const first = presetFor('gardener');
    first[0]!.size = 'small';
    const second = presetFor('gardener');
    second[0]!.size = 'large';
    const third = presetFor('gardener');
    third[1]!.size = 'large';

    vi.useFakeTimers();
    act(() => result.current.setBlocks(first));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    // The second write is queued behind the first, which is still in flight.
    act(() => result.current.setBlocks(second));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);

    act(() => result.current.setBlocks(third));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // The in-flight one is aborted...
    const firstSignal = vi.mocked(saveDashboardPreferences).mock
      .calls[0]![2] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);

    // ...and the queued one never leaves, even once the first settles.
    settle[0]!();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(saveDashboardPreferences).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveDashboardPreferences).mock.calls[1]![1]).toBe(true);
    // An abort is a supersession, not a failure: no red state for it.
    expect(result.current.saveState).not.toBe('error');
  });

  it('a write queued before a teardown never leaves, even after the page comes back', async () => {
    // Round 3 (N'2), the whole sequence in one test: an ordinary PUT in flight,
    // a second one queued behind it, `pagehide`, then a back/forward-cache
    // restoration and a fresh change. The shared flag this replaces had to be
    // lowered for the restored page to save at all, and lowering it also freed
    // the write still queued under the OLD layout — which then landed on top of
    // the teardown write. An epoch captured per write cannot be un-superseded.
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const settle: Array<() => void> = [];
    vi.mocked(saveDashboardPreferences).mockImplementation(
      () => new Promise<void>((resolve) => settle.push(resolve))
    );

    const first = presetFor('gardener');
    first[0]!.size = 'small';
    const queued = presetFor('gardener');
    queued[1]!.size = 'small';
    const teardown = presetFor('gardener');
    teardown[2]!.size = 'large';
    const afterRestore = presetFor('gardener');
    afterRestore[3]!.size = 'large';

    vi.useFakeTimers();
    act(() => result.current.setBlocks(first));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);

    // Queued behind the first, which never settles.
    act(() => result.current.setBlocks(queued));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(1);
    // Round 4 (E'''3): the signal of the write that is ACTUALLY in flight. The
    // mock ignores it and the test settles that request by hand further down,
    // so without reading it the assertions below hold even with the abort
    // removed — the one thing this test exists to pin.
    const firstSignal = vi.mocked(saveDashboardPreferences).mock.calls[0]![2];
    expect(firstSignal?.aborted).toBe(false);

    // Teardown: the epoch moves on and the in-flight write is aborted.
    act(() => result.current.setBlocks(teardown));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveDashboardPreferences).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveDashboardPreferences).mock.calls[1]).toEqual([
      { level: 'gardener', blocks: teardown },
      true,
    ]);
    expect(firstSignal?.aborted).toBe(true);

    // The teardown PUT completes — the tab was closing, the request went out.
    await act(async () => {
      settle[1]!();
      await vi.advanceTimersByTimeAsync(0);
    });

    // The page comes back and the user changes the layout again.
    act(() => result.current.setBlocks(afterRestore));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    });

    // Let the first PUT settle, which is what releases the queued one.
    await act(async () => {
      settle[0]!();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Three writes, never four: the queued one is gone for good, and the write
    // made after the restoration DID leave.
    const sent = vi
      .mocked(saveDashboardPreferences)
      .mock.calls.map((call) => call[0]);
    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual({ level: 'gardener', blocks: afterRestore });
    expect(sent).not.toContainEqual({ level: 'gardener', blocks: queued });
  });

  it('writes nothing to localStorage — the layout lives on the server', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue(preferences());
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Awaited since SMA-448 (S5): choosing a level is a switch on the server.
    await act(async () => {
      await result.current.setLevel('novice');
    });

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
