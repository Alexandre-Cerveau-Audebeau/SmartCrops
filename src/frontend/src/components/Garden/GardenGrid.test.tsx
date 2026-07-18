import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import GardenGrid from './GardenGrid';

// SMA-17 5.3-D / SMA-209 — the grid consumes the planner tokens: base cells
// re-skinned (cellOn/cellOff, both modes) and the exposure layer replaces the
// active cells' fill/border with the §3 category swatches (hatch on shade).

const grid: CellData[][] = [
  [{ active: true }, { active: true }],
  [{ active: false }, { active: true }],
];

const exposure: (ExposureCategory | null)[][] = [
  ['full', 'shade'],
  [null, 'morning'],
];

function renderGrid(opts: {
  mode?: 'light' | 'dark';
  exposure?: (ExposureCategory | null)[][] | null;
} = {}) {
  return render(
    <ThemeProvider theme={createTheme({ palette: { mode: opts.mode ?? 'light' } })}>
      <GardenGrid
        grid={grid}
        shapeEditMode={false}
        exposure={opts.exposure ?? null}
      />
    </ThemeProvider>
  );
}

describe('GardenGrid tokens re-skin + exposure layer', () => {
  it('re-skins base cells to the day tokens (active cellOn, inactive cellOff)', () => {
    renderGrid();
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]).toHaveStyle({ backgroundColor: '#F1F7EE' }); // --cell-on (day)
    expect(cells[2]).toHaveStyle({ backgroundColor: '#ECEEEA' }); // --cell-off (day)
  });

  it('re-skins base cells to the night tokens (SMA-209)', () => {
    renderGrid({ mode: 'dark' });
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]).toHaveStyle({ backgroundColor: '#132740' }); // --cell-on (night)
    expect(cells[2]).toHaveStyle({ backgroundColor: '#0B1830' }); // --cell-off (night)
  });

  it('tints active cells with the §3 category fill and tags data-exposure; inactive stays cellOff', () => {
    renderGrid({ exposure });
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]).toHaveAttribute('data-exposure', 'full');
    expect(cells[0]).toHaveStyle({ backgroundColor: '#FFE7A3' });
    expect(cells[1]).toHaveAttribute('data-exposure', 'shade');
    expect(cells[3]).toHaveAttribute('data-exposure', 'morning');
    // Inactive cell: no tint, keeps the off fill.
    expect(cells[2]).not.toHaveAttribute('data-exposure');
    expect(cells[2]).toHaveStyle({ backgroundColor: '#ECEEEA' });
  });

  it('shade cells carry the §3 hatch as a background-image', () => {
    renderGrid({ exposure });
    const cells = screen.getAllByRole('gridcell');
    expect(cells[1]).toHaveStyle({
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(71,94,120,0.18) 0px, rgba(71,94,120,0.18) 3px, transparent 3px, transparent 8px)',
    });
    // Non-shade tinted cells carry no hatch.
    expect(cells[0]).not.toHaveStyle({
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(71,94,120,0.18) 0px, rgba(71,94,120,0.18) 3px, transparent 3px, transparent 8px)',
    });
  });

  it('layer off (null exposure) leaves no data-exposure tags', () => {
    renderGrid({ exposure: null });
    for (const cell of screen.getAllByRole('gridcell')) {
      expect(cell).not.toHaveAttribute('data-exposure');
    }
  });

  it('forwards the clicked cell element as the popover anchor (R3, CR accept)', () => {
    const onCellClick = vi.fn();
    render(
      <ThemeProvider theme={createTheme()}>
        <GardenGrid grid={grid} shapeEditMode={false} onCellClick={onCellClick} />
      </ThemeProvider>
    );
    const cell = screen.getAllByRole('gridcell')[0]!;
    fireEvent.click(cell);
    expect(onCellClick).toHaveBeenCalledWith(0, 0, cell);
  });

  it('exposes a valid ARIA hierarchy: the grid contains only rows, cells sit inside them (R5, CR accept)', () => {
    renderGrid();
    const gridEl = screen.getByRole('grid');
    const rows = within(gridEl).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('aria-rowindex', '1');
    expect(rows[1]).toHaveAttribute('aria-rowindex', '2');
    expect(within(rows[0]!).getAllByRole('gridcell')).toHaveLength(2);
    expect(within(rows[1]!).getAllByRole('gridcell')).toHaveLength(2);
  });

  it('shape-edit buttons keep gridcell semantics with one-based aria-colindex (R6, CR accept)', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <GardenGrid grid={grid} shapeEditMode />
      </ThemeProvider>
    );
    const gridEl = screen.getByRole('grid');
    const rows = within(gridEl).getAllByRole('row');
    expect(rows).toHaveLength(2);
    const cells = within(rows[0]!).getAllByRole('gridcell');
    expect(cells).toHaveLength(2);
    expect(cells[1]).toHaveAttribute('aria-colindex', '2');
    // Still a real button underneath (behavior unchanged).
    expect(cells[0]!.tagName).toBe('BUTTON');
  });

  it('matches the visible axes in cell a11y: one-based indices, letter columns (R3, CR accept)', () => {
    renderGrid({ exposure });
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]).toHaveAttribute('aria-rowindex', '1');
    expect(cells[0]).toHaveAttribute('aria-colindex', '1');
    expect(cells[0]).toHaveAccessibleName(
      'Full sun — empty cell at row 1, column A'
    );
    expect(cells[2]).toHaveAttribute('aria-rowindex', '2');
    expect(cells[2]).toHaveAccessibleName('Inactive cell at row 2, column A');
    expect(cells[3]).toHaveAccessibleName(
      'Morning sun — empty cell at row 2, column B'
    );
  });
});

