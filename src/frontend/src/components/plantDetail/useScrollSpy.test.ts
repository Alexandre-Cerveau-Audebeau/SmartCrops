import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollSpy } from './useScrollSpy';

// SMA-421: the active id is reconciled with the CURRENT id list at render
// time (no setState in the effect). Locks the two behaviors the old effect
// reset carried: a still-present section stays highlighted across an ids
// change, a vanished one falls back to the first id of the new list.

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

function stubIntersectionObserver(callbacks: ObserverCallback[]) {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: ObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
}

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
    const callbacks: ObserverCallback[] = [];
    stubIntersectionObserver(callbacks);
    document.body.innerHTML =
      '<div id="a"></div><div id="b"></div><div id="c"></div>';

    const { result, rerender } = renderHook(({ ids }) => useScrollSpy(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    expect(result.current).toBe('a');
    expect(callbacks).toHaveLength(1);

    // The user scrolls: 'b' enters the spy band.
    act(() => callbacks[0]!([entryFor('b', true)]));
    expect(result.current).toBe('b');

    // 'a' leaves the list, 'b' is still there: stays highlighted, no flash.
    rerender({ ids: ['b', 'c'] });
    expect(result.current).toBe('b');

    // 'b' leaves too: the first id of the new list takes over.
    rerender({ ids: ['c'] });
    expect(result.current).toBe('c');
  });
});
