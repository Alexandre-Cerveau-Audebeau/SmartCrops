import { render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import App from './App';

vi.mock('./services/plantApi', () => ({
  fetchPlants: vi.fn().mockResolvedValue([]),
  fetchPlantTypes: vi.fn().mockResolvedValue([]),
}));

vi.mock('./services/authApi', () => ({
  fetchMe: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  login: vi.fn().mockResolvedValue(undefined),
  register: vi.fn().mockResolvedValue(undefined),
  exchangeCode: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
}));

describe('App', () => {
  // App mounts a BrowserRouter, so a route is exercised by setting the URL
  // before render. Restore it afterwards or the next test starts off-route.
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders without crashing', () => {
    render(<App />);
  });

  it('renders the navbar brand name', () => {
    render(<App />);
    expect(screen.getAllByText('SmartCrops').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Library and Shop nav links (navbar + footer)', () => {
    render(<App />);
    // Both Library and Shop appear once in the Navbar and once in the Footer.
    expect(screen.getAllByRole('link', { name: 'Library' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Shop' })).toHaveLength(2);
  });

  // SMA-394 — the hidden plant's own page. Asserted against App's REAL route
  // table (not a hand-rolled MemoryRouter) so the static route really does win
  // over the dynamic /library/:id that follows it; otherwise the slug would
  // fall through to PlantDetail, which would fetch an id that does not exist.
  it('routes the hidden plant slug to its own page (SMA-394)', () => {
    window.history.pushState(
      {},
      '',
      '/library/erina-j-mon-coeur-since-october-31-2024'
    );

    render(<App />);

    // A line that exists only in the local content module.
    expect(
      screen.getByText('Would you like to live with me?')
    ).toBeInTheDocument();
  });
});
