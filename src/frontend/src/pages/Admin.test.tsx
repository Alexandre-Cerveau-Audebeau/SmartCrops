import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { HttpStatusError } from '../services/httpStatusError';
import type {
  AdminDashboardStats,
  AdminUserListItem,
  PagedResponse,
} from '../types/Admin';
import type { AuthUser } from '../types/Auth';

vi.mock('../services/adminApi', () => ({
  fetchAdminStats: vi.fn(),
  fetchAdminUsers: vi.fn(),
}));
vi.mock('../services/authApi', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

import Admin from './Admin';
import { fetchAdminStats, fetchAdminUsers } from '../services/adminApi';
import { fetchMe } from '../services/authApi';

// SMA-414 locks (Profile.test pattern: mocked services, real providers):
// loading skeletons keep the static labels; loaded data fills the counters,
// the rows, the icon+text badges and the « you » tag; D5 page sizing and the
// bar; the error card retries BOTH calls; an API 403 becomes the forbidden
// state; mobile swaps the table for cards.

const ADMIN: AuthUser = {
  userId: 'u-admin',
  email: 'admin@example.com',
  displayName: 'O2BO',
  isAdmin: true,
};

const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

const STATS: AdminDashboardStats = {
  totalUsers: 9,
  newUsersLast7Days: 2,
  newUsersLast30Days: 6,
  gardensCount: 8,
  latestGardenCreatedAt: iso(DAY),
  placementsCount: 214,
  usersWithAtLeastOneGarden: 5,
};

const USERS: PagedResponse<AdminUserListItem> = {
  items: [
    {
      id: 'u-lea',
      email: 'lea.fontaine@example.com',
      displayName: 'Léa Fontaine',
      createdAt: iso(DAY),
      emailConfirmed: true,
      hasPassword: false,
      hasGoogleLogin: true,
    },
    {
      id: 'u-marc',
      email: 'marc.delorme@example.com',
      displayName: 'Marc Delorme',
      createdAt: iso(4 * DAY),
      emailConfirmed: false,
      hasPassword: true,
      hasGoogleLogin: false,
    },
    {
      id: 'u-admin',
      email: 'admin@example.com',
      displayName: 'O2BO',
      createdAt: null, // predates migration 30 (D1)
      emailConfirmed: true,
      hasPassword: true,
      hasGoogleLogin: false,
    },
  ],
  page: 1,
  pageSize: 100,
  total: 3,
};

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

function renderAdmin(user: AuthUser = ADMIN) {
  vi.mocked(fetchMe).mockResolvedValue(user);
  return render(
    <LanguageProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/" element={<div>HOME PAGE</div>} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  // SMA-393: default is French — pin English the way a returning visitor sets it.
  localStorage.setItem('smartcrops-language', 'en');
  setMatchMedia(false); // desktop unless a test says otherwise
  vi.mocked(fetchAdminStats).mockResolvedValue(STATS);
  vi.mocked(fetchAdminUsers).mockResolvedValue(USERS);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Admin page (SMA-414)', () => {
  it('shows skeletons (busy) with the static labels while loading', () => {
    vi.mocked(fetchAdminStats).mockReturnValue(
      new Promise<AdminDashboardStats>(() => {})
    );
    const { container } = renderAdmin();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Administration' })
    ).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Users' })
    ).toBeInTheDocument();
    expect(screen.getByText('Sort: registration, newest first')).toBeInTheDocument();
    expect(screen.getByText('Registration')).toBeInTheDocument();
    expect(screen.queryByText('Léa Fontaine')).toBeNull();
  });

  it('renders the counters, the rows, the badges and the « you » tag once loaded', async () => {
    renderAdmin();

    expect(await screen.findByText('Léa Fontaine')).toBeInTheDocument();
    // D5: 9 accounts ≤ 100 → one page of 100, no pagination bar.
    expect(fetchAdminUsers).toHaveBeenCalledWith(1, 100, expect.anything());
    expect(screen.queryByRole('navigation')).toBeNull();
    // Header meta + tiles.
    expect(
      screen.getByText(/^9 users · 8 gardens · 214 placements — data as of /)
    ).toBeInTheDocument();
    expect(screen.getByText('Admin role · O2BO')).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.getByText(/over 7 days/)).toBeInTheDocument();
    expect(screen.getByText('most recent created yesterday')).toBeInTheDocument();
    expect(screen.getByText('across the 8 gardens')).toBeInTheDocument();
    expect(screen.getByText('i.e. 56% of users')).toBeInTheDocument();
    // Rows: name + e-mail, icon+text badges.
    expect(screen.getByText('lea.fontaine@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Confirmed')).toHaveLength(2);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getAllByText('Local')).toHaveLength(2);
    // Long date + relative wording; a pre-migration account (null createdAt).
    expect(screen.getByText('yesterday')).toBeInTheDocument();
    expect(
      screen.getByText('Registered before September 3, 2026')
    ).toBeInTheDocument();
    // « you » on the admin's own row only.
    const you = screen.getAllByText('you');
    expect(you).toHaveLength(1);
    expect(you[0]!.closest('tr')).toHaveTextContent('O2BO');
    expect(screen.getByText('3 accounts')).toBeInTheDocument();
    expect(screen.getByText(/^Minimal display \(GDPR\)/)).toBeInTheDocument();
  });

  it('paginates above 100 accounts: 25 per page, the bar, next page (D5)', async () => {
    const page1: PagedResponse<AdminUserListItem> = {
      ...USERS,
      pageSize: 25,
      total: 127,
    };
    const page2: PagedResponse<AdminUserListItem> = {
      items: [
        {
          ...USERS.items[0]!,
          id: 'u-p2',
          displayName: 'Page Two',
          email: 'p2@example.com',
        },
      ],
      page: 2,
      pageSize: 25,
      total: 127,
    };
    vi.mocked(fetchAdminStats).mockResolvedValue({ ...STATS, totalUsers: 127 });
    vi.mocked(fetchAdminUsers)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    renderAdmin();

    expect(await screen.findByText('1–25 of 127')).toBeInTheDocument();
    expect(fetchAdminUsers).toHaveBeenCalledWith(1, 25, expect.anything());
    expect(screen.getByText('Page 1 / 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Page Two')).toBeInTheDocument();
    expect(fetchAdminUsers).toHaveBeenLastCalledWith(2, 25, expect.anything());
    expect(screen.getByText('26–50 of 127')).toBeInTheDocument();
    expect(screen.getByText('Page 2 / 6')).toBeInTheDocument();
    expect(fetchAdminStats).toHaveBeenCalledTimes(1);
  });

  it('shows the error card and « Retry » re-runs BOTH calls', async () => {
    vi.mocked(fetchAdminStats).mockRejectedValueOnce(new Error('network down'));
    renderAdmin();

    expect(await screen.findByText('Unable to load data')).toBeInTheDocument();
    expect(fetchAdminUsers).not.toHaveBeenCalled();
    // Title and chips stay (A3), the counters do not.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('214')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Léa Fontaine')).toBeInTheDocument();
    expect(fetchAdminStats).toHaveBeenCalledTimes(2);
    expect(fetchAdminUsers).toHaveBeenCalledTimes(1);
  });

  it('turns an API 403 into the forbidden state, without the admin chrome', async () => {
    vi.mocked(fetchAdminStats).mockRejectedValue(
      new HttpStatusError('Request failed (403)', 403)
    );
    renderAdmin();

    expect(await screen.findByText('Restricted access')).toBeInTheDocument();
    expect(screen.getByText('HTTP 403')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('renders cards instead of the table under the md breakpoint', async () => {
    setMatchMedia(true);
    renderAdmin();

    expect(await screen.findByText('Léa Fontaine')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('newest first')).toBeInTheDocument();
    expect(screen.getByText('Admin role')).toBeInTheDocument();
    expect(
      screen.getByText('9 users · 8 gardens · 214 placements')
    ).toBeInTheDocument();
    expect(screen.getByText('≥ 1 garden')).toBeInTheDocument();
  });
});
