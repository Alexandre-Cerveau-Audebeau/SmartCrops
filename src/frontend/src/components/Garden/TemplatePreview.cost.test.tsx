import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import TemplatePreview from './TemplatePreview';
import { fitPreview } from '../../utils/gardenPreview';
import type { PreviewPlan } from '../../utils/gardenTemplates';

/**
 * SMA-336 PR 2/5, round 1 (E14) — the MEASUREMENT behind refusing the canvas.
 *
 * The finding asks for a `<canvas>` on fitted previews, on the grounds that a
 * plan may be up to 100 × 100 and the component draws one DOM node per cell.
 * The premise is exact and the numbers are worth pinning; what the numbers do
 * not support is the conclusion, so they are asserted here rather than argued in
 * a commit message. If a future plan size or a future widget moves them, this
 * test is what says so.
 */

const plan = (cols: number, rows: number, placements = 0): PreviewPlan => ({
  cols,
  rows,
  cells: [],
  placements: Array.from({ length: placements }, (_, i) => ({
    plantKey: `p-${i}`,
    row: i % rows,
    col: i % cols,
    spanRows: 1,
    spanCols: 1,
  })),
});

function nodesFor(cols: number, rows: number, maxW: number, maxH: number, placements = 0) {
  const { container, unmount } = render(
    <ThemeProvider theme={createTheme()}>
      <TemplatePreview
        template={plan(cols, rows, placements)}
        fitTo={{ maxW, maxH }}
      />
    </ThemeProvider>
  );
  const count = container.querySelectorAll('*').length;
  unmount();
  return count;
}

describe('what a fitted thumbnail actually costs in DOM nodes', () => {
  it('a 40 × 30 plan in a 48 px thumbnail is 1 201 nodes', () => {
    // The case the finding names. One node per cell of the plan, whatever the
    // thumbnail measures — the fit changes the track size, never the node count.
    expect(nodesFor(40, 30, 48, 48)).toBe(40 * 30 + 1);
  });

  it('the same plan in the 34 × 26 table thumbnail costs exactly as much', () => {
    expect(nodesFor(40, 30, 34, 26)).toBe(40 * 30 + 1);
  });

  it('the layout ceiling, 100 × 100, is 10 001 nodes', () => {
    // `SaveLayoutRequest` bounds width and height at 100, so this is the worst
    // case the contract allows — not a hypothetical.
    expect(nodesFor(100, 100, 48, 48)).toBe(100 * 100 + 1);
  });

  it('placements add one node each, on top of the cells', () => {
    expect(nodesFor(40, 30, 48, 48, 25)).toBe(40 * 30 + 25 + 1);
  });

  it('a 10 × 8 garden — the shape the product actually has — is 81 nodes', () => {
    // The measured DEV data: the two real gardens are 10 × 8. The worst case is
    // what the contract allows; this is what the widget draws today.
    expect(nodesFor(10, 8, 48, 48)).toBe(10 * 8 + 1);
  });

  it('draws at one pixel per cell rather than refusing the big plan', () => {
    // What a 100 × 100 plan looks like at 48 px, which is the other half of the
    // decision: 10 000 nodes buy a picture with no readable cell in it.
    expect(fitPreview(100, 100, 48, 48)).toEqual({ cellPx: 1, gapPx: 0 });
    expect(fitPreview(40, 30, 48, 48)).toEqual({ cellPx: 1, gapPx: 0 });
    // And the shape the product has, for comparison: readable cells.
    expect(fitPreview(10, 8, 48, 48)).toEqual({ cellPx: 3, gapPx: 1 });
  });
});
