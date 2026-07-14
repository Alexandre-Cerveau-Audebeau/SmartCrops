import { HttpStatusError } from './httpStatusError';

// 15s: sized above the backend's 10s wall-clock SMTP deadline
// (SmtpEmailService.SendTimeout) — the slowest call the API makes — so a
// slow-but-successful request is never aborted client-side.
const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchJsonOptions extends Omit<RequestInit, 'credentials'> {
  /**
   * REQUIRED by design (SMA-280 policy): every call site states its cookie
   * policy explicitly — never rely on the browser's implicit `same-origin`
   * default. `'include'` for authenticated endpoints (the HttpOnly auth
   * cookie must flow), `'omit'` for public ones.
   */
  credentials: RequestCredentials;
  /** Abort deadline for the whole request. Defaults to 15 000 ms. */
  timeoutMs?: number;
}

/**
 * Shared JSON fetch wrapper (SMA-280).
 *
 * Contract:
 * - Non-OK responses throw {@link HttpStatusError} carrying `res.status`, so
 *   callers narrow with `instanceof` instead of duck-typing a `status` field.
 * - Abort rejections (timeout or caller signal) and network failures (fetch
 *   `TypeError`) propagate untouched — both are statusless by design so
 *   callers can tell "server said no" from "no server".
 * - A 204 or empty body resolves `undefined`; anything else is parsed as
 *   JSON and returned as `T`.
 * - A caller-supplied `signal` is honoured alongside the timeout: whichever
 *   aborts first wins.
 */
export async function fetchJson<T = void>(
  url: string,
  options: FetchJsonOptions
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new HttpStatusError(`Request failed (${res.status})`, res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
