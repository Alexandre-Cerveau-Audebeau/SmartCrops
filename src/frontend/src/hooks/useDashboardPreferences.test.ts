import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_DEBOUNCE_MS,
  useDashboardPreferences,
  type SwitchOutcome,
} from './useDashboardPreferences';
import {
  changeFormula,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { HttpStatusError } from '../services/httpStatusError';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
import type { DashboardBlock, DashboardLevel, DashboardPreferences } from '../types/Dashboard';

// SMA-448, PR #293, fix round 2 (A1) — the module's own `refusalOf` stays
// real: it is what turns a refused switch into what the panel says, and a
// mock of it would test nothing.
vi.mock('../services/dashboardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/dashboardApi')>()),
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

  it('a switch the server refuses for a reason the hook cannot read (a bare 409) leaves the formula and the layout as they were, and says the refusal — never « not saved » (SMA-448, A1)', async () => {
    serveFormulas('gardener', presetFor('gardener'));
    vi.mocked(changeFormula).mockRejectedValue(new HttpStatusError('Request failed (409)', 409));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setLevel('novice');
    });

    expect(result.current.saveState).not.toBe('error');
    expect(result.current.refusal).toEqual({ formula: 'novice', reasons: [] });
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

// SMA-448, PR #293, fix round 1 — S2 (the Extension, `major`): a write that
// failed BEFORE the switch used to let it go on. `flush` owed nothing, the
// chain swallowed the rejection, and the server archived the last layout it
// held, not the one on screen — which was then gone, under « Saved ».
describe('useDashboardPreferences — a switch never loses a layout that is not saved (SMA-448, S2)', () => {
  const moved = () => {
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'small';
    return blocks;
  };

  it('a write that failed before the switch is written again FIRST: the layout on screen is the one archived', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The server misses ONE write: the arrangement stays on screen, unsaved.
    vi.mocked(saveDashboardPreferences).mockRejectedValueOnce(new HttpStatusError('Request failed (503)', 503));
    act(() => result.current.setBlocks(moved()));
    await waitFor(() => expect(result.current.saveState).toBe('error'));

    let switched: SwitchOutcome | undefined;
    await act(async () => {
      switched = await result.current.setLevel('expert');
    });

    expect(switched).toBe('switched');
    expect(server.archive.get('gardener')).toEqual(moved());
    expect(result.current.level).toBe('expert');
    expect(result.current.saveState).toBe('saved');
  });

  it('a write that STILL fails stops the switch: the formula, the layout on screen and « Changes not saved » stay', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(saveDashboardPreferences).mockRejectedValue(new HttpStatusError('Request failed (503)', 503));
    act(() => result.current.setBlocks(moved()));
    await waitFor(() => expect(result.current.saveState).toBe('error'));

    let switched: SwitchOutcome | undefined;
    await act(async () => {
      switched = await result.current.setLevel('expert');
    });

    expect(switched).toBe('unsaved');
    expect(changeFormula).not.toHaveBeenCalled();
    expect(server.formula).toBe('gardener');
    expect(result.current.level).toBe('gardener');
    expect(result.current.blocks).toEqual(moved());
    expect(result.current.saveState).toBe('error');
  });

  it('a write still IN FLIGHT when the switch is chosen, and that then fails, stops the switch too', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let failInFlight!: (error: unknown) => void;
    vi.mocked(saveDashboardPreferences).mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          failInFlight = reject;
        })
    );
    act(() => result.current.setBlocks(moved()));
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalledTimes(1));
    // The server is down from now on: the write on the wire will fail, and so
    // would any other.
    vi.mocked(saveDashboardPreferences).mockRejectedValue(new HttpStatusError('Request failed (503)', 503));

    let switching!: Promise<SwitchOutcome>;
    act(() => {
      switching = result.current.setLevel('expert');
    });
    let switched: SwitchOutcome | undefined;
    await act(async () => {
      failInFlight(new HttpStatusError('Request failed (503)', 503));
      switched = await switching;
    });

    expect(switched).toBe('unsaved');
    expect(changeFormula).not.toHaveBeenCalled();
    expect(server.formula).toBe('gardener');
    expect(result.current.blocks).toEqual(moved());
    expect(result.current.saveState).toBe('error');
  });
});

