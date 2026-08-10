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
import { MeasurementPageProvider } from '../../contexts/MeasurementPageContext';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { ColorModeProvider } from '../../contexts/ColorModeContext';
import type { AuthContextValue } from '../../contexts/authContextValue';
import type { AuthUser } from '../../types/Auth';
import { useMeasurementPage } from '../../hooks/useMeasurementPage';
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

// Stands in for a page that declares it displays measurements (SMA-352) —
// same register/unregister path PlantDetail and PlantLibrary use.
function DeclareMeasurementPage() {
  useMeasurementPage();
  return null;
}

function renderNavbar(
  auth: AuthContextValue = makeAuth(),
  { mobile = false, declared = false }: { mobile?: boolean; declared?: boolean } = {}
) {
  setMatchMedia(mobile); // mobile=true => useMediaQuery(down('md')) matches => drawer mode
  return render(
    <AuthContext.Provider value={auth}>
      <ColorModeProvider>
        <LanguageProvider>
          <UnitSystemProvider>
            <MeasurementPageProvider>
              <MemoryRouter>
                {declared && <DeclareMeasurementPage />}
                <Navbar />
              </MemoryRouter>
            </MeasurementPageProvider>
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
    // LanguageProvider re-applies its own language on mount (mirrors
    // Home.test), so the stored key must be cleared, not just i18next.
    localStorage.removeItem('smartcrops-language');
    localStorage.removeItem('smartcrops.unitSystem');
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
});

describe('Contextual controls (SMA-352 / SMA-56)', () => {
  beforeEach(async () => {
    localStorage.removeItem('smartcrops-language');
    localStorage.removeItem('smartcrops.unitSystem');
    await i18next.changeLanguage('en');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Both unit controls share the accessible-name triplet contract, so the
  // metric segment is the switch's stable signature wherever it renders.
  const unitButtons = () => screen.queryAllByRole('button', { name: /cm · L/ });

  it('mobile, declared page: unit switch in the bar, not the drawer; drawer carries the language dropdown', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth(), { mobile: true, declared: true });

    // In the bar before the drawer ever opens.
    expect(unitButtons()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    // The open drawer is a modal: the bar behind it goes aria-hidden, so the
    // only accessible switches would be drawer copies — and a declared page
    // folds none in. The bar's copy still exists, hidden behind the modal.
    expect(unitButtons()).toHaveLength(0);
    expect(
      screen.getAllByRole('button', { name: /cm · L/, hidden: true })
    ).toHaveLength(1);
    expect(screen.queryByText('Units')).toBeNull();
    // SMA-56: the flag dropdown replaces the legacy FR/EN toggle.
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change language' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /FR \/ EN/ })).toBeNull();
  });

  it('mobile, undeclared page: no bar switch; the drawer row carries it and drives the shared preference', async () => {
    const user = userEvent.setup();
    renderNavbar(makeAuth(), { mobile: true });

    expect(unitButtons()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(unitButtons()).toHaveLength(1);

    // The folded switch is the same shared control, not a copy.
    await user.click(screen.getByRole('button', { name: /in · gal/ }));
    expect(localStorage.getItem('smartcrops.unitSystem')).toBe('imperial');
  });

  it('desktop, undeclared page: no bar switch (status quo, no hamburger)', () => {
    renderNavbar();
    expect(unitButtons()).toHaveLength(0);
  });

  it('desktop, declared page: first desktop mount, and the language trigger holds the right edge', () => {
    renderNavbar(makeAuth(), { declared: true });
    expect(unitButtons()).toHaveLength(1);

    // SMA-56 stability: DOM order pins the trigger AFTER the auth control as
    // the cluster's last child — the right-anchored cluster grows leftward,
    // so auth-label width changes can no longer displace the trigger.
    const language = screen.getByRole('button', { name: 'Change language' });
    const login = screen.getByRole('link', { name: 'Login' });
    const cluster = language.parentElement!;
    expect(cluster).toContainElement(login);
    expect(cluster.lastElementChild).toBe(language);
    expect(
      login.compareDocumentPosition(language) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('authenticated cluster: profile label is bounded and the language trigger keeps the edge', () => {
    const longName = 'A'.repeat(120);
    renderNavbar(
      makeAuth({
        isAuthenticated: true,
        user: { ...TEST_USER, displayName: longName },
      })
    );

    // SMA-56: the ruling's motivating case — unbounded user data may never
    // displace the trigger. The span clips; the title recovers the full text.
    const span = screen.getByText(longName);
    expect(span).toHaveAttribute('title', longName);
    expect(span).toHaveStyle({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });

    const language = screen.getByRole('button', { name: 'Change language' });
    const cluster = language.parentElement!;
    expect(cluster.lastElementChild).toBe(language);
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
