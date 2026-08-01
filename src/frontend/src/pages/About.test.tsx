import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import type { AuthUser } from '../types/Auth';

// SMA-360: the CTA reads auth state; AuthProvider gets it from fetchMe.
vi.mock('../services/authApi', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

import About from './About';
import { fetchMe } from '../services/authApi';

const signedInUser: AuthUser = {
  userId: 'u-1',
  email: 'user@example.com',
  displayName: 'User',
  isAdmin: false,
};

function renderAbout() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <About />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('About (SMA-36)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(fetchMe).mockRejectedValue(new Error('Not authenticated'));
    await i18next.changeLanguage('en');
  });

  it('renders the hero title, the four pillars and the CTA links (EN)', async () => {
    renderAbout();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Growing a smarter way to garden',
      })
    ).toBeInTheDocument();
    [
      'Plant Library',
      'Garden Planner',
      'Bilingual',
      'Intelligence to come',
    ].forEach((title) => {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse Library' })
    ).toHaveAttribute('href', '/library');
    // findBy*: the second action stays in reserve until auth resolves (SMA-360).
    expect(
      await screen.findByRole('link', { name: 'Create Account' })
    ).toHaveAttribute('href', '/register');
  });

  // SMA-353 — About is where the homepage's assistant card sends the visitor,
  // so the explanation has to be here, and it has to stay the user's assistant.
  it('explains the assistant connection inside the Intelligence pillar (SMA-359)', () => {
    const { container } = renderAbout();

    const pillar = screen
      .getByRole('heading', { name: 'Intelligence to come' })
      .closest('.MuiCard-root') as HTMLElement;

    // What it lets you do — named assistants, in the conversation you own.
    expect(pillar.textContent).toMatch(/Claude, ChatGPT, Gemini or Mistral/);
    // What it does NOT do — keys never reach us, least privilege, not the account.
    expect(pillar.textContent).toMatch(/never receives them/i);
    expect(pillar.textContent).toMatch(/never your account/i);
    // Why it beats an embedded chatbot.
    expect(pillar.textContent).toMatch(
      /keep your assistant, your subscription and your history/i
    );

    // No date, no quarter, no "soon" beyond the badge itself.
    expect(pillar.textContent).not.toMatch(/\b20\d\d\b|\bQ[1-4]\b/);

    // And never framed as our AI.
    const text = container.textContent ?? '';
    for (const banned of ['AI-powered', 'AI powered', 'powered by AI', 'our AI']) {
      expect(text).not.toContain(banned);
    }
  });

  it('is signed, without a biography (SMA-353)', () => {
    renderAbout();
    expect(
      screen.getByText('Designed and built by Alexandre Cerveau-Audebeau.')
    ).toBeInTheDocument();
  });

  it('lists Typesense among the current stack chips', () => {
    renderAbout();
    expect(screen.getByText('Typesense')).toBeInTheDocument();
  });

  // SMA-360 — the CTA stopped offering an account to people who have one.
  it('sends a signed-in visitor to their gardens instead of a signup', async () => {
    vi.mocked(fetchMe).mockResolvedValue(signedInUser);
    renderAbout();

    expect(
      await screen.findByRole('link', { name: 'My Gardens' })
    ).toHaveAttribute('href', '/gardens');
    expect(
      screen.queryByRole('link', { name: 'Create Account' })
    ).not.toBeInTheDocument();
    // The other action is untouched — the pair keeps both its buttons.
    expect(screen.getByRole('link', { name: 'Browse Library' })).toHaveAttribute(
      'href',
      '/library'
    );
  });

  it('reserves the CTA slot while auth is unknown', async () => {
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {}));
    const { container } = renderAbout();

    await waitFor(() => expect(vi.mocked(fetchMe)).toHaveBeenCalled());
    expect(
      screen.queryByRole('link', { name: 'Create Account' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'My Gardens' })
    ).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/register"]')).toHaveStyle({
      visibility: 'hidden',
    });
  });

  it('does not claim bilingual plant descriptions', () => {
    renderAbout();
    expect(screen.queryByText(/bilingual descriptions/i)).not.toBeInTheDocument();
    // The language truth lives in the Bilingual pillar, said once.
    const pillar = screen
      .getByRole('heading', { name: 'Bilingual' })
      .closest('.MuiCard-root') as HTMLElement;
    expect(pillar.textContent).toMatch(/their descriptions are in English/i);
  });

  it('renders in French', async () => {
    await i18next.changeLanguage('fr');
    renderAbout();
    // findBy* retries until React flushes the language change (de-flakes R19).
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Cultiver le jardin, en plus intelligent',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: "L'intelligence à venir" })
    ).toBeInTheDocument();
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument();
    expect(
      screen.getByText('Conçu et développé par Alexandre Cerveau-Audebeau.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/leurs descriptions sont en anglais/i)
    ).toBeInTheDocument();
  });
});
