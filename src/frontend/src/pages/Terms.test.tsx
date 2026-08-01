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

  it('renders title, sections and the real date in English', () => {
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Use' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Governing law' })
    ).toBeInTheDocument();
    expect(screen.getByText(/August 1, 2026/)).toBeInTheDocument();
    // SMA-157 regression: no unresolved [À REMPLIR/CONFIRMER/ACTIVER] marker.
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
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

  it('renders in French with the full disclaimer and the real date', async () => {
    await i18next.changeLanguage('fr');
    const { container } = renderPage();
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
    expect(screen.getByText(/1er août 2026/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
  });
});
