export interface UserProfile {
  email: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  hasPassword: boolean;
}

export interface UpdateProfileData {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
}

export async function fetchProfile(): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function updateProfile(data: UpdateProfileData): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

/**
 * Sentinel thrown by deleteAccount when its 10 s bound aborts the request
 * (SMA-341 R3). An abort is INDETERMINATE, not a failure: it cannot tell "the
 * server never got it" from "the server committed and the response was lost".
 * The dialog must treat it as its own case, never as a plain error — a retry
 * against a committed deletion meets a 404 on an account that no longer
 * exists. Same sentinel pattern as authApi's RESET_FAILED / RESET_RATE_LIMITED.
 */
export const DELETE_TIMEOUT = 'DELETE_TIMEOUT';

/**
 * Sentinel thrown by deleteAccount when the request failed WITHOUT a backend
 * explanation (network error, or a non-OK response whose body carried no
 * usable detail). The dialog maps it to its localized generic copy; only
 * messages that are NOT this sentinel are genuine backend explanations, safe
 * to render verbatim (SMA-341 R3).
 */
export const DELETE_FAILED = 'DELETE_FAILED';

/**
 * SMA-341 (GDPR art. 17): deletes the caller's account. The confirmation is the
 * account's own email address, typed by the user — the backend re-checks it.
 * Bounded at 10 s (AbortSignal.timeout, the SMA-323 declarative precedent): the
 * dialog blocks EVERY exit while deleting, so an unbounded hung request would
 * trap the user in the modal with no way out.
 *
 * Error contract (R3): the ABORT case is recognized FIRST and thrown as
 * DELETE_TIMEOUT (indeterminate — see the sentinel). Every other failure is
 * either a genuine backend explanation (the `{ error }` mismatch message, or
 * Identity's error descriptions — thrown verbatim, mirroring the
 * changePassword parser below) or DELETE_FAILED when no such detail exists.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ confirmation }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Abort first: browsers reject with a DOMException named TimeoutError
    // (older engines: AbortError). Anything else is a network failure with no
    // backend explanation to show.
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(DELETE_TIMEOUT);
    }
    throw new Error(DELETE_FAILED);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      typeof body?.error === 'string'
        ? body.error
        : Array.isArray(body)
          ? body
              .map((e: { description?: string }) => e.description)
              .filter(Boolean)
              .join(', ')
          : null;
    throw new Error(message || DELETE_FAILED);
  }
}

/**
 * SMA-341 (GDPR art. 20): downloads the caller's data export. The filename comes
 * from the Content-Disposition the backend sets (dated), with a static fallback
 * if the header is unreadable. Bounded at 10 s like deleteAccount — nothing else
 * bounds the request, and the export button would otherwise spin forever.
 */
export async function exportAccountData(): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch('/api/auth/account/export', {
    credentials: 'include',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error('Failed to export account data');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return { blob: await res.blob(), filename: match?.[1] ?? 'smartcrops-export.json' };
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const firstError =
      Array.isArray(body) ? body[0]
      : Array.isArray(body?.errors) ? body.errors[0]
      : null;
    const message = firstError?.description ?? 'Failed to change password';
    throw new Error(message);
  }
}
