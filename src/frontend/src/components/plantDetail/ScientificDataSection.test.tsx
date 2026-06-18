import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import type { Plant } from '../../types/Plant';
import ScientificDataSection from './ScientificDataSection';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

function makePlant(overrides: Record<string, unknown> = {}): Plant {
  return {
    perenualData: {
      hasSupremeData: true,
      xWateringPhMin: 6,
      xWateringPhMax: 7,
      xWateringBasedTempMinC: null,
      xWateringBasedTempMaxC: null,
      xSunlightHoursMin: null,
      xSunlightHoursMax: null,
      xTemperatureToleranceMinC: null,
      xTemperatureToleranceMaxC: null,
      xPlantSpacingValue: null,
      xPlantSpacingUnit: null,
      xWateringQualityJson: null,
      xWateringPeriodJson: null,
      ...overrides,
    },
  } as unknown as Plant;
}

function renderSci(plant: Plant) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UnitSystemProvider>{children}</UnitSystemProvider>
  );
  return render(<ScientificDataSection plant={plant} />, { wrapper });
}

describe('ScientificDataSection (SMA-178)', () => {
  it('renders the title and a formatted xData field', () => {
    renderSci(makePlant());

    expect(
      screen.getByText('Scientific data (Perenual Supreme)')
    ).toBeInTheDocument();
    expect(screen.getByText('Watering pH range')).toBeInTheDocument();
    expect(screen.getByText('6–7')).toBeInTheDocument();
  });

  it('renders nothing when perenualData is absent', () => {
    const { container } = renderSci({ perenualData: null } as unknown as Plant);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders water-quality / watering-period chips from JSON arrays', () => {
    renderSci(
      makePlant({
        xWateringQualityJson: '["Rainwater"]',
        xWateringPeriodJson: '["Morning"]',
      })
    );

    expect(screen.getByText('Preferred water quality')).toBeInTheDocument();
    expect(screen.getByText('Rainwater')).toBeInTheDocument();
    expect(screen.getByText('Watering time of day')).toBeInTheDocument();
  });

  it('converts temperature and spacing for the imperial system (SMA-178)', () => {
    localStorage.setItem('smartcrops.unitSystem', 'imperial');
    renderSci(
      makePlant({
        xWateringBasedTempMinC: 18,
        xWateringBasedTempMaxC: 24,
        xPlantSpacingValue: 45,
        xPlantSpacingUnit: 'cm',
      })
    );

    // 18–24 °C → 64–75 °F ; 45 cm → 18 in.
    expect(screen.getByText('64–75 °F')).toBeInTheDocument();
    expect(screen.getByText('18 in')).toBeInTheDocument();
    expect(screen.queryByText('18–24 °C')).toBeNull();
  });
});
