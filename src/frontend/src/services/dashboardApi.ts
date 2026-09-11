import {
  isDashboardBlockKey,
  isDashboardLevel,
  isDashboardSize,
  type DashboardBlock,
  type DashboardBlockKey,
  type DashboardPreferences,
  type SaveDashboardPreferences,
} from '../types/Dashboard';
import type {
  DashboardData,
  DashboardGardenData,
  DashboardTotals,
  DashboardVarietyData,
} from '../types/DashboardData';
import type { GardenConfig, LightSlot } from '../types/Garden';
import type { PlacementData } from './gardenLayoutApi';
import { DEFAULT_DASHBOARD_LEVEL, presetFor } from '../constants/dashboardPresets';
import { fetchJson } from './fetchJson';

const API_BASE = '/api';

// DashboardController sits behind [Authorize] — `credentials: 'include'` so the
// HttpOnly auth cookie flows (SMA-280 policy: every call site states it).

/**
 * SMA-336 round 1 (E17) — the service boundary is where an untrusted body
 * becomes the typed layout the rest of the app relies on.
 *
 * `fetchJson` parses the body and hands it back as `T` WITHOUT any runtime
 * check, so a block key this build does not know reaches `BLOCK_ICONS`, yields
 * `undefined`, and rendering `<Icon />` throws in the Customize gallery or in a
 * widget. The server is careful, but it is not the only thing that can be on
 * the other end of this call: an older client meeting a newer server, a proxy,
 * a replayed cache. Normalizing here costs one pass and removes the crash.
 *
 * Unknown block keys and invalid sizes are DROPPED, an unknown level falls back
 * to the default, and a document from which nothing survives falls back to that
 * level's preset — the same principle the server applies on read: a stored
 * layout must never be able to keep someone out of their own dashboard.
 */
function normalizeBlock(value: unknown): DashboardBlock | null {
  if (typeof value !== 'object' || value === null) return null;

  const block = value as { key?: unknown; size?: unknown; hidden?: unknown; options?: unknown };
  if (typeof block.key !== 'string' || !isDashboardBlockKey(block.key)) return null;
  if (typeof block.size !== 'string' || !isDashboardSize(block.size)) return null;

  const normalized: DashboardBlock = {
    key: block.key,
    size: block.size,
    hidden: block.hidden === true,
  };

  // `options` is carried only when there is something to carry: an invented
  // `options: null` would make every normalized block differ structurally from
  // the presets the client compares against and re-sends.
  //
  // An array passes `typeof === 'object'` (round 2, N5), and one assigned to
  // `Record<string, unknown>` comes straight back out on the next debounced
  // write, where `SaveDashboardBlockRequest.Options` binds a
  // `Dictionary<string, JsonElement>` and the PUT fails validation — an error
  // state the user has no gesture to clear.
  if (
    typeof block.options === 'object' &&
    block.options !== null &&
    !Array.isArray(block.options)
  ) {
    normalized.options = block.options as Record<string, unknown>;
  }

  return normalized;
}

function normalize(raw: unknown): DashboardPreferences {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const level =
    typeof source.level === 'string' && isDashboardLevel(source.level)
      ? source.level
      : DEFAULT_DASHBOARD_LEVEL;

  // `key` is the identity the grid sorts by (round 2, E'8): React keys,
  // `SortableContext` items, the `indexOf` of `handleDragEnd`, and the match
  // `patchBlock` updates. The controller rejects duplicates on write and drops
  // them on read, but `normalize` exists precisely for the response THIS server
  // did not write — so the first occurrence wins here too.
  const seen = new Set<DashboardBlockKey>();
  const blocks = (Array.isArray(source.blocks) ? source.blocks : [])
    .map(normalizeBlock)
    .filter((block): block is DashboardBlock => block !== null)
    .filter((block) => {
      if (seen.has(block.key)) return false;
      seen.add(block.key);
      return true;
    });

  return {
    schemaVersion: typeof source.schemaVersion === 'number' ? source.schemaVersion : 0,
    level,
    isPreset: source.isPreset === true,
    // Nothing usable came back: show the level's preset rather than an empty
    // grid, which would read as "you have no widgets" instead of "we could not
    // read your layout".
    blocks: blocks.length > 0 ? blocks : presetFor(level),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  };
}