// SMA-448, PR #293, fix round 1 — S5 (GitHub 4109933667): an edit made while
// a switch was on the wire was drawn, then replaced by the layout of the
// formula entered, and written under the formula LEFT — refused by R8, so
// « Changes not saved » after a switch that had succeeded.
describe('useDashboardPreferences — no edit is taken while a switch is in flight (SMA-448, S5)', () => {
  it('an edit or a reset made while the switch is on the wire is refused: never drawn then lost, never written under the formula left', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const switchOnServer = vi.mocked(changeFormula).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(changeFormula).mockImplementationOnce(async (to) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return switchOnServer(to);
    });
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let switching!: Promise<SwitchOutcome>;
    act(() => {
      switching = result.current.setLevel('expert');
    });
    await waitFor(() => expect(changeFormula).toHaveBeenCalledWith('expert'));

    const edited = presetFor('gardener');
    edited[0]!.size = 'small';
    act(() => result.current.setBlocks(edited));
    expect(result.current.blocks).toEqual(presetFor('gardener'));
    act(() => result.current.resetToLevel());
    expect(result.current.blocks).toEqual(presetFor('gardener'));
    expect(result.current.switching).toBe(true);

    await act(async () => {
      release();
      await switching;
    });
    // Past the pause an edit's write would have waited.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100));
    });

    expect(saveDashboardPreferences).not.toHaveBeenCalled();
    expect(server.formula).toBe('expert');
    expect(server.archive.get('gardener')).toEqual(presetFor('gardener'));
    expect(result.current.switching).toBe(false);
    expect(result.current.level).toBe('expert');
    expect(result.current.blocks).toEqual(presetFor('expert'));
    expect(result.current.saveState).toBe('saved');
  });

  it('a second choice while a switch is in flight is refused: the page and the server stand at the same formula', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const readFromServer = vi.mocked(fetchDashboardPreferences).getMockImplementation()!;
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The first switch's read-back is slow: it answers what the server held
    // when it was asked.
    let answer!: () => void;
    vi.mocked(fetchDashboardPreferences).mockImplementationOnce(async () => {
      const held = await readFromServer();
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return held;
    });

    let first!: Promise<SwitchOutcome>;
    act(() => {
      first = result.current.setLevel('expert');
    });
    await waitFor(() => expect(fetchDashboardPreferences).toHaveBeenCalledTimes(2));

    let second: SwitchOutcome | undefined;
    await act(async () => {
      second = await result.current.setLevel('novice');
    });
    await act(async () => {
      answer();
      await first;
    });

    expect(second).toBe('ignored');
    expect(changeFormula).toHaveBeenCalledTimes(1);
    expect(server.formula).toBe('expert');
    expect(result.current.level).toBe(server.formula);
  });
});

// SMA-448, PR #293, fix round 1 — S6 (GitHub 4109933669): when the switch
// landed but reading the new layout back failed, the page kept the layout of
// the formula LEFT under its name while the account stood at the new one, and
// every later edit was refused by R8.
describe('useDashboardPreferences — a switch whose read-back fails says so honestly (SMA-448, S6)', () => {
  it('shows the load error — nothing of the formula left, nothing unsaved — and reload() brings the new formula', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(fetchDashboardPreferences).mockRejectedValueOnce(new Error('network'));
    let switched: SwitchOutcome | undefined;
    await act(async () => {
      switched = await result.current.setLevel('expert');
    });

    // The switch DID land; the page does not know the layout it brought.
    expect(server.formula).toBe('expert');
    expect(switched).toBe('unread');
    expect(result.current.loadError).toBe(true);
    expect(result.current.blocks).toEqual([]);
    expect(result.current.capabilities).toBeNull();
    // Nothing is unsaved: the layout left was written before the switch.
    expect(result.current.saveState).toBe('idle');

    // No edit of the formula left can be made meanwhile.
    act(() => result.current.setBlocks(presetFor('gardener')));
    expect(result.current.blocks).toEqual([]);

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.level).toBe('expert'));
    expect(result.current.blocks).toEqual(presetFor('expert'));
    expect(result.current.capabilities).toEqual(capabilitiesFor('expert'));
    expect(result.current.loadError).toBe(false);
  });
});

