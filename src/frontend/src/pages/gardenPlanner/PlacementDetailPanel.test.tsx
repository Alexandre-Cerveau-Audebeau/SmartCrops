import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import i18n from '../../i18n/i18n';
import type { CellData } from '../../types/GardenLayout';
import type { Plant } from '../../types/Plant';
import { cellRef, footprintFits } from './placementGeometry';
import type { PlannerPlacement } from './plannerReducer';
import { PlacementDetailPanel } from './PlacementDetailPanel';

// SMA-288 locks: the unknown-plant fallback is reserved for plants missing
// from a READY catalog — while the active-language catalog is pending, the
// name slot renders EMPTY (a not-yet-loaded plant is not an unknown plant).
// SMA-193 lot 3: the footprint section — source line, draft steppers with
// live apply-on-fit, inline warn, cells+meters line, Move.

const placement: PlannerPlacement = {
  id: 'pl1',
  plantId: 'p1',
  startRow: 0,
  startCol: 0,
  spanRows: 1,
  spanCols: 1,
  notes: null,
};

// 90 cm @ 50cm/cell → known 2×2 suggestion; the panel shows the SINGLE
// cached Perenual value (lot-1 ruling).
const spacedPlant = {
  id: 'p1',
  scientificName: 'Arbor fixture',
  xPlantSpacingValue: 90,
  xPlantSpacingUnit: 'cm',
} as Plant;
const unspacedPlant = { id: 'p1', scientificName: 'Mystery fixture' } as Plant;

const activeGrid = (rows: number, cols: number): CellData[][] =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ active: true }) as CellData)
  );

