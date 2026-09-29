import { afterEach, describe, expect, it, vi } from 'vitest';
import { openGarden, saveGardenOrder } from './gardenSettingsApi';
import { HttpStatusError } from './httpStatusError';

// SMA-448, lot F5-a — the two writes of the Gardens widget's settings that
// live on the garden: the opening stamp and the account's own order. The
// gardenApi.test.ts pattern: stub global fetch, restore after each test.
function mockFetch(response: { ok: boolean; status?: number; text?: () => Promise<string> }) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openGarden — POST /api/gardens/{id}/open', () => {
  it('POSTs to the garden’s own route with the cookie, and resolves on 204', async () => {
    const spy = mockFetch({ ok: true, status: 204, text: () => Promise.resolve('') });

    await expect(openGarden('g 1')).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/gardens/g%201/open');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('rejects with the status on a 404 — a server before this lot, or a garden that is not the caller’s', async () => {
    mockFetch({ ok: false, status: 404, text: () => Promise.resolve('') });

    const error = await openGarden('g1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).status).toBe(404);
  });
});

describe('saveGardenOrder — PUT /api/gardens/order', () => {
  it('PUTs the ids as one list, with the cookie, and resolves on 204', async () => {
    const spy = mockFetch({ ok: true, status: 204, text: () => Promise.resolve('') });

    await expect(saveGardenOrder(['b', 'a', 'c'])).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/gardens/order');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['b', 'a', 'c'] });
  });

  it('aborts an in-flight write when the caller signal aborts — a newer order supersedes an older one', async () => {
    // fetchJson composes the caller signal with its timeout controller (the
    // gardenApi lock): a caller abort must reach the signal fetch received.
    const spy = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );
    vi.stubGlobal('fetch', spy);
    const controller = new AbortController();

    const pending = saveGardenOrder(['a', 'b'], controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow();
    const [, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).signal?.aborted).toBe(true);
  });

  it('rejects with the status on a 403 — a formula without the custom order', async () => {
    mockFetch({
      ok: false,
      status: 403,
      text: () => Promise.resolve('{"code":"formula.gardenOrder","formula":"gardener"}'),
    });

    const error = await saveGardenOrder(['a']).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpStatusError);
    expect((error as HttpStatusError).status).toBe(403);
  });
});
