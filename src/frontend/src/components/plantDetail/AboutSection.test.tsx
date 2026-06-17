import { render, screen } from '@testing-library/react';
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
});
