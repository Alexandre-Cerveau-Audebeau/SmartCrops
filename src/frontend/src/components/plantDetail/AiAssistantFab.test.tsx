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
  it('renders a non-interactive note on mobile (not a focusable button)', () => {
    setMatchMedia(true);
    render(<AiAssistantFab />);

    expect(
      screen.getByRole('note', { name: /ai assistant/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Soon')).toBeInTheDocument();
    // Purely informative — never a focusable/activatable control.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing on desktop (>= md)', () => {
    setMatchMedia(false);
    render(<AiAssistantFab />);

    expect(screen.queryByRole('note', { name: /ai assistant/i })).toBeNull();
  });

  it('localizes its accessible name', async () => {
    await i18n.changeLanguage('fr');
    setMatchMedia(true);
    render(<AiAssistantFab />);

    expect(
      screen.getByRole('note', { name: /assistant ia/i })
    ).toBeInTheDocument();
  });
});
