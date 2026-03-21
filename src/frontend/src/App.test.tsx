import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('renders the Get started heading', () => {
    render(<App />);
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });

  it('renders the counter button', () => {
    render(<App />);
    expect(screen.getByText(/Count is/)).toBeInTheDocument();
  });
});
