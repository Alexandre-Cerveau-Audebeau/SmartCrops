import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPlantById,
  fetchPlants,
  fetchPlantTypes,
  findPlants,
  searchPlants,
} from './plantApi';
import { HttpStatusError } from './httpStatusError';

// SMA-9 T3 — pins findPlants' QUERY-STRING serialization, the layer under
// the hook's param building. The regression trap is the inverted safety
// traits: "Pet-safe"/"Human-safe" send an EXPLICIT false
// (isToxicToPets=false / isToxicToHumans=false), which a truthiness check
// in the serializer would silently drop — only `undefined` means "not
// filtered". Enum multi-selects must stay repeated keys alongside.

const emptyResult = {
  items: [],
  found: 0,
  page: 1,
  perPage: 24,
  facetCounts: [],
};

function mockFetch() {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(emptyResult),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const requestedUrl = (spy: ReturnType<typeof vi.fn>) =>
  new URL(spy.mock.calls[0]![0] as string, 'http://localhost');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findPlants query serialization', () => {
  it('emits the explicit FALSE of the inverted safety traits', async () => {
    const spy = mockFetch();
    await findPlants({ isToxicToPets: false, isToxicToHumans: false });

    const url = requestedUrl(spy);
    expect(url.pathname).toBe('/api/plants/finder');
    expect(url.searchParams.get('isToxicToPets')).toBe('false');
    expect(url.searchParams.get('isToxicToHumans')).toBe('false');
  });

  it('emits true for a direct trait and omits undefined booleans entirely', async () => {
    const spy = mockFetch();
    await findPlants({ isEdible: true, page: 2 });

    const url = requestedUrl(spy);
    expect(url.searchParams.get('isEdible')).toBe('true');
    for (const absent of [
      'isIndoor',
      'isDroughtTolerant',
      'isToxicToPets',
      'isToxicToHumans',
    ]) {
      expect(url.searchParams.has(absent)).toBe(false);
    }
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('keeps enum multi-selects as repeated keys alongside a boolean', async () => {
    const spy = mockFetch();
    await findPlants({
      careLevels: ['Easy', 'Medium'],
      plantTypeIds: [1, 3],
      isIndoor: true,
    });

    const url = requestedUrl(spy);
    expect(url.searchParams.getAll('careLevels')).toEqual(['Easy', 'Medium']);
    expect(url.searchParams.getAll('plantTypeIds')).toEqual(['1', '3']);
    expect(url.searchParams.get('isIndoor')).toBe('true');
  });

  it('emits only the DEFINED range bounds — an open-ended top has no max key at all (T4)', async () => {
    const spy = mockFetch();
    await findPlants({
      heightCmMin: 50,
      hardinessZoneMin: 4,
      hardinessZoneMax: 9,
      xWateringPhMin: 5.5,
    });

    const url = requestedUrl(spy);
    expect(url.searchParams.get('heightCmMin')).toBe('50');
    // The open-ended "3 m +" contract: NO heightCmMax on the wire.
    expect(url.searchParams.has('heightCmMax')).toBe(false);
    expect(url.searchParams.get('hardinessZoneMin')).toBe('4');
    expect(url.searchParams.get('hardinessZoneMax')).toBe('9');
    // Decimal bound serializes with the invariant dot.
    expect(url.searchParams.get('xWateringPhMin')).toBe('5.5');
    for (const absent of [
      'xWateringPhMax',
      'xPlantSpacingValueMin',
      'xPlantSpacingValueMax',
      'xWateringBasedTempCMin',
      'xWateringBasedTempCMax',
    ]) {
      expect(url.searchParams.has(absent)).toBe(false);
    }
  });

  it('emits a ZERO bound (falsy but defined) — only undefined means "open" (T4)', async () => {
    // Same truthiness trap as the inverted booleans: a min of 0 must survive.
    const spy = mockFetch();
    await findPlants({ xWateringBasedTempCMin: 0, xWateringBasedTempCMax: 20 });

    const url = requestedUrl(spy);
    expect(url.searchParams.get('xWateringBasedTempCMin')).toBe('0');
    expect(url.searchParams.get('xWateringBasedTempCMax')).toBe('20');
  });

  it('emits the bonus trait booleans like the hero ones (T4)', async () => {
    const spy = mockFetch();
    await findPlants({ isMedicinal: true, isThorny: true });

    const url = requestedUrl(spy);
    expect(url.searchParams.get('isMedicinal')).toBe('true');
    expect(url.searchParams.get('isThorny')).toBe('true');
    for (const absent of ['isSaltTolerant', 'isTropical', 'isInvasive']) {
      expect(url.searchParams.has(absent)).toBe(false);
    }
  });
});

// SMA-280 contract locks (gardenApi.test.ts model): explicit public-endpoint
// credentials and the single HttpStatusError shape across the module.
describe('plantApi error/credentials contract (SMA-280)', () => {
  it('fetchPlants sends credentials: omit', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', spy);

    await expect(fetchPlants()).resolves.toEqual([]);

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/plants');
    expect(init.credentials).toBe('omit');
  });

  it('fetchPlants rejects with HttpStatusError carrying status 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    await expect(fetchPlants()).rejects.toBeInstanceOf(HttpStatusError);
    await expect(fetchPlants()).rejects.toMatchObject({ status: 500 });
  });

  it('fetchPlantById rejects with HttpStatusError carrying status 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );

    await expect(fetchPlantById('p1')).rejects.toBeInstanceOf(HttpStatusError);
    await expect(fetchPlantById('p1')).rejects.toMatchObject({ status: 404 });
  });

  it('fetchPlantTypes sends credentials: omit', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', spy);

    await expect(fetchPlantTypes()).resolves.toEqual([]);

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/planttypes');
    expect(init.credentials).toBe('omit');
  });

  it('fetchPlantTypes rejects with HttpStatusError carrying status 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    const pending = fetchPlantTypes();
    await expect(pending).rejects.toBeInstanceOf(HttpStatusError);
    await expect(pending).rejects.toMatchObject({ status: 500 });
  });

  it('searchPlants sends credentials: omit with the query/lang pair', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', spy);

    await expect(searchPlants('rose', 'fr')).resolves.toEqual([]);

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/plants/search?query=rose&lang=fr');
    expect(init.credentials).toBe('omit');
  });

  it('searchPlants rejects with HttpStatusError carrying status 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502 })
    );

    const pending = searchPlants('rose', 'fr');
    await expect(pending).rejects.toBeInstanceOf(HttpStatusError);
    await expect(pending).rejects.toMatchObject({ status: 502 });
  });

  it('findPlants sends credentials: omit', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [],
          found: 0,
          page: 1,
          perPage: 24,
          facetCounts: [],
        }),
    });
    vi.stubGlobal('fetch', spy);

    await findPlants({ q: 'rose' });

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/plants/finder?q=rose');
    expect(init.credentials).toBe('omit');
  });

  it('findPlants rejects with HttpStatusError carrying status 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );

    const pending = findPlants({ q: 'rose' });
    await expect(pending).rejects.toBeInstanceOf(HttpStatusError);
    await expect(pending).rejects.toMatchObject({ status: 503 });
  });
});
