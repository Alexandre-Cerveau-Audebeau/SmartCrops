import { cleanup, render, screen, within } from '@testing-library/react';
import { ThemeProvider, alpha, createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { getPlannerTokens } from '../../theme/plannerTokens';
import {
  getGardenTemplate,
  type GardenTemplateKey,
} from '../../utils/gardenTemplates';
import { getPlantColor } from '../../utils/plantColor';
import TemplatePreview from './TemplatePreview';

function renderPreview(
  key: GardenTemplateKey,
  mode: 'light' | 'dark' = 'light',
  resolvePlantId?: (scientificName: string) => string | undefined
) {
  render(
    <ThemeProvider theme={createTheme({ palette: { mode } })}>
      <TemplatePreview
        template={getGardenTemplate(key)}
        resolvePlantId={resolvePlantId}
      />
    </ThemeProvider>
  );
  const preview = screen.getByTestId('template-preview');
  const cells = within(preview).getAllByTestId('template-preview-cell');
  const plants = within(preview).getAllByTestId('template-preview-plant');
  // Cells are emitted row-major, so (row, col) → row * cols + col.
  const cellAt = (row: number, col: number) => cells[row * 10 + col]!;
  return { preview, cells, plants, cellAt };
}

describe('TemplatePreview (SMA-18 lot 2)', () => {
  it('draws rows × cols cells plus one rectangle per placement — decorative and inert', () => {
    const { preview, cells, plants } = renderPreview('potager');

    expect(cells).toHaveLength(60);
    expect(plants).toHaveLength(14);
    // Decorative: hidden from assistive tech, no role, no control inside.
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    expect(within(preview).queryAllByRole('button')).toHaveLength(0);
    expect(within(preview).queryAllByRole('grid')).toHaveLength(0);
    expect(preview).toHaveStyle({ pointerEvents: 'none' });
  });

  it('colours cells by kind from the planner tokens (day)', () => {
    const tk = getPlannerTokens('light');
    const potager = renderPreview('potager');
    // The central path (row 3), the water point (5, 9), a plain cell.
    expect(potager.cellAt(3, 0)).toHaveAttribute('data-cell-kind', 'infra:path');
    expect(potager.cellAt(3, 0)).toHaveStyle({ backgroundColor: tk.infra.path.bg });
    expect(potager.cellAt(5, 9)).toHaveAttribute('data-cell-kind', 'infra:water');
    expect(potager.cellAt(5, 9)).toHaveStyle({ backgroundColor: tk.infra.water.bg });
    expect(potager.cellAt(0, 0)).toHaveAttribute('data-cell-kind', 'empty');
    expect(potager.cellAt(0, 0)).toHaveStyle({ backgroundColor: tk.cellOn });
  });

  it('soil shows as a wash over the cell — but never under an infrastructure (§15)', () => {
    const tk = getPlannerTokens('light');
    const japanese = renderPreview('japanese');
    const moss = japanese.cellAt(0, 0);
    expect(moss).toHaveAttribute('data-cell-kind', 'soil:humus');
    expect(moss).toHaveStyle({ backgroundColor: tk.cellOn });
    const wash = alpha(tk.soil.humus.pastille, 0.38);
    expect(moss).toHaveStyle({
      backgroundImage: `linear-gradient(${wash}, ${wash})`,
    });
    // A stone on humus reads as the stone, soil masked.
    const stone = japanese.cellAt(0, 3);
    expect(stone).toHaveAttribute('data-cell-kind', 'infra:wall');
    expect(stone).toHaveStyle({ backgroundColor: tk.infra.wall.bg });
    expect(stone).not.toHaveStyle({
      backgroundImage: `linear-gradient(${wash}, ${wash})`,
    });
  });

  it('follows the night palette', () => {
    const tk = getPlannerTokens('dark');
    const mediterranean = renderPreview('mediterranean', 'dark');
    expect(mediterranean.cellAt(0, 0)).toHaveAttribute('data-cell-kind', 'infra:pot');
    expect(mediterranean.cellAt(0, 0)).toHaveStyle({
      backgroundColor: tk.infra.pot.bg,
    });
    expect(mediterranean.cellAt(1, 0)).toHaveAttribute('data-cell-kind', 'soil:stony');
    expect(mediterranean.cellAt(1, 0)).toHaveStyle({ backgroundColor: tk.cellOn });
  });

  it('plant rectangles take the resolved id colour, else the name hash', () => {
    const unresolved = renderPreview('potager');
    // First placement: Solanum lycopersicum at (0, 0).
    expect(unresolved.plants[0]).toHaveStyle({
      backgroundColor: getPlantColor('Solanum lycopersicum'),
    });
    cleanup();

    const resolved = renderPreview('potager', 'light', (name) =>
      name === 'Solanum lycopersicum' ? 'p-42' : undefined
    );
    expect(resolved.plants[0]).toHaveStyle({
      backgroundColor: getPlantColor('p-42'),
    });
    // An unresolved name keeps the name hash even when a resolver exists.
    expect(resolved.plants[3]).toHaveStyle({
      backgroundColor: getPlantColor('Ocimum basilicum'),
    });
  });
});
