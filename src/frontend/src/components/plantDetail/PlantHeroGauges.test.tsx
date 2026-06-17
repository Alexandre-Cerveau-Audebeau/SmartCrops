import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import type { Plant } from '../../types/Plant';
import PlantHeroGauges from './PlantHeroGauges';

// Isolate locale + unit preference so assertions never depend on another suite.
beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

// PlantHeroGauges reads useUnitSystem(), so every render needs the provider.
function renderGauges(plant: Plant) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UnitSystemProvider>{children}</UnitSystemProvider>
  );
  return render(<PlantHeroGauges plant={plant} />, { wrapper });
}

// Minimal Plant carrying only the fields the gauges read. Cast through unknown —
// the real DTO has dozens of fields the gauge row never touches.
function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    hardinessZoneMin: 5,
    hardinessZoneMax: 9,
    minHeightCm: 30,
    maxHeightCm: 60,
    wateringNeedLevel: 'Average',
    careLevel: 'Easy',
    perenualData: {
      xSunlightHoursMin: 6,
      xSunlightHoursMax: 8,
      xWateringPhMin: 6,
      xWateringPhMax: 7,
      xWateringBasedTempMinC: 18,
      xWateringBasedTempMaxC: 24,
      xPlantSpacingValue: 45,
      xPlantSpacingUnit: 'cm',
    },
    ...overrides,
  } as unknown as Plant;
}

describe('PlantHeroGauges (SMA-169)', () => {
  it('renders a gauge for each present field, with its label and value', () => {
    renderGauges(makePlant());

    expect(screen.getByText('Growing conditions')).toBeInTheDocument();
    expect(screen.getByText('Hardiness')).toBeInTheDocument();
    expect(screen.getByText('5-9')).toBeInTheDocument();
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('30–60 cm')).toBeInTheDocument();
    expect(screen.getByText('Spacing')).toBeInTheDocument();
    expect(screen.getByText('45 cm')).toBeInTheDocument();
    expect(screen.getByText('pH')).toBeInTheDocument();
    expect(screen.getByText('6–7')).toBeInTheDocument();
  });

  it('omits a gauge whose value is absent (hide-if-null per gauge)', () => {
    const base = makePlant();
    const plant = makePlant({
      hardinessZoneMin: null,
      hardinessZoneMax: null,
      perenualData: {
        ...base.perenualData,
        xPlantSpacingValue: null,
        xPlantSpacingUnit: null,
      } as Plant['perenualData'],
    });
    renderGauges(plant);

    expect(screen.queryByText('Hardiness')).toBeNull();
    expect(screen.queryByText('Spacing')).toBeNull();
    // A gauge that still has data keeps rendering.
    expect(screen.getByText('Height')).toBeInTheDocument();
  });

  it('renders nothing when no gauge has a value', () => {
    const empty = {
      hardinessZoneMin: null,
      hardinessZoneMax: null,
      minHeightCm: null,
      maxHeightCm: null,
      wateringNeedLevel: null,
      careLevel: null,
      perenualData: null,
    } as unknown as Plant;
    const { container } = renderGauges(empty);
    expect(container).toBeEmptyDOMElement();
  });

  it('reflects the imperial system for convertible gauges, leaving others intact (SMA-178)', () => {
    // Persisted preference drives the provider's initial system.
    localStorage.setItem('smartcrops.unitSystem', 'imperial');
    renderGauges(makePlant());

    // Convertible: height 30–60 cm → 12–24 in, spacing 45 cm → 18 in.
    expect(screen.getByText('12–24 in')).toBeInTheDocument();
    expect(screen.getByText('18 in')).toBeInTheDocument();
    // Non-convertible: hardiness zone and pH are unchanged.
    expect(screen.getByText('5-9')).toBeInTheDocument();
    expect(screen.getByText('6–7')).toBeInTheDocument();
    expect(screen.queryByText('30–60 cm')).toBeNull();
  });
});
