import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import i18n from '../../i18n/i18n';
import type { PlannerPlacement } from './plannerReducer';
import { PlacementDetailPanel } from './PlacementDetailPanel';

// SMA-288 locks: the unknown-plant fallback is reserved for plants missing
// from a READY catalog — while the active-language catalog is pending, the
// name slot renders EMPTY (a not-yet-loaded plant is not an unknown plant).

const placement: PlannerPlacement = {
  id: 'pl1',
  plantId: 'p1',
  startRow: 0,
  startCol: 0,
  spanRows: 1,
  spanCols: 1,
  notes: null,
};

function renderPanel(props: { catalogReady: boolean }) {
  return render(
    <PlacementDetailPanel
      placement={placement}
      plant={null}
      soil={undefined}
      language={i18n.language}
      catalogReady={props.catalogReady}
      onRemove={vi.fn()}
    />
  );
}

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('PlacementDetailPanel unknown-plant gating (SMA-288)', () => {
  it('renders an empty name slot while the catalog is pending', () => {
    renderPanel({ catalogReady: false });
    expect(screen.queryByText('Unknown')).toBeNull();
    expect(screen.queryByText('Inconnue')).toBeNull();
  });

  it('renders the localized unknown fallback once the catalog is ready (EN)', () => {
    renderPanel({ catalogReady: true });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders the localized unknown fallback once the catalog is ready (FR)', async () => {
    await i18n.changeLanguage('fr');
    renderPanel({ catalogReady: true });
    expect(screen.getByText('Inconnue')).toBeInTheDocument();
  });
});
