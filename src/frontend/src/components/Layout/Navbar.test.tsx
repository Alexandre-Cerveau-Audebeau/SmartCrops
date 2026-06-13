import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import i18next from '../../i18n/i18n';
import { AuthContext } from '../../contexts/authContextValue';
import type { AuthContextValue } from '../../contexts/authContextValue';
import type { AuthUser } from '../../types/Auth';
import Navbar from './Navbar';

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

function setMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

function renderNavbar(
  auth: AuthContextValue = makeAuth(),
  { mobile = false }: { mobile?: boolean } = {}
) {
  setMatchMedia(mobile); // mobile=true => useMediaQuery(down('md')) matches => drawer mode
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeAll(() => {
  // MUI Menu focuses items via scrollIntoView, which jsdom doesn't implement.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Navbar v2 (SMA-152 / SMA-150)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the Shop entry as a /shop link with a Coming Soon chip (desktop)', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute(
      'href',
      '/shop'
    );
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('shows Login and no profile menu when signed out (desktop)', () => {
    renderNavbar(makeAuth({ isAuthenticated: false }));
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByRole('button', { name: /Alex Gardener/ })).toBeNull();
  });

  it('opens the profile dropdown with edit/notifications/settings/logout (desktop)', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderNavbar(makeAuth({ isAuthenticated: true, user: TEST_USER, logout }));

    const trigger = screen.getByRole('button', { name: /Alex Gardener/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    expect(trigger).not.toHaveAttribute('aria-expanded', 'true');
    // Menu closed initially.
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const menu = await screen.findByRole('menu');
    // Edit-profile item is a real link to /profile.
    const editItem = within(menu).getByRole('menuitem', {
      name: /Edit profile/,
    });
    expect(editItem).toHaveAttribute('href', '/profile');
    // Notifications / Settings: menuitems, Coming Soon, but NOT links.
    expect(
      within(menu).getByRole('menuitem', { name: /Notifications/ })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: /Settings/ })
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('link', { name: /Notifications/ })
    ).toBeNull();
    expect(within(menu).queryByRole('link', { name: /Settings/ })).toBeNull();
    expect(
      within(menu).getAllByText('Coming Soon').length
    ).toBeGreaterThanOrEqual(2);

    // Logout calls the auth hook.
    await user.click(within(menu).getByRole('menuitem', { name: 'Logout' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('mirrors Shop + the profile section in the mobile drawer', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth({ isAuthenticated: true, user: TEST_USER }), {
      mobile: true,
    });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute(
      'href',
      '/shop'
    );
    // Profile edit link + non-navigable coming-soon items.
    expect(screen.getByRole('link', { name: /Edit profile/ })).toHaveAttribute(
      'href',
      '/profile'
    );
    expect(screen.queryByRole('link', { name: /Notifications/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Settings/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Logout/ })).toBeInTheDocument();
  });

  it('renders key labels in French', async () => {
    await i18next.changeLanguage('fr');
    renderNavbar(makeAuth({ isAuthenticated: true, user: TEST_USER }));
    expect(
      await screen.findByRole('link', { name: 'Boutique' })
    ).toHaveAttribute('href', '/shop');
  });
});
