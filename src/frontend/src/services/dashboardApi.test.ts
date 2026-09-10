import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDashboardPreferences,
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
