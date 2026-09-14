/**
 * SMA-336 PR 3b/5 — the wire-check primitives every service boundary of the
 * dashboard reads a body through.
 *
 * MOVED here from `dashboardApi.ts`, not copied: eight review rounds hardened
 * that file's validators, and the weather aggregate (`weatherApi.ts`) needs the
 * same primitives for a second wire shape. One owner, two readers — a check
 * fixed here is fixed for both, and `dashboardApi.ts` keeps its own validators
 * unchanged (its tests stay green without a touch).
 *
 * Nothing here knows a dashboard field: these are the bricks, the record
 * validators that assemble them live beside the type they narrow to.
 */

/** A plain object — not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A predicate that NARROWS to `V` — a type guard, not a boolean (round 8 —
 * Extension #9-18). `(value: unknown) => boolean` says nothing about what a
 * passing value is, so a map of such checks can be exhaustive over the KEYS of
 * a type and still pair a field with the wrong test: `count: isString` was a
 * well-typed entry of `Record<keyof T, Check>`. With the guard in the type, an
 * entry for a field of type `T[K]` must be a `Check<T[K]>`, and that pairing
 * no longer compiles.
 */
export type Check<V = unknown> = (value: unknown) => value is V;

/** The checks a record of `T` needs: one per field, each narrowing to THAT field's type. */
export type Checks<T> = { [K in keyof T]-?: Check<T[K]> };

/**
 * A record validator keyed by `keyof T` (round 7, S39 — Extension #7-24), and
 * typed by `T[K]` (round 8 — Extension #9-18).
 *
 * The predicates below narrow to the wire types, and the compiler cannot tell
 * a hand-listed run of `typeof` checks from a complete one: a field added to
 * `DashboardGardenData` kept every file compiling while the new field travelled
 * unverified — the drift the doc comments of `dashboardApi.ts` argue against.
 * A map typed `Checks<T>` is checked EXHAUSTIVELY by TypeScript: a field of `T`
 * with no entry is a build error, and so is an entry `T` has no field for — and
 * so, since round 8, is an entry whose check narrows to something other than
 * the field's own type. « Verified » and « narrowed » are the same list, by
 * construction, field by field.
 *
 * Fields are READ, never rebuilt: an unknown property a newer server adds
 * travels through untouched, as before.
 */
export function matches<T>(checks: Checks<T>): Check<T> {
  const entries = Object.entries(checks) as [string, Check][];
  return (value): value is T =>
    isRecord(value) && entries.every(([key, check]) => check(value[key]));
}

export const isString: Check<string> = (value): value is string =>
  typeof value === 'string';

export const isBoolean: Check<boolean> = (value): value is boolean =>
  typeof value === 'boolean';

export const nullable =
  <V>(item: Check<V>): Check<V | null> =>
  (value): value is V | null =>
    value === null || item(value);

export const arrayOf =
  <V>(item: Check<V>): Check<V[]> =>
  (value): value is V[] =>
    Array.isArray(value) && value.every(item);

/**
 * A whole, non-negative number — what every count and every grid coordinate or
 * dimension of the aggregate is.
 *
 * Grid numbers first (round 7, S43 — Extension #7-28). `typeof` let
 * `height: 2.5` through, and the readers disagree on what that means:
 * `parseCellsJson` builds three rows for it, `placementCoverage` builds two,
 * and `freeExposureFrom` then dereferences `taken[2]![c]` and throws — after
 * the load succeeded, where no error state is left to draw it. The same
 * arithmetic indexes the grid by every placement's four numbers, so they are
 * held to the same rule.
 *
 * Then the counts (round 8 — GitHub 3994206417): `placementCount`,
 * `varietyCount`, `occupiedCells`, a variety's `count` and `cells`, and the
 * four totals stayed at `typeof`, so `-1` and `1.5` walked through to the
 * count, occupancy and catalog displays — a « −1 plant » nothing on the server
 * can produce, drawn as if it could. A count is the same kind of number a grid
 * index is, and the same rule holds both.
 *
 * No finiteness check besides: JSON carries neither `NaN` nor `Infinity`, so
 * a guard against them would be untestable code standing for a value that
 * cannot arrive — and `Number.isInteger` refuses both anyway. Rejected HERE,
 * at the boundary, not normalised downstream: a value the server never sends
 * is a malformed aggregate, and the page already knows how to say so.
 */
export const isWholeNumber: Check<number> = (value): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * A finite number of ANY sign, whole or not — what a temperature, a wind speed
 * or a rainfall is (SMA-336 PR 3b/5, pre-flight § D.5). `isWholeNumber` would
 * refuse « −2 °C » and « 0.4 mm », which are exactly the values the weather
 * aggregate exists to carry. `Number.isFinite` refuses the two things `typeof`
 * lets through, `NaN` and the infinities, which JSON cannot carry either — the
 * same untestable-guard argument as above applies, and the check is kept
 * because it is the DEFINITION of the type it narrows to, not a defence.
 */
export const isFiniteNumber: Check<number> = (value): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** `string | null`. */
export const isNullableString = nullable(isString);
