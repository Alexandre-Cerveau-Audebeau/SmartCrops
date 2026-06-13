import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import LegalNotice from './LegalNotice';

function renderPage() {
  return render(
    <MemoryRouter>
      <LegalNotice />
    </MemoryRouter>
  );
}

describe('LegalNotice (SMA-35)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders title, sections and placeholder chips in English, with the courtesy notice', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Legal Notice' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hosting' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/À REMPLIR/).length).toBeGreaterThan(0);
    expect(screen.getByText(/the French version prevails/)).toBeInTheDocument();
  });

  it('renders in French without the courtesy notice', async () => {
    await i18next.changeLanguage('fr');
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mentions légales' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hébergement' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/À REMPLIR/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/the French version prevails/)
    ).not.toBeInTheDocument();
  });

  it('renders both LCEN publisher options (A and B)', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /Option A/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Option B/ })
    ).toBeInTheDocument();
  });
});
