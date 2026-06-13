import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import Shop from './Shop';

function renderShop() {
  return render(
    <MemoryRouter>
      <Shop />
    </MemoryRouter>
  );
}

describe('Shop placeholder (SMA-150 footer half)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders the title, Coming Soon and a back-to-library CTA (EN)', () => {
    renderShop();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Shop' })
    ).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse the library' })
    ).toHaveAttribute('href', '/library');
  });

  it('renders in French', async () => {
    await i18next.changeLanguage('fr');
    renderShop();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Boutique' })
    ).toBeInTheDocument();
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument();
  });
});
