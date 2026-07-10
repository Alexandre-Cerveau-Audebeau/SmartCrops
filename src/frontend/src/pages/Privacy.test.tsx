import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import Privacy from './Privacy';

function renderPage() {
  return render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Privacy (SMA-35)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders the real controller, cookie inventory and date in English (mobile: stacked cards)', () => {
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cookies' })
    ).toBeInTheDocument();
    // jsdom matchMedia matches=false → mobile variant: card per processing row.
    expect(screen.getByText('User account')).toBeInTheDocument();
    expect(screen.getByText('Alexandre Cerveau Audebeau')).toBeInTheDocument();
    // SMA-157: the cookie table carries the audited real inventory.
    expect(screen.getByText('smartcrops_token')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('sc_cookie_notice_ack')).toBeInTheDocument();
    // Newsletter has no backend: its rows are gone from the page.
    expect(screen.queryByText(/Newsletter/)).not.toBeInTheDocument();
    expect(screen.getByText(/July 10, 2026/)).toBeInTheDocument();
    // SMA-157 regression: no unresolved [À REMPLIR/CONFIRMER/ACTIVER] marker.
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
  });

  it('renders the real content in French', async () => {
    await i18next.changeLanguage('fr');
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Politique de confidentialité',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Compte utilisateur')).toBeInTheDocument();
    expect(screen.getByText('smartcrops_token')).toBeInTheDocument();
    expect(screen.getByText('7 jours')).toBeInTheDocument();
    expect(screen.getByText(/10 juillet 2026/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
  });

  it('renders real tables on desktop (md+)', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    renderPage();
    expect(
      screen.getByRole('table', {
        name: 'Data collected, purposes and legal bases',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Cookies and local storage used' })
    ).toBeInTheDocument();
  });
});