/**
 * The caller's layout, normalized. Never 404s: a user who has never saved one
 * receives their level preset with `isPreset: true`.
 */
export async function fetchDashboardPreferences(
  signal?: AbortSignal
): Promise<DashboardPreferences> {
  const raw = await fetchJson<unknown>(`${API_BASE}/dashboard/preferences`, {
    credentials: 'include',
    signal,
  });

  return normalize(raw);
}

/**
 * Replaces the layout wholesale; 204 on success (fetchJson resolves void).
 *
 * `keepalive` is for the page-teardown write only (SMA-336 round 1, E12): a
 * plain fetch started from an unload path may be cancelled with the document,
 * while a keepalive request outlives it. Best-effort delivery, not an
 * acknowledgement — and browsers cap the aggregate keepalive body at roughly
 * 64 KiB, which the bounded options of `DashboardController` keep this payload
 * well under.
 *
 * `signal` cancels an ordinary write that a teardown write has superseded
 * (round 2, E'6 / N4): the endpoint replaces the layout wholesale, so an older
 * PUT still on the wire would restore the arrangement the user has just moved
 * past. The teardown write itself is never given one.
 */
export async function saveDashboardPreferences(
  preferences: SaveDashboardPreferences,
  keepalive = false,
  signal?: AbortSignal
): Promise<void> {
  return fetchJson<void>(`${API_BASE}/dashboard/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    keepalive,
    signal,
    body: JSON.stringify(preferences),
  });
}

/** A plain object — not null, not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Check = (value: unknown) => boolean;

/**
 * A record validator keyed by `keyof T` (round 7, S39 — Extension #7-24).
 *
 * The predicates below narrow to the wire types, and the compiler cannot tell
 * a hand-listed run of `typeof` checks from a complete one: a field added to
 * `DashboardGardenData` kept every file compiling while the new field travelled
 * unverified — the drift the doc comments of this file argue against. A map
 * typed `Record<keyof T, Check>` is checked EXHAUSTIVELY by TypeScript: a field
 * of `T` with no entry is a build error, and so is an entry `T` has no field
 * for. « Verified » and « narrowed » are the same list, by construction.
 *
 * Fields are READ, never rebuilt: an unknown property a newer server adds
 * travels through untouched, as before.
 */
export function matches<T>(checks: Record<keyof T, Check>): Check {
  const entries = Object.entries(checks) as [string, Check][];
  return (value) =>
    isRecord(value) && entries.every(([key, check]) => check(value[key]));
}

const isString: Check = (value) => typeof value === 'string';
const isNumber: Check = (value) => typeof value === 'number';
const isNullableBoolean: Check = (value) =>
  value === null || typeof value === 'boolean';
const arrayOf =
  (item: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(item);

/**
 * A grid coordinate or dimension: a whole, non-negative number (round 7, S43 —
 * Extension #7-28). No finiteness check besides: JSON carries neither `NaN`
 * nor `Infinity`, so a guard against them would be untestable code standing
 * for a value that cannot arrive — and `Number.isInteger` refuses both anyway.
 *
 * `typeof` let `height: 2.5` through, and the readers disagree on what that
 * means: `parseCellsJson` builds three rows for it, `placementCoverage` builds
 * two, and `freeExposureFrom` then dereferences `taken[2]![c]` and throws —
 * after the load succeeded, where no error state is left to draw it. The same
 * arithmetic indexes the grid by every placement's four numbers, so they are
 * held to the same rule. Rejected HERE, at the boundary, not normalised in
 * `deriveGardenView`: a value the server never sends is a malformed aggregate,
 * and the page already knows how to say so.
 */
const isGridInteger: Check = (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isNullableGridInteger: Check = (value) =>
  value === null || isGridInteger(value);

/** `string | null`. */
const isNullableString: Check = (value) => value === null || isString(value);

/**
 * One indoor light slot: two `HH:mm` strings, and nothing weaker.
 *
 * The FORM only, not the clock. `LightScheduleDocument.ValidateSlots` holds the
 * document to a 24 h pattern, an ordering and a ceiling, and a schedule that
 * fails any of them reads as no schedule at all before it reaches the wire — so
 * repeating those rules here would be a second copy of a contract the server
 * already enforces. What this boundary answers for is that `start` and `end`
 * are strings at all, which is what `computeExposureGrid` reads.
 */
const isLightSlot = matches<LightSlot>({
  start: isString,
  end: isString,
});

/**
 * The five exposure inputs, each on its own (round 4, C1 — E‴5 / G‴2).
 *
 * Round 3 checked that `config` was an OBJECT and stopped there, which let `{}`
 * narrow to `GardenConfig`. Two things then read fields that were never
 * checked: `computeExposureGrid` calls `.filter` on `lightSchedule` in its
 * indoor branch, so a non-array value throws; and the four string fields reach
 * the engine as whatever arrived.
 *
 * `lightSchedule` is `null` or an array of slots — the third state the type
 * allows, and the one the finding names.
 */
const isGardenConfig = matches<GardenConfig>({
  orientation: isNullableString,
  gardenType: isNullableString,
  lightSchedule: (value) => value === null || arrayOf(isLightSlot)(value),
  hemisphere: isNullableString,
  latitudeBand: isNullableString,
});

/**
 * One placed plant, complete (round 4, C1 — G‴2).
 *
 * The finding's own case, verbatim: « For a garden with a plan, `[null]`
 * reaches `placementCoverage` and throws when it reads `placement.startRow`. »
 * Round 3 checked that `placements` was an array and no deeper, on the argument
 * that a bad element degrades one thumbnail rather than killing the render.
 * That argument was wrong about WHERE the elements are read: `placementCoverage`
 * runs inside `deriveGardenView`, on the page's critical path, and it
 * dereferences four numbers per element with no guard — so one null in the array
 * takes down the whole dashboard, not one thumbnail.
 *
 * The walk this adds is one pass of eight checks over a few hundred elements,
 * next to an exposure engine that already walks width × height several times
 * per garden.
 */
const isPlacementRecord = matches<PlacementData>({
  id: isString,
  plantId: isString,
  plantScientificName: isNullableString,
  startRow: isGridInteger,
  startCol: isGridInteger,
  spanRows: isGridInteger,
  spanCols: isGridInteger,
  notes: isNullableString,
});

/**
 * One garden of the aggregate, checked on EVERY field of the type — the map is
 * exhaustive by construction (see {@link matches}).
 *
 * `config` is the one round 3 named and the reason the whole check exists:
 * `deriveGardenView` enters its planned branch on positive `width`/`height` and
 * reads `garden.config.orientation` on the next line, so a garden that arrives
 * without a config takes the page down at render — after the load succeeded,
 * where no error state is left to draw it. Round 4 finished the same argument
 * one level down: a config that is an object and a placements array that is an
 * array were still narrowing values nobody had looked inside.
 */
const isGardenRecord = matches<DashboardGardenData>({
  id: isString,
  name: isString,
  description: isNullableString,
  width: isNullableGridInteger,
  height: isNullableGridInteger,
  cellSize: isNullableString,
  cellsJson: isNullableString,
  config: isGardenConfig,
  updatedAt: isString,
  placements: arrayOf(isPlacementRecord),
  placementCount: isNumber,
  varietyCount: isNumber,
  occupiedCells: isNumber,
  isEdible: isNullableBoolean,
});

/**
 * One Counters row, COMPLETE — every field the narrowing promises (round 6,
 * Extension #5-17 and #4-18).
 *
 * Same argument as `isGardenRecord`, which rounds 3 and 4 completed for the
 * gardens: this predicate narrows to `DashboardData`, so a field it does not
 * check is a field the compiler was told about on this function's word alone.
 * It verified five of the ten. `commonName` is the one with teeth — an
 * object-valued name reaching a React child throws AFTER the load succeeded,
 * where no error state is left to draw; a non-string `gardenIds` element
 * silently drops a variety from the per-garden filter; a non-string `imageUrl`
 * degrades an avatar. The boundary is the one place where « verified » and
 * « narrowed » have to mean the same thing, or none of the predicates in this
 * file can be trusted — which is what `matches` now makes the compiler's job.
 */
const isVarietyRecord = matches<DashboardVarietyData>({
  plantId: isString,
  scientificName: isString,
  commonName: isNullableString,
  plantType: isNullableString,
  isEdible: isNullableBoolean,
  imageUrl: isNullableString,
  imageAttribution: isNullableString,
  count: isNumber,
  cells: isNumber,
  gardenIds: arrayOf(isString),
});

/** The four page totals. */
const isTotalsRecord = matches<DashboardTotals>({
  gardenCount: isNumber,
  placementCount: isNumber,
  varietyCount: isNumber,
  catalogPlantCount: isNumber,
});

const isAggregate = matches<DashboardData>({
  gardens: arrayOf(isGardenRecord),
  varieties: arrayOf(isVarietyRecord),
  totals: isTotalsRecord,
});

/**
 * Is this body the aggregate?
 *
 * Round 1 (E19 / G8) checked the three top-level CONTAINERS, which stopped the
 * empty body — `fetchJson` resolves `undefined` on a 204, and
 * `Promise<DashboardData>` said nothing about it, so `dashboardData.gardens`
 * threw during render instead of showing the load-error state the page already
 * draws.
 *
 * Round 3 (E″8) went one level in, and the reason the first pass was incomplete
 * rather than wrong is the signature: `value is DashboardData` narrows to a type
 * that promises every RECORD's fields too, while the check only ever looked at
 * the containers holding them — so the compiler was told more than the function
 * had established, and a garden with a width but no `config` walked through a
 * predicate that had declared it well-formed.
 *
 * Round 4 (C1 — E‴5 / G‴2) applied the same argument to the fields those
 * records carry; round 7 (S39) hands the argument to the compiler: every record
 * predicate is a `keyof`-keyed map, so the narrowing this signature claims is
 * exactly what the checks establish, at every depth, and a field added to a
 * wire type without its check is a build error rather than a runtime surprise.
 *
 * Unknown properties are PRESERVED: this reads fields, it never rebuilds the
 * object, so a field a newer server adds travels through untouched.
 */
function isDashboardData(value: unknown): value is DashboardData {
  return isAggregate(value);
}

/**
 * SMA-336 PR 2/5 — the transport aggregate: every garden with its plan, the
 * counts by variety, and the page totals, in one call.
 *
 * Rejects a body that is not the aggregate rather than returning it (round 1,
 * E19 / G8) — see {@link isDashboardData} for where the line is drawn. Throwing
 * puts the failure on the path the page already handles: `useDashboardData`
 * catches it, keeps `EMPTY_DASHBOARD_DATA` and raises `loadError`, which the
 * three widgets draw with a Retry button.
 */
export async function fetchDashboardData(
  language: string,
  signal?: AbortSignal
): Promise<DashboardData> {
  const body = await fetchJson<unknown>(
    `${API_BASE}/dashboard?lang=${encodeURIComponent(language)}`,
    { credentials: 'include', signal }
  );

  if (!isDashboardData(body)) {
    // Names every level the predicate can reject at (round 6, Extension #4-17
    // / #5-17): it used to say the three containers were missing, so a
    // rejection caused by a malformed placement or variety row sent the next
    // debugger to the wrong level.
    throw new Error(
      'Malformed dashboard aggregate: gardens, varieties or totals is missing, ' +
        'or a garden, a placement, a variety row or the totals block does not ' +
        'match the expected shape.'
    );
  }

  return body;
}
