import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_NOW_MS, freezeClock } from './clock';

// SMA-336 mobile lot, fix round 1 (#8) — the harness's clock.

afterEach(() => {
  vi.useRealTimers();
});

describe('LAYOUT_NOW_MS — the instant the harness runs on', () => {
  it('is Écully’s capture of 14 September 2026, 18:36:12 UTC, built from components', () => {
    expect(new Date(LAYOUT_NOW_MS).toISOString()).toBe('2026-09-14T18:36:12.000Z');
  });
});

describe('freezeClock — `new Date()` and `Date.now()` answer the instant, nothing else changes', () => {
  it('answers the frozen instant whatever the system clock says, and gives the clock back', () => {
    vi.setSystemTime(Date.UTC(2027, 1, 3, 15, 30, 0));
    const thaw = freezeClock(LAYOUT_NOW_MS);
    try {
      expect(Date.now()).toBe(LAYOUT_NOW_MS);
      expect(new Date().getTime()).toBe(LAYOUT_NOW_MS);
      // Explicit constructions are untouched: from a number, from components.
      expect(new Date(0).getTime()).toBe(0);
      expect(new Date(2020, 0, 15).getMonth()).toBe(0);
      expect(new Date(Date.UTC(2020, 5, 1)).getUTCMonth()).toBe(5);
      // Every method is the engine's own.
      expect(new Date().toISOString()).toBe('2026-09-14T18:36:12.000Z');
    } finally {
      thaw();
    }
    expect(Date.now()).toBe(Date.UTC(2027, 1, 3, 15, 30, 0));
  });

  it('over the real clock — as in the page — a frozen date is a Date, and the real Date comes back', () => {
    // Not under `vi.setSystemTime`: vitest's fake `Date` builds its instances
    // from the native constructor, so `instanceof` cannot be read through it.
    const RealDate = Date;
    const thaw = freezeClock(LAYOUT_NOW_MS);
    try {
      expect(new Date() instanceof Date).toBe(true);
      expect(new Date() instanceof RealDate).toBe(true);
      expect(Date.now()).toBe(LAYOUT_NOW_MS);
    } finally {
      thaw();
    }
    expect(Date).toBe(RealDate);
    expect(Math.abs(Date.now() - RealDate.now())).toBeLessThan(1_000);
  });

  it('gives the same reading under two different system clocks — what the harness relies on', () => {
    const readings = [Date.UTC(2026, 2, 5), Date.UTC(2026, 10, 20)].map((now) => {
      vi.setSystemTime(now);
      const thaw = freezeClock(LAYOUT_NOW_MS);
      try {
        return { now: Date.now(), month: new Date().getUTCMonth() };
      } finally {
        thaw();
      }
    });
    expect(readings[0]).toEqual(readings[1]);
    expect(readings[0]).toEqual({ now: LAYOUT_NOW_MS, month: 8 });
  });
});
