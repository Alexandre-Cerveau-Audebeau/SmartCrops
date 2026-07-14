import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addPlantToGarden,
  fetchGarden,
  fetchGardens,
  removePlantFromGarden,
} from './gardenApi';
import { HttpStatusError } from './httpStatusError';

// SMA-280 migration locks: gardenApi now goes through fetchJson. What must
// never regress: the auth cookie policy (credentials: 'include' — every
// garden endpoint sits behind [Authorize]), the caller AbortSignal reaching
// fetch (useGardenLayout aborts on garden switch), and the HttpStatusError
// contract the 409 consumers narrow on.

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

  it('rejects with HttpStatusError carrying the status (409 duplicate plant)', async () => {
    mockFetch({ ok: false, status: 409 });

    const rejection = expect(
      addPlantToGarden('g1', 'p1')
    ).rejects;
    await rejection.toBeInstanceOf(HttpStatusError);
    await expect(addPlantToGarden('g1', 'p1')).rejects.toMatchObject({
      status: 409,
    });
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

  it('URL-encodes both gardenId and plantId in removePlantFromGarden', async () => {
    const spy = mockFetch({ ok: true, status: 204 });
    await removePlantFromGarden('a/b', 'c d');
    const [url] = spy.mock.calls[0]! as [string];
    expect(url).toBe('/api/gardens/a%2Fb/plants/c%20d');
  });
});
