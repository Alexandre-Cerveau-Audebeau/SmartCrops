import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDashboardData,
  fetchDashboardPreferences,
  matches,
  saveDashboardPreferences,
} from './dashboardApi';
import { presetFor } from '../constants/dashboardPresets';

// SMA-336 round 1 (E17) — the service boundary is the last place an untrusted
// body can be turned into the typed layout the app relies on. `fetchJson`
// returns the parsed body as `T` with NO runtime check, so a block key this
// build does not know reaches BLOCK_ICONS, yields undefined, and rendering
// <Icon /> throws in the Customize gallery or in a widget.

// gardenApi.test.ts pattern: stub global fetch, restore after each test.
function mockFetch(body: unknown, status = 200) {
  const spy = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** A 204, or a 200 with nothing in it — both make `fetchJson` resolve undefined. */
function mockEmptyBody(status = 204) {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status,
    text: () => Promise.resolve(''),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const AGGREGATE = {
  gardens: [],
  varieties: [],
  totals: {
    gardenCount: 0,
    placementCount: 0,
    varietyCount: 0,
    catalogPlantCount: 536,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchDashboardPreferences — normalization (SMA-336)', () => {
  it('passes a well-formed document through unchanged', async () => {
    mockFetch({
      schemaVersion: 1,
      level: 'novice',
      isPreset: true,
      blocks: presetFor('novice'),
      updatedAt: '2026-09-09T10:00:00Z',
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.level).toBe('novice');
    expect(preferences.isPreset).toBe(true);
    expect(preferences.updatedAt).toBe('2026-09-09T10:00:00Z');
    expect(preferences.blocks).toEqual(presetFor('novice'));
  });

  it('drops blocks whose key this build does not know', async () => {
    mockFetch({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: [
        { key: 'weather', size: 'medium', hidden: false },
        { key: 'moon-phase', size: 'large', hidden: false },
        { key: 'gardens', size: 'large', hidden: false },
      ],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.blocks.map((block) => block.key)).toEqual([
      'weather',
      'gardens',
    ]);
  });

  it('drops blocks whose size is not one of the three footprints', async () => {
    mockFetch({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: [
        { key: 'weather', size: 'enormous', hidden: false },
        { key: 'gardens', size: 'large', hidden: false },
      ],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.blocks.map((block) => block.key)).toEqual(['gardens']);
  });

  it('falls back to the default level when the stored one is unknown', async () => {
    mockFetch({
      schemaVersion: 1,
      level: 'archdruid',
      isPreset: false,
      blocks: [{ key: 'gardens', size: 'large', hidden: false }],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.level).toBe('gardener');
  });

  it('serves the level preset when nothing in the document survives', async () => {
    // Not an empty grid: that would read as "you have no widgets" instead of
    // "we could not read your layout".
    mockFetch({
      schemaVersion: 1,
      level: 'novice',
      isPreset: false,
      blocks: [{ key: 'moon-phase', size: 'huge', hidden: false }, null, 7],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.level).toBe('novice');
    expect(preferences.blocks).toEqual(presetFor('novice'));
  });

  it('survives a body that is not an object at all', async () => {
    mockFetch('a string where a layout was expected');

    const preferences = await fetchDashboardPreferences();

    expect(preferences.level).toBe('gardener');
    expect(preferences.blocks).toEqual(presetFor('gardener'));
    expect(preferences.updatedAt).toBeNull();
  });

  it('keeps a valid `options` object', async () => {
    mockFetch({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: [
        { key: 'gardens', size: 'large', hidden: false, options: { pinned: true } },
      ],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.blocks[0]!.options).toEqual({ pinned: true });
  });

  it('omits `options` rather than inventing a null one', async () => {
    // Round 2 (E'7). A structural difference from the preset would make every
    // block read as « adjusted » and re-send a layout the user never changed —
    // `isAdjusted` compares the normalized blocks against `presetFor`.
    mockFetch({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: [{ key: 'gardens', size: 'large', hidden: false, options: null }],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect('options' in preferences.blocks[0]!).toBe(false);
  });

  it('refuses an ARRAY as `options` — `typeof` alone lets one through', async () => {
    // Round 2 (N5): assigned to Record<string, unknown>, an array comes back out
    // on the next write, where the endpoint binds a Dictionary and rejects it.
    mockFetch({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: [
        { key: 'gardens', size: 'large', hidden: false, options: ['a', 'b'] },
      ],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect('options' in preferences.blocks[0]!).toBe(false);
  });

  it('keeps the FIRST of two blocks sharing a key', async () => {
    // Round 2 (E'8): `key` is the identity React, SortableContext and the
    // `indexOf` of handleDragEnd all sort by. Two blocks under one key make the
    // grid reorder the wrong slot.
    mockFetch({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: [
        { key: 'gardens', size: 'large', hidden: false },
        { key: 'weather', size: 'medium', hidden: false },
        { key: 'gardens', size: 'small', hidden: false },
      ],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.blocks.map((block) => block.key)).toEqual([
      'gardens',
      'weather',
    ]);
    expect(preferences.blocks[0]!.size).toBe('large');
  });

  it('coerces a non-boolean `hidden` instead of trusting it', async () => {
    mockFetch({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: false,
      blocks: [{ key: 'gardens', size: 'large', hidden: 'yes' }],
      updatedAt: null,
    });

    const preferences = await fetchDashboardPreferences();

    expect(preferences.blocks[0]!.hidden).toBe(false);
  });
});

describe('saveDashboardPreferences (SMA-336)', () => {
  it('PUTs the layout with the auth cookie and no keepalive by default', async () => {
    const fetchSpy = mockFetch(null, 204);

    await saveDashboardPreferences({
      level: 'gardener',
      blocks: presetFor('gardener'),
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/dashboard/preferences');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.keepalive).toBe(false);
  });

  it('sets keepalive for the page-teardown write (round 1, E12)', async () => {
    const fetchSpy = mockFetch(null, 204);

    await saveDashboardPreferences(
      { level: 'gardener', blocks: presetFor('gardener') },
      true
    );

    expect(fetchSpy.mock.calls[0]![1].keepalive).toBe(true);
  });

  it('forwards the caller signal so a superseded write can be cancelled', async () => {
    // Round 2 (E'6 / N4): the teardown write aborts the ordinary one it
    // replaces, which only works if the signal reaches `fetchJson`. Asserted by
    // ABORTING it — `fetchJson` builds its own controller and would hand fetch
    // an AbortSignal either way, so the instance proves nothing.
    const fetchSpy = mockFetch(null, 204);
    const controller = new AbortController();
    controller.abort();

    await expect(
      saveDashboardPreferences(
        { level: 'gardener', blocks: presetFor('gardener') },
        false,
        controller.signal
      )
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('fetchDashboardData — the aggregate boundary (round 1, E19 / G8)', () => {
  it('returns a well-formed aggregate untouched', async () => {
    mockFetch(AGGREGATE);

    await expect(fetchDashboardData('fr')).resolves.toEqual(AGGREGATE);
  });

  it('sends the language and the auth cookie', async () => {
    const fetchSpy = mockFetch(AGGREGATE);

    await fetchDashboardData('fr');

    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/dashboard?lang=fr');
    expect(fetchSpy.mock.calls[0]![1].credentials).toBe('include');
  });

  it('rejects a 204, which resolves undefined and used to reach the widgets', async () => {
    // The failure this guards: `fetchJson` resolves undefined on an empty
    // successful body, `Promise<DashboardData>` says nothing about it, and
    // `GardensDashboard` reads `dashboardData.gardens` on its first line — so
    // the page threw during render instead of showing its load-error state.
    mockEmptyBody();

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it('rejects a 200 with an empty body', async () => {
    mockEmptyBody(200);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'ok'],
    ['no gardens', { varieties: [], totals: {} }],
    ['no varieties', { gardens: [], totals: {} }],
    ['no totals', { gardens: [], varieties: [] }],
    ['gardens as an object', { gardens: {}, varieties: [], totals: {} }],
    ['totals as an array', { gardens: [], varieties: [], totals: [] }],
  ])('rejects a body with %s', async (_label, body) => {
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it('an unknown extra key still passes', async () => {
    // The line drawn on purpose, and moved by round 3 (E″8): every field the
    // page DEREFERENCES is required now, on the records as well as on the three
    // containers — but nothing is rebuilt, so a field a newer server adds
    // travels through untouched. Round 4 walks placement elements too, so the
    // forward-compatibility rule holds at every depth the check reaches.
    const withExtra = { ...AGGREGATE, somethingNewer: 42 };
    mockFetch(withExtra);

    await expect(fetchDashboardData('en')).resolves.toEqual(withExtra);
  });
});

// ── Round 3 (E″8): validate the RECORDS, not only their containers ───────────

describe('fetchDashboardData — a garden record is checked before it is trusted', () => {
  /** A garden with everything the page dereferences. */
  const GARDEN = {
    id: 'g1',
    name: 'Terrasse',
    description: null,
    width: 4,
    height: 2,
    cellSize: '50cm',
    cellsJson: null,
    config: {
      orientation: 'S',
      gardenType: null,
      lightSchedule: null,
      hemisphere: 'N',
      latitudeBand: 'mid',
    },
    updatedAt: '2026-05-01T00:00:00Z',
    placements: [],
    placementCount: 0,
    varietyCount: 0,
    occupiedCells: 0,
    isEdible: null,
  };

  const VARIETY = {
    plantId: 'p1',
    scientificName: 'Ocimum basilicum',
    commonName: 'Basil',
    plantType: 'Herb',
    isEdible: true,
    imageUrl: null,
    imageAttribution: null,
    count: 1,
    cells: 1,
    gardenIds: ['g1'],
  };

  const full = () => ({
    gardens: [{ ...GARDEN }],
    varieties: [{ ...VARIETY }],
    totals: {
      gardenCount: 1,
      placementCount: 1,
      varietyCount: 1,
      catalogPlantCount: 536,
    },
  });

  it('accepts a complete aggregate, records and all', async () => {
    const body = full();
    mockFetch(body);

    await expect(fetchDashboardData('en')).resolves.toEqual(body);
  });

  it('rejects the garden the finding names — a plan, and no config', async () => {
    // The crash this prevents: `deriveGardenView` enters its planned branch on
    // positive width and height, then reads `garden.config.orientation` on the
    // next line. Round 1 narrowed to `DashboardData` — which promises a config
    // — while only ever checking that `gardens` was an array.
    const body = full();
    delete (body.gardens[0] as Record<string, unknown>).config;
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each([
    'id',
    'name',
    'description',
    'width',
    'height',
    'cellSize',
    'cellsJson',
    'config',
    'updatedAt',
    'placements',
    'placementCount',
    'varietyCount',
    'occupiedCells',
    'isEdible',
  ])('rejects a garden with no %s', async (field) => {
    const body = full();
    delete (body.gardens[0] as Record<string, unknown>)[field];
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each([
    ['config as null', { config: null }],
    ['config as an array', { config: [] }],
    ['width as a string', { width: '4' }],
    ['height as a boolean', { height: true }],
    ['placements as an object', { placements: {} }],
    ['isEdible as a string', { isEdible: 'yes' }],
  ])('rejects a garden with %s', async (_label, patch) => {
    const body = full();
    Object.assign(body.gardens[0]!, patch);
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each(['plantId', 'scientificName', 'count', 'cells', 'gardenIds'])(
    'rejects a variety with no %s',
    async (field) => {
      const body = full();
      delete (body.varieties[0] as Record<string, unknown>)[field];
      mockFetch(body);

      await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
    }
  );

  it.each([
    'gardenCount',
    'placementCount',
    'varietyCount',
    'catalogPlantCount',
  ])('rejects totals with no %s', async (field) => {
    const body = full();
    delete (body.totals as Record<string, unknown>)[field];
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  // ROUND 4 (C1 — E‴5 / G‴2): the nested records, checked at the depth the page
  // actually reads them.
  it.each([
    ['config as {}', { config: {} }],
    ['orientation as a number', { config: { ...GARDEN.config, orientation: 1 } }],
    ['gardenType as an object', { config: { ...GARDEN.config, gardenType: {} } }],
    ['hemisphere missing', { config: { orientation: 'S', gardenType: null, lightSchedule: null, latitudeBand: 'mid' } }],
    ['latitudeBand as a boolean', { config: { ...GARDEN.config, latitudeBand: true } }],
  ])('rejects an incomplete configuration — %s', async (_label, patch) => {
    // `{}` used to narrow to `GardenConfig`: round 3 checked that `config` was
    // an object and nothing about what it held.
    const body = full();
    Object.assign(body.gardens[0]!, patch);
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each([
    ['a string', 'always'],
    ['a number', 7],
    ['an object', { start: '08:00', end: '20:00' }],
    ['an array holding null', [null]],
    ['an array of empty slots', [{}]],
    ['a slot with no end', [{ start: '08:00' }]],
    ['a slot whose start is a number', [{ start: 8, end: '20:00' }]],
  ])('rejects a malformed lightSchedule — %s', async (_label, schedule) => {
    // `computeExposureGrid` calls `.filter` on `lightSchedule` in its indoor
    // branch, so a non-array value throws there rather than here.
    const body = full();
    Object.assign(body.gardens[0]!, {
      config: { ...GARDEN.config, lightSchedule: schedule },
    });
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it('accepts a well-formed lightSchedule', async () => {
    const body = full();
    Object.assign(body.gardens[0]!, {
      config: {
        ...GARDEN.config,
        gardenType: 'indoor',
        lightSchedule: [{ start: '08:00', end: '20:00' }],
      },
    });
    mockFetch(body);

    await expect(fetchDashboardData('en')).resolves.toEqual(body);
  });

  const PLACEMENT = {
    id: 'pl-1',
    plantId: 'p1',
    plantScientificName: 'Ocimum basilicum',
    startRow: 0,
    startCol: 0,
    spanRows: 1,
    spanCols: 1,
    notes: null,
  };

  it('rejects the placement the finding names — [null] on a garden with a plan', async () => {
    // Verbatim from the finding: « For a garden with a plan, `[null]` reaches
    // `placementCoverage` and throws when it reads `placement.startRow`. »
    const body = full();
    Object.assign(body.gardens[0]!, { placements: [null] });
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each([
    'id',
    'plantId',
    'plantScientificName',
    'startRow',
    'startCol',
    'spanRows',
    'spanCols',
    'notes',
  ])('rejects a placement with no %s', async (field) => {
    const placement: Record<string, unknown> = { ...PLACEMENT };
    delete placement[field];
    const body = full();
    Object.assign(body.gardens[0]!, { placements: [placement] });
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each([
    ['startRow as a string', { startRow: '0' }],
    ['spanCols as null', { spanCols: null }],
    ['id as a number', { id: 7 }],
    // ROUND 7 (S43 — Extension #7-28): the four numbers index the grid.
    ['startRow as a fraction', { startRow: 0.5 }],
    ['spanRows as a negative', { spanRows: -1 }],
  ])('rejects a malformed placement — %s', async (_label, patch) => {
    const body = full();
    Object.assign(body.gardens[0]!, {
      placements: [{ ...PLACEMENT, ...patch }],
    });
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it('accepts a complete placement', async () => {
    const body = full();
    Object.assign(body.gardens[0]!, { placements: [{ ...PLACEMENT }] });
    mockFetch(body);

    await expect(fetchDashboardData('en')).resolves.toEqual(body);
  });

  // ROUND 7 (S43 — Extension #7-28): a dimension is a whole, non-negative
  // number, or null. `typeof` let `height: 2.5` through, and the readers then
  // disagreed on what it meant — `parseCellsJson` built three rows,
  // `placementCoverage` two, and `freeExposureFrom` dereferenced `taken[2]`
  // and threw, after the load had succeeded.
  it.each([
    ['height as a fraction', { height: 2.5 }],
    ['width as a fraction', { width: 3.999 }],
    ['width as a negative', { width: -4 }],
  ])('rejects a garden with %s', async (_label, patch) => {
    const body = full();
    Object.assign(body.gardens[0]!, patch);
    mockFetch(body);

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it.each([
    ['null dimensions — a garden whose layout was never saved', { width: null, height: null }],
    ['zero dimensions', { width: 0, height: 0 }],
  ])('still accepts %s', async (_label, patch) => {
    const body = full();
    Object.assign(body.gardens[0]!, patch);
    mockFetch(body);

    await expect(fetchDashboardData('en')).resolves.toEqual(body);
  });

  it('preserves an unknown field a newer server adds, on the record too', async () => {
    // The check READS fields, it never rebuilds the object — so forward
    // compatibility survives the stricter boundary.
    const body = full();
    Object.assign(body.gardens[0]!, { somethingNewer: 42 });
    mockFetch(body);

    await expect(fetchDashboardData('en')).resolves.toEqual(body);
  });
});

// ROUND 6 (Extension #5-17 / #4-18 / #4-17) — the variety row is checked as
// completely as the garden row has been since rounds 3 and 4.
describe('fetchDashboardData — a variety row is checked before it is trusted (round 6)', () => {
  const GARDEN = {
    id: 'g1',
    name: 'Terrasse',
    description: null,
    width: 4,
    height: 2,
    cellSize: '50cm',
    cellsJson: null,
    config: {
      orientation: 'S',
      gardenType: null,
      lightSchedule: null,
      hemisphere: 'N',
      latitudeBand: 'mid',
    },
    updatedAt: '2026-05-01T00:00:00Z',
    placements: [],
    placementCount: 0,
    varietyCount: 0,
    occupiedCells: 0,
    isEdible: null,
  };

  const VARIETY = {
    plantId: 'p1',
    scientificName: 'Ocimum basilicum',
    commonName: 'Basil',
    plantType: 'Herb',
    isEdible: true,
    imageUrl: null,
    imageAttribution: null,
    count: 1,
    cells: 1,
    gardenIds: ['g1'],
  };

  const withVariety = (over: Record<string, unknown>) => ({
    gardens: [{ ...GARDEN }],
    varieties: [{ ...VARIETY, ...over }],
    totals: { gardenCount: 1, placementCount: 1, varietyCount: 1, catalogPlantCount: 536 },
  });

  it('rejects an object-valued commonName — the one that throws after the load', async () => {
    // `displayName` hands `commonName ?? scientificName` to a React child, and
    // an object there throws during render, after the load-error state is no
    // longer available to draw.
    mockFetch(withVariety({ commonName: { fr: 'Basilic' } }));

    await expect(fetchDashboardData('en')).rejects.toThrow(/variety row/);
  });

  it.each([
    ['plantType', 7],
    ['imageUrl', 42],
    ['imageAttribution', ['x']],
    ['isEdible', 'yes'],
  ])('rejects a %s that is neither null nor its declared type', async (field, bad) => {
    mockFetch(withVariety({ [field]: bad }));

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it('rejects a gardenIds element that is not a string (Extension #4-18)', async () => {
    // `gardenIds.includes(activeGarden)` is the per-garden filter; a numeric
    // element passes `Array.isArray` and silently drops the variety from a
    // filtered widget.
    mockFetch(withVariety({ gardenIds: ['g1', 7] }));

    await expect(fetchDashboardData('en')).rejects.toThrow(/aggregate/i);
  });

  it('accepts every nullable field at null', async () => {
    const body = withVariety({
      commonName: null,
      plantType: null,
      isEdible: null,
      imageUrl: null,
      imageAttribution: null,
    });
    mockFetch(body);

    await expect(fetchDashboardData('en')).resolves.toEqual(body);
  });

  it('names the levels it rejects at, not only the three containers (Extension #4-17)', async () => {
    mockFetch(withVariety({ commonName: 3 }));

    await expect(fetchDashboardData('en')).rejects.toThrow(
      /a garden, a placement, a variety row or the totals block/
    );
  });
});

// ── Round 7 (S39 — Extension #7-24): the validators are keyed by `keyof` ──────
//
// The record predicates narrow to the wire types, and a hand-listed run of
// `typeof` checks let a field added to a type travel unverified while every
// file kept compiling. `matches<T>` takes a `Record<keyof T, Check>`, which
// TypeScript checks exhaustively — so the proof here is at the TYPE level, and
// `tsc -b` (part of `npm run build`, which includes `src/` whole) is what runs
// it: an `@ts-expect-error` with nothing to expect is itself an error.
describe('matches — a validator that the compiler holds to the type', () => {
  const isNumber = (value: unknown) => typeof value === 'number';

  it('a field of T with no check is a build error', () => {
    // @ts-expect-error — `b` has no check: `Record<keyof T, Check>` is exhaustive.
    const incomplete = matches<{ a: number; b: number }>({ a: isNumber });
    expect(incomplete({ a: 1, b: 2 })).toBe(true);
  });

  it('a check for a field T does not have is a build error', () => {
    // @ts-expect-error — `c` is not a field of T.
    const surplus = matches<{ a: number }>({ a: isNumber, c: isNumber });
    expect(surplus({ a: 1 })).toBe(false);
  });

  it('reads the fields it names, and only them', () => {
    const isPoint = matches<{ x: number; y: number }>({ x: isNumber, y: isNumber });

    expect(isPoint({ x: 1, y: 2 })).toBe(true);
    expect(isPoint({ x: 1, y: 2, z: 'travels through' })).toBe(true);
    expect(isPoint({ x: 1 })).toBe(false);
    expect(isPoint(null)).toBe(false);
    expect(isPoint([1, 2])).toBe(false);
  });
});
