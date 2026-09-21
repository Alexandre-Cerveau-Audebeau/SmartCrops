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
 * Replaces the global `Date` with one whose `new Date()`, `Date()` and
 * `Date.now()` answer `instantMs`; every other construction — `new Date(ms)`,
 * from components, from a wire string — and every method stay the engine's
 * own. Returns the function that puts the previous `Date` back.
 *
 * The replacement is a FUNCTION, not a class (fix round 2, #10 — ledger
 * `e8e83b2a`): the engine's `Date` is callable as well as constructible —
 * `Date()` without `new` is the current instant as a string — and a class
 * cannot be called, so a caller of that form would have thrown under the
 * freeze. Called, it answers the frozen instant's string; constructed, it
 * builds the engine's own `Date` for `new.target`, so an instance is an
 * `instanceof Date` with the engine's prototype. `Date.parse` and `Date.UTC`
 * are reached through the prototype chain; `Date.now` alone is its own.
 */
export function freezeClock(instantMs: number): () => void {
  const Previous = globalThis.Date;
  /** The frozen `Date`: the instant's string when called, the engine's `Date` when constructed. */
  function FrozenDate(this: unknown, ...args: unknown[]): Date | string {
    if (new.target === undefined) return new Previous(instantMs).toString();
    return Reflect.construct(Previous, args.length === 0 ? [instantMs] : args, new.target) as Date;
  }
  Object.setPrototypeOf(FrozenDate, Previous);
  FrozenDate.prototype = Previous.prototype;
  Object.defineProperty(FrozenDate, 'now', { value: (): number => instantMs, configurable: true, writable: true });
  globalThis.Date = FrozenDate as unknown as DateConstructor;
  return () => {
    globalThis.Date = Previous;
  };
}
