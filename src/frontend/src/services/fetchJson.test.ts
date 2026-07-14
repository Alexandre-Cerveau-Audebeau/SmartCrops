import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './fetchJson';
import { HttpStatusError } from './httpStatusError';

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
  vi.useRealTimers();
});

describe('fetchJson (SMA-280)', () => {
  it('resolves the parsed JSON body of a 200', async () => {
    mockFetch({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"id":"g1","name":"Potager"}'),
    });

    await expect(
      fetchJson<{ id: string; name: string }>('/api/gardens/g1', {
        credentials: 'include',
      })
    ).resolves.toEqual({ id: 'g1', name: 'Potager' });
  });

  it('resolves undefined on 204 without reading the body', async () => {
    // No text() on the stub — reading the body would throw.
    mockFetch({ ok: true, status: 204 });

    await expect(
      fetchJson('/api/contact', { credentials: 'omit' })
    ).resolves.toBeUndefined();
  });

  it('resolves undefined on a 200 with an empty body', async () => {
    // Several authenticated endpoints return 200/201 with or without a body;
    // an empty body must not go through JSON.parse.
    mockFetch({ ok: true, status: 200, text: () => Promise.resolve('') });

    await expect(
      fetchJson('/api/gardens/g1/plants/p1', { credentials: 'include' })
    ).resolves.toBeUndefined();
  });

  it('rejects with HttpStatusError carrying status 500 on a server error', async () => {
    mockFetch({ ok: false, status: 500 });

    await expect(
      fetchJson('/api/gardens', { credentials: 'include' })
    ).rejects.toBeInstanceOf(HttpStatusError);
    await expect(
      fetchJson('/api/gardens', { credentials: 'include' })
    ).rejects.toMatchObject({ status: 500 });
  });

  it('rejects with status 429 attached when rate-limited', async () => {
    mockFetch({ ok: false, status: 429 });

    await expect(
      fetchJson('/api/contact', { credentials: 'omit' })
    ).rejects.toMatchObject({ status: 429 });
  });

  it('propagates a network rejection untouched (no status attached)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );

    await expect(
      fetchJson('/api/gardens', { credentials: 'include' })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      fetchJson('/api/gardens', { credentials: 'include' })
    ).rejects.not.toHaveProperty('status');
  });

  it('aborts at timeoutMs with a statusless TimeoutError', async () => {
    vi.useFakeTimers();
    // Like real fetch, the stub rejects with the signal's abort reason.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject((init.signal as AbortSignal).reason)
            );
          })
      )
    );

    const pending = fetchJson('/api/slow', {
      credentials: 'include',
      timeoutMs: 5_000,
    });
    // Attach the expectations before advancing so the rejection is handled.
    const nameExpectation = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    const statusExpectation = expect(pending).rejects.not.toHaveProperty(
      'status'
    );
    vi.advanceTimersByTime(5_000);
    await nameExpectation;
    await statusExpectation;
  });

  it('honours a caller-supplied signal alongside the timeout', async () => {
    // Like real fetch, the stub rejects with the signal's abort reason —
    // here the caller's default AbortError, forwarded by fetchJson.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject((init.signal as AbortSignal).reason)
            );
          })
      )
    );

    const caller = new AbortController();
    const pending = fetchJson('/api/gardens', {
      credentials: 'include',
      signal: caller.signal,
    });
    const expectation = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    caller.abort();
    await expectation;
  });

  it('rejects immediately when passed an already-aborted signal', async () => {
    // The stub must not matter: the early-abort path rejects from fetchJson
    // itself with the caller's reason, before any response handling.
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const controller = new AbortController();
    controller.abort();

    const pending = fetchJson('/api/gardens', {
      credentials: 'include',
      signal: controller.signal,
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pending).rejects.not.toHaveProperty('status');
    expect(spy).not.toHaveBeenCalled();
  });

  it('forwards the exact credentials value to fetch', async () => {
    const spy = mockFetch({ ok: true, status: 204 });

    await fetchJson('/api/plants', { credentials: 'same-origin' });

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/plants');
    expect(init.credentials).toBe('same-origin');
  });
});
