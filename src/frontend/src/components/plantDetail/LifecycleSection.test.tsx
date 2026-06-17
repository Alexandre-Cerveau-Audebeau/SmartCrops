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

describe('LifecycleSection (SMA-178)', () => {
  it('renders the four stages with a formatted period, without MUI Grid', () => {
    const { container } = render(<LifecycleSection plant={makePlant()} />);

    expect(screen.getByText('Sowing')).toBeInTheDocument();
    expect(screen.getByText('Growth')).toBeInTheDocument();
    expect(screen.getByText('Flowering')).toBeInTheDocument();
    expect(screen.getByText('Harvest')).toBeInTheDocument();
    // A known period is localized and rendered (sowing march-may → March …).
    expect(screen.getByText(/March/)).toBeInTheDocument();
    // SMA-178: the banned MUI <Grid> is replaced by a CSS-grid Box.
    expect(container.querySelector('.MuiGrid-root')).toBeNull();
  });
});
