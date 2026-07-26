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
