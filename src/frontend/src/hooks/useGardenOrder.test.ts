import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gardenFixture } from '../test/fixtures/dashboard';
import { SAVE_DEBOUNCE_MS } from './useDashboardPreferences';
import { useGardenOrder } from './useGardenOrder';

vi.mock('../services/gardenSettingsApi', () => ({
  openGarden: vi.fn(),
  saveGardenOrder: vi.fn(),
}));

import { saveGardenOrder } from '../services/gardenSettingsApi';

// SMA-448, lot F5-a — the account's custom order (A-N5): applied at once,
// written after the pause the layout takes, said in the panel's own region;
// a failed write keeps the user's order and the next move retries.

const ranked = (id: string, sortOrder: number | null, createdAt: string) =>
  gardenFixture({ id, name: id, sortOrder, createdAt });

/** Two ranked gardens and one never ranked, created last. */
const GARDENS = [
  ranked('b', 1, '2026-01-02T00:00:00Z'),
  ranked('a', 0, '2026-01-01T00:00:00Z'),
  ranked('n', null, '2026-09-01T00:00:00Z'),
];

/** The `.then / .catch / .finally` chain of a write, flushed — `waitFor` polls on timers the test has faked. */
const flushWrite = () =>
  act(async () => {
    for (let hop = 0; hop < 6; hop++) await Promise.resolve();
  });

/** A promise the test resolves or rejects when it decides. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveGardenOrder).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGardenOrder', () => {
  it('reads the server’s places, the unranked garden at the head, and writes nothing on its own', () => {
    const { result } = renderHook(() => useGardenOrder(GARDENS));

    expect(result.current.ids).toEqual(['n', 'a', 'b']);
    expect(result.current.order).toBeNull();
    expect(result.current.state).toBe('idle');
    expect(saveGardenOrder).not.toHaveBeenCalled();
  });

  it('applies a move at once, and writes the whole list ONCE after the pause — the last move wins', async () => {
    const write = deferred<void>();
    vi.mocked(saveGardenOrder).mockReturnValue(write.promise);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useGardenOrder(GARDENS, onSaved));

    act(() => result.current.move(2, 0));
    expect(result.current.ids).toEqual(['b', 'n', 'a']);
    expect(result.current.state).toBe('pending');
    act(() => result.current.move(2, 1));
    expect(result.current.ids).toEqual(['b', 'a', 'n']);
    expect(saveGardenOrder).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(saveGardenOrder).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveGardenOrder).mock.calls[0]![0]).toEqual(['b', 'a', 'n']);

    await act(async () => {
      write.resolve();
      await write.promise;
    });
    expect(result.current.state).toBe('saved');
    expect(onSaved).toHaveBeenCalledTimes(1);
    // The local order stays the user's: read back through it, not rolled back.
    expect(result.current.order).toEqual(['b', 'a', 'n']);
  });

  it('keeps the user’s order when the write fails — a 403, a server before this lot — says it, and the next move retries', async () => {
    const failed = deferred<void>();
    vi.mocked(saveGardenOrder).mockReturnValueOnce(failed.promise);
    const { result } = renderHook(() => useGardenOrder(GARDENS));

    act(() => result.current.move(0, 2));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    await act(async () => {
      failed.reject(new Error('403'));
      await failed.promise.catch(() => undefined);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.ids).toEqual(['a', 'b', 'n']);

    vi.mocked(saveGardenOrder).mockResolvedValueOnce(undefined);
    act(() => result.current.move(2, 0));
    expect(result.current.state).toBe('pending');
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    await flushWrite();
    expect(result.current.state).toBe('saved');
    expect(saveGardenOrder).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveGardenOrder).mock.calls[1]![0]).toEqual(['n', 'a', 'b']);
  });

  it('puts a garden created after the order was set at the head, without a write, and forgets a deleted one', async () => {
    vi.mocked(saveGardenOrder).mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ gardens }) => useGardenOrder(gardens), {
      initialProps: { gardens: GARDENS },
    });
    act(() => result.current.move(0, 2));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    await flushWrite();
    expect(result.current.state).toBe('saved');
    expect(result.current.ids).toEqual(['a', 'b', 'n']);

    // Created since: at the head; deleted since: gone. No write for either.
    rerender({ gardens: [...GARDENS.filter((g) => g.id !== 'a'), ranked('z', null, '2026-09-28T00:00:00Z')] });

    expect(result.current.ids).toEqual(['z', 'b', 'n']);
    expect(saveGardenOrder).toHaveBeenCalledTimes(1);
  });

  it('aborts a write a newer move supersedes, and reports the newer one', async () => {
    const first = deferred<void>();
    const signals: AbortSignal[] = [];
    vi.mocked(saveGardenOrder).mockImplementation((_ids, signal) => {
      signals.push(signal!);
      return signals.length === 1 ? first.promise : Promise.resolve();
    });
    const { result } = renderHook(() => useGardenOrder(GARDENS));

    act(() => result.current.move(0, 1));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(signals[0]!.aborted).toBe(false);

    // A second move while the first write is still out.
    act(() => result.current.move(2, 0));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });

    expect(signals[0]!.aborted).toBe(true);
    await flushWrite();
    expect(result.current.state).toBe('saved');
    // The first write's late failure — its abort — is not a failure of the order.
    await act(async () => {
      first.reject(new Error('aborted'));
      await first.promise.catch(() => undefined);
    });
    expect(result.current.state).toBe('saved');
  });
});
