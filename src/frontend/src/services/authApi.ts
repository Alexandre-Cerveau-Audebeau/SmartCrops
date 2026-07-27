import type { AuthUser } from '../types/Auth';

const API_BASE = '/api';

export async function register(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body)
      ? body.map((e: { description?: string }) => e.description).join(', ')
      : 'Registration failed';
    throw new Error(message);
  }
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Invalid email or password' : 'Login failed');
  }
}

/**
 * Confirms an email address from the link mailed at registration (SMA-31).
 * The endpoint is deliberately opaque — an unknown user id and a bad token both
 * come back 400 — so the caller only ever learns "it worked" or "it didn't".
 *
 * Unlike the rest of this file, the request is bounded (10 s abort): the
 * confirmation page renders NO button while processing, so a never-settling
 * promise would trap the user on a spinner — its error state (the only escape
 * route) is unreachable without a rejection.
 */
export async function confirmEmail(userId: string, token: string): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API_BASE}/auth/confirm-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, token }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error('Email confirmation failed');
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Requests a password-reset email (SMA-323). The endpoint answers 202 whether or
 * not the address exists — the caller learns nothing either way, and the UI is
 * expected to mirror that silence. Bounded at 10 s via AbortSignal.timeout (the
 * declarative form of confirmEmail's manual controller dance).
 */
export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error('Password reset request failed');
  }
}

/**
 * Pre-validates a reset link (SMA-323 R1-bis) so the page can hide the password
 * form when the link is already dead. Returns 'valid' on 204 and 'invalid' on
 * the 400 the backend answers for a dead link. Any OTHER outcome — network
 * failure, timeout, unexpected status (429 included) — THROWS, and the caller
 * must fall through to the form: only a positive "this token is refused" may
 * hide it, because the submit path stays the authority.
 */
export async function validateResetToken(
  userId: string,
  token: string
): Promise<'valid' | 'invalid'> {
  const res = await fetch(`${API_BASE}/auth/reset-password/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ userId, token }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204) return 'valid';
  if (res.status === 400) return 'invalid';
  throw new Error(`Unexpected status ${res.status}`);
}

/**
 * Consumes a reset link (SMA-323). On a refused password the backend answers with
 * Identity's raw error array; the descriptions are joined and thrown so the page
 * can show WHY. The 'RESET_FAILED' sentinel (no description available) and any
 * non-plain-Error rejection (timeout DOMException) are the page's cue to fall
 * back to its generic message.
 */
export async function resetPassword(
  userId: string,
  token: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ userId, token, newPassword }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body)
      ? body
          .map((e: { description?: string }) => e.description)
          .filter(Boolean)
          .join(', ')
      : null;
    throw new Error(message || 'RESET_FAILED');
  }
}

export async function exchangeCode(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/exchange-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Code exchange failed');
  }
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    console.warn('Logout request failed:', res.status);
  }
}
