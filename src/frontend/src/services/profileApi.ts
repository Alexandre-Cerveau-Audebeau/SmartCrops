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