// SMA-448, PR #293, fix round 2 — A1 (Alexandre's visual finding, 26/09), and
// the family. A formula the server refused (409 `formula.tooSmall`) used to
// show « Modifications non enregistrées » — false: nothing was unsaved, and
// the server had sent its reasons. The three ends of a switch that does not
// go through now each say the truth, and nothing else: the layout that could
// not be written before the switch (S2) — « not saved »; the formula the
// server refuses (A1) — the refusal and each reason served, for the panel;
// the layout that could not be read back (S6) — the load error.
describe('useDashboardPreferences — the three ends of a switch that does not go through each say the truth (SMA-448, A1)', () => {
  const tooSmall = (formula: DashboardLevel, reasons: unknown[]) =>
    new HttpStatusError('Request failed (409)', 409, {
      status: 409,
      title: "This formula is too small for the account's gardens.",
      code: 'formula.tooSmall',
      formula,
      reasons,
    });
  const moved = () => {
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'small';
    return blocks;
  };

  it('S2 — a layout that cannot be written: « not saved », no refusal, no load error', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(saveDashboardPreferences).mockRejectedValue(new HttpStatusError('Request failed (503)', 503));
    act(() => result.current.setBlocks(moved()));
    await waitFor(() => expect(result.current.saveState).toBe('error'));

    await act(async () => {
      await result.current.setLevel('expert');
    });

    expect(result.current.saveState).toBe('error');
    expect(result.current.refusal).toBeNull();
    expect(result.current.loadError).toBe(false);
    expect(server.formula).toBe('gardener');
    expect(result.current.blocks).toEqual(moved());
  });

  it('A1 — a formula the server refuses: the refusal and each reason served, the indicator left as it was, no load error — the formula and the layout stay', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // An arrangement, saved: what the indicator says before the switch, and
    // must still say after — it is true.
    act(() => result.current.setBlocks(moved()));
    await waitFor(() => expect(result.current.saveState).toBe('saved'));
    vi.mocked(changeFormula).mockRejectedValue(
      tooSmall('novice', [
        { kind: 'gardens', have: 5, limit: 3 },
        { kind: 'size', gardenId: 'g1', width: 30, height: 30, maxWidth: 20, maxHeight: 20 },
      ])
    );

    await act(async () => {
      await result.current.setLevel('novice');
    });

    expect(result.current.saveState).not.toBe('error');
    expect(result.current.saveState).toBe('saved');
    expect(result.current.refusal).toEqual({
      formula: 'novice',
      reasons: [
        { kind: 'gardens', have: 5, limit: 3 },
        { kind: 'size', gardenId: 'g1', width: 30, height: 30, maxWidth: 20, maxHeight: 20 },
      ],
    });
    expect(result.current.loadError).toBe(false);
    expect(server.formula).toBe('gardener');
    expect(result.current.level).toBe('gardener');
    expect(result.current.blocks).toEqual(moved());
  });

  it('S6 — a layout that cannot be read back: the load error, no refusal, nothing « not saved »', async () => {
    const server = serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(fetchDashboardPreferences).mockRejectedValueOnce(new Error('network'));

    await act(async () => {
      await result.current.setLevel('expert');
    });

    expect(result.current.loadError).toBe(true);
    expect(result.current.refusal).toBeNull();
    expect(result.current.saveState).toBe('idle');
    expect(server.formula).toBe('expert');
  });

  it('a refusal whose reasons the hook cannot all read keeps the ones it can — the refusal is said either way', async () => {
    serveFormulas('gardener', presetFor('gardener'));
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(changeFormula).mockRejectedValue(
      tooSmall('novice', [
        { kind: 'gardens', have: 'five', limit: 3 },
        { kind: 'size', width: 30 },
        'nonsense',
        { kind: 'gardens', have: 4, limit: 3 },
      ])
    );

    await act(async () => {
      await result.current.setLevel('novice');
    });

    expect(result.current.refusal).toEqual({ formula: 'novice', reasons: [{ kind: 'gardens', have: 4, limit: 3 }] });
    expect(result.current.saveState).toBe('idle');
  });

  it('the next choice clears the refusal, and so does dismissing it', async () => {
    serveFormulas('gardener', presetFor('gardener'));
    const switchOnServer = vi.mocked(changeFormula).getMockImplementation()!;
    const { result } = renderHook(() => useDashboardPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(changeFormula).mockRejectedValueOnce(tooSmall('novice', [{ kind: 'gardens', have: 5, limit: 3 }]));
    await act(async () => {
      await result.current.setLevel('novice');
    });
    expect(result.current.refusal).not.toBeNull();

    act(() => result.current.dismissRefusal());
    expect(result.current.refusal).toBeNull();

    vi.mocked(changeFormula).mockRejectedValueOnce(tooSmall('novice', [{ kind: 'gardens', have: 5, limit: 3 }]));
    await act(async () => {
      await result.current.setLevel('novice');
    });
    expect(result.current.refusal).not.toBeNull();

    vi.mocked(changeFormula).mockImplementation(switchOnServer);
    await act(async () => {
      await result.current.setLevel('expert');
    });
    expect(result.current.refusal).toBeNull();
    expect(result.current.level).toBe('expert');
  });
});
