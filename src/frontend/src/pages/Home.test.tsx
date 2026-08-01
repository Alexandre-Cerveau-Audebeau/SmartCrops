import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';

vi.mock('../services/plantApi', () => ({
  fetchPlants: vi.fn(),
}));

import Home from './Home';
import { fetchPlants } from '../services/plantApi';

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
        <Home />
      </LanguageProvider>
    </MemoryRouter>
  );
}

/** Waits out the plant fetch so the library preview settles before asserting. */
async function renderHomeSettled() {
  const result = renderHome();
  await waitFor(() => expect(vi.mocked(fetchPlants)).toHaveBeenCalled());
  return result;
}

describe('Home — the page says only what ships (SMA-353)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockMatchMedia(false);
    vi.mocked(fetchPlants).mockResolvedValue([]);
    // LanguageProvider re-applies its own language on mount, so the locale has
    // to be set the way a returning visitor sets it, not on i18next directly.
    localStorage.removeItem('smartcrops-language');
    await i18next.changeLanguage('en');
  });

  it('renders NOTHING for testimonials while the source is empty', async () => {
    await renderHomeSettled();

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
    await renderHomeSettled();

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
    await renderHomeSettled();

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
    await renderHomeSettled();

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
    await renderHomeSettled();

    const card = screen
      .getByRole('heading', { name: 'Bring your own assistant' })
      .closest('.MuiCard-root') as HTMLElement;
    expect(within(card).getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      '/about'
    );
  });

  it('never calls the assistant connection our own AI', async () => {
    const { container } = await renderHomeSettled();

    // The differentiator IS that the assistant is the visitor's, already paid
    // for. Generic "AI-powered" phrasing would erase it — and the privacy
    // argument with it.
    const text = container.textContent ?? '';
    for (const banned of ['AI-powered', 'AI powered', 'powered by AI', 'our AI']) {
      expect(text).not.toContain(banned);
    }
  });

  it('lists Typesense in the current stack, not on the roadmap', async () => {
    const { container } = await renderHomeSettled();

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
    await renderHomeSettled();

    const toolsStat = screen.getByRole('button', { name: 'Tools' });
    expect(within(toolsStat).getByText('4')).toBeInTheDocument();
  });

  it('says the library descriptions are in English, in both locales', async () => {
    const { unmount } = await renderHomeSettled();
    expect(
      screen.getByText(/their descriptions are in English/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/multilingual descriptions/i)).not.toBeInTheDocument();
    unmount();

    localStorage.setItem('smartcrops-language', 'fr');
    renderHome();
    expect(
      await screen.findByText(/leurs descriptions sont en anglais/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/descriptions multilingues/i)
    ).not.toBeInTheDocument();
  });

  it('promises no personalized recommendations in the present tense', async () => {
    const { container } = await renderHomeSettled();

    expect(within(container).queryByText(/Follow personalized recommendations/i))
      .not.toBeInTheDocument();
    expect(
      screen.getByText(/follow your garden's progress through the seasons/i)
    ).toBeInTheDocument();
  });

  it('does not promise unsubscription from a form that cannot subscribe', async () => {
    await renderHomeSettled();

    expect(screen.queryByText(/unsubscribe anytime/i)).not.toBeInTheDocument();
    expect(
      screen.getByText('The form is not live yet — nothing is collected.')
    ).toBeInTheDocument();
  });
});
