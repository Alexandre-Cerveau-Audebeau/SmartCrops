import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import type { Plant } from '../../types/Plant';
import type { InfrastructureType } from '../../utils/infrastructure';
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

type SidebarOverrides = {
  searchQuery?: string;
  plants?: Plant[];
  catalogReady?: boolean;
  selectedPlantId?: string | null;
  onPlantSelect?: (plantId: string | null) => void;
  cellSize?: string;
  selectedInfraType?: InfrastructureType | null;
  // Must mirror the prop's FULL union: a narrower parameter type is not
  // assignable (contravariance) and only tsc catches it — vitest strips types.
  onInfraSelect?: (type: InfrastructureType | null) => void;
};

// Built as an element (not rendered) so a test can re-render the SAME instance
// with a new armed type — the callback's toggle branch needs that round-trip.
const sidebar = (overrides: SidebarOverrides = {}) => (
  <PlantSidebar
    plants={overrides.plants ?? [ivy, fern]}
    searchQuery={overrides.searchQuery ?? ''}
    onSearchChange={vi.fn()}
    selectedPlantId={overrides.selectedPlantId ?? null}
    onPlantSelect={overrides.onPlantSelect ?? vi.fn()}
    cellSize={overrides.cellSize}
    selectedInfraType={overrides.selectedInfraType ?? null}
    onInfraSelect={overrides.onInfraSelect ?? vi.fn()}
    language="fr"
    shapeEditMode={false}
    onShapeEditToggle={vi.fn()}
    catalogFailed={false}
    onCatalogRetry={vi.fn()}
    catalogReady={overrides.catalogReady ?? true}
  />
);

function renderSidebar(overrides: SidebarOverrides = {}) {
  return render(sidebar(overrides));
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

  it('plant rows: click arms, re-click disarms with null (SMA-193)', () => {
    // Exact plant-side analog of the infra toggle below — without the spy the
    // suite would still pass with the row onClick deleted (e7e2feb8 lesson).
    const onPlantSelect = vi.fn();
    const { rerender } = render(sidebar({ onPlantSelect }));
    const ivyRow = () =>
      screen
        .getAllByRole('button')
        .find((el) => within(el).queryByText('Lierre'))!;

    fireEvent.click(ivyRow());
    expect(onPlantSelect).toHaveBeenCalledWith('p1');

    rerender(sidebar({ onPlantSelect, selectedPlantId: 'p1' }));
    fireEvent.click(ivyRow());
    expect(onPlantSelect).toHaveBeenLastCalledWith(null);
    expect(onPlantSelect).toHaveBeenCalledTimes(2);
  });

  it('footprint badges: spacing-known rows show N×N, unknown rows show the dashed 1×1? (SMA-193)', () => {
    renderSidebar({
      plants: [
        { ...ivy, xPlantSpacingValue: 90, xPlantSpacingUnit: 'cm' } as Plant,
        fern, // no spacing → unknown badge
      ],
      cellSize: '50cm',
    });
    // 90 cm at 50 cm/cell → 2×2 (the mockup anchor).
    expect(screen.getByText('2×2')).toBeInTheDocument();
    expect(screen.getByLabelText('2×2 footprint')).toBeInTheDocument();
    expect(screen.getByText('1×1?')).toBeInTheDocument();
  });

  it('unknown-footprint badge explains itself: tooltip + combined aria; known badges do not (R2)', async () => {
    renderSidebar({
      plants: [
        { ...ivy, xPlantSpacingValue: 90, xPlantSpacingUnit: 'cm' } as Plant,
        fern, // no spacing → unknown badge
      ],
      cellSize: '50cm',
    });
    // AT hears footprint + meaning, never "one times one question mark".
    const unknownBadge = screen.getByLabelText(
      '1×1 — Unknown spacing — manual setting'
    );
    expect(unknownBadge).toHaveTextContent('1×1?');
    // Hovering surfaces the États-component explanation as a tooltip.
    fireEvent.mouseOver(unknownBadge);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Unknown spacing — manual setting'
    );
    // The known badge keeps its plain footprint label — no tooltip wiring.
    expect(screen.getByLabelText('2×2 footprint')).not.toHaveAttribute(
      'aria-describedby'
    );
  });

  it('plant rows expose the armed state via aria-pressed (R2, CR committable)', () => {
    renderSidebar({ selectedPlantId: 'p1' });
    const rowOf = (text: string) =>
      screen
        .getAllByRole('button')
        .find((el) => within(el).queryAllByText(text).length > 0)!;
    expect(rowOf('Lierre')).toHaveAttribute('aria-pressed', 'true');
    expect(rowOf('Athyrium vidalii')).toHaveAttribute('aria-pressed', 'false');
  });

  it('arms a type on click and disarms it with null on re-click (SMA-303)', () => {
    // The prop state alone proves nothing: without this, removing the row's
    // onClick — or passing the wrong value — would still pass the suite.
    const onInfraSelect = vi.fn();
    const { rerender } = render(sidebar({ onInfraSelect }));
    fireEvent.click(screen.getByRole('tab', { name: 'Infrastructure' }));
    const trellisRow = () =>
      screen.getAllByRole('button').find((el) => within(el).queryByText('Trellis'))!;

    fireEvent.click(trellisRow());
    expect(onInfraSelect).toHaveBeenCalledWith('trellis');

    // The armed type comes back down as a prop — re-clicking it disarms.
    rerender(sidebar({ onInfraSelect, selectedInfraType: 'trellis' }));
    fireEvent.click(trellisRow());
    expect(onInfraSelect).toHaveBeenLastCalledWith(null);
    expect(onInfraSelect).toHaveBeenCalledTimes(2);
  });
});
