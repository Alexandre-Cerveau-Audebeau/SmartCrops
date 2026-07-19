import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import type { Plant } from '../../types/Plant';
import PlantSidebar from './PlantSidebar';

// SMA-194 locks: the picker's primary label is the SAME localized common name
// the Library shows (flat list-DTO `commonName`, scientific fallback), and the
// search filter matches that displayed name — not only the scientific name.

const ivy = {
  id: 'p1',
  scientificName: 'Hedera helix',
  commonName: 'lierre', // server-localized flat field (?lang=fr)
} as Plant;

const fern = {
  id: 'p2',
  scientificName: 'Athyrium vidalii',
  commonName: null, // enrichment gap -> scientific fallback
} as Plant;

function renderSidebar(
  overrides: {
    searchQuery?: string;
    plants?: Plant[];
    catalogReady?: boolean;
    selectedInfraType?: 'wall' | 'trellis' | null;
  } = {}
) {
  return render(
    <PlantSidebar
      plants={overrides.plants ?? [ivy, fern]}
      searchQuery={overrides.searchQuery ?? ''}
      onSearchChange={vi.fn()}
      selectedPlantId={null}
      onPlantSelect={vi.fn()}
      selectedInfraType={overrides.selectedInfraType ?? null}
      onInfraSelect={vi.fn()}
      language="fr"
      shapeEditMode={false}
      onShapeEditToggle={vi.fn()}
      catalogFailed={false}
      onCatalogRetry={vi.fn()}
      catalogReady={overrides.catalogReady ?? true}
    />
  );
}

describe('PlantSidebar (SMA-194)', () => {
  it('renders the localized common name as primary label, scientific as secondary', () => {
    renderSidebar();
    const items = screen.getAllByRole('button');
    const ivyItem = items.find((el) => within(el).queryByText('Lierre'));
    expect(ivyItem).toBeTruthy();
    // Secondary line stays the scientific name (Library card parity).
    expect(within(ivyItem!).getByText('Hedera helix')).toBeInTheDocument();
    // Avatar initial derives from the DISPLAYED name, not the scientific one.
    expect(within(ivyItem!).getByText('L')).toBeInTheDocument();
  });

  it('falls back to the scientific name when no common name is available', () => {
    renderSidebar();
    expect(screen.getAllByText('Athyrium vidalii').length).toBeGreaterThan(0);
  });

  it('search matches the displayed common name, not only the scientific name', () => {
    renderSidebar({ searchQuery: 'lierre' });
    expect(screen.getByText('Lierre')).toBeInTheDocument();
    expect(screen.queryByText('Athyrium vidalii')).toBeNull();
  });

  it('shows the neutral loading state while the catalog is pending — never "no plants found" (SMA-288 R3)', () => {
    renderSidebar({ plants: [], catalogReady: false });
    expect(screen.getByText('Loading plants…')).toBeInTheDocument();
    expect(screen.queryByText('No plants found')).toBeNull();
    expect(screen.queryByText('Lierre')).toBeNull();
  });

  it('reserves the no-results message for a READY catalog (SMA-288 R3)', () => {
    renderSidebar({ plants: [], catalogReady: true });
    expect(screen.getByText('No plants found')).toBeInTheDocument();
    expect(screen.queryByText('Loading plants…')).toBeNull();
  });

  it('exposes the armed infrastructure toggle state via aria-pressed (SMA-15 R5, CR accept)', () => {
    renderSidebar({ selectedInfraType: 'wall' });
    fireEvent.click(screen.getByRole('tab', { name: 'Infrastructure' }));
    const wallRow = screen
      .getAllByRole('button')
      .find((el) => within(el).queryByText('Wall'))!;
    const trellisRow = screen
      .getAllByRole('button')
      .find((el) => within(el).queryByText('Trellis'))!;
    expect(wallRow).toHaveAttribute('aria-pressed', 'true');
    expect(trellisRow).toHaveAttribute('aria-pressed', 'false');
  });
});