// SMA-15 (5.4) — §6 region render: adjacent same-type infrastructure cells
// draw as ONE positioned block (single border + centered icon/label), and the
// selected moment's cast shadows hatch the cells beneath the exposure tints.
describe('GardenGrid infrastructure regions (SMA-15 5.4)', () => {
  const withInfra = (
    cells: CellData[][],
    opts: { castShadow?: boolean[][] | null; exposure?: (ExposureCategory | null)[][] | null } = {}
  ) =>
    render(
      <ThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>
        <GardenGrid
          grid={cells}
          shapeEditMode={false}
          exposure={opts.exposure ?? null}
          castShadow={opts.castShadow ?? null}
        />
      </ThemeProvider>
    );

  it('a 1×6 wall run renders as ONE region block with ONE label (≥4 cells wide)', () => {
    const cells: CellData[][] = [
      Array.from({ length: 6 }, () => ({ active: true, infrastructure: 'wall' as const })),
    ];
    const { container } = withInfra(cells);
    const regions = container.querySelectorAll('[data-infra-region="wall"]');
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveTextContent('Wall');
    // §6: wall day bg + the single perimeter border.
    expect(regions[0]).toHaveStyle({ backgroundColor: '#8A919C' });
  });

  it('two separated walls render as TWO region blocks', () => {
    const cells: CellData[][] = [
      [
        { active: true, infrastructure: 'wall' },
        { active: true },
        { active: true, infrastructure: 'wall' },
      ],
    ];
    const { container } = withInfra(cells);
    expect(container.querySelectorAll('[data-infra-region="wall"]')).toHaveLength(2);
  });

  it('a narrow region (<4 cells wide) shows no label', () => {
    const cells: CellData[][] = [
      [
        { active: true, infrastructure: 'path' },
        { active: true, infrastructure: 'path' },
      ],
    ];
    const { container } = withInfra(cells);
    const region = container.querySelector('[data-infra-region="path"]');
    expect(region).not.toBeNull();
    expect(region).not.toHaveTextContent('Path');
  });

  it('water renders rounded (§6 formes rondes)', () => {
    const cells: CellData[][] = [[{ active: true, infrastructure: 'water' }]];
    const { container } = withInfra(cells);
    expect(container.querySelector('[data-infra-region="water"]')).not.toBeNull();
    // jsdom never APPLIES media-scoped rules, so the §6 radius pair is
    // asserted on the emitted styles instead of the computed style: both the
    // 15px mobile and 29px desktop values must be wired (base cells use 4px).
    const styles = Array.from(document.head.querySelectorAll('style'))
      .map((tag) => tag.textContent)
      .join('');
    expect(styles).toContain('border-radius:15px');
    expect(styles).toContain('border-radius:29px');
  });

  it('infrastructure cells announce their type to assistive tech', () => {
    const cells: CellData[][] = [[{ active: true, infrastructure: 'trellis' }]];
    withInfra(cells);
    expect(screen.getByRole('gridcell')).toHaveAccessibleName(
      'Trellis — row 1, column A'
    );
  });

  it('cast-shadow cells carry the §3 hatch and the data tag while the layer is on', () => {
    const cells: CellData[][] = [[{ active: true }, { active: true }]];
    withInfra(cells, {
      exposure: [['full', 'full']],
      castShadow: [[true, false]],
    });
    const gridCells = screen.getAllByRole('gridcell');
    expect(gridCells[0]).toHaveAttribute('data-cast-shadow', 'true');
    expect(gridCells[0]).toHaveStyle({
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(71,94,120,0.18) 0px, rgba(71,94,120,0.18) 3px, transparent 3px, transparent 8px)',
    });
    expect(gridCells[1]).not.toHaveAttribute('data-cast-shadow');
  });
});
