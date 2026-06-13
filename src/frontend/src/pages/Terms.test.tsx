import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import Terms from './Terms';

function renderPage() {
  return render(
    <MemoryRouter>
      <Terms />
    </MemoryRouter>
  );
}

describe('Terms (SMA-35)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders title, sections and placeholder chips in English', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Use' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Governing law' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/OPTION/).length).toBeGreaterThan(0);
  });

  it('keeps the botanical-data disclaimer (information, not prescription)', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /information, not prescription/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Under no circumstances does it constitute medical, veterinary/
      )
    ).toBeInTheDocument();
  });

  it('renders in French with the full disclaimer', async () => {
    await i18next.changeLanguage('fr');
    renderPage();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "Conditions générales d'utilisation (CGU)",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /information, pas prescription/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /ne constituent en aucun cas un avis médical, vétérinaire/
      )
    ).toBeInTheDocument();
  });
});