// SMA-309: the identity block links to the plant record, so the panel now
// needs Router context. Only this scaffolding gained a provider — every
// assertion below is unchanged.
function renderPanel(props: { catalogReady: boolean }) {
  return render(
    <MemoryRouter>
      <PlacementDetailPanel
        placement={placement}
        plant={null}
        soil={undefined}
        language={i18n.language}
        catalogReady={props.catalogReady}
        cellSize="50cm"
        gridRows={3}
        gridCols={3}
        checkFit={() => ({ ok: true })}
        describeOverlap={() => ({ plant: '', cell: '' })}
        onSetFootprint={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
      />
    </MemoryRouter>
  );
}

/**
 * Stateful harness mirroring the page wiring: checkFit runs the REAL
 * footprintFits over the harness grid + neighbours; a fitting apply mutates
 * the placement (live apply), a misfit leaves it untouched.
 */
function FootprintHarness(props: {
  plant?: Plant;
  others?: PlannerPlacement[];
  rows?: number;
  cols?: number;
  onApplySpy?: (r: number, c: number) => void;
  onMove?: () => void;
}) {
  const [pl, setPl] = useState<PlannerPlacement>(placement);
  const others = props.others ?? [];
  const grid = activeGrid(props.rows ?? 4, props.cols ?? 4);
  return (
    <MemoryRouter>
      <PlacementDetailPanel
        placement={pl}
        plant={props.plant ?? spacedPlant}
        soil={undefined}
        language={i18n.language}
        catalogReady
        cellSize="50cm"
        gridRows={grid.length}
        gridCols={grid[0].length}
        checkFit={(r, c) =>
          footprintFits(
            grid,
            [pl, ...others],
            {
              startRow: pl.startRow,
              startCol: pl.startCol,
              spanRows: r,
              spanCols: c,
            },
            pl.id
          )
        }
        describeOverlap={(id) => {
          const hit = others.find((o) => o.id === id);
          return {
            plant: 'Fraisier fixture',
            cell: hit ? cellRef(hit.startRow, hit.startCol) : '',
          };
        }}
        onSetFootprint={(r, c) => {
          props.onApplySpy?.(r, c);
          setPl((p) => ({ ...p, spanRows: r, spanCols: c }));
        }}
        onMove={props.onMove ?? vi.fn()}
        onRemove={vi.fn()}
      />
    </MemoryRouter>
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

describe('PlacementDetailPanel footprint section (SMA-193 lot 3)', () => {
  it('the source line shows the single cached Perenual value + unit', () => {
    render(<FootprintHarness />);
    expect(
      screen.getByText('From Perenual spacing (90 cm)')
    ).toBeInTheDocument();
  });

  it('an unknown spacing reuses the lot-1 manual-setting line', () => {
    render(<FootprintHarness plant={unspacedPlant} />);
    expect(
      screen.getByText('Unknown spacing — manual setting')
    ).toBeInTheDocument();
  });

  it('a fitting step applies live: the placement spans change and the line follows', () => {
    const spy = vi.fn();
    render(<FootprintHarness onApplySpy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase rows' }));
    expect(spy).toHaveBeenCalledWith(2, 1);
    // Draft + committed value agree; the cells+meters line follows the draft
    // (A1–A2, 2×1, 0.5 m wide × 1.0 m tall at 50cm/cell).
    expect(
      screen.getByText('Cells A1–A2 — footprint 2×1 (0.5 × 1.0 m)')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a misfit step keeps the draft, warns with the hit plant + cell, applies nothing', () => {
    const spy = vi.fn();
    render(
      <FootprintHarness
        onApplySpy={spy}
        others={[
          {
            id: 'pl-straw',
            plantId: 'p2',
            startRow: 0,
            startCol: 1,
            spanRows: 1,
            spanCols: 1,
            notes: null,
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Increase columns' }));
    // The strawberry sits at (0,1): the 1×2 draft overlaps it.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Overlaps Fraisier fixture (B1). Adjust the footprint or move the plant.'
    );
    expect(spy).not.toHaveBeenCalled();
    // The out-of-range value stays DISPLAYED (mockup: warn WITH the value).
    expect(
      screen.getByText('Cells A1–B1 — footprint 1×2 (1.0 × 0.5 m)')
    ).toBeInTheDocument();
  });

  it('stepping back to a fitting value applies and clears the warn', () => {
    const spy = vi.fn();
    render(
      <FootprintHarness
        onApplySpy={spy}
        others={[
          {
            id: 'pl-straw',
            plantId: 'p2',
            startRow: 0,
            startCol: 1,
            spanRows: 1,
            spanCols: 1,
            notes: null,
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Increase columns' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Decrease columns' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(spy).toHaveBeenCalledWith(1, 1);
  });

  it('bounds: decrease disables at 1, increase disables at the grid dimension', () => {
    render(<FootprintHarness rows={2} cols={4} />);
    expect(screen.getByRole('button', { name: 'Decrease rows' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Decrease columns' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Increase rows' }));
    // rows draft = 2 = grid rows → + disabled; columns (4) stay enabled.
    expect(screen.getByRole('button', { name: 'Increase rows' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Increase columns' })
    ).toBeEnabled();
  });

  it('Move fires the page callback', () => {
    const onMove = vi.fn();
    render(<FootprintHarness onMove={onMove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('the FR line uses the comma decimal (empreinte, cases)', async () => {
    await i18n.changeLanguage('fr');
    render(<FootprintHarness />);
    expect(
      screen.getByText('Cases A1–A1 — empreinte 1×1 (0,5 × 0,5 m)')
    ).toBeInTheDocument();
  });
});

// ── SMA-309: identity first, geometry second ────────────────────────────────

const identityPlant = {
  id: 'p1',
  scientificName: 'Ocimum basilicum',
  commonName: 'Basil',
  imageUrl: 'https://example.test/basil.jpg',
  wateringNeedLevel: 'Average',
  careLevel: 'Easy',
  lifeCycle: 'Annual',
  xPlantSpacingValue: 90,
  xPlantSpacingUnit: 'cm',
} as Plant;

/** The panel under Router (the identity block links to the library page). */
function renderIdentity(
  props: Partial<React.ComponentProps<typeof PlacementDetailPanel>> = {}
) {
  return render(
    <MemoryRouter>
      <PlacementDetailPanel
        placement={placement}
        plant={identityPlant}
        soil={undefined}
        language="en"
        catalogReady
        cellSize="50cm"
        gridRows={3}
        gridCols={3}
        checkFit={() => ({ ok: true })}
        describeOverlap={() => ({ plant: '', cell: '' })}
        onSetFootprint={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('PlacementDetailPanel identity header (SMA-309)', () => {
  it('renders the section title, the name, the scientific name and the footprint badge', () => {
    renderIdentity();
    expect(screen.getByText('Selected placement')).toBeInTheDocument();
    expect(screen.getByText('Basil')).toBeInTheDocument();
    expect(screen.getByText('Ocimum basilicum')).toBeInTheDocument();
    // The shared badge (extracted in FIX A) — 90 cm @ 50cm/cell → 2×2.
    expect(screen.getByLabelText('2×2 footprint')).toBeInTheDocument();
  });

  it('renders the photo from imageUrl', () => {
    renderIdentity();
    const img = screen.getByRole('img', { name: 'Basil' });
    expect(img).toHaveAttribute('src', 'https://example.test/basil.jpg');
  });

  it('falls back to the coloured initial when the plant has no stable image', () => {
    // 31.5% of the catalogue: no Trefle image at all (SMA-118). No <img> is
    // requested — the initial IS the deliberate placeholder.
    renderIdentity({ plant: { ...identityPlant, imageUrl: null } as Plant });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('the close button clears the selection', () => {
    const onClose = vi.fn();
    renderIdentity({ onClose });
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the placement panel' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the raw zero-indexed position line is GONE (FIX C)', () => {
    renderIdentity();
    expect(screen.queryByText(/Position:/)).toBeNull();
    expect(screen.queryByText(/row 0, col 0/)).toBeNull();
  });
});

describe('PlacementDetailPanel summary rows (SMA-309)', () => {
  it('renders watering, care and life cycle from the enum fields', () => {
    renderIdentity();
    expect(screen.getByTestId('summary-watering')).toHaveTextContent('Average');
    expect(screen.getByTestId('summary-care')).toHaveTextContent('Easy');
    expect(screen.getByTestId('summary-lifeCycle')).toHaveTextContent('Annual');
  });

  it('prefers the Perenual enum over the legacy waterNeeds string', () => {
    renderIdentity({
      plant: {
        ...identityPlant,
        wateringNeedLevel: 'Frequent',
        waterNeeds: 'daily',
      } as Plant,
    });
    expect(screen.getByTestId('summary-watering')).toHaveTextContent('Frequent');
  });

  it('hides each row whose value is unknown rather than printing an empty label', () => {
    renderIdentity({
      plant: {
        id: 'p1',
        scientificName: 'Mystery fixture',
        imageUrl: null,
      } as Plant,
    });
    expect(screen.queryByTestId('summary-watering')).toBeNull();
    expect(screen.queryByTestId('summary-care')).toBeNull();
    expect(screen.queryByTestId('summary-lifeCycle')).toBeNull();
    expect(screen.queryByTestId('summary-exposure')).toBeNull();
  });

  it('states the exposure exactly when the moment triplet is known', () => {
    renderIdentity({
      exposure: 'full',
      momentsLit: { morning: true, noon: true, evening: true },
    });
    expect(screen.getByTestId('summary-exposure')).toHaveTextContent(
      'Full sun — morning, noon, and evening'
    );
  });

  it('enumerates only the lit moments', () => {
    renderIdentity({
      exposure: 'morning',
      momentsLit: { morning: true, noon: true, evening: false },
    });
    expect(screen.getByTestId('summary-exposure')).toHaveTextContent(
      'Morning sun — morning and noon'
    );
  });

  it('renders the category ALONE when the triplet is unavailable (override/indoor)', () => {
    // 'full' with no triplet must NOT claim the three moments — aggregate
    // collapses noon-only into 'full' too.
    renderIdentity({ exposure: 'full', momentsLit: null });
    const row = screen.getByTestId('summary-exposure');
    expect(row).toHaveTextContent('Full sun');
    expect(row).not.toHaveTextContent('—');
  });

  it('links to the plant record', () => {
    renderIdentity();
    expect(screen.getByRole('link', { name: 'Plant details' })).toHaveAttribute(
      'href',
      '/library/p1'
    );
  });
});

describe('PlacementDetailPanel notes (SMA-309)', () => {
  it('shows the existing note and reports every edit to the page', () => {
    const onSetNotes = vi.fn();
    renderIdentity({
      placement: { ...placement, notes: 'Staked in June' },
      onSetNotes,
    });
    const field = screen.getByLabelText('Notes');
    expect(field).toHaveValue('Staked in June');
    fireEvent.change(field, { target: { value: 'Staked in July' } });
    expect(onSetNotes).toHaveBeenCalledWith('Staked in July');
  });

  it('caps the field at the 500 characters the server column allows', () => {
    renderIdentity({ onSetNotes: vi.fn() });
    expect(screen.getByLabelText('Notes')).toHaveAttribute('maxlength', '500');
  });

  it('renders no notes field when the page wires no handler', () => {
    renderIdentity();
    expect(screen.queryByLabelText('Notes')).toBeNull();
  });
});

describe('PlacementDetailPanel exposure override (SMA-309)', () => {
  it('opens the picker without unmounting the panel, and reports the choice', () => {
    const onSetExposureOverride = vi.fn();
    renderIdentity({ onSetExposureOverride, exposureOverride: null });
    fireEvent.click(screen.getByRole('button', { name: /Adjust exposure/ }));
    // The popover is open AND the panel is still mounted (the cell-click path
    // clears the selection; the panel path must not).
    expect(screen.getByText('Cell exposure')).toBeInTheDocument();
    expect(screen.getByText('Selected placement')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Shade' }));
    expect(onSetExposureOverride).toHaveBeenCalledWith('shade');
  });
});

// SMA-309 R2: the details link must carry the SAME origin the
// PlantsInGardenSection chips carry (router state, not the URL), so the
// detail page offers its back-to-garden affordance from either entry point —
// and a pasted /library URL still degrades to the plain plant page.
describe('PlacementDetailPanel plant-details link origin (SMA-309 R2)', () => {
  function LocationProbe() {
    const location = useLocation();
    return (
      <div data-testid="location-probe">
        {JSON.stringify({ pathname: location.pathname, state: location.state })}
      </div>
    );
  }

  it('navigating through the link lands on the plant page with the planner origin', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <PlacementDetailPanel
                placement={placement}
                plant={spacedPlant}
                soil={undefined}
                language={i18n.language}
                catalogReady
                cellSize="50cm"
                gridRows={3}
                gridCols={3}
                checkFit={() => ({ ok: true })}
                describeOverlap={() => ({ plant: '', cell: '' })}
                onSetFootprint={vi.fn()}
                onMove={vi.fn()}
                onRemove={vi.fn()}
                gardenId="g7"
                gardenName="Potager du fond"
              />
            }
          />
          <Route path="/library/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Plant details' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent(
      JSON.stringify({
        pathname: '/library/p1',
        state: {
          from: 'planner',
          gardenId: 'g7',
          gardenName: 'Potager du fond',
        },
      })
    );
  });
});
