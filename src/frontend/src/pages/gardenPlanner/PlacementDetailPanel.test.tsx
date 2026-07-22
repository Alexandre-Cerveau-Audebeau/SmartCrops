import { useState } from 'react';
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

function renderPanel(props: { catalogReady: boolean }) {
  return render(
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
