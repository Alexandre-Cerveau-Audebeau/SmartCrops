import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../../i18n/i18n';
import Footer from './Footer';

describe('Footer legal links (SMA-35)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('points Privacy / Legal Notice / Terms of Use to their routes', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
    expect(screen.getByRole('link', { name: 'Legal Notice' })).toHaveAttribute(
      'href',
      '/legal-notice'
    );
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute(
      'href',
      '/terms'
    );
  });

  it('points About Us / Contact to their routes (SMA-36)', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'About Us' })).toHaveAttribute(
      'href',
      '/about'
    );
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/contact'
    );
  });
});
