import { cleanup, render, screen, within } from '@testing-library/react';
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
  // Unmount FIRST (SMA-452 § 13): the page reads the stubbed `matchMedia`
  // until it is gone — only then is the stub dropped.
  cleanup();
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
    expect(screen.getByText('auth_binding')).toBeInTheDocument();
    expect(screen.getByText('smartcrops-color-mode')).toBeInTheDocument();
    expect(screen.getByText('smartcrops.unitSystem')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('2 minutes')).toBeInTheDocument();
    expect(screen.getByText('sc_cookie_notice_ack')).toBeInTheDocument();
    // Newsletter has no backend: its rows are gone from the page.
    expect(screen.queryByText(/Newsletter/)).not.toBeInTheDocument();
    // The policy's own date (SMA-448): the day of its change for the formulas.
    expect(screen.getByText(/October 1, 2026/)).toBeInTheDocument();
    // SMA-441: the garden-location section names its processor.
    expect(
      screen.getByRole('heading', { name: 'Location of your gardens' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Zoomash Ltd/).length).toBeGreaterThan(0);
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
    // FR mirror of the EN inventory lock — fr.json is independently editable.
    expect(screen.getByText('auth_binding')).toBeInTheDocument();
    expect(screen.getByText('smartcrops-color-mode')).toBeInTheDocument();
    expect(screen.getByText('smartcrops.unitSystem')).toBeInTheDocument();
    expect(screen.getByText('7 jours')).toBeInTheDocument();
    expect(screen.getByText('2 minutes')).toBeInTheDocument();
    expect(screen.getByText('sc_cookie_notice_ack')).toBeInTheDocument();
    expect(screen.getByText(/1er octobre 2026/)).toBeInTheDocument();
    // SMA-441, FR mirror.
    expect(
      screen.getByRole('heading', { name: 'Localisation de vos jardins' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Zoomash Ltd/).length).toBeGreaterThan(0);
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

// SMA-448 — the formulas in the policy, the text of « SMA-448 - CGU et
// confidentialité - texte final.md » (§ 3): the row « Formula and dashboard
// layout », the two data the gardens gained, the retention of the layouts,
// what the export leaves out, and the policy's own date (T7).
describe('the formulas in the policy (SMA-448)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('in English: the formula row, the gardens’ two new data, the retention of the layouts, the export without the layout, the date of the change', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';

    expect(screen.getByText('Formula and dashboard layout')).toBeInTheDocument();
    expect(text).toContain('Your formula (Novice, Gardener or Expert) and the date of your latest choice;');
    expect(text).toContain('the date you last opened each garden, the rank of each in your custom order if you set one');
    expect(text).toContain(
      'Formula, date of choice and dashboard layouts — lifetime of the account; erased with it, under the same conditions as the account and its content.'
    );
    expect(text).toContain("your dashboard layout, including its widgets' settings, is not included");
    expect(screen.getByText(/October 1, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/September 22, 2026/)).toBeNull();
  });

  it('en français : la ligne de la formule, les deux données des jardins, la conservation des dispositions, l’export sans la disposition, la date du changement', async () => {
    await i18next.changeLanguage('fr');
    const { container } = renderPage();
    const text = container.textContent ?? '';

    expect(screen.getByText('Formule et disposition du tableau de bord')).toBeInTheDocument();
    expect(text).toContain('Votre formule (Novice, Jardinier ou Expert) et la date de votre dernier choix ;');
    expect(text).toContain(
      'date de votre dernière ouverture de chaque jardin, rang de chacun dans votre ordre personnalisé si vous en définissez un'
    );
    expect(text).toContain(
      'Formule, date du choix et dispositions du tableau de bord — durée de vie du compte ; effacées avec lui, dans les mêmes conditions que le compte et ses contenus.'
    );
    expect(text).toContain("la disposition de votre tableau de bord, réglages de ses widgets compris, n'y figure pas");
    expect(screen.getByText(/1er octobre 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/22 septembre 2026/)).toBeNull();
  });

  it('places the formula row between « Profile » and « Created content » (desktop table)', () => {
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
    const table = screen.getByRole('table', { name: 'Data collected, purposes and legal bases' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]!.textContent);

    expect(names.slice(0, 5)).toEqual([
      'User account',
      'Google sign-in (optional)',
      'Profile (optional)',
      'Formula and dashboard layout',
      'Created content',
    ]);
  });
});
