/**
 * SMA-426 — the global inert ResizeObserver stub installed by setup.ts.
 *
 * jsdom ships no ResizeObserver. Test files used to stub it themselves with
 * `vi.stubGlobal` in a `beforeEach` and drop it with `vi.unstubAllGlobals()`
 * in an `afterEach`. With vitest's default `sequence.hooks = 'stack'` the
 * file's `afterEach` runs BEFORE Testing Library's auto-cleanup `afterEach`
 * (registered earlier, at import time), so the tree is unmounted AFTER the
 * stub is gone. React 19 flushes every still-pending passive effect before
 * it processes the unmount (`flushPendingEffects` at the top of
 * `performWorkOnRoot`); an effect that runs `new ResizeObserver(...)` at that
 * point throws "ResizeObserver is not defined" — the flake.
 *
 * setup.ts now installs one inert stub straight on `globalThis` (NOT via
 * `vi.stubGlobal`, so `vi.unstubAllGlobals()` cannot remove it). The suites
 * below lock (1) the stub is inert, (2) it survives a stub/unstub cycle,
 * (3) the exact React race above no longer throws.
 */
import { render, screen } from '@testing-library/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SETUP_STUB_NAME = 'InertResizeObserver';

describe('global ResizeObserver stub (SMA-426) — shape', () => {
  it('is defined before any test-level stubbing', () => {
    expect(typeof ResizeObserver).toBe('function');
    expect(ResizeObserver.name).toBe(SETUP_STUB_NAME);
  });

  it('is inert: observe / unobserve / disconnect never invoke the callback', () => {
    const callback = vi.fn();
    const ro = new ResizeObserver(callback);
    expect(() => {
      ro.observe(document.body);
      ro.unobserve(document.body);
      ro.disconnect();
    }).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('global ResizeObserver stub (SMA-426) — during a local stub', () => {
  // The GardenPlanner.test.tsx idiom before SMA-426.
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class LocalResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a file-level vi.stubGlobal still wins while the test runs', () => {
    expect(ResizeObserver.name).toBe('LocalResizeObserver');
  });
});

describe('global ResizeObserver stub (SMA-426) — after the stub/unstub cycle', () => {
  it('is back to the setup stub once vi.unstubAllGlobals() has run', () => {
    expect(typeof ResizeObserver).toBe('function');
    expect(ResizeObserver.name).toBe(SETUP_STUB_NAME);
    expect(() =>
      new ResizeObserver(() => {}).observe(document.body)
    ).not.toThrow();
  });

  it('survives a bare vi.unstubAllGlobals() with nothing stubbed', () => {
    vi.unstubAllGlobals();
    expect(typeof ResizeObserver).toBe('function');
    expect(ResizeObserver.name).toBe(SETUP_STUB_NAME);
  });
});

// The exact race, reproduced deterministically:
//  - a Default-lane state update (from a timer, outside act) re-runs a passive
//    effect that constructs a ResizeObserver;
//  - a >5 ms layout effect on that commit pushes React's Scheduler past its
//    time slice, so the passive effects are deferred to the NEXT macrotask;
//  - the test awaits the commit through a MutationObserver (a microtask) and
//    returns, so the afterEach chain runs with those effects still pending;
//  - the file's afterEach drops the local stub, then Testing Library unmounts
//    the tree, and React flushes the pending effect first.
// Before SMA-426 this threw "ResizeObserver is not defined" from the cleanup.
function ObservingBox() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setTick(1), 0);
    return () => clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    if (tick === 0) return;
    const start = performance.now();
    while (performance.now() - start < 10) {
      // Hold the Scheduler past its 5 ms slice so the passive effects yield.
    }
  }, [tick]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {});
    ro.observe(el);
    return () => ro.disconnect();
  }, [tick]);

  return <div ref={ref}>tick={tick}</div>;
}

describe('global ResizeObserver stub (SMA-426) — the passive-effect race', () => {
  let previousActEnvironment: unknown;

  beforeEach(() => {
    // The timer-driven update is deliberately outside act(); silence React's
    // act warning for this describe only, the way Testing Library's waitFor does.
    previousActEnvironment = (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    vi.stubGlobal(
      'ResizeObserver',
      class LocalResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  it('unmounting after vi.unstubAllGlobals() with a pending passive effect does not throw', async () => {
    const { container } = render(<ObservingBox />);
    expect(screen.getByText('tick=0')).toBeInTheDocument();
    // Resolve on the FIRST DOM mutation after the timer-driven commit: React
    // has committed but, having yielded, has not flushed the passive effects.
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        observer.disconnect();
        resolve();
      });
      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    expect(container.textContent).toBe('tick=1');
    // No assertion after this point on purpose: the failure mode is the
    // ReferenceError thrown from Testing Library's auto-cleanup afterEach.
  });
});
