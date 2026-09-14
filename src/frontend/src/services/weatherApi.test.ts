import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGardenLocation,
  clearProfileLocation,
  fetchDashboardWeather,
  saveGardenLocation,
  saveProfileLocation,
  searchLocations,
} from './weatherApi';
import { HttpStatusError } from './httpStatusError';
import {
  alertFixture,
  currentFixture,
  dayFixture,
  hourFixture,
  linkFixture,
  locationFixture,
  pickFixture,
  weatherFixture,
} from '../test/fixtures/weather';

// SMA-336 PR 3b/5 — the weather service boundary. `fetchJson` hands the body
// back as `T` with NO runtime check, so this is the last place a malformed
// aggregate can be refused before a widget dereferences it during render.

// dashboardApi.test.ts pattern: stub global fetch, restore after each test.
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

afterEach(() => vi.unstubAllGlobals());

/** The artboards' Lyon, one located garden. */
const aggregate = () =>
  weatherFixture(
    [locationFixture({ alerts: [alertFixture()] })],
    [linkFixture({ gardenId: 'g1' }), linkFixture({ gardenId: 'g2', locationKey: null, source: null })]
  );

/** The same aggregate as plain JSON — what the wire carries. */
const wire = () => JSON.parse(JSON.stringify(aggregate())) as Record<string, unknown>;

/** The aggregate with one edit applied at a path, for the rejection cases. */
function withEdit(edit: (root: ReturnType<typeof aggregate>) => void) {
  const root = aggregate();
  edit(root);
  return root;
}

describe('fetchDashboardWeather — the request', () => {
  it('reads the weather endpoint with the language, and sends the auth cookie', async () => {
    const spy = mockFetch(aggregate());

    await fetchDashboardWeather('fr');

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/dashboard/weather?lang=fr');
    expect(init.credentials).toBe('include');
  });

  it('URL-encodes the language', async () => {
    const spy = mockFetch(aggregate());

    await fetchDashboardWeather('fr FR');

    expect(spy.mock.calls[0]![0]).toBe('/api/dashboard/weather?lang=fr%20FR');
  });

  it('forwards the caller signal', async () => {
    const spy = mockFetch(aggregate());
    const controller = new AbortController();

    await fetchDashboardWeather('en', controller.signal);

    // fetchJson composes its own controller; the request carries A signal.
    expect(spy.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('fetchDashboardWeather — the aggregate is accepted whole', () => {
  it('returns a well-formed body untouched, unknown properties included', async () => {
    const body = { ...wire(), serverExtra: 'kept' };
    mockFetch(body);

    const result = await fetchDashboardWeather('fr');

    expect(result).toEqual(body);
    expect((result as unknown as Record<string, unknown>).serverExtra).toBe('kept');
  });

  it('accepts a negative, decimal temperature — the value the aggregate exists to carry', async () => {
    mockFetch(
      withEdit((root) => {
        root.locations[0]!.current!.tempC = -2.5;
        root.locations[0]!.days[3]!.minTempC = -4;
      })
    );

    const result = await fetchDashboardWeather('fr');

    expect(result.locations[0]!.current!.tempC).toBe(-2.5);
    expect(result.locations[0]!.days[3]!.minTempC).toBe(-4);
  });

  it('accepts a decimal rainfall and a decimal wind', async () => {
    mockFetch(
      withEdit((root) => {
        root.locations[0]!.days[0]!.totalPrecipMm = 0.4;
        root.locations[0]!.days[0]!.maxWindKph = 17.3;
        root.locations[0]!.current!.windKph = 11.9;
      })
    );

    await expect(fetchDashboardWeather('fr')).resolves.toBeDefined();
  });

  it.each([
    ['current.isDay', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.current!.isDay = null; }],
    ['day.chanceOfRain', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.days[0]!.chanceOfRain = null; }],
    ['day.chanceOfSnow', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.days[0]!.chanceOfSnow = null; }],
    ['hour.isDay', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.days[0]!.hours[0]!.isDay = null; }],
    ['hour.chanceOfRain', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.days[0]!.hours[0]!.chanceOfRain = null; }],
  ])('accepts null on %s (PR 3a round 1, K3 — the provider did not say)', async (_field, edit) => {
    mockFetch(withEdit(edit));

    await expect(fetchDashboardWeather('fr')).resolves.toBeDefined();
  });

  it('accepts a place with nothing to show — unavailable, no current, no day', async () => {
    mockFetch(
      weatherFixture(
        [
          locationFixture({
            status: 'unavailable',
            fetchedAt: null,
            timeZone: null,
            localTime: null,
            current: null,
            days: [],
          }),
        ],
        [linkFixture()]
      )
    );

    const result = await fetchDashboardWeather('fr');

    expect(result.locations[0]!.status).toBe('unavailable');
    expect(result.locations[0]!.current).toBeNull();
  });

  it('accepts the empty aggregate of an account with no located garden', async () => {
    mockFetch({ locations: [], gardens: [], profileLocated: false });

    await expect(fetchDashboardWeather('fr')).resolves.toEqual({
      locations: [],
      gardens: [],
      profileLocated: false,
    });
  });
});

