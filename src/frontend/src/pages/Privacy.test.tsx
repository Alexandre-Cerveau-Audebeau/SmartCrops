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

  it('renders title, sections and placeholder chips in English (mobile: stacked cards)', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cookies' })
    ).toBeInTheDocument();
    // jsdom matchMedia matches=false → mobile variant: card per processing row.
    expect(screen.getByText('User account')).toBeInTheDocument();
    expect(screen.getAllByText(/À CONFIRMER/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/À ACTIVER/).length).toBeGreaterThan(0);
  });

  it('renders in French', async () => {
    await i18next.changeLanguage('fr');
    renderPage();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Politique de confidentialité',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Compte utilisateur')).toBeInTheDocument();
    expect(screen.getAllByText(/À REMPLIR/).length).toBeGreaterThan(0);
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
