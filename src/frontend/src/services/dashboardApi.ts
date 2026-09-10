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
 * One garden of the aggregate, checked on the fields the page DEREFERENCES.
 *
 * `config` is the one the finding names and the reason the whole check exists:
 * `deriveGardenView` enters its planned branch on positive `width`/`height` and
 * reads `garden.config.orientation` on the next line, so a garden that arrives
 * without a config takes the page down at render — after the load succeeded,
 * where no error state is left to draw it.
 *
 * `placements` is checked for being an array and no deeper: the derivation
 * reads a placement's four numbers, but a few hundred of them per load is the
 * walk round 1 declined, and a bad element degrades one thumbnail rather than
 * killing the render.
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
    isRecord(value.config) &&
    typeof value.updatedAt === 'string' &&
    Array.isArray(value.placements) &&
    typeof value.placementCount === 'number' &&
    typeof value.varietyCount === 'number' &&
    typeof value.occupiedCells === 'number' &&
    (value.isEdible === null || typeof value.isEdible === 'boolean')
  );
}

/** One Counters row, on the fields the widget reads without guarding. */
function isVarietyRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.plantId === 'string' &&
    typeof value.scientificName === 'string' &&
    typeof value.count === 'number' &&
    typeof value.cells === 'number' &&
    Array.isArray(value.gardenIds)
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
 * Round 3 (E″8) finishes the job, and the reason the first pass was incomplete
 * rather than wrong is the signature: `value is DashboardData` narrows to a type
 * that promises every RECORD's fields too, while the check only ever looked at
 * the containers holding them — so the compiler was told more than the function
 * had established, and a garden with a width but no `config` walked through a
 * predicate that had declared it well-formed. What the page dereferences is now
 * what is verified, and the narrowing is licensed by the check that precedes it.
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
    throw new Error('Malformed dashboard aggregate: gardens, varieties or totals is missing.');
  }

  return body;
}
