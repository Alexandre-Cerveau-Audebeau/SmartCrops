import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { AuthUser } from '../types/Auth';

vi.mock('../services/plantApi', () => ({
  fetchPlants: vi.fn(),
}));
// SMA-360: the page reads auth state, and AuthProvider gets it from fetchMe —
// the same seam Profile.test drives, so an authenticated render is a resolved
// fetchMe and an anonymous one is a rejected fetchMe.
vi.mock('../services/authApi', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

import Home from './Home';
import { fetchPlants } from '../services/plantApi';
import { fetchMe } from '../services/authApi';

const signedInUser: AuthUser = {
  userId: 'u-1',
  email: 'user@example.com',
  displayName: 'User',
  isAdmin: false,
};

// SMA-353 — this suite exists to keep the public page honest. Each pin below
// stands for a claim the 01/08 audit found false or stale; a regression here
// means the homepage started overstating the product again.
//
// jsdom has no matchMedia and MUI's useMediaQuery drives the testimonials
// carousel's items-per-page. Desktop is stubbed once for the whole suite.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderHome() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <AuthProvider>
          <Home />
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

/**
 * Waits out the plant fetch only. Reserved for the tests that deliberately
 * leave auth pending — everything else must also settle the auth promise, or
 * React updates state outside act() after the test has returned (R3).
 */
async function renderHomeSettled() {
  const result = renderHome();
  await waitFor(() => expect(vi.mocked(fetchPlants)).toHaveBeenCalled());
  return result;
}

/** Renders with auth resolved to a visitor without an account. */
async function renderHomeAnonymous() {
  const result = await renderHomeSettled();
  await screen.findByRole('link', { name: 'Create Account' });
  return result;
}

/** Renders with auth resolved to a signed-in visitor. */
async function renderHomeSignedIn() {
  vi.mocked(fetchMe).mockResolvedValue(signedInUser);
  const result = await renderHomeSettled();
  await screen.findByRole('link', { name: 'My Gardens' });
  return result;
}

describe('Home — the page says only what ships (SMA-353)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockMatchMedia(false);
    vi.mocked(fetchPlants).mockResolvedValue([]);
    // Anonymous unless a test says otherwise: fetchMe rejects for a visitor
    // with no session, exactly as the real endpoint 401s.
    vi.mocked(fetchMe).mockRejectedValue(new Error('Not authenticated'));
    // LanguageProvider re-applies its own language on mount, so the locale has
    // to be set the way a returning visitor sets it, not on i18next directly.
    // SMA-393: the no-choice default is French now, so English is stored.
    localStorage.setItem('smartcrops-language', 'en');
    await i18next.changeLanguage('en');
  });

  it('renders NOTHING for testimonials while the source is empty', async () => {
    await renderHomeAnonymous();

    // No heading, no carousel, no hollow frame: the section is absent, not
    // empty. The i18n key survives for SMA-356; nothing renders it today.
    expect(
      screen.queryByRole('heading', { name: 'What Our Users Say' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Previous testimonials' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next testimonials' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tablist', { name: 'Testimonial pages' })
    ).not.toBeInTheDocument();
  });

  it('names no invented reviewer', async () => {
    await renderHomeAnonymous();

    // The nine people who never existed. Naming them here is the point: if a
    // literal ever comes back, this fails.
    for (const name of [
      'Marie L.',
      'Thomas C.',
      'Sarah E.',
      'Pierre D.',
      'Emma W.',
      'Lucas M.',
      'Isabelle R.',
      'James K.',
      'Clara B.',
    ]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
  });

  it('does not badge the virtual garden or the planner as forthcoming', async () => {
    await renderHomeAnonymous();

    for (const title of ['Virtual Garden', 'Garden Planner']) {
      const card = screen
        .getByRole('heading', { name: title })
        .closest('.MuiCard-root');
      expect(card).not.toBeNull();
      expect(
        within(card as HTMLElement).queryByText('Coming Soon')
      ).not.toBeInTheDocument();
    }
  });

  it('keeps the badge on what genuinely has not shipped', async () => {
    await renderHomeAnonymous();

    // Smart Monitoring (weather + IoT) and the assistant connection — two out
    // of six cards, the ceiling agreed for this grid.
    expect(screen.getAllByText('Coming Soon')).toHaveLength(2);
    for (const title of ['Smart Monitoring', 'Bring your own assistant']) {
      const card = screen
        .getByRole('heading', { name: title })
        .closest('.MuiCard-root');
      expect(
        within(card as HTMLElement).getByText('Coming Soon')
      ).toBeInTheDocument();
    }
  });

  it('offers the assistant card with a route to the explanation (SMA-359)', async () => {
    await renderHomeAnonymous();

    const card = screen
      .getByRole('heading', { name: 'Bring your own assistant' })
      .closest('.MuiCard-root') as HTMLElement;
    // Visible label stays short; the accessible name is what changed (R3).
    const link = within(card).getByRole('link', {
      name: 'Learn more — Bring your own assistant',
    });
    expect(link).toHaveAttribute('href', '/about');
    expect(link).toHaveTextContent('Learn more');
  });

  // R3 — the cookie banner offers its own "Learn more", to /privacy, on the
  // same first visit. Two links answering to one name are indistinguishable in
  // a screen reader's link list, so this pins the difference rather than the
  // wording.
  it('does not answer to the same accessible name as the cookie banner', async () => {
    await renderHomeAnonymous();

    // Nothing on the page may be reachable by the bare label any more.
    expect(
      screen.queryByRole('link', { name: 'Learn more' })
    ).not.toBeInTheDocument();

    const assistantLink = screen.getByRole('link', {
      name: 'Learn more — Bring your own assistant',
    });
    // cookies.learnMore, the label this used to collide with, verbatim.
    expect(i18next.t('cookies.learnMore')).toBe('Learn more');
    expect(
      assistantLink.getAttribute('aria-label')
    ).not.toBe(i18next.t('cookies.learnMore'));
  });

  it('names the assistant link in French too', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    renderHome();
    // The assistant link renders whatever auth says, so awaiting it alone would
    // leave fetchMe pending past the end of the test (R4). The CTA is the
    // signal that auth resolved — the same one the other French tests use.
    await screen.findByRole('link', { name: 'Créer un compte' });

    const link = await screen.findByRole('link', {
      name: 'En savoir plus — Branchez votre propre assistant',
    });
    expect(link).toHaveAttribute('href', '/about');
    expect(link).toHaveTextContent('En savoir plus');
  });

  it('never calls the assistant connection our own AI', async () => {
    const { container } = await renderHomeAnonymous();

    // The differentiator IS that the assistant is the visitor's, already paid
    // for. Generic "AI-powered" phrasing would erase it — and the privacy
    // argument with it.
    const text = container.textContent ?? '';
    for (const banned of ['AI-powered', 'AI powered', 'powered by AI', 'our AI']) {
      expect(text).not.toContain(banned);
    }
  });

  it('lists Typesense in the current stack, not on the roadmap', async () => {
    const { container } = await renderHomeAnonymous();

    const roadmapCaption = screen.getByText('On Our Roadmap');
    const roadmapRow = roadmapCaption.nextElementSibling as HTMLElement;
    expect(within(roadmapRow).queryByText('Typesense')).not.toBeInTheDocument();

    // Present exactly once on the page, and above the roadmap divider.
    const typesense = screen.getByText('Typesense');
    expect(typesense).toBeInTheDocument();
    expect(
      roadmapCaption.compareDocumentPosition(typesense) &
        Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();
    expect(container.querySelector('img[alt="Typesense"]')).toBeInTheDocument();
  });

  it('counts only the tools that ship', async () => {
    await renderHomeAnonymous();

    const toolsStat = screen.getByRole('button', { name: 'Tools' });
    expect(within(toolsStat).getByText('4')).toBeInTheDocument();
  });

  it('says the library descriptions are in English, in both locales', async () => {
    const { unmount } = await renderHomeAnonymous();
    expect(
      screen.getByText(/their descriptions are in English/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/multilingual descriptions/i)).not.toBeInTheDocument();
    unmount();

    localStorage.setItem('smartcrops-language', 'fr');
    renderHome();
    // Settles auth inside the test too — the CTA only appears once resolved.
    await screen.findByRole('link', { name: 'Créer un compte' });
    expect(
      await screen.findByText(/leurs descriptions sont en anglais/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/descriptions multilingues/i)
    ).not.toBeInTheDocument();
  });

  it('promises no personalized recommendations in the present tense', async () => {
    const { container } = await renderHomeAnonymous();

    expect(within(container).queryByText(/Follow personalized recommendations/i))
      .not.toBeInTheDocument();
    expect(
      screen.getByText(/follow your garden's progress through the seasons/i)
    ).toBeInTheDocument();
  });

  it('does not promise unsubscription from a form that cannot subscribe', async () => {
    await renderHomeAnonymous();

    expect(screen.queryByText(/unsubscribe anytime/i)).not.toBeInTheDocument();
    expect(
      screen.getByText('The form is not live yet — nothing is collected.')
    ).toBeInTheDocument();
  });
});

// SMA-360 — the page stopped asserting that its reader has no account.
describe('Home — what a signed-in visitor is offered (SMA-360)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockMatchMedia(false);
    vi.mocked(fetchPlants).mockResolvedValue([]);
    vi.mocked(fetchMe).mockRejectedValue(new Error('Not authenticated'));
    // SMA-393: English is stored the way a returning visitor stores it.
    localStorage.setItem('smartcrops-language', 'en');
    await i18next.changeLanguage('en');
  });

  it('sends a signed-in visitor to their gardens instead of a signup', async () => {
    await renderHomeSignedIn();

    expect(screen.getByRole('link', { name: 'My Gardens' })).toHaveAttribute(
      'href',
      '/gardens'
    );
    expect(
      screen.queryByRole('link', { name: 'Create Account' })
    ).not.toBeInTheDocument();
  });

  it('still offers the account to a visitor without one', async () => {
    await renderHomeAnonymous();

    expect(
      await screen.findByRole('link', { name: 'Create Account' })
    ).toHaveAttribute('href', '/register');
    expect(
      screen.queryByRole('link', { name: 'My Gardens' })
    ).not.toBeInTheDocument();
  });

  it('withdraws the whole closing pitch from someone who already signed up', async () => {
    await renderHomeSignedIn();

    // Heading, subtitle and button are one invitation: none of it survives.
    expect(
      screen.queryByRole('heading', { name: 'Ready to Start Growing?' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Join SmartCrops today/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: "Get Started — It's Free" })
    ).not.toBeInTheDocument();
  });

  it('keeps the closing pitch for a visitor without an account', async () => {
    await renderHomeAnonymous();

    expect(
      await screen.findByRole('heading', { name: 'Ready to Start Growing?' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Get Started — It's Free" })
    ).toHaveAttribute('href', '/register');
  });

  it('shows no account offer at all while auth is still unknown', async () => {
    // A promise that never settles keeps the provider in its loading state —
    // the flicker window. Neither label may be announced in it, and the pitch
    // must not appear only to be retracted.
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {}));
    await renderHomeSettled();

    expect(
      screen.queryByRole('link', { name: 'Create Account' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'My Gardens' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ready to Start Growing?' })
    ).not.toBeInTheDocument();
  });

  it('reserves the hero slot so resolving auth never moves the other action', async () => {
    vi.mocked(fetchMe).mockReturnValue(new Promise(() => {}));
    const { container } = await renderHomeSettled();

    // The button still occupies its box while hidden — that is what keeps
    // "Browse Library" from sliding when the answer arrives.
    const reserved = container.querySelector('a[href="/register"]');
    expect(reserved).not.toBeNull();
    expect(reserved).toHaveStyle({ visibility: 'hidden' });
  });
});
