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

/**
 * Is this body the aggregate, at all?
 *
 * A SHAPE check, not a schema validation, and the line between the two is the
 * point (round 1, E19 / G8). A layout is stored data an older or newer build may
 * have written, so `normalizeBlock` above inspects every field. This body is
 * computed fresh from the caller's own rows on each request: there is no older
 * document to meet, and walking a few hundred placements per load would cost
 * more than it could catch. What CAN arrive and must not reach a component is
 * the empty case — `fetchJson` resolves `undefined` on a 204 or an empty body,
 * and `Promise<DashboardData>` says nothing about it, so `dashboardData.gardens`
 * threw during render instead of showing the load-error state the page already
 * draws. The three top-level containers are what every widget indexes into on
 * its first line.
 */
function isDashboardData(value: unknown): value is DashboardData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const body = value as Partial<DashboardData>;
  return (
    Array.isArray(body.gardens) &&
    Array.isArray(body.varieties) &&
    typeof body.totals === 'object' &&
    body.totals !== null &&
    !Array.isArray(body.totals)
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