describe('fetchDashboardWeather — a malformed body is refused', () => {
  const MALFORMED = /Malformed weather aggregate/;

  it('rejects an empty body — the 204 lesson (round 1, E19)', async () => {
    mockEmptyBody();

    await expect(fetchDashboardWeather('fr')).rejects.toThrow(MALFORMED);
  });

  it('rejects a 200 whose body is empty text', async () => {
    mockEmptyBody(200);

    await expect(fetchDashboardWeather('fr')).rejects.toThrow(MALFORMED);
  });

  it.each([
    ['a missing container', (body: Record<string, unknown>) => { delete body.gardens; }],
    ['profileLocated as a string', (body: Record<string, unknown>) => { body.profileLocated = 'true'; }],
    ['locations as an object', (body: Record<string, unknown>) => { body.locations = {}; }],
  ])('rejects %s', async (_case, edit) => {
    const body = wire();
    edit(body);
    mockFetch(body);

    await expect(fetchDashboardWeather('fr')).rejects.toThrow(MALFORMED);
  });

  it.each([
    ['a null day in days', (root: ReturnType<typeof aggregate>) => { (root.locations[0]!.days as unknown[])[1] = null; }],
    ['a null hour in hours', (root: ReturnType<typeof aggregate>) => { (root.locations[0]!.days[0]!.hours as unknown[])[0] = null; }],
    ['a null alert', (root: ReturnType<typeof aggregate>) => { (root.locations[0]!.alerts as unknown[])[0] = null; }],
    ['a null garden link', (root: ReturnType<typeof aggregate>) => { (root.gardens as unknown[])[0] = null; }],
    ['chanceOfRain above 100', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.days[0]!.chanceOfRain = 101; }],
    ['a negative chanceOfRain', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.days[0]!.hours[0]!.chanceOfRain = -1; }],
    ['a decimal chanceOfSnow', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.days[0]!.chanceOfSnow = 12.5; }],
    ['a temperature as a string', (root: ReturnType<typeof aggregate>) => { (root.locations[0]!.current as { tempC: unknown }).tempC = '24'; }],
    ['a decimal condition code', (root: ReturnType<typeof aggregate>) => { root.locations[0]!.current!.conditionCode = 1000.5; }],
    ['an unknown status', (root: ReturnType<typeof aggregate>) => { (root.locations[0] as { status: unknown }).status = 'expired'; }],
    ['an unknown location source', (root: ReturnType<typeof aggregate>) => { (root.gardens[0] as { source: unknown }).source = 'user'; }],
    ['a missing hour field', (root: ReturnType<typeof aggregate>) => { delete (root.locations[0]!.days[0]!.hours[0] as { windKph?: unknown }).windKph; }],
    ['a missing alert headline', (root: ReturnType<typeof aggregate>) => { delete (root.locations[0]!.alerts[0] as { headline?: unknown }).headline; }],
    ['undefined where null is allowed', (root: ReturnType<typeof aggregate>) => { delete (root.locations[0]!.current as { isDay?: unknown }).isDay; }],
    ['a null place name', (root: ReturnType<typeof aggregate>) => { (root.locations[0] as { name: unknown }).name = null; }],
    ['a null place key', (root: ReturnType<typeof aggregate>) => { (root.locations[0] as { key: unknown }).key = null; }],
    ['a numeric garden id', (root: ReturnType<typeof aggregate>) => { (root.gardens[0] as { gardenId: unknown }).gardenId = 12; }],
  ])('rejects %s', async (_case, edit) => {
    mockFetch(withEdit(edit));

    await expect(fetchDashboardWeather('fr')).rejects.toThrow(MALFORMED);
  });

  it('propagates a non-OK status as HttpStatusError, not as a malformed body', async () => {
    mockFetch({ error: 'nope' }, 500);

    await expect(fetchDashboardWeather('fr')).rejects.toBeInstanceOf(HttpStatusError);
  });
});

