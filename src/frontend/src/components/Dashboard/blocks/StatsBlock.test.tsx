import { cleanup, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import type { DashboardGardenData } from '../../../types/DashboardData';
import { serializeCellsJson, type CellData } from '../../../types/GardenLayout';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import { at } from '../../../test/fixtures/placements';
import { rulesFor } from '../../../test/dashboardDom';
import StatsBlock from './StatsBlock';

// SMA-336 PR 2/5 — the Statistics widget. What it must get right: the surface
// counts ACTIVE cells, the occupancy is a share of the plantable ones, the
// exposure header names the season and moment it fixed, and a garden with no
// plan reports a marker rather than a zero.

// The overrides that carry meaning stay here: 4 × 2 (eight cells, 2.0 m²), and
// a south orientation so the exposure engine rates every cell.
const garden = (over: Partial<DashboardGardenData> = {}): DashboardGardenData =>
  gardenFixture({
    height: 2,
    config: {
      orientation: 'S',
      gardenType: null,
      lightSchedule: null,
      hemisphere: 'N',
      latitudeBand: 'mid',
    },
    ...over,
  });

const widgetNode = () =>
  document.querySelector('[data-widget="stats"]') as HTMLElement;

/**
 * The card's own headline surface (round 4, A6).
 *
 * `getByText(/m²/)` used to be unique; `A3Expert.dc.html` puts « 20 m² · 68 % »
 * on every occupancy row, so the total needs to be asked for by name. The widget
 * declares `data-stats-surface` for exactly this, the way it already declares
 * `data-widget`.
 */
const surfaceNode = () =>
  widgetNode().querySelector('[data-stats-surface]') as HTMLElement;

/**
 * The Large card's header chip (round 5, A10-7).
 *
 * `A3Expert.dc.html` states the surface THERE — `<span class="pill n num">42,5
 * m² · occupation moyenne 67 %</span>` — and draws no headline at all under it,
 * so the Large card no longer carries a `data-stats-surface` node. The tests
 * that are about the surface DERIVATION render a Medium card, where the
 * headline still lives; the ones about the chip ask for it by name.
 */
const chipNode = () =>
  widgetNode().querySelector('[data-stats-chip]') as HTMLElement;


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
      size: 'medium',
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
        garden({
          cellsJson: serializeCellsJson(grid),
          occupiedCells: 2,
          placements: [at(0, 0), at(0, 1)],
        }),
      ],
    });

    // Two of four plantable, not two of eight — and the row carries the
    // SURFACE beside the share now (A6): four cells of 50 cm make 1 m².
    expect(widget.getByText('1.0 m² · 50 %')).toBeInTheDocument();
  });

  it('counts free cells, and how many of them are in full sun', () => {
    const widget = renderBlock({
      gardens: [garden({ occupiedCells: 3, placements: [at(0, 0), at(0, 1), at(0, 2)] })],
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

  it('states the dominant exposure as ONE segmented bar, not four rows (A6)', () => {
    // `A3Expert.dc.html` draws a single 16 px strip whose four segments are the
    // four shares, then a pastille legend under it. The widget stacked four
    // 42 px rows instead — 168 px where the artboard spends about 64, which is
    // the single biggest reason the Large card scrolled inside itself (V7).
    const widget = renderBlock();
    const node = widgetNode();

    const bars = node.querySelectorAll('[data-exposure-bar]');
    // One for the whole page, then one per garden.
    expect(bars).toHaveLength(2);

    const dominant = bars[0] as HTMLElement;
    // One segment per category the plan actually rates — at most four, never
    // four fixed rows. The fixture garden faces south with nothing shading it,
    // so its cells all land in the same category and the bar is one segment.
    expect(dominant.children.length).toBeGreaterThan(0);
    expect(dominant.children.length).toBeLessThanOrEqual(4);

    // The legend is a SIBLING of the bar, and it carries all four names with
    // their figures: colour is never the only signal (§ 7 of the design
    // contract), and the four labels are one wrapped row rather than four
    // 42 px lines.
    const section = within(dominant.parentElement!);
    for (const label of [
      'Full sun',
      'Morning sun',
      'Afternoon sun',
      'Shade',
    ]) {
      expect(section.getByText(label)).toBeInTheDocument();
    }
    expect(section.getAllByText(/%|—/).length).toBe(4);
    expect(widget.getByText('Occupancy by garden')).toBeInTheDocument();
  });

  it('gives every garden its own bar and its dominant share (A6)', () => {
    // The rows named the dominant category in words and said nothing about the
    // other three, so two gardens that are 62 % and 98 % full sun read alike.
    const widget = renderBlock({
      gardens: [garden(), garden({ id: 'g2', name: 'Balcon' })],
    });

    expect(widgetNode().querySelectorAll('[data-exposure-bar]')).toHaveLength(3);
    // The dominant category still travels with the figure in words, for a
    // reader who cannot take the swatch.
    expect(widget.getAllByText('Full sun').length).toBeGreaterThanOrEqual(2);
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
      renderBlock({ size: 'medium', gardens: [garden()] });
      const surface = surfaceNode().textContent;
      // UNMOUNT, not « remove the nodes » (round 1, E12). Wiping
      // `document.body.innerHTML` took the first tree's DOM away and left its
      // React root — and its effects — alive, and Testing Library's auto
      // cleanup then unmounted a container whose nodes were already gone.
      // `StatsBlock` registers no subscription today, so it passed; the first
      // effect or timer it gains would have surfaced as a flake in a
      // neighbouring test rather than here.
      cleanup();

      renderBlock({ size: 'medium', gardens: [garden(), unplanned] });

      expect(surfaceNode().textContent).toBe(surface);
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

// ROUND 5 — the two marks of the A10 list, at the artboards' measurements.
describe('StatsBlock — the exposure swatch and the occupancy bar (round 5)', () => {
  it('draws the exposure swatch as a rounded SQUARE with a border (A10-9)', () => {
    // `Main.dc.html` l. 202: `.sw-ex { width: 13px; height: 13px;
    // border-radius: 4px; border: 1px solid }`. It was a circle, which beside
    // the planner's own rounded cells reads as a bullet rather than as a piece
    // of the plan. ONE component for the three sites that render it — this
    // legend, the per-garden dominant swatch, and the Gardens table's
    // EXPOSITION cell.
    renderBlock();

    const dots = widgetNode().querySelectorAll('[data-exposure-dot]');
    expect(dots.length).toBeGreaterThanOrEqual(4);

    for (const dot of dots) {
      const rules = rulesFor(dot).toLowerCase().replace(/\s+/g, '');
      expect(rules).toContain('border-radius:4px');
      expect(rules).toContain('border:1pxsolid');
      expect(rules).not.toContain('border-radius:50%');
    }
  });

  it('hatches the SHADE swatch, and only that one (A10-9)', () => {
    // `.ex-shade { background-image: var(--hatch) }` — a 45° trame. Shade is
    // the one category the design paints in a cool grey, which is also what an
    // unfilled surface looks like: the trame is the difference between
    // « shaded » and « nothing measured », and it is the signal of the four
    // that survives greyscale.
    renderBlock();

    const shade = widgetNode().querySelector('[data-exposure-dot="shade"]')!;
    expect(
      rulesFor(shade).toLowerCase().replace(/\s+/g, '')
    ).toContain('background-image:repeating-linear-gradient(45deg');

    const full = widgetNode().querySelector('[data-exposure-dot="full"]')!;
    expect(
      rulesFor(full).toLowerCase().replace(/\s+/g, '')
    ).not.toContain('repeating-linear-gradient');
  });

  it('gives the occupancy bar the artboard’s 9 px (A10-8)', () => {
    // `Main.dc.html` l. 172: `.bar { height: 9px; border-radius: 999px }`. It
    // was 6 px on a 3 px radius, which at a 10 % fill drew a sliver too thin to
    // read as a quantity.
    renderBlock({ size: 'medium' });

    const track = widgetNode().querySelector('[data-occupancy-track]')!;
    const rules = rulesFor(track).toLowerCase().replace(/\s+/g, '');
    expect(rules).toContain('height:9px');
    expect(rules).toContain('border-radius:999px');
  });
});

// ROUND 5 (B2, B3) — what the rows are worth, and what a garden with no plan
// puts where its figure would be.
// ROUND 5 (C1) — the finding both surfaces raised, with two different anchors:
// the Extension on `ExposureBar.tsx:54` (the component carries the
// `aria-hidden`), GitHub on `StatsBlock.tsx:317` (the per-garden call site does
// not compensate for it).
describe('StatsBlock — the per-garden exposure, for a screen reader (C1)', () => {
  it('names each garden’s bar with its COMPLETE distribution', () => {
    // The rows state the dominant category and its share and nothing else, the
    // legend above them describes the page rather than a garden, and the bar
    // that draws the four shares is decorative — so three of every garden's
    // four shares were nowhere a screen reader could reach.
    const widget = renderBlock({
      gardens: [garden(), garden({ id: 'g2', name: 'Balcon' })],
    });

    for (const name of ['Terrasse', 'Balcon']) {
      const bar = widget.getByRole('img', {
        name: new RegExp('^' + name + ':'),
      });
      const label = bar.getAttribute('aria-label')!;
      for (const category of [
        'Full sun',
        'Morning sun',
        'Afternoon sun',
        'Shade',
      ]) {
        expect(label).toContain(category);
      }
      // Four shares, four figures — the whole distribution and not the
      // dominant one repeated.
      expect(label.match(/%/g)).toHaveLength(4);
    }
  });

  it('leaves the AGGREGATE bar decorative, where the legend already says it', () => {
    // The distribution section prints all four categories with all four
    // percentages directly under its bar. Naming that bar as well would read
    // the same distribution twice.
    renderBlock();

    const bars = [...widgetNode().querySelectorAll('[data-exposure-bar]')];
    expect(bars[0]).toHaveAttribute('aria-hidden', 'true');
    expect(bars[0]).not.toHaveAttribute('aria-label');
    expect(bars[1]).toHaveAttribute('role', 'img');
    expect(bars[1]).not.toHaveAttribute('aria-hidden');
  });
});

describe('StatsBlock — row proportions and the « no plan » marker (round 5)', () => {
  const rows = () => [...widgetNode().querySelectorAll('[data-stat-row]')];

  it('gives the garden name 160 px and pins the figure column at 116 (B2)', () => {
    // The artboard's own gardens are « Terrasse », « Balcon sud » and « Potager
    // du fond », and its 120 px label track holds them; real ones do not —
    // « Test Template… », « Another anoth… » — while the bar beside them took
    // 248 px to state one percentage. 160 px is about nineteen characters at
    // 15 px semibold instead of about fourteen.
    //
    // The last track is FIXED rather than `auto`, and that is the other half:
    // each row is its own grid, so an `auto` track sized itself on its own
    // content — « 20 m² · 68 % » and « 3 m² · 50 % » are not the same width —
    // and every bar in the section ended at a different x. The `min-content`
    // floor keeps the figure from being clipped on a card too narrow to grant
    // the track: the bar collapses first, which is the right order.
    renderBlock();

    const rules = rulesFor(rows()[0]!).toLowerCase().replace(/\s+/g, '');
    expect(rules).toContain(
      'grid-template-columns:minmax(0,160px)minmax(0,1fr)minmax(min-content,116px)'
    );
  });

  it('puts the « no plan » marker where the VALUE goes, not across the track (B3)', () => {
    // It was the row's middle child, and a `MissingDataMark` is a grid item
    // like any other: stretched across a whole `1fr` track it drew a 212 px
    // dashed lozenge that read as an empty bar — the one thing rule 4 of the
    // design contract forbids a missing figure from looking like. In the value
    // column it keeps its natural width, right-aligned where `A3Expert` writes
    // « 20 m² · 68 % », and it replaces the « — » that stood there.
    renderBlock({
      gardens: [
        garden(),
        garden({ id: 'g2', name: 'Jamais dessiné', width: null, height: null }),
      ],
    });

    const marks = [...widgetNode().querySelectorAll('[data-missing-mark]')];
    // One in the occupancy section, one in the per-garden exposure section.
    expect(marks).toHaveLength(2);

    for (const mark of marks) {
      const row = mark.closest('[data-stat-row]')!;
      const value = mark.parentElement!;
      // THIRD child of the three: the bar's track is left empty above it.
      expect([...row.children].indexOf(value)).toBe(2);
      expect(value.textContent).toBe('No plan');
      // And it is not stretched: the marker is an inline box inside the value
      // cell, never the cell itself.
      expect(mark).not.toBe(value);
    }
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

// ROUND 5 (A10-7) — the header chip the Large card never had.
describe('StatsBlock — the header chip of the Large card (A10-7)', () => {
  it('states the surface and the overall occupancy, as `A3Expert` writes it', () => {
    // `<span class="pill n num">42,5 m² · occupation moyenne 67 %</span>` in
    // the widget's `.hd-r`. The fixture is 4 × 2 at 50 cm — eight active cells,
    // 2.0 m² — with nothing planted in it.
    renderBlock();

    expect(chipNode().textContent).toBe('2.0 m² · 0 % average occupancy');
  });

  it('states the occupancy as a share of every plantable cell', () => {
    // The OVERALL share, not the mean of the per-garden percentages: a 1 m²
    // balcony must not weigh as much as a 20 m² terrace. The second garden is
    // deliberately HALF the size of the first, so the weighted figure and the
    // mean cannot agree by coincidence: eight plantable cells and four, two
    // planted in the first and none in the second.
    renderBlock({
      gardens: [
        garden({ occupiedCells: 2, placements: [at(0, 0), at(0, 1)] }),
        garden({ id: 'g2', name: 'Balcon', width: 2, height: 2 }),
      ],
    });

    // 2 planted of 12 plantable = 17 %; the mean of 25 % and 0 % is 13 %.
    expect(chipNode().textContent).toContain('17 %');
  });

  it('does not repeat the surface in the body of the Large card', () => {
    // The artboard goes straight from the header to « Occupation par jardin ».
    // Keeping the headline as well would print « 2.0 m² » twice, 60 px apart.
    const widget = renderBlock();

    expect(surfaceNode()).toBeNull();
    expect(widget.getByText('Occupancy by garden')).toBeInTheDocument();
  });

  it('keeps the active-cell line the Medium card shows', () => {
    // Rule 3 of the design contract: a bigger card shows MORE, never something
    // different. The artboard drops this line on its Large card; dropping it
    // here would make Large the one size that says less than Medium.
    const widget = renderBlock();

    expect(widget.getByText(/8 active cells/)).toBeInTheDocument();
  });

  it('is absent while there is nothing to state', () => {
    renderBlock({ gardens: [garden({ width: null, height: null })] });

    expect(chipNode()).toBeNull();
  });
});

describe('StatsBlock — figures in the reader’s language (round 1, G5)', () => {
  it('writes the surface with the French decimal comma', () => {
    // `toFixed(1)` always emits a point, so the French widget printed « 1.8 m² »
    // in a page that writes every other decimal with a comma.
    renderBlock({ size: 'medium', gardens: [garden()] }, 'fr');

    expect(surfaceNode().textContent).toMatch(/^\d+,\d m²$/);
  });

  it('writes it with a point in English', () => {
    renderBlock({ size: 'medium', gardens: [garden()] });

    expect(surfaceNode().textContent).toMatch(/^\d+\.\d m²$/);
  });

  it('never reaches the screen through toFixed', () => {
    // The rule, not just the one site: no figure of this widget is formatted by
    // `toFixed` or by bare concatenation.
    renderBlock({ size: 'medium', gardens: [garden()] });

    expect(surfaceNode().textContent).not.toContain('NaN');
  });
});
