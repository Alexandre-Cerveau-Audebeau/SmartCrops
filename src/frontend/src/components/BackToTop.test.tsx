import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/i18n';

// Force the scroll trigger on so the FAB is rendered (jsdom doesn't compute scroll).
vi.mock('@mui/material/useScrollTrigger', () => ({ default: () => true }));

import BackToTop from './BackToTop';

// SMA-393: the default language is now French — pin English like a returning EN visitor.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BackToTop (SMA-126)', () => {
  it('renders the button and scrolls to top on click', async () => {
    const scrollSpy = vi.fn();
    vi.stubGlobal('scrollTo', scrollSpy);

    const user = userEvent.setup();
    render(<BackToTop />);

    const btn = screen.getByRole('button', { name: 'Back to top' });
    expect(btn).toBeInTheDocument();

    await user.click(btn);
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    );
  });

  // F3a: the click respects prefers-reduced-motion (smooth normally, auto when reduced).
  it.each([
    { matches: false, behavior: 'smooth' },
    { matches: true, behavior: 'auto' },
  ])('uses behavior:$behavior when reduced-motion matches=$matches', async ({ matches, behavior }) => {
    const scrollSpy = vi.fn();
    vi.stubGlobal('scrollTo', scrollSpy);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches })));

    const user = userEvent.setup();
    render(<BackToTop />);
    await user.click(screen.getByRole('button', { name: 'Back to top' }));

    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior });
  });
});
