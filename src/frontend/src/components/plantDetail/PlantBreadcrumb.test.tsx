import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { PlantBreadcrumb } from './PlantBreadcrumb';

// Stabilise the locale so the localized aria-label assertion is deterministic.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});

const BASE = {
  libraryLabel: 'Library',
  libraryHref: '/library',
  typeLabel: 'Fruiting vegetable' as string | null,
  currentLabel: 'Tomato',
};

function renderBreadcrumb(overrides: Partial<typeof BASE> = {}) {
  const props = { ...BASE, ...overrides };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );
  return render(<PlantBreadcrumb {...props} />, { wrapper });
}

describe('PlantBreadcrumb (SMA-246)', () => {
  it('links the Library segment to /library', () => {
    renderBreadcrumb();
    const link = screen.getByRole('link', { name: 'Library' });
    expect(link).toHaveAttribute('href', '/library');
  });

  it('renders the type segment as plain text (not a link) when provided', () => {
    renderBreadcrumb();
    expect(screen.getByText('Fruiting vegetable')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Fruiting vegetable' })
    ).toBeNull();
  });

  it('omits the type segment when typeLabel is null', () => {
    renderBreadcrumb({ typeLabel: null });
    expect(screen.queryByText('Fruiting vegetable')).toBeNull();
    // Library + current still present (2-segment breadcrumb).
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Tomato')).toBeInTheDocument();
  });

  it('marks the current segment with aria-current="page" and not a link', () => {
    renderBreadcrumb();
    const current = screen.getByText('Tomato');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Tomato' })).toBeNull();
  });
});