describe('searchLocations', () => {
  it('reads the geocode endpoint with the encoded query, and sends the cookie', async () => {
    const spy = mockFetch([pickFixture()]);

    const result = await searchLocations('Saint-Étienne');

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/geocode/search?q=Saint-%C3%89tienne');
    expect(init.credentials).toBe('include');
    expect(result).toEqual([pickFixture()]);
  });

  it('returns the empty list the server sends when nothing matches', async () => {
    mockFetch([]);

    await expect(searchLocations('xyz')).resolves.toEqual([]);
  });

  it('lets the 503 of an unavailable geocoder reach the caller with its status', async () => {
    mockFetch({ error: 'geocoding unavailable' }, 503);

    const error = await searchLocations('Lyon').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).status).toBe(503);
  });

  it.each([
    ['an object instead of a list', { name: 'Lyon' }],
    ['a null element', [null]],
    ['a pick without coordinates', [{ name: 'Lyon', region: null, country: 'France' }]],
    ['a pick with string coordinates', [{ ...pickFixture(), latitude: '45.76' }]],
    ['a pick without a name', [{ ...pickFixture(), name: undefined }]],
  ])('rejects %s', async (_case, body) => {
    mockFetch(body);

    await expect(searchLocations('Lyon')).rejects.toThrow(/Malformed geocode response/);
  });

  it('rejects an empty body', async () => {
    mockEmptyBody(200);

    await expect(searchLocations('Lyon')).rejects.toThrow(/Malformed geocode response/);
  });

  it('accepts a pick whose region and country are null', async () => {
    mockFetch([pickFixture({ region: null, country: null })]);

    await expect(searchLocations('Lyon')).resolves.toHaveLength(1);
  });
});

describe('the four location writes', () => {
  it('saveGardenLocation PUTs the pick as is to the garden route', async () => {
    const spy = mockEmptyBody();

    await saveGardenLocation('g 1', pickFixture());

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/gardens/g%201/location');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(pickFixture());
  });

  it('clearGardenLocation DELETEs the garden route', async () => {
    const spy = mockEmptyBody();

    await clearGardenLocation('g1');

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/gardens/g1/location');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
  });

  it('saveProfileLocation PUTs the pick to the profile route', async () => {
    const spy = mockEmptyBody();

    await saveProfileLocation(pickFixture({ name: 'Annecy' }));

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/auth/profile/location');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body).name).toBe('Annecy');
  });

  it('clearProfileLocation DELETEs the profile route', async () => {
    const spy = mockEmptyBody();

    await clearProfileLocation();

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/auth/profile/location');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
  });

  it('a refused write rejects with its status, for the dialog to keep open', async () => {
    mockFetch({ errors: {} }, 400);

    const error = await saveProfileLocation(pickFixture()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).status).toBe(400);
  });
});

describe('the fixtures agree with the wire shape', () => {
  it('every builder produces a record the validator accepts', async () => {
    mockFetch(
      weatherFixture(
        [
          locationFixture({
            current: currentFixture({ isDay: null }),
            days: [dayFixture({ hours: [hourFixture({ chanceOfRain: null })] })],
            alerts: [alertFixture()],
          }),
        ],
        [linkFixture()]
      )
    );

    await expect(fetchDashboardWeather('fr')).resolves.toBeDefined();
  });
});
