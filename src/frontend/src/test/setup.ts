import '@testing-library/jest-dom';

// SMA-426 — jsdom ships no ResizeObserver, and the planner (GardenPlanner.tsx)
// constructs one from a passive effect. A per-file `vi.stubGlobal` dropped by
// `vi.unstubAllGlobals()` in an `afterEach` raced Testing Library's auto-cleanup:
// with vitest's default `sequence.hooks = 'stack'` the file's afterEach runs
// FIRST, and React 19 flushes every still-pending passive effect before it
// processes the unmount — "ReferenceError: ResizeObserver is not defined".
// One inert stub, installed straight on `globalThis` (NOT through
// `vi.stubGlobal`, so no `vi.unstubAllGlobals()` can ever remove it), shared by
// every test file and never removed. A file may still `vi.stubGlobal` its own
// ResizeObserver for a test; `vi.unstubAllGlobals()` then restores THIS one.
// Locked by src/test/resizeObserverStub.test.tsx.
class InertResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = InertResizeObserver;
