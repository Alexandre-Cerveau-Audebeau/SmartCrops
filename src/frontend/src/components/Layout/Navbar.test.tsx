import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  afterAll,
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
import { LanguageProvider } from '../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { ColorModeProvider } from '../../contexts/ColorModeContext';
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
      <ColorModeProvider>
        <LanguageProvider>
          <UnitSystemProvider>
            <MemoryRouter>
              <Navbar />
            </MemoryRouter>
          </UnitSystemProvider>
        </LanguageProvider>
      </ColorModeProvider>
    </AuthContext.Provider>
  );
}

// MUI Menu focuses items via scrollIntoView, which jsdom doesn't implement.
let originalScrollIntoView: typeof Element.prototype.scrollIntoView;
beforeAll(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe('Navbar v2 (SMA-152 / SMA-150)', () => {
  beforeEach(async () => {
    // SMA-393: the no-choice default is now French, so English is stored the
    // way a returning visitor stores it — LanguageProvider re-applies the
    // stored key on mount (mirrors Home.test), not just i18next.
    localStorage.setItem('smartcrops-language', 'en');
    localStorage.removeItem('smartcrops.unitSystem');
    localStorage.removeItem('smartcrops-color-mode');
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
    // LanguageProvider re-applies the STORED language on mount (mirrors
    // Home.test), so French is set the way a returning visitor sets it —
    // a direct i18next.changeLanguage would be overridden at render.
    localStorage.setItem('smartcrops-language', 'fr');
    renderNavbar(makeAuth({ isAuthenticated: true, user: TEST_USER }));
    expect(
      await screen.findByRole('link', { name: 'Boutique' })
    ).toHaveAttribute('href', '/shop');
  });

  // SMA-315 — the desktop profile menu now carries the same day/night switch
  // the mobile drawer has had since SMA-247, and clicking it must NOT dismiss
  // the menu (the row is a plain Box, not a MenuItem).
  it('carries the day/night switch in the profile menu, without closing it (desktop)', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth({ isAuthenticated: true, user: TEST_USER }));

    await user.click(screen.getByRole('button', { name: /Alex Gardener/ }));
    const menu = await screen.findByRole('menu');

    // Both options stay visible; light is the stubbed-matchMedia default.
    expect(
      within(menu).getByRole('button', { name: 'Light mode' })
    ).toHaveAttribute('aria-pressed', 'true');
    const dark = within(menu).getByRole('button', { name: 'Dark mode' });
    expect(dark).toHaveAttribute('aria-pressed', 'false');

    await user.click(dark);

    // Re-queried through the menu: it is still open, and dark is now pressed.
    const openMenu = screen.getByRole('menu');
    expect(
      within(openMenu).getByRole('button', { name: 'Light mode' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(openMenu).getByRole('button', { name: 'Dark mode' })
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Drawer & cluster controls (SMA-352 R2 / SMA-56)', () => {
  beforeEach(async () => {
    // SMA-393: store 'en' like a returning visitor — the fr default would win otherwise.
    localStorage.setItem('smartcrops-language', 'en');
    localStorage.removeItem('smartcrops.unitSystem');
    localStorage.removeItem('smartcrops-color-mode');
    await i18next.changeLanguage('en');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Both unit controls share the accessible-name triplet contract, so the
  // metric segment is the switch's stable signature wherever it renders.
  const unitButtons = () => screen.queryAllByRole('button', { name: /cm · L/ });

  it('the mobile bar renders no unit switch on any page', () => {
    renderNavbar(makeAuth(), { mobile: true });
    // Before the drawer opens nothing is aria-hidden: an empty query proves
    // the BAR carries no switch (the drawer copy only mounts on open).
    expect(unitButtons()).toHaveLength(0);
  });

  it('the desktop bar renders no unit switch', () => {
    renderNavbar();
    expect(unitButtons()).toHaveLength(0);
  });

  it('the drawer always carries the Language row, then the Units row below it', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth(), { mobile: true });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const language = screen.getByText('Language');
    const units = screen.getByText('Units');
    // SMA-352 R2 order: Language first, Units below.
    expect(
      language.compareDocumentPosition(units) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // The dropdown replaced the legacy FR/EN toggle for good.
    expect(
      screen.getByRole('button', { name: 'Change language' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /FR \/ EN/ })).toBeNull();
  });

  it('the drawer units row drives the shared preference', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth(), { mobile: true });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(unitButtons()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /in · gal/ }));
    expect(localStorage.getItem('smartcrops.unitSystem')).toBe('imperial');
  });

  it('desktop cluster: auth is the rightmost element and the login slot reserves its width across languages', () => {
    renderNavbar();

    const language = screen.getByRole('button', { name: 'Change language' });
    const login = screen.getByRole('link', { name: 'Login' });
    const cluster = language.parentElement!;
    // SMA-352 R2: original order restored — auth last, LanguageMenu before it.
    expect(cluster.lastElementChild).toBe(login);
    expect(
      language.compareDocumentPosition(login) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // SMA-56 immobility with this order: the slot is wider than the widest
    // label ("CONNEXION"), so a language switch cannot resize it.
    expect(login).toHaveStyle({ minWidth: '104px' });
  });

  it('the reserved login width is identical under French', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    renderNavbar();

    const login = screen.getByRole('link', { name: 'Connexion' });
    const cluster = login.parentElement!;
    expect(cluster.lastElementChild).toBe(login);
    expect(login).toHaveStyle({ minWidth: '104px' });
  });

  it('authenticated cluster: profile label stays bounded and auth stays last', () => {
    const longName = 'A'.repeat(120);
    renderNavbar(
      makeAuth({
        isAuthenticated: true,
        user: { ...TEST_USER, displayName: longName },
      })
    );

    // SMA-56 (kept from lot 1): unbounded user data is clipped; the title
    // recovers the full text.
    const span = screen.getByText(longName);
    expect(span).toHaveAttribute('title', longName);
    expect(span).toHaveStyle({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });

    const profile = screen.getByRole('button', { name: /A{20,}/ });
    const cluster = profile.parentElement!;
    expect(cluster.lastElementChild).toBe(profile);
  });

  it('the drawer language trigger renders the small variant; the desktop bar keeps the default', async () => {
    const user = userEvent.setup();

    // Desktop first: default size — original 14px font, 14-high flag.
    const desktop = renderNavbar();
    const desktopTrigger = screen.getByRole('button', {
      name: 'Change language',
    });
    expect(desktopTrigger).toHaveStyle({ fontSize: '14px' });
    expect(
      desktopTrigger.querySelector('svg')!.getAttribute('height')
    ).toBe('14');
    desktop.unmount();

    // Drawer mount: the small variant — smaller short-code font AND flag.
    renderNavbar(makeAuth(), { mobile: true });
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawerTrigger = screen.getByRole('button', {
      name: 'Change language',
    });
    expect(drawerTrigger).toHaveStyle({ fontSize: '12px' });
    expect(
      drawerTrigger.querySelector('svg')!.getAttribute('height')
    ).toBe('12');
  });

  it('drawer language dropdown switches the app language', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth(), { mobile: true });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('button', { name: 'Change language' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Français' }));

    await waitFor(() => expect(i18next.language).toBe('fr'));
    expect(localStorage.getItem('smartcrops-language')).toBe('fr');
  });

  it('the drawer close button closes the drawer', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth(), { mobile: true });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByText('Units')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    await waitFor(() => expect(screen.queryByText('Units')).toBeNull());
  });
});
