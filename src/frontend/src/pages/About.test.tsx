import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import About from './About';

function renderAbout() {
  return render(
    <MemoryRouter>
      <About />
    </MemoryRouter>
  );
}

describe('About (SMA-36)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders the hero title, the four pillars and the CTA links (EN)', () => {
    renderAbout();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Growing a smarter way to garden',
      })
    ).toBeInTheDocument();
    [
      'Plant Library',
      'Garden Planner',
      'Bilingual',
      'Intelligence to come',
    ].forEach((title) => {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse Library' })
    ).toHaveAttribute('href', '/library');
    expect(
      screen.getByRole('link', { name: 'Create Account' })
    ).toHaveAttribute('href', '/register');
  });

  it('renders in French', async () => {
    await i18next.changeLanguage('fr');
    renderAbout();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Cultiver le jardin, en plus intelligent',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: "L'intelligence à venir" })
    ).toBeInTheDocument();
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument();
  });
});
