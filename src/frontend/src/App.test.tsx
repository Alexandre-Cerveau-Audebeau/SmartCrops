import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
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
  beforeEach(() => {
    // Each test states its visitor: no key = first visit (SMA-393).
    localStorage.removeItem('smartcrops-language');
  });

  it('renders without crashing', () => {
    render(<App />);
  });

  it('renders the navbar brand name', () => {
    render(<App />);
    expect(screen.getAllByText('SmartCrops').length).toBeGreaterThanOrEqual(1);
  });

  it('a first visit with no stored choice lands in French — nav links + document lang (SMA-393)', async () => {
    render(<App />);
    // Both links appear once in the Navbar and once in the Footer.
    expect(
      await screen.findAllByRole('link', { name: 'Bibliothèque' })
    ).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Boutique' })).toHaveLength(2);
    expect(document.documentElement.lang).toBe('fr');
  });

  it('a stored "en" keeps the site in English end-to-end (SMA-393)', async () => {
    localStorage.setItem('smartcrops-language', 'en');
    render(<App />);
    expect(
      await screen.findAllByRole('link', { name: 'Library' })
    ).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Shop' })).toHaveLength(2);
    expect(document.documentElement.lang).toBe('en');
  });
});
