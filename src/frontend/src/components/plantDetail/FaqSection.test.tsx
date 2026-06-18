import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import type { Plant } from '../../types/Plant';
import FaqSection from './FaqSection';
import { buildFaqItems } from '../../utils/plantDetailFaq';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

function makePlant(overrides: Record<string, unknown> = {}): Plant {
  return {
    isEdible: true,
    isToxicToPets: false,
    hardinessZoneMin: 5,
    hardinessZoneMax: 9,
    lifeCycle: 'Perennial',
    perenualData: {
      hasEdibleFruit: true,
      hasEdibleLeaves: false,
      xSunlightHoursMin: 6,
      xSunlightHoursMax: 8,
      xWateringPhMin: 6,
      xWateringPhMax: 7,
      xPlantSpacingValue: 45,
      xPlantSpacingUnit: 'cm',
    },
    ...overrides,
  } as unknown as Plant;
}

function renderFaq(plant: Plant) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UnitSystemProvider>{children}</UnitSystemProvider>
  );
  return render(<FaqSection plant={plant} />, { wrapper });
}

describe('FaqSection (SMA-78)', () => {
  it('renders a question per available field, first answer open by default', () => {
    renderFaq(makePlant());

    expect(screen.getByText('Frequently asked questions')).toBeInTheDocument();
    for (const q of [
      'Is this plant edible?',
      'Is this plant toxic to pets?',
      'How much sun does this plant need?',
      'Which hardiness zones does it grow in?',
      'What soil pH does it prefer?',
      'How far apart should it be spaced?',
    ]) {
      expect(screen.getByRole('button', { name: q })).toBeInTheDocument();
    }
    // First item open: its answer is visible (edible + fruit parts) and expanded.
    expect(
      screen.getByText('Yes, this plant is edible (fruit).')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Is this plant edible?' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('omits a question when its source field is missing', () => {
    renderFaq(makePlant({ isEdible: null, isToxicToPets: null }));

    expect(
      screen.queryByRole('button', { name: 'Is this plant edible?' })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Is this plant toxic to pets?' })
    ).toBeNull();
    // A remaining (Perenual-sourced) question still renders.
    expect(
      screen.getByRole('button', { name: 'What soil pH does it prefer?' })
    ).toBeInTheDocument();
  });

  it('renders nothing when no source field is available', () => {
    const { container } = renderFaq(
      makePlant({
        isEdible: null,
        isToxicToPets: null,
        hardinessZoneMin: null,
        hardinessZoneMax: null,
        perenualData: null,
      })
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('buildFaqItems returns [] when the plant has no answerable field', () => {
    const t = i18n.getFixedT('en');
    const items = buildFaqItems(
      {
        isEdible: null,
        isToxicToPets: null,
        hardinessZoneMin: null,
        perenualData: null,
      } as unknown as Plant,
      t,
      'metric'
    );
    expect(items).toHaveLength(0);
  });
});
