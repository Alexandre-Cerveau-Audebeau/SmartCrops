import { createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import CookieBanner, {
  COOKIE_NOTICE_ACK_VALUE,
  COOKIE_NOTICE_STORAGE_KEY,
} from './CookieBanner';

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
    // SMA-277: the copy discloses the real preference inventory.
    expect(
      screen.getByText(/display preferences \(language, theme, units\)/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it('discloses the real preference inventory in French', async () => {
    await i18next.changeLanguage('fr');
    renderBanner();
    expect(
      screen.getByText(/préférences d'affichage \(langue, thème, unités\)/)
    ).toBeInTheDocument();
  });

  it('layers strictly below MUI drawers and modals (SMA-272)', () => {
    renderBanner();
    // The banner used to sit at snackbar tier and masked the mobile filters
    // Drawer's sticky footer; the contract is "strictly below the drawer
    // tier", derived from the same source the component resolves.
    const expectedZ = createTheme().zIndex.drawer - 1; // same default tiers the component resolves (app doesn't customize zIndex)
    const paper = screen
      .getByText(/display preferences/)
      .closest('.MuiPaper-root');
    expect(paper).not.toBeNull();
    expect(getComputedStyle(paper as Element).zIndex).toBe(String(expectedZ));
  });

  it('hides and stores the versioned ack key on OK', async () => {
    const user = userEvent.setup();
    renderBanner();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(
      screen.queryByRole('button', { name: 'OK' })
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY)).toBe(
      COOKIE_NOTICE_ACK_VALUE
    );
  });

  it('does not render on mount when the ack key is already stored', () => {
    localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, COOKIE_NOTICE_ACK_VALUE);
    renderBanner();
    expect(
      screen.queryByRole('button', { name: 'OK' })
    ).not.toBeInTheDocument();
  });
});
