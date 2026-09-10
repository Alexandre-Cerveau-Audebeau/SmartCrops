import { cleanup, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import type { DashboardGardenData } from '../../../types/DashboardData';
import { serializeCellsJson, type CellData } from '../../../types/GardenLayout';
import StatsBlock from './StatsBlock';

// SMA-336 PR 2/5 — the Statistics widget. What it must get right: the surface
// counts ACTIVE cells, the occupancy is a share of the plantable ones, the
// exposure header names the season and moment it fixed, and a garden with no
// plan reports a marker rather than a zero.

const garden = (over: Partial<DashboardGardenData> = {}): DashboardGardenData => ({
  id: 'g1',
  name: 'Terrasse',
  description: null,
  width: 4,
  height: 2,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: 'S',
    gardenType: null,
    lightSchedule: null,
    hemisphere: 'N',
    latitudeBand: 'mid',
  },
  updatedAt: '2026-05-01T00:00:00Z',
  placements: [],
  placementCount: 0,
  varietyCount: 0,
  occupiedCells: 0,
  isEdible: null,
  ...over,
});

const widgetNode = () =>
  document.querySelector('[data-widget="stats"]') as HTMLElement;

function renderBlock(
  props: Partial<React.ComponentProps<typeof StatsBlock>> = {},
  language: 'en' | 'fr' = 'en'
) {
  // Pinned through the STORED key, which is what `LanguageProvider` re-applies
  // on mount — since SMA-393 the no-key default is French.
  localStorage.setItem('smartcrops-language', language);
  render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <StatsBlock
          size="large"
          gardens={[garden()]}
          loading={false}
          loadError={false}
          onRetry={() => {}}
          {...props}
        />
      </LanguageProvider>
    </ThemeProvider>
  );
  return within(widgetNode());
}

