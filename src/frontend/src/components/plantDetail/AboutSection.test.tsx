import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import type { Plant } from '../../types/Plant';
import AboutSection from './AboutSection';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

// Minimal Plant carrying only the fields AboutSection reads.
function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    longDescriptions: [],
    translations: [],
    ...overrides,
  } as unknown as Plant;
}

describe('AboutSection (SMA-178)', () => {
  it('renders the rich long description under the About subtitle', () => {
    render(
      <AboutSection
        plant={makePlant({
          longDescriptions: [
            {
              id: 1,
              language: 'en',
              longDescription: 'Sweet basil is a tender herb.',
              sourceMethod: 'perenual',
            },
          ],
        })}
      />
    );

    expect(screen.getByText('About')).toBeInTheDocument();
    expect(
      screen.getByText('Sweet basil is a tender herb.')
    ).toBeInTheDocument();
  });

  it('falls back to the short translated description', () => {
    render(
      <AboutSection
        plant={makePlant({
          translations: [
            {
              id: 1,
              language: 'en',
              commonName: 'Basil',
              description: 'A short basil note.',
            },
          ],
        })}
      />
    );

    expect(screen.getByText('A short basil note.')).toBeInTheDocument();
  });

  it('truncates a long description and toggles it via the read-more button, exposing aria-expanded', async () => {
    const user = userEvent.setup();
    // >360 chars, with a unique marker placed past the truncation boundary.
    const longText = `Basil intro. ${'word '.repeat(80)}ENDMARKER`;
    render(
      <AboutSection
        plant={makePlant({
          longDescriptions: [
            {
              id: 1,
              language: 'en',
              longDescription: longText,
              sourceMethod: null,
            },
          ],
        })}
      />
    );

    // Collapsed: the tail beyond 360 chars is hidden; toggle reads "Read more".
    expect(screen.queryByText(/ENDMARKER/)).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Read more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'about-description');

    await user.click(toggle);
    // Expanded: full text shown, button flips to "Read less", aria-expanded true.
    expect(screen.getByText(/ENDMARKER/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    await user.click(screen.getByRole('button', { name: 'Read less' }));
    expect(screen.queryByText(/ENDMARKER/)).toBeNull();
  });

  it('renders the source attribution when sourceMethod is present', () => {
    render(
      <AboutSection
        plant={makePlant({
          longDescriptions: [
            {
              id: 1,
              language: 'en',
              longDescription: 'Short rich text.',
              sourceMethod: 'perenual',
            },
          ],
        })}
      />
    );

    expect(screen.getByText('Source: perenual')).toBeInTheDocument();
  });
});
