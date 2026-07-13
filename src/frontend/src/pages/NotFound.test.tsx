import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import NotFound from './NotFound';

function renderPage() {
  return render(
    <MemoryRouter>
      <NotFound />
    </MemoryRouter>
  );
}

describe('NotFound (Wave-1 T3)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders the 404 hero title and the home CTA in English', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: '404' })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Oops — looks like this page didn't sprout.")
    ).toBeInTheDocument();
    // The MUI Buttons render as router <a>s, so the CTAs surface as links.
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(
      screen.getByRole('link', { name: 'Browse the Library' })
    ).toHaveAttribute('href', '/library');
  });

  it('renders the localized title in French', async () => {
    await i18next.changeLanguage('fr');
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: '404' })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Oups — on dirait que cette page n'a pas germé.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Retour à l'accueil" })
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: 'Parcourir la bibliothèque' })
    ).toHaveAttribute('href', '/library');
  });
});
