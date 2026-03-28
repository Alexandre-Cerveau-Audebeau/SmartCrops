import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

vi.mock('./services/plantApi', () => ({
  fetchPlants: vi.fn().mockResolvedValue([]),
  fetchPlantTypes: vi.fn().mockResolvedValue([]),
  searchPlants: vi.fn().mockResolvedValue([]),
  exchangeCode: vi.fn().mockResolvedValue({ token: '' }),
}));

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('renders the navbar brand name', () => {
    render(<App />);
    expect(screen.getAllByText('SmartCrops').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Library nav link', () => {
    render(<App />);
    // "Library" appears in both Navbar and Footer
    expect(screen.getAllByRole('link', { name: 'Library' })).toHaveLength(2);
  });
});
