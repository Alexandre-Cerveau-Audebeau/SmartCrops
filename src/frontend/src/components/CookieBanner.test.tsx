import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import CookieBanner from './CookieBanner';

const STORAGE_KEY = 'sc_cookie_notice_ack';

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieBanner />
    </MemoryRouter>
  );
}

describe('CookieBanner (SMA-35)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18next.changeLanguage('en');
  });

  it('is visible without the ack key and links to /privacy', () => {
    renderBanner();
    expect(
      screen.getByRole('region', { name: 'Cookie information' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it('hides and stores the versioned ack key on OK', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(
      screen.queryByRole('button', { name: 'OK' })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('v1');
  });

  it('does not render on mount when the ack key is already stored', () => {
    localStorage.setItem(STORAGE_KEY, 'v1');
    renderBanner();
    expect(
      screen.queryByRole('button', { name: 'OK' })
    ).not.toBeInTheDocument();
  });
});
