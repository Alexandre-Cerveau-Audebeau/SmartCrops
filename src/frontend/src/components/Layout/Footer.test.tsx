import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../../i18n/i18n';
import { AuthContext } from '../../contexts/authContextValue';
import type { AuthContextValue } from '../../contexts/authContextValue';
import { ColorModeProvider } from '../../contexts/ColorModeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import Footer from './Footer';

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

function renderFooter(auth: AuthContextValue = makeAuth()) {
  return render(
    <ColorModeProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <Footer />
        </MemoryRouter>
      </AuthContext.Provider>
    </ColorModeProvider>
  );
}

describe('Footer v2 (SMA-151)', () => {
  beforeEach(async () => {
    // SMA-393: English is stored the way a returning visitor stores it.
    localStorage.setItem('smartcrops-language', 'en');
    await i18next.changeLanguage('en');
  });

  it('carries the language selector beside the theme switch (SMA-56)', () => {
    // SMA-393: LanguageMenu reads LanguageContext (no-provider default is now
    // French), so mount the provider and let the stored EN choice resolve.
    render(
      <ColorModeProvider>
        <AuthContext.Provider value={makeAuth()}>
          <LanguageProvider>
            <MemoryRouter>
              <Footer />
            </MemoryRouter>
          </LanguageProvider>
        </AuthContext.Provider>
      </ColorModeProvider>
    );
    // Mounted AS-IS at the end of the copyright row; the white-on-green
    // trigger fits the dark footer natively.
    expect(
      screen.getByRole('button', { name: 'Change language' })
    ).toHaveTextContent('EN');
  });

  it('points every functional link to its route (signed out)', () => {
    renderFooter();
    const expected: [string, string][] = [
      ['Library', '/library'],
      ['My Gardens', '/gardens'],
      ['Shop', '/shop'],
      ['About Us', '/about'],
      ['Contact', '/contact'],
      ['Login', '/login'],
      ['Create account', '/register'],
      ['Legal Notice', '/legal-notice'],
      ['Terms of Use', '/terms'],
      ['Privacy', '/privacy'],
    ];
    for (const [name, href] of expected) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('renders Help Center / News / social as Coming Soon items that are NOT links', () => {
    renderFooter();
    // Help Center & News: muted text + chip, never an <a>.
    expect(screen.getByText('Help Center')).toBeInTheDocument();
    expect(screen.getByText('News')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Help Center' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'News' })).toBeNull();
    // Social icons: present as list items, never links.
    expect(
      screen.getByRole('listitem', { name: 'Instagram' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Instagram' })).toBeNull();
    // At least the four Coming Soon chips (Shop, Help Center, News, social).
    expect(screen.getAllByText('Coming Soon').length).toBeGreaterThanOrEqual(4);
  });

  it('shows Login / Create account when signed out', () => {
    renderFooter(makeAuth({ isAuthenticated: false }));
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(
      screen.getByRole('link', { name: 'Create account' })
    ).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('link', { name: 'My Account' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('shows My Account / Log out when signed in, and logout calls the auth hook', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    renderFooter(makeAuth({ isAuthenticated: true, logout }));
    expect(screen.getByRole('link', { name: 'My Account' })).toHaveAttribute(
      'href',
      '/profile'
    );
    expect(screen.queryByRole('link', { name: 'Login' })).toBeNull();

    const logoutBtn = screen.getByRole('button', { name: 'Log out' });
    await userEvent.click(logoutBtn);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('renders key labels in French', async () => {
    await i18next.changeLanguage('fr');
    renderFooter();
    expect(screen.getByRole('link', { name: 'Boutique' })).toHaveAttribute(
      'href',
      '/shop'
    );
    expect(screen.getByText("Centre d'aide")).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Créer un compte' })
    ).toHaveAttribute('href', '/register');
  });
});