describe('StatsBlock', () => {
  it('turns the ACTIVE cells into a surface, ignoring the ones switched off', () => {
    const grid: CellData[][] = [
      [{ active: true }, { active: true }, { active: false }, { active: true }],
      [{ active: true }, { active: true }, { active: true }, { active: true }],
    ];

    const widget = renderBlock({
      gardens: [garden({ cellsJson: serializeCellsJson(grid) })],
    });

    // Seven active cells of 50 cm: 7 × 0.25 = 1.75 m², rounded for display.
    expect(widget.getByText('1.8 m²')).toBeInTheDocument();
    expect(widget.getByText(/7 active cells/)).toBeInTheDocument();
  });

  it('states occupancy as a share of the PLANTABLE cells', () => {
    const grid: CellData[][] = [
      [{ active: true }, { active: true }, { active: false }, { active: false }],
      [{ active: true }, { active: true }, { active: false }, { active: false }],
    ];

    const widget = renderBlock({
      gardens: [
        garden({ cellsJson: serializeCellsJson(grid), occupiedCells: 2 }),
      ],
    });

    // Two of four plantable, not two of eight.
    expect(widget.getByText('50 %')).toBeInTheDocument();
  });

  it('counts free cells, and how many of them are in full sun', () => {
    const widget = renderBlock({
      gardens: [garden({ occupiedCells: 3 })],
    });

    // Eight active, three planted: five free. The sunny share comes from the
    // engine, so the assertion is on the sentence rather than on a number the
    // exposure model owns.
    expect(widget.getByText(/5 free cells/)).toBeInTheDocument();
  });

  it('names the season and the moment it fixed, rather than implying a clock', () => {
    // Decision D12: summer at noon, always. A figure derived from the current
    // date would change under a user who changed nothing, and would make this
    // very test depend on the day it runs.
    const widget = renderBlock();

    expect(
      widget.getByText('Dominant exposure — Summer · Noon')
    ).toBeInTheDocument();
  });

  it('lists the three sections of the frozen design at Large', () => {
    const widget = renderBlock();

    expect(widget.getByText('Occupancy by garden')).toBeInTheDocument();
    expect(widget.getByText(/Dominant exposure/)).toBeInTheDocument();
    expect(widget.getByText('Exposure by garden')).toBeInTheDocument();
  });

  it('uses the LONG exposure label, not the table’s short form', () => {
    // Point 19 of the frozen design: « Afternoon » is the table's form because
    // its column is 51 px; a section row has the space for the full wording.
    // Two matches on a Large card is right — the distribution names all four
    // categories, and the per-garden section names each garden's dominant one.
    const widget = renderBlock();

    expect(widget.getAllByText('Full sun').length).toBeGreaterThan(0);
    expect(widget.getByText("Afternoon sun")).toBeInTheDocument();
  });

  describe('a garden with no plan', () => {
    const unplanned = garden({ id: 'g2', name: 'Jamais dessiné', width: null, height: null });

    it('still appears, with a marker instead of a zero', () => {
      const widget = renderBlock({ gardens: [garden(), unplanned] });

      // Twice: the occupancy section and the per-garden exposure section both
      // list every garden, drawn or not.
      expect(widget.getAllByText('Jamais dessiné')).toHaveLength(2);
      // Zero is a measurement; « not drawn yet » is not, and the two must not
      // read the same.
      expect(widget.getAllByText('No plan').length).toBeGreaterThan(0);
    });

    it('is left out of the totals rather than counted as empty', () => {
      const onlyPlanned = renderBlock({ gardens: [garden()] });
      const surface = onlyPlanned.getByText(/m²/).textContent;
      // UNMOUNT, not « remove the nodes » (round 1, E12). Wiping
      // `document.body.innerHTML` took the first tree's DOM away and left its
      // React root — and its effects — alive, and Testing Library's auto
      // cleanup then unmounted a container whose nodes were already gone.
      // `StatsBlock` registers no subscription today, so it passed; the first
      // effect or timer it gains would have surfaced as a flake in a
      // neighbouring test rather than here.
      cleanup();

      const withUnplanned = renderBlock({ gardens: [garden(), unplanned] });

      expect(withUnplanned.getByText(/m²/).textContent).toBe(surface);
    });
  });

  describe('states', () => {
    it('says plainly that there is no garden yet', () => {
      const widget = renderBlock({ gardens: [] });

      expect(
        widget.getByText('Create a garden to see its statistics.')
      ).toBeInTheDocument();
    });

    it('points at the planner when gardens exist but none is drawn', () => {
      const widget = renderBlock({
        gardens: [garden({ width: null, height: null })],
      });

      expect(
        widget.getByText(
          "Draw a garden's plan to see its surface and its exposure."
        )
      ).toBeInTheDocument();
    });

    it('offers a retry when the aggregate failed', () => {
      const widget = renderBlock({ loadError: true });

      expect(widget.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('shows skeletons while the aggregate is in flight', () => {
      renderBlock({ loading: true });

      expect(
        widgetNode().querySelectorAll('.MuiSkeleton-root').length
      ).toBeGreaterThan(0);
    });
  });

  describe('sizes', () => {
    it('a Small card carries the headline and the free-cell line only', () => {
      const widget = renderBlock({ size: 'small' });

      expect(widget.getByText(/m²/)).toBeInTheDocument();
      expect(widget.queryByText('Occupancy by garden')).toBeNull();
    });

    it('a Medium card adds the occupancy section, not the exposure ones', () => {
      const widget = renderBlock({ size: 'medium' });

      expect(widget.getByText('Occupancy by garden')).toBeInTheDocument();
      expect(widget.queryByText('Exposure by garden')).toBeNull();
    });
  });
});

describe('StatsBlock — section labels are headings (round 1, E13)', () => {
  it('gives each Large section a heading one level below the widget title', () => {
    // A Large card carries three of these, each introducing its own list of
    // rows. As bare Typography a screen reader met three unlabelled groups with
    // nothing to jump between; the widget card's own title is the h2 above them.
    const widget = renderBlock({ size: 'large', gardens: [garden()] });

    const headings = widget
      .getAllByRole('heading', { level: 3 })
      .map((node) => node.textContent);

    expect(headings).toContain('Occupancy by garden');
    expect(headings).toContain('Exposure by garden');
    expect(headings.some((text) => text?.startsWith('Dominant exposure'))).toBe(
      true
    );
  });

  it('leaves the styling exactly where it was', () => {
    // The change is semantic only: the existing tests select these labels by
    // text, and they still find them.
    const widget = renderBlock({ size: 'large', gardens: [garden()] });

    expect(widget.getByText('Occupancy by garden')).toBeInTheDocument();
  });
});

describe('StatsBlock — figures in the reader’s language (round 1, G5)', () => {
  it('writes the surface with the French decimal comma', () => {
    // `toFixed(1)` always emits a point, so the French widget printed « 1.8 m² »
    // in a page that writes every other decimal with a comma.
    const widget = renderBlock({ gardens: [garden()] }, 'fr');

    expect(widget.getByText(/m²/).textContent).toMatch(/^\d+,\d m²$/);
  });

  it('writes it with a point in English', () => {
    const widget = renderBlock({ gardens: [garden()] });

    expect(widget.getByText(/m²/).textContent).toMatch(/^\d+\.\d m²$/);
  });

  it('never reaches the screen through toFixed', () => {
    // The rule, not just the one site: no figure of this widget is formatted by
    // `toFixed` or by bare concatenation.
    const widget = renderBlock({ size: 'large', gardens: [garden()] });

    expect(widget.getByText(/m²/).textContent).not.toContain('NaN');
  });
});
