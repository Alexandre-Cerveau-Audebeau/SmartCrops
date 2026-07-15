import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteGarden,
  fetchGarden,
  fetchGardens,
} from './gardenApi';
import { HttpStatusError } from './httpStatusError';

// SMA-280 migration locks: gardenApi now goes through fetchJson. What must
// never regress: the auth cookie policy (credentials: 'include' — every
// garden endpoint sits behind [Authorize]), the caller AbortSignal reaching
// fetch (useGardenLayout aborts on garden switch), and the HttpStatusError
// contract consumers narrow on. (removePlantFromGarden/updatePlantNotes left
// with the GardenPlants table — SMA-285 — so the status-carrying lock now
// rides deleteGarden; the dual-param URL-encode lock retired with its route,
// single-id encoding stays pinned below.)

// contactApi.test.ts pattern: stub global fetch, restore after each test.
function mockFetch(response: {
  ok: boolean;
  status?: number;
  text?: () => Promise<string>;
}) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gardenApi (SMA-280 migration)', () => {
  it('sends credentials: include', async () => {
    const spy = mockFetch({
      ok: true,
      status: 200,
      text: () => Promise.resolve('[]'),
    });

    await expect(fetchGardens()).resolves.toEqual([]);

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/gardens');
    expect(init.credentials).toBe('include');
  });

  it('aborts an in-flight request when the caller signal aborts', async () => {
    // fetchJson composes the caller signal with its timeout controller, so a
    // mid-flight caller abort must reach the signal fetch received.
    const spy = vi
      .fn()
      .mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      );
    vi.stubGlobal('fetch', spy);
    const controller = new AbortController();

    const pending = fetchGardens(controller.signal);
    const expectation = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await expectation;

    const [, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(init.signal?.aborted).toBe(true);
  });

  it('rejects with HttpStatusError carrying the status (404 garden not found)', async () => {
    mockFetch({ ok: false, status: 404 });

    const rejection = expect(deleteGarden('g1')).rejects;
    await rejection.toBeInstanceOf(HttpStatusError);
    await expect(deleteGarden('g1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('fetchGardens forwards the lang query (server-localized card names, SMA-155)', async () => {
    const spy = mockFetch({
      ok: true,
      status: 200,
      text: () => Promise.resolve('[]'),
    });

    await fetchGardens(undefined, 'fr');

    const [url] = spy.mock.calls[0]! as [string];
    expect(url).toBe('/api/gardens?lang=fr');
  });

  it('URL-encodes the garden id', async () => {
    const spy = mockFetch({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    });

    await fetchGarden('a/b c');

    const [url] = spy.mock.calls[0]! as [string];
    expect(url).toBe('/api/gardens/a%2Fb%20c');
  });

});
