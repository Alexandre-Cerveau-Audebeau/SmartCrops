import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  deleteAccount: vi.fn(),
  exportAccountData: vi.fn(),
}));
vi.mock('../services/authApi', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

import Profile from './Profile';
import { fetchMe, logout } from '../services/authApi';
import { deleteAccount, exportAccountData } from '../services/profileApi';

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

describe('Danger zone (SMA-341)', () => {
  it('keeps the delete confirmation disabled until the typed email matches', async () => {
    renderProfileAs(baseUser);
    await screen.findByText('My Profile');

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await screen.findByRole('dialog');

    const confirmButton = screen.getByRole('button', { name: 'Delete permanently' });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByLabelText('Your email address');
    fireEvent.change(input, { target: { value: 'wrong@example.com' } });
    expect(confirmButton).toBeDisabled();

    // Case-insensitive + trimmed, mirroring the backend contract: the brake is
    // the act of typing, not casing pedantry.
    fireEvent.change(input, { target: { value: '  USER@example.com ' } });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('USER@example.com'));
    // The core success path of the erasure flow: the client session is cleared
    // after the backend confirmed the deletion — nothing else pins it (R2).
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it('export button downloads the file returned by the API', async () => {
    // jsdom has no createObjectURL — stub the global via vi.stubGlobal (R2: a
    // plain assignment would outlive the test, since vi.clearAllMocks clears
    // call history but never undoes an assignment). The subclass keeps `new
    // URL(...)` working for anything else that runs while the stub is live.
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    vi.mocked(exportAccountData).mockResolvedValue({
      blob: new Blob(['{}'], { type: 'application/json' }),
      filename: 'smartcrops-export-2026-08-01.json',
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      renderProfileAs(baseUser);
      await screen.findByText('My Profile');

      fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));

      await waitFor(() => expect(exportAccountData).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
      // mock.contexts holds the `this` of each call — the transient anchor —
      // proving it carried the dated filename the backend chose.
      const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('smartcrops-export-2026-08-01.json');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      // The revoke is deferred a tick (R2) so the click can start consuming
      // the blob URL first — hence the waitFor.
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'));
    } finally {
      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
