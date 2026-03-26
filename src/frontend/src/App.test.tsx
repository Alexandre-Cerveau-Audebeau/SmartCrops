import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('renders the navbar brand name', () => {
    render(<App />);
    expect(screen.getAllByText('SmartCrops')).toHaveLength(2);
  });

  it('renders the Library nav link', () => {
    render(<App />);
    // "Library" appears in both Navbar and Footer
    expect(screen.getAllByRole('link', { name: 'Library' })).toHaveLength(2);
  });
});
