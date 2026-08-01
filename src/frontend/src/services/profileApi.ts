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
 * SMA-341 (GDPR art. 17): deletes the caller's account. The confirmation is the
 * account's own email address, typed by the user — the backend re-checks it.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  const res = await fetch('/api/auth/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ confirmation }),
  });
  if (!res.ok) throw new Error('Failed to delete account');
}

/**
 * SMA-341 (GDPR art. 20): downloads the caller's data export. The filename comes
 * from the Content-Disposition the backend sets (dated), with a static fallback
 * if the header is unreadable.
 */
export async function exportAccountData(): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch('/api/auth/account/export', { credentials: 'include' });
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
