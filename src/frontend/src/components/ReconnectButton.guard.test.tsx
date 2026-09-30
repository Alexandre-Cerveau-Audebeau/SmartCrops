import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import ReconnectButton from './ReconnectButton';

// SMA-448, PR #297, fix round 1 (S2 — GitHub G3 and Extension E2, REFUTED on
// the evidence): both said « navigate to /login even when logout() rejects »,
// the user otherwise « left on the page with a button that does nothing ».
// The premise has no path in the code: `authApi.logout` swallows every
// failure of the request — a network error, a timeout, a non-OK status —
// by a documented invariant (authApi.ts, « no caller needs to tolerate
// anything »), and `AuthContext.logout` clears the user in a `finally`.
// So `useReconnect` always reaches `navigate('/login')`. This is THE GUARD
// of that invariant, in the real chain — the real provider, the real
// service, the real hook, the real button, a real router — with only the
// network stubbed: should `authApi.logout` ever be made to reject, the way
// back would break here first. `useReconnect` is not touched.

function renderTheRealChain() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/gardens']}>
        <Routes>
          <Route path="/gardens" element={<ReconnectButton />} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

/** The button, in whichever language i18n stands at without a LanguageProvider around it. */
const reconnect = () => screen.findByRole('button', { name: /^(Sign in again|Se reconnecter)$/ });

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup (vitest's `sequence.hooks = 'stack'`); what it puts
  // back below stays in place until the tree that reads it is gone.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('« Sign in again » reaches /login even when the logout request fails (SMA-448, PR #297, fix round 1, S2 — the guard)', () => {
  it('the network is down — every fetch rejects: the logout is attempted, its failure warned and swallowed, and the way back still leads to the login page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    renderTheRealChain();

    fireEvent.click(await reconnect());

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(warn).toHaveBeenCalledWith('Logout request failed:', expect.any(TypeError));
  });

  it('the server answers 500 to the logout: warned and swallowed, and the way back still leads to the login page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetch);
    renderTheRealChain();

    fireEvent.click(await reconnect());

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
    expect(warn).toHaveBeenCalledWith('Logout request failed:', 500);
  });
});
