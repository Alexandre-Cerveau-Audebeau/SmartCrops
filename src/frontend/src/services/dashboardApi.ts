import {
  isDashboardBlockKey,
  isDashboardLevel,
  isDashboardSize,
  type DashboardBlock,
  type DashboardBlockKey,
  type DashboardPreferences,
  type SaveDashboardPreferences,
} from '../types/Dashboard';
import type { DashboardData } from '../types/DashboardData';
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

/**
 * `number | null`. No finiteness check: JSON carries neither `NaN` nor
 * `Infinity`, so a guard against them would be untestable code standing for a
 * value that cannot arrive.
 */
function isNullableNumber(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

/** `string | null`. */
function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

/**
 * One indoor light slot: two `HH:mm` strings, and nothing weaker.
 *
 * The FORM only, not the clock. `GardensController.ValidateSlots` holds the
 * document to a 24 h pattern, an ordering and a ceiling, and a schedule that
 * fails any of them reads as no schedule at all before it reaches the wire — so
 * repeating those rules here would be a second copy of a contract the server
 * already enforces. What this boundary answers for is that `start` and `end`
 * are strings at all, which is what `computeExposureGrid` reads.
 */
function isLightSlot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.start === 'string' && typeof value.end === 'string';
}

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
function isGardenConfig(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNullableString(value.orientation) &&
    isNullableString(value.gardenType) &&
    isNullableString(value.hemisphere) &&
    isNullableString(value.latitudeBand) &&
    (value.lightSchedule === null ||
      (Array.isArray(value.lightSchedule) &&
        value.lightSchedule.every(isLightSlot)))
  );
}

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
 * The walk this adds is one pass of eight typeof checks over a few hundred
 * elements, next to an exposure engine that already walks width × height
 * several times per garden.
 */
function isPlacementRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.plantId === 'string' &&
    isNullableString(value.plantScientificName) &&
    typeof value.startRow === 'number' &&
    typeof value.startCol === 'number' &&
    typeof value.spanRows === 'number' &&
    typeof value.spanCols === 'number' &&
    isNullableString(value.notes)
  );
}

/**
 * One garden of the aggregate, checked on the fields the page DEREFERENCES —
 * and, since round 4, on the fields those fields carry.
 *
 * `config` is the one round 3 named and the reason the whole check exists:
 * `deriveGardenView` enters its planned branch on positive `width`/`height` and
 * reads `garden.config.orientation` on the next line, so a garden that arrives
 * without a config takes the page down at render — after the load succeeded,
 * where no error state is left to draw it. Round 4 finishes the same argument
 * one level down: a config that is an object and a placements array that is an
 * array were still narrowing values nobody had looked inside.
 */
function isGardenRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.description) &&
    isNullableNumber(value.width) &&
    isNullableNumber(value.height) &&
    isNullableString(value.cellSize) &&
    isNullableString(value.cellsJson) &&
    isGardenConfig(value.config) &&
    typeof value.updatedAt === 'string' &&
    Array.isArray(value.placements) &&
    value.placements.every(isPlacementRecord) &&
    typeof value.placementCount === 'number' &&
    typeof value.varietyCount === 'number' &&
    typeof value.occupiedCells === 'number' &&
    (value.isEdible === null || typeof value.isEdible === 'boolean')
  );
}

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
 * file can be trusted.
 */
function isVarietyRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.plantId === 'string' &&
    typeof value.scientificName === 'string' &&
    isNullableString(value.commonName) &&
    isNullableString(value.plantType) &&
    (value.isEdible === null || typeof value.isEdible === 'boolean') &&
    isNullableString(value.imageUrl) &&
    isNullableString(value.imageAttribution) &&
    typeof value.count === 'number' &&
    typeof value.cells === 'number' &&
    Array.isArray(value.gardenIds) &&
    value.gardenIds.every((id) => typeof id === 'string')
  );
}

/** The four page totals. */
function isTotalsRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.gardenCount === 'number' &&
    typeof value.placementCount === 'number' &&
    typeof value.varietyCount === 'number' &&
    typeof value.catalogPlantCount === 'number'
  );
}

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
 * Round 4 (C1 — E‴5 / G‴2) applies the same argument to the fields those records
 * carry: `GardenConfig` field by field including `lightSchedule`, and every
 * element of `placements` as a complete `PlacementData`. What the page
 * dereferences is now what is verified, at every depth it reaches, and the
 * narrowing is licensed by the check that precedes it.
 *
 * Unknown properties are PRESERVED: this reads fields, it never rebuilds the
 * object, so a field a newer server adds travels through untouched.
 */
function isDashboardData(value: unknown): value is DashboardData {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.gardens) &&
    value.gardens.every(isGardenRecord) &&
    Array.isArray(value.varieties) &&
    value.varieties.every(isVarietyRecord) &&
    isTotalsRecord(value.totals)
  );
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
