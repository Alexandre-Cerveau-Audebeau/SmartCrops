import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollSpy } from './useScrollSpy';

// SMA-421: the active id is reconciled with the CURRENT id list at render
// time (no setState in the effect). Locks the two behaviors the old effect
// reset carried: a still-present section stays highlighted across an ids
// change, a vanished one falls back to the first id of the new list.

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;
// One callback per observer the hook creates, plus the disconnect count, so
// a test can assert re-subscription and cleanup after each ids change.
type ObserverTracker = { callbacks: ObserverCallback[]; disconnects: number };

function stubIntersectionObserver(): ObserverTracker {
  const tracker: ObserverTracker = { callbacks: [], disconnects: 0 };
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: ObserverCallback) {
        tracker.callbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        tracker.disconnects += 1;
      }
    }
  );
  return tracker;
}

const latestCallback = (tracker: ObserverTracker) =>
  tracker.callbacks[tracker.callbacks.length - 1]!;

const entryFor = (id: string, isIntersecting: boolean) =>
  ({
    target: document.getElementById(id)!,
    isIntersecting,
  }) as unknown as IntersectionObserverEntry;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('useScrollSpy (SMA-421)', () => {
  it('reports the first id and keeps it while it survives an ids change (jsdom fallback, no observer)', () => {
    const { result, rerender } = renderHook(({ ids }) => useScrollSpy(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    expect(result.current).toBe('a');

    // 'b' leaves, 'a' stays: the highlighted section must not move.
    rerender({ ids: ['a', 'c'] });
    expect(result.current).toBe('a');
  });

  it('falls back to the first id of the new list once the active one disappears', () => {
    const { result, rerender } = renderHook(({ ids }) => useScrollSpy(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    expect(result.current).toBe('a');

    rerender({ ids: ['b', 'c'] });
    expect(result.current).toBe('b');

    rerender({ ids: [] });
    expect(result.current).toBe('');
  });

  it('keeps an observer-selected section across an ids change that retains it, and resets when it does not', () => {
    const observers = stubIntersectionObserver();
    document.body.innerHTML =
      '<div id="a"></div><div id="b"></div><div id="c"></div>';

    const { result, rerender } = renderHook(({ ids }) => useScrollSpy(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    expect(result.current).toBe('a');
    expect(observers.callbacks).toHaveLength(1);
    expect(observers.disconnects).toBe(0);

    // The user scrolls: 'b' enters the spy band.
    act(() => latestCallback(observers)([entryFor('b', true)]));
    expect(result.current).toBe('b');

    // 'a' leaves the list, 'b' is still there: stays highlighted, no flash.
    // The hook re-subscribes: the first observer is disconnected, a second
    // one is created, and THAT one now drives the active id.
    rerender({ ids: ['b', 'c'] });
    expect(result.current).toBe('b');
    expect(observers.disconnects).toBe(1);
    expect(observers.callbacks).toHaveLength(2);
    act(() => latestCallback(observers)([entryFor('c', true)]));
    expect(result.current).toBe('c');
    act(() =>
      latestCallback(observers)([entryFor('c', false), entryFor('b', true)])
    );
    expect(result.current).toBe('b');

    // 'b' leaves too: the first id of the new list takes over, the second
    // observer is disconnected and a third one subscribes to what is left.
    rerender({ ids: ['c'] });
    expect(result.current).toBe('c');
    expect(observers.disconnects).toBe(2);
    expect(observers.callbacks).toHaveLength(3);
    act(() => latestCallback(observers)([entryFor('c', true)]));
    expect(result.current).toBe('c');
  });
});
