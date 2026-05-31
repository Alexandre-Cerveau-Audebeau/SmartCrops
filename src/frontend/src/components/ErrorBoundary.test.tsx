import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/i18n';
import { ErrorBoundary } from './ErrorBoundary';

// A child that always throws during render, to drive the boundary's error path.
function Boom(): never {
  throw new Error('SMA-73 boom');
}

beforeEach(async () => {
  // Pin the locale so the fallback's translated strings are deterministic.
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('catches a render-time throw and shows the translated fallback (role="alert")', () => {
    // React still logs the caught error to console.error in dev; silence the
    // expected noise so the test output stays clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
  });

  it('passes children through untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>healthy child</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('healthy child')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
