import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { AuthUser } from '../types/Auth';

vi.mock('../services/profileApi', () => ({
  fetchProfile: vi.fn().mockResolvedValue({
    email: 'user@example.com',
    displayName: 'User',
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  }),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
}));
vi.mock('../services/authApi', () => ({
  fetchMe: vi.fn(),
}));

import Profile from './Profile';
import { fetchMe } from '../services/authApi';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.clearAllMocks();
});

function renderProfileAs(user: AuthUser) {
  vi.mocked(fetchMe).mockResolvedValue(user);
  return render(
    <LanguageProvider>
      <AuthProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </AuthProvider>
    </LanguageProvider>,
  );
}

const baseUser: AuthUser = {
  userId: 'u-1',
  email: 'user@example.com',
  displayName: 'User',
  isAdmin: false,
};

describe('Profile admin badge (SMA-83)', () => {
  it('shows the Admin badge when the user is an admin', async () => {
    renderProfileAs({ ...baseUser, isAdmin: true });

    // The page title proves we rendered past the loading spinner.
    await screen.findByText('My Profile');
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());
  });

  it('does not show the Admin badge for a non-admin user', async () => {
    renderProfileAs({ ...baseUser, isAdmin: false });

    await screen.findByText('My Profile');
    // Give the auth context a tick to settle, then assert the badge is absent.
    await waitFor(() => expect(screen.queryByText('Admin')).not.toBeInTheDocument());
  });
});
