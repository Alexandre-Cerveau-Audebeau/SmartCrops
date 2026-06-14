import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { AuthContext } from '../contexts/authContextValue';
import type { AuthContextValue } from '../contexts/authContextValue';
import type { AuthUser } from '../types/Auth';
import GuestRoute from './GuestRoute';

const TEST_USER: AuthUser = {
  email: 'alex@example.com',
  userId: 'u1',
  displayName: 'Alex Gardener',
  isAdmin: false,
};

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    token: null,
    login: vi.fn(),
    register: vi.fn(),
    googleCallback: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshUser: vi.fn(),
    isAuthenticated: false,
    loading: false,
    ...overrides,
  };
}

// Render the guard around sentinel /login and /register routes so the test
// exercises the guard logic itself, independent of the real form pages.
function renderAt(path: string, auth: AuthContextValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>HOME PAGE</div>} />
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<div>LOGIN FORM</div>} />
            <Route path="/register" element={<div>REGISTER FORM</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('GuestRoute (SMA-123)', () => {
  it('redirects an authenticated user away from /login to home', () => {
    renderAt('/login', makeAuth({ isAuthenticated: true, user: TEST_USER }));
    expect(screen.queryByText('LOGIN FORM')).toBeNull();
    expect(screen.getByText('HOME PAGE')).toBeInTheDocument();
  });

  it('redirects an authenticated user away from /register to home', () => {
    renderAt('/register', makeAuth({ isAuthenticated: true, user: TEST_USER }));
    expect(screen.queryByText('REGISTER FORM')).toBeNull();
    expect(screen.getByText('HOME PAGE')).toBeInTheDocument();
  });

  it('renders the login form for an anonymous visitor', () => {
    renderAt('/login', makeAuth({ isAuthenticated: false }));
    expect(screen.getByText('LOGIN FORM')).toBeInTheDocument();
  });

  it('renders the register form for an anonymous visitor', () => {
    renderAt('/register', makeAuth({ isAuthenticated: false }));
    expect(screen.getByText('REGISTER FORM')).toBeInTheDocument();
  });

  it('shows the loading fallback without form or redirect while the session resolves', () => {
    renderAt('/login', makeAuth({ loading: true }));
    // The spinner carries a translated accessible name (SMA-123 a11y fix);
    // assert one exists without pinning the locale.
    const spinner = screen.getByRole('progressbar');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAccessibleName();
    expect(screen.queryByText('LOGIN FORM')).toBeNull();
    expect(screen.queryByText('HOME PAGE')).toBeNull();
  });
});
