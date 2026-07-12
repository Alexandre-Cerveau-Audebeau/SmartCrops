import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendContactMessage } from './contactApi';
import { HttpStatusError } from './httpStatusError';

// plantApi.test.ts pattern: stub global fetch, restore after each test.
function mockFetch(response: { ok: boolean; status?: number }) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const payload = {
  name: 'Alex',
  email: 'alex@example.com',
  reason: 'other' as const,
  message: 'Hello',
};

describe('sendContactMessage (SMA-30)', () => {
  it('POSTs the payload to /api/contact without credentials and resolves on 204', async () => {
    const spy = mockFetch({ ok: true, status: 204 });

    await expect(sendContactMessage(payload)).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/contact');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual(payload);
    // Public endpoint: no credentials ride along (plantApi model).
    expect(init.credentials).toBeUndefined();
  });

  it('rejects with status 429 attached when rate-limited', async () => {
    mockFetch({ ok: false, status: 429 });

    await expect(sendContactMessage(payload)).rejects.toMatchObject({
      status: 429,
    });
    await expect(sendContactMessage(payload)).rejects.toBeInstanceOf(
      HttpStatusError
    );
  });

  it('rejects with status 500 attached on a server error', async () => {
    mockFetch({ ok: false, status: 500 });

    await expect(sendContactMessage(payload)).rejects.toMatchObject({
      status: 500,
    });
    await expect(sendContactMessage(payload)).rejects.toBeInstanceOf(
      HttpStatusError
    );
  });

  it('aborts after 15s (above the 10s backend SMTP cap) with a statusless AbortError', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );

    const pending = sendContactMessage(payload);
    // Attach the expectations before advancing so the rejection is handled.
    const nameExpectation = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    const statusExpectation = expect(pending).rejects.not.toHaveProperty(
      'status'
    );
    vi.advanceTimersByTime(15_000);
    await nameExpectation;
    await statusExpectation;
  });

  it('propagates a network rejection untouched (no status attached)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );

    await expect(sendContactMessage(payload)).rejects.toBeInstanceOf(TypeError);
    await expect(sendContactMessage(payload)).rejects.not.toHaveProperty(
      'status'
    );
  });
});
