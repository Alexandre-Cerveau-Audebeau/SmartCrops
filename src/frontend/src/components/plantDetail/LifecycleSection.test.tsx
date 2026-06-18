import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import type { Plant } from '../../types/Plant';
import LifecycleSection from './LifecycleSection';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    sowingPeriod: 'march-may',
    harvestPeriod: 'july-september',
    perenualData: null,
    lifeCycle: 'Annual',
    ...overrides,
  } as unknown as Plant;
}

describe('LifecycleSection (SMA-78 — 12-month Gantt timeline)', () => {
  it('renders the 12-month header, five stage rows + a short-word legend, without MUI Grid', () => {
    const { container } = render(<LifecycleSection plant={makePlant()} />);

    expect(
      screen.getByText('Seasonal calendar & timeline')
    ).toBeInTheDocument();
    // Month header (Jan … Dec).
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Dec')).toBeInTheDocument();
    // Full row labels (middot) are unique to their rows.
    expect(screen.getByText('Seed · sowing')).toBeInTheDocument();
    expect(screen.getByText('Plant · growth')).toBeInTheDocument();
    // Flowering / Fruits / Harvest each appear in their row AND the legend.
    expect(screen.getAllByText('Flowering')).toHaveLength(2);
    expect(screen.getAllByText('Fruits')).toHaveLength(2);
    expect(screen.getAllByText('Harvest')).toHaveLength(2);
    // Legend short words distinct from the full row labels.
    expect(screen.getByText('Seed')).toBeInTheDocument();
    expect(screen.getByText('Plant')).toBeInTheDocument();
    // SMA-178/78: the banned MUI <Grid> stays absent (CSS-grid Box only).
    expect(container.querySelector('.MuiGrid-root')).toBeNull();
  });

  it('shows the COMING SOON · DATA badge and a disabled Indoor mode teaser (no extra chip)', () => {
    render(<LifecycleSection plant={makePlant()} />);

    expect(screen.getByText('COMING SOON · DATA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outdoor' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Indoor · greenhouse · IoT' })
    ).toBeDisabled();
  });

  it('shows the perennial note for a perennial life cycle', () => {
    render(<LifecycleSection plant={makePlant({ lifeCycle: 'Perennial' })} />);
    expect(
      screen.getByText('Perennial growth resumes each year.')
    ).toBeInTheDocument();
  });

  it('shows the biennial note for a biennial life cycle', () => {
    render(<LifecycleSection plant={makePlant({ lifeCycle: 'Biennial' })} />);
    expect(
      screen.getByText(
        'Vegetative growth in year 1, flowering and fruiting in year 2.'
      )
    ).toBeInTheDocument();
  });

  it('renders without crashing when every stage lacks data (empty tracks)', () => {
    render(
      <LifecycleSection
        plant={makePlant({
          sowingPeriod: null,
          harvestPeriod: null,
          perenualData: null,
        })}
      />
    );
    // The frozen rich layout keeps all five stage rows even with no periods.
    expect(screen.getAllByText('Harvest')).toHaveLength(2);
  });
});
