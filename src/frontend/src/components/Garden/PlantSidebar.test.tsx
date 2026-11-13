import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_REGION_CLEAR_MS } from '../../hooks/useLiveRegion';
import i18n from '../../i18n/i18n';
import type { Plant } from '../../types/Plant';
import type { InfrastructureType } from '../../utils/infrastructure';
import PlantSidebar, { type PlantSidebarTab } from './PlantSidebar';

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
  catalogFailed?: boolean;
  selectedPlantId?: string | null;
  onPlantSelect?: (plantId: string | null) => void;
  cellSize?: string;
  selectedInfraType?: InfrastructureType | null;
  // Must mirror the prop's FULL union: a narrower parameter type is not
  // assignable (contravariance) and only tsc catches it — vitest strips types.
  onInfraSelect?: (type: InfrastructureType | null) => void;
};

// SMA-18 lot 2: the tab is a controlled prop now (lifted to the page so it
// survives the sheet Drawer unmounting) — the harness plays the page's role
// and owns it, so tab clicks keep switching panels in these tests. State
// survives the rerender-based toggle tests because the element TYPE is the
// same stateful wrapper.
function StatefulSidebar(overrides: SidebarOverrides) {
  const [tab, setTab] = useState<PlantSidebarTab>('plants');
  return (
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
      catalogFailed={overrides.catalogFailed ?? false}
      onCatalogRetry={vi.fn()}
      catalogReady={overrides.catalogReady ?? true}
      activeTab={tab}
      onActiveTabChange={setTab}
    />
  );
}

// Built as an element (not rendered) so a test can re-render the SAME instance
// with a new armed type — the callback's toggle branch needs that round-trip.
const sidebar = (overrides: SidebarOverrides = {}) => (
  <StatefulSidebar {...overrides} />
);

function renderSidebar(overrides: SidebarOverrides = {}) {
  return render(sidebar(overrides));
}

describe('PlantSidebar (SMA-194)', () => {
  // SMA-393: FR is the no-stored-choice default now — pin EN the way a
  // returning English visitor would, so the English UI labels below hold.
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });


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
    // The live region says the same sentence (SMA-294): this reads the screen's.
    expect(
      screen.getByText('Loading plants…', { ignore: '[role="status"]' })
    ).toBeInTheDocument();
    expect(screen.queryByText('No plants found')).toBeNull();
    expect(screen.queryByText('Lierre')).toBeNull();
  });

  it('reserves the no-results message for a READY catalog (SMA-288 R3)', () => {
    renderSidebar({ plants: [], catalogReady: true });
    expect(
      screen.getByText('No plants found', { ignore: '[role="status"]' })
    ).toBeInTheDocument();
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
    // describeChild (R3): the OPEN tooltip attaches as the badge's
    // DESCRIPTION — the accessible NAME (footprint + meaning) survives.
    expect(unknownBadge).toHaveAccessibleName(
      '1×1 — Unknown spacing — manual setting'
    );
    expect(unknownBadge).toHaveAccessibleDescription(
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

describe('PlantSidebar results announcement (SMA-294 item 2)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    // Unmount FIRST (SMA-452 § 13), on the clock the test ran on; only then is
    // the real clock back.
    cleanup();
    vi.useRealTimers();
  });

  /** The sidebar's ONE status region: a second one is the stacking SMA-294 forbids. */
  function region() {
    const regions = document.querySelectorAll('[aria-live], [role="status"]');
    expect(regions).toHaveLength(1);
    const found = regions[0] as HTMLElement;
    expect(found).toHaveAttribute('role', 'status');
    expect(found).toHaveAttribute('aria-live', 'polite');
    return found;
  }

  it('is born empty and written afterwards: a region inserted with its text is read unreliably', () => {
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    renderSidebar({ plants: [], catalogReady: false });
    const records = observer.takeRecords();
    observer.disconnect();

    // React inserts a new subtree whole: a region rendered WITH its text never
    // shows a record of its own.
    const node = region();
    const written = records.filter((record) => record.target === node);
    expect(written).toHaveLength(1);
    expect(written[0].addedNodes[0].textContent).toBe('Loading plants…');
  });

  it('says the load, the count and the empty result, in one region that stays', () => {
    const { rerender } = render(sidebar({ plants: [], catalogReady: false }));
    const node = region();
    expect(node.textContent).toBe('Loading plants…');

    rerender(sidebar());
    expect(region()).toBe(node);
    expect(node.textContent).toBe('2 plants');

    rerender(sidebar({ searchQuery: 'lierre' }));
    expect(region()).toBe(node);
    expect(node.textContent).toBe('1 plant');

    rerender(sidebar({ searchQuery: 'nothing like it' }));
    expect(region()).toBe(node);
    expect(node.textContent).toBe('No plants found');
  });

  it('stands beside the list, not around it: no row is read out with it', () => {
    renderSidebar();
    const node = region();
    expect(node.childElementCount).toBe(0);

    const row = screen.getByText('Lierre').closest('[aria-pressed]')!;
    expect(row).toBeInTheDocument();
    expect(node).not.toContainElement(row as HTMLElement);
    expect(row.closest('[aria-live], [role="status"]')).toBeNull();
  });

  it('leaves the failure to the alert: nothing beside it, the same region back on the retry', () => {
    const { rerender } = render(sidebar({ plants: [], catalogReady: false }));
    const node = region();
    expect(node.textContent).toBe('Loading plants…');

    rerender(sidebar({ plants: [], catalogReady: false, catalogFailed: true }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the plant catalog.");
    expect(region()).toBe(node);
    expect(node.textContent).toBe('');
    expect(node).not.toContainElement(alert);

    rerender(sidebar({ plants: [], catalogReady: false }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(region()).toBe(node);
    expect(node.textContent).toBe('Loading plants…');
  });

  it('has no results to speak of on the other tabs, and says them again on the way back', () => {
    renderSidebar();
    const node = region();
    expect(node.textContent).toBe('2 plants');

    for (const name of ['Soils', 'Infrastructure']) {
      const tab = screen.getByRole('tab', { name });
      fireEvent.click(tab);
      expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(region()).toBe(node);
      expect(node.textContent).toBe('');
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Plants' }));
    expect(region()).toBe(node);
    expect(node.textContent).toBe('2 plants');
  });

  it('empties a sentence no one sees after its delay, and says the next one', () => {
    const { rerender } = render(sidebar({ plants: [], catalogReady: false }));
    vi.useFakeTimers();
    rerender(sidebar());
    const node = region();
    expect(node.textContent).toBe('2 plants');

    act(() => {
      vi.advanceTimersByTime(LIVE_REGION_CLEAR_MS - 1);
    });
    expect(node.textContent).toBe('2 plants');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(node.textContent).toBe('');

    rerender(sidebar({ searchQuery: 'lierre' }));
    expect(node.textContent).toBe('1 plant');
  });
});
