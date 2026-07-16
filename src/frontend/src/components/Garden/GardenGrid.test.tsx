import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
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
});
