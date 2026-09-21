/**
 * SMA-336 mobile lot, fix round 1 (#8) — the layout harness's ONE instant.
 *
 * Four things in a scene read the clock: the calendar fixtures of
 * `scenes.tsx` are keyed on a month, the calendar widget tints the current
 * month's column, every To-do sentence names its task's month, and the
 * Gardens card says how long ago a plan was modified. A harness that read
 * the machine's date would measure a different wrapping in October than in
 * September — and hide a different row. It runs on a fixed instant instead:
 * the one `weather-real.ts` was captured on, Écully on 14 September 2026 at
 * 20:36 local time, 18:36:12 UTC — built from components, never parsed from
 * text.
 */
export const LAYOUT_NOW_MS = Date.UTC(2026, 8, 14, 18, 36, 12);

/**
 * Replaces the global `Date` with one whose `new Date()` and `Date.now()`
 * answer `instantMs`; every other construction — `new Date(ms)`, from
 * components, from a wire string — and every method stay the engine's own.
 * Returns the function that puts the previous `Date` back.
 */
export function freezeClock(instantMs: number): () => void {
  const Previous = globalThis.Date;
  class FrozenDate extends Previous {
    constructor(...args: [] | [number | string | Date] | [number, number, number?, number?, number?, number?, number?]) {
      if (args.length === 0) super(instantMs);
      else if (args.length === 1) super(args[0]);
      else super(...args);
    }
    /** The frozen instant, for `Date.now()`. */
    static now(): number {
      return instantMs;
    }
  }
  globalThis.Date = FrozenDate as DateConstructor;
  return () => {
    globalThis.Date = Previous;
  };
}
