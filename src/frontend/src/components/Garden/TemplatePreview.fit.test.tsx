import { render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { getDashboardTokens } from '../../theme/dashboardTokens';
import { getPlannerTokens } from '../../theme/plannerTokens';
import { gardenToPreview } from '../../utils/gardenPreview';
import { getGardenTemplate } from '../../utils/gardenTemplates';
import TemplatePreview from './TemplatePreview';

// SMA-336 PR 2/5 — what the WIDENING added, tested beside the lot-2 file rather
// than inside it. `TemplatePreview.test.tsx` and `gardenTemplates.test.ts` pass
// unchanged: that is the proof the new props are additions and not a rewrite,
// so this file only exercises what did not exist before — drawing a real
// garden, fitting it into a box, and the two rules that keep a 2 px thumbnail
// readable.

function renderFitted(
  ui: React.ReactElement,
  mode: 'light' | 'dark' = 'light'
) {
  render(
    <ThemeProvider theme={createTheme({ palette: { mode } })}>{ui}</ThemeProvider>
  );
  const preview = screen.getByTestId('template-preview');
  return {
    preview,
    cells: within(preview).getAllByTestId('template-preview-cell'),
    plants: within(preview).queryAllByTestId('template-preview-plant'),
  };
}

const bigGarden = () =>
  gardenToPreview(
    JSON.stringify([
      { row: 0, col: 0, soil: 'humus' },
      { row: 1, col: 3, infrastructure: 'wall' },
      { row: 2, col: 2, active: false },
    ]),
    40,
    30,
    [
      {
        id: 'pl-1',
        plantId: 'p-1',
        plantScientificName: 'Solanum lycopersicum',
        startRow: 0,
        startCol: 1,
        spanRows: 1,
        spanCols: 1,
        notes: null,
      },
    ]
  );

describe('TemplatePreview drawing a real garden (SMA-336 PR 2/5)', () => {
  it('draws a 40 × 30 plan a template could never have described', () => {
    // The whole point of the widening: `GardenTemplate.cols` is the literal 10,
    // so this shape was not expressible before — not at runtime, at compile
    // time.
    const { cells, plants } = renderFitted(
      <TemplatePreview template={bigGarden()} fitTo={{ maxW: 48, maxH: 48 }} />
    );

    expect(cells).toHaveLength(40 * 30);
    expect(plants).toHaveLength(1);
  });

  it('keeps the painted cells of the stored plan', () => {
    const { cells } = renderFitted(
      <TemplatePreview template={bigGarden()} fitTo={{ maxW: 48, maxH: 48 }} />
    );
    const at = (row: number, col: number) => cells[row * 40 + col]!;

    expect(at(0, 0)).toHaveAttribute('data-cell-kind', 'soil:humus');
    expect(at(1, 3)).toHaveAttribute('data-cell-kind', 'infra:wall');
    expect(at(2, 2)).toHaveAttribute('data-cell-kind', 'inactive');
    expect(at(5, 5)).toHaveAttribute('data-cell-kind', 'empty');
  });

  it('fits the plan inside the box it was given', () => {
    const { preview } = renderFitted(
      <TemplatePreview template={bigGarden()} fitTo={{ maxW: 48, maxH: 48 }} />
    );

    // 40 columns in 48 px leaves one pixel each and nothing for gaps.
    expect(preview).toHaveStyle({
      gridTemplateColumns: 'repeat(40, 1px)',
      gridTemplateRows: 'repeat(30, 1px)',
      gap: '0px',
    });
  });

  it('keeps the gap when the plan is small enough to afford it', () => {
    const small = gardenToPreview(null, 10, 8, []);

    const { preview } = renderFitted(
      <TemplatePreview template={small} fitTo={{ maxW: 48, maxH: 48 }} />
    );

    expect(preview).toHaveStyle({ gap: '1px' });
  });

  it('erases the plant inset below a 4 px cell, so plantings stay visible', () => {
    // At 2 px per cell a 1×1 block inset by 2 px on each side measures zero:
    // the frozen design drops the inset rather than the block.
    const { plants } = renderFitted(
      <TemplatePreview template={bigGarden()} fitTo={{ maxW: 48, maxH: 48 }} />
    );

    expect(plants[0]).toHaveStyle({ margin: '0px' });
  });

  it('keeps the 2 px inset at a readable cell size', () => {
    const small = gardenToPreview(null, 4, 3, [
      {
        id: 'pl-1',
        plantId: 'p-1',
        plantScientificName: null,
        startRow: 0,
        startCol: 0,
        spanRows: 1,
        spanCols: 1,
        notes: null,
      },
    ]);

    const { plants } = renderFitted(
      <TemplatePreview template={small} fitTo={{ maxW: 96, maxH: 96 }} />
    );

    expect(plants[0]).toHaveStyle({ margin: '2px' });
  });

  it('without fitTo, nothing moves — the template picker is untouched', () => {
    const { preview, plants } = renderFitted(
      <TemplatePreview template={getGardenTemplate('potager')} />
    );

    expect(preview).toHaveStyle({
      gridTemplateColumns: 'repeat(10, 16px)',
      gridTemplateRows: 'repeat(6, 16px)',
      gap: '1px',
    });
    expect(plants[0]).toHaveStyle({ margin: '2px' });
  });
});

describe('TemplatePreview cell colours (SMA-336 PR 2/5)', () => {
  it('takes the planner tokens by default', () => {
    const tk = getPlannerTokens('dark');
    const { preview, cells } = renderFitted(
      <TemplatePreview
        template={gardenToPreview(null, 2, 2, [])}
        fitTo={{ maxW: 40, maxH: 40 }}
      />,
      'dark'
    );

    expect(cells[0]).toHaveStyle({ backgroundColor: tk.cellOn });
    expect(preview).toHaveStyle({ backgroundColor: tk.cellOnBd });
  });

  it('takes the dashboard night cell when the widget passes it', () => {
    // The frozen design moved these for the thumbnail and only for the
    // thumbnail: on a widget card at night the planner's cell sits at 1.04:1
    // and the sketch reads as an empty rectangle.
    const dashboard = getDashboardTokens('dark');
    const planner = getPlannerTokens('dark');

    const { preview, cells } = renderFitted(
      <TemplatePreview
        template={gardenToPreview(null, 2, 2, [])}
        fitTo={{ maxW: 40, maxH: 40 }}
        cellColors={{ on: dashboard.thumbCellOn, frame: dashboard.thumbCellFrame }}
      />,
      'dark'
    );

    expect(cells[0]).toHaveStyle({ backgroundColor: dashboard.thumbCellOn });
    expect(preview).toHaveStyle({ backgroundColor: dashboard.thumbCellFrame });
    // And they really are different values — a test that passed because both
    // sides carried the same hex would prove nothing.
    expect(dashboard.thumbCellOn).not.toBe(planner.cellOn);
    expect(dashboard.thumbCellFrame).not.toBe(planner.cellOnBd);
  });

  it('leaves infrastructure and inactive cells on the planner palette', () => {
    // Only the plain cell and the frame move; a wall must stay the wall the
    // planner draws, or the thumbnail stops being a small version of the plan.
    const tk = getPlannerTokens('dark');
    const dashboard = getDashboardTokens('dark');
    const plan = gardenToPreview(
      JSON.stringify([
        { row: 0, col: 0, infrastructure: 'wall' },
        { row: 0, col: 1, active: false },
      ]),
      2,
      1,
      []
    );

    const { cells } = renderFitted(
      <TemplatePreview
        template={plan}
        fitTo={{ maxW: 40, maxH: 40 }}
        cellColors={{ on: dashboard.thumbCellOn, frame: dashboard.thumbCellFrame }}
      />,
      'dark'
    );

    expect(cells[0]).toHaveStyle({ backgroundColor: tk.infra.wall.bg });
    expect(cells[1]).toHaveStyle({ backgroundColor: tk.cellOff });
  });
});

describe('TemplatePreview — the two plan kinds are separate (round 1, E21)', () => {
  it('refuses a name resolver on a fitted plan, at COMPILE time', () => {
    // The hazard being made unrepresentable: `resolvePlantId` maps a scientific
    // name to a catalog id, and a fitted plan's colour key is a plant ID. Handed
    // one, the resolver resolved nothing, fell through, and the plant silently
    // changed colour. `TemplatePlacement` and `PreviewPlacement` are two types
    // now, and the props union accepts only the plan that produces its own kind
    // — so this is a type error, and `tsc` in `npm run build` is what runs it.
    const plan = gardenToPreview(null, 2, 2, []);

    const rejected = (
      // @ts-expect-error a fitted plan carries plant IDs; there is no name to resolve
      <TemplatePreview
        template={plan}
        fitTo={{ maxW: 40, maxH: 40 }}
        resolvePlantId={(name: string) => name}
      />
    );

    expect(rejected).toBeTruthy();
  });

  it('a fitted plan exposes a final colour key and no scientific name', () => {
    const plan = gardenToPreview(null, 2, 2, [
      {
        id: 'pl-1',
        plantId: 'plant-42',
        plantScientificName: null,
        startRow: 0,
        startCol: 0,
        spanRows: 1,
        spanCols: 1,
        notes: null,
      },
    ]);

    expect(plan.placements[0]).toEqual({
      plantKey: 'plant-42',
      row: 0,
      col: 0,
      spanRows: 1,
      spanCols: 1,
    });
    expect(plan.placements[0]).not.toHaveProperty('scientificName');
  });
});
