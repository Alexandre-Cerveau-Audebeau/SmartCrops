import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { AuthContext } from '../contexts/authContextValue';
import type { AuthContextValue } from '../contexts/authContextValue';
import type { AuthUser } from '../types/Auth';
import AdminRoute from './AdminRoute';

const MEMBER: AuthUser = {
  email: 'alex@example.com',
  userId: 'u1',
  displayName: 'Alex Gardener',
  isAdmin: false,
};
const ADMIN: AuthUser = { ...MEMBER, isAdmin: true };

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

// Sentinel routes around the guard: the test exercises the guard logic, not
// the real pages (GuestRoute.test pattern).
function renderAt(auth: AuthContextValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/" element={<div>HOME PAGE</div>} />
          <Route path="/login" element={<div>LOGIN FORM</div>} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<div>ADMIN PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('AdminRoute (SMA-414)', () => {
  it('shows the loading fallback, no page and no redirect, while the session resolves', () => {
    renderAt(makeAuth({ loading: true }));
    const spinner = screen.getByRole('progressbar');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAccessibleName();
    expect(screen.queryByText('ADMIN PAGE')).toBeNull();
    expect(screen.queryByText('LOGIN FORM')).toBeNull();
  });

  it('redirects an anonymous visitor to /login', () => {
    renderAt(makeAuth({ isAuthenticated: false }));
    expect(screen.getByText('LOGIN FORM')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN PAGE')).toBeNull();
  });

  it('renders the 403 state IN PLACE for a signed-in non-admin (D3), with a way home', () => {
    renderAt(makeAuth({ isAuthenticated: true, user: MEMBER }));
    expect(screen.getByText('HTTP 403')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/');
    expect(screen.queryByText('ADMIN PAGE')).toBeNull();
    // No redirect: neither sentinel page took over.
    expect(screen.queryByText('HOME PAGE')).toBeNull();
    expect(screen.queryByText('LOGIN FORM')).toBeNull();
  });

  it('renders the child route for an admin', () => {
    renderAt(makeAuth({ isAuthenticated: true, user: ADMIN }));
    expect(screen.getByText('ADMIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('HTTP 403')).toBeNull();
  });
});
