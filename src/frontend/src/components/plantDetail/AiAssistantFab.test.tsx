import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import { AiAssistantFab } from './AiAssistantFab';

// Same matchMedia stub pattern as Navbar.test: matches=true → useMediaQuery(
// down('md')) matches → mobile.
function setMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AiAssistantFab (SMA-247)', () => {
  it('renders a non-interactive pill on mobile', () => {
    setMatchMedia(true);
    render(<AiAssistantFab />);

    const fab = screen.getByRole('button', { name: /ai assistant/i });
    expect(fab).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('renders nothing on desktop (>= md)', () => {
    setMatchMedia(false);
    render(<AiAssistantFab />);

    expect(screen.queryByRole('button', { name: /ai assistant/i })).toBeNull();
  });

  it('localizes its accessible name', async () => {
    await i18n.changeLanguage('fr');
    setMatchMedia(true);
    render(<AiAssistantFab />);

    expect(
      screen.getByRole('button', { name: /assistant ia/i })
    ).toBeInTheDocument();
  });
});
