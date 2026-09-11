import { fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import type {
  DashboardTotals,
  DashboardVarietyData,
} from '../../../types/DashboardData';
import { getPlantColor } from '../../../utils/plantColor';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import { placement } from '../../../test/fixtures/placements';
import { rulesFor } from '../../../test/dashboardDom';
import CountersBlock from './CountersBlock';
import { COUNTERS_GARDEN_ALL, COUNTERS_LINE_CAP } from './countersOptions';

// SMA-336 PR 2/5 — the Counters widget. Three things carry the weight here: the
// ornamental split follows rule R4 and not either signal alone, the header chip
// counts DISTINCT varieties, and pastilles are the default while photos are the
// option.

const variety = (
  over: Partial<DashboardVarietyData> = {}
): DashboardVarietyData => ({
  plantId: 'p-1',
  scientificName: 'Ocimum basilicum',
  commonName: 'Basil',
  plantType: 'Herb',
  isEdible: true,
  imageUrl: null,
  imageAttribution: null,
  count: 4,
  cells: 4,
  gardenIds: ['g1'],
  ...over,
});

const garden = (id: string, name: string) => gardenFixture({ id, name });


const totals = (over: Partial<DashboardTotals> = {}): DashboardTotals => ({
  gardenCount: 1,
  placementCount: 10,
  varietyCount: 3,
  catalogPlantCount: 536,
  ...over,
});

/** The widget's own DOM node — the frozen artboards' `data-widget` handle. */
const widgetNode = () =>
  document.querySelector('[data-widget="counters"]') as HTMLElement;

function renderBlock(props: Partial<React.ComponentProps<typeof CountersBlock>> = {}) {
  // Pinned EN through the provider, as the page tests do: since SMA-393 the
  // no-key default is French, and i18n only re-applies the stored language when
  // LanguageProvider mounts.
  localStorage.setItem('smartcrops-language', 'en');
  render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
      <MemoryRouter>
        <CountersBlock
          size="large"
          options={null}
          varieties={[variety()]}
          gardens={[garden('g1', 'Terrasse')]}
          totals={totals()}
          loading={false}
          loadError={false}
          onRetry={() => {}}
          {...props}
        />
      </MemoryRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
  return within(widgetNode());
}

describe('CountersBlock', () => {
  it('lists each variety with its count', () => {
    const widget = renderBlock({
      varieties: [
        variety({ plantId: 'p-1', commonName: 'Basil', count: 4 }),
        variety({ plantId: 'p-2', commonName: 'Aubergine', count: 1 }),
      ],
    });

    expect(widget.getByText('Basil')).toBeInTheDocument();
    expect(widget.getByText('× 4')).toBeInTheDocument();
    expect(widget.getByText('× 1')).toBeInTheDocument();
  });

  it('falls back to the scientific name when nothing is translated', () => {
    const widget = renderBlock({
      varieties: [variety({ commonName: null, scientificName: 'Athyrium vidalii' })],
    });

    expect(widget.getByText('Athyrium vidalii')).toBeInTheDocument();
  });

  it('counts DISTINCT varieties in the header chip, not the per-garden sum', () => {
    // Decision D11: a variety planted in two gardens is one variety. The chip
    // reads the aggregate's own total rather than the length of the list, which
    // a garden filter would shorten.
    const widget = renderBlock({
      varieties: [variety({ plantId: 'p-1' }), variety({ plantId: 'p-2' })],
      totals: totals({ varietyCount: 2 }),
    });

    expect(widget.getByText('2 varieties')).toBeInTheDocument();
  });

  it('draws that chip FILLED and green, as the artboard has it (A10-5)', () => {
    // `Main.dc.html` l. 145 — `<span class="pill ok num">128 plantes</span>`,
    // `.pill.ok { background: var(--chip-ok-bg); color: var(--chip-ok-tx) }`.
    // Counters is the one header chip the artboards paint green; Gardens and
    // Statistics take the neutral `.pill.n`. It was an MUI outline: a bordered
    // ghost where the design draws a tinted lozenge.
    const widget = renderBlock({
      varieties: [variety({ plantId: 'p-1' })],
      totals: totals({ varietyCount: 1 }),
    });

    const chip = widget.getByText('1 variety').closest('.MuiChip-root')!;
    const rules = rulesFor(chip).toLowerCase().replace(/\s+/g, '');

    expect(rules).toContain('background-color:#e4f3e9');
    expect(rules).toContain('color:#20713f');
    expect(chip.className).not.toContain('MuiChip-outlined');
  });

  describe('the ornamental split (rule R4)', () => {
    it('puts an ornamental variety under its own heading', () => {
      const widget = renderBlock({
        varieties: [
          variety({ plantId: 'p-1', commonName: 'Basil', plantType: 'Herb' }),
          variety({
            plantId: 'p-2',
            commonName: 'Lady fern',
            plantType: 'Ornamental',
            isEdible: false,
          }),
        ],
      });

      expect(widget.getByText('Ornamental')).toBeInTheDocument();
      expect(widget.getByText('Lady fern')).toBeInTheDocument();
    });

    it('keeps a Vegetable on the edible side even when its own flag says no', () => {
      // 31 catalog plants are exactly this: a food type with isEdible false.
      const widget = renderBlock({
        varieties: [
          variety({
            plantId: 'p-1',
            commonName: 'Star onion',
            plantType: 'Vegetable',
            isEdible: false,
          }),
        ],
      });

      expect(widget.queryByText('Ornamental')).toBeNull();
      expect(widget.getByText('Star onion')).toBeInTheDocument();
    });

    it('keeps an edible-flagged Ornamental on the edible side', () => {
      // And 38 catalog plants are the mirror case.
      const widget = renderBlock({
        varieties: [
          variety({
            plantId: 'p-1',
            commonName: 'Daylily',
            plantType: 'Ornamental',
            isEdible: true,
          }),
        ],
      });

      expect(widget.queryByText('Ornamental')).toBeNull();
    });

    it('shows no ornamental heading when there is nothing to put under it', () => {
      const widget = renderBlock({ varieties: [variety()] });

      expect(widget.queryByText('Ornamental')).toBeNull();
    });
  });

  describe('avatars', () => {
    it('draws a colour pastille by default, and no image request', () => {
      const widget = renderBlock({
        varieties: [variety({ plantId: 'p-1', imageUrl: 'https://example/x.jpg' })],
      });

      // No <img> at all: twenty photos are twenty requests to a third party,
      // and the option is off.
      expect(widget.queryByRole('img')).toBeNull();
      expect(document.querySelectorAll('[data-widget="counters"] img')).toHaveLength(0);
      // A PLAIN dot, no letter (round 6, partie E1): `Main.dc.html` l. 158,
      // `.dot { width: 14px; height: 14px; border-radius: 50% }` filled with
      // the plant's hue. The widget drew the planner's lettered avatar.
      const pastille = widgetNode().querySelector('[data-variety-dot]')!;
      expect(pastille).toHaveStyle({ backgroundColor: getPlantColor('p-1') });
      expect(pastille.textContent).toBe('');
      const rules = rulesFor(pastille).replace(/\s+/g, '');
      expect(rules).toContain('width:14px');
      expect(rules).toContain('height:14px');
      expect(rules).toContain('border-radius:50%');
      expect(widget.queryByText('B')).toBeNull();
    });

    it('draws the photo when the option is on', () => {
      renderBlock({
        options: { photos: true },
        varieties: [variety({ imageUrl: 'https://bs.plantnet.org/habit.jpg' })],
      });

      const img = widgetNode().querySelector('img');
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute('src', 'https://bs.plantnet.org/habit.jpg');
    });

    it('falls back to the brand placeholder for a variety with no photo', () => {
      // A quarter of the placed varieties have none.
      renderBlock({
        options: { photos: true },
        varieties: [variety({ imageUrl: null })],
      });

      const img = widgetNode().querySelector('img');
      expect(img?.getAttribute('src')).toContain('data:image/svg+xml');
    });

    it('ignores an options document it does not recognise', () => {
      // The block's options are persisted JSON this build may not have written.
      const widget = renderBlock({
        options: { photos: 'yes-please', garden: 42 } as Record<string, unknown>,
      });

      expect(document.querySelectorAll('[data-widget="counters"] img')).toHaveLength(0);
      expect(widget.getByText('Basil')).toBeInTheDocument();
    });
  });

  describe('the per-garden filter', () => {
    it('shows the chips only when there is more than one garden to choose from', () => {
      const widget = renderBlock({ gardens: [garden('g1', 'Terrasse')] });
      expect(widget.queryByText('All gardens')).toBeNull();
    });

    it('keeps only the varieties of the selected garden', () => {
      const widget = renderBlock({
        options: { garden: 'g2' },
        gardens: [garden('g1', 'Terrasse'), garden('g2', 'Balcon')],
        varieties: [
          variety({ plantId: 'p-1', commonName: 'Basil', gardenIds: ['g1'] }),
          variety({ plantId: 'p-2', commonName: 'Aubergine', gardenIds: ['g2'] }),
        ],
      });

      expect(widget.queryByText('Basil')).toBeNull();
      expect(widget.getByText('Aubergine')).toBeInTheDocument();
    });

    it('falls back to all gardens when the stored filter names a deleted one', () => {
      // Otherwise the widget empties with no way back: the chip row no longer
      // offers that garden, so the user cannot clear the filter.
      const widget = renderBlock({
        options: { garden: 'gone' },
        gardens: [garden('g1', 'Terrasse'), garden('g2', 'Balcon')],
        varieties: [variety({ commonName: 'Basil', gardenIds: ['g1'] })],
      });

      expect(widget.getByText('Basil')).toBeInTheDocument();
    });
  });

  describe('truncation', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      variety({
        plantId: `p-${index}`,
        commonName: `Plant ${index}`,
        plantType: 'Herb',
        isEdible: true,
      })
    );

    it('a Medium card lists eight varieties then offers the rest', () => {
      const widget = renderBlock({ size: 'medium', varieties: many });

      expect(widget.getByText('Plant 7')).toBeInTheDocument();
      expect(widget.queryByText('Plant 8')).toBeNull();
      expect(widget.getByText('+4 varieties')).toBeInTheDocument();
    });

    it('the « +N » reveals the rest in place', () => {
      const widget = renderBlock({ size: 'medium', varieties: many });

      fireEvent.click(widget.getByText('+4 varieties'));

      expect(widget.getByText('Plant 11')).toBeInTheDocument();
    });
  });

  describe('states', () => {
    it('invites a first planting when nothing is placed anywhere', () => {
      const widget = renderBlock({ varieties: [] });

      expect(widget.getByText('No plant placed yet.')).toBeInTheDocument();
      expect(widget.getByText('Add from the Library →')).toBeInTheDocument();
    });

    it('states plainly that a filtered garden holds nothing', () => {
      const widget = renderBlock({
        options: { garden: 'g2' },
        gardens: [garden('g1', 'Terrasse'), garden('g2', 'Balcon')],
        varieties: [variety({ gardenIds: ['g1'] })],
      });

      expect(widget.getByText('This garden holds no plant yet.')).toBeInTheDocument();
    });

    it('offers a retry when the aggregate failed', () => {
      const widget = renderBlock({ loadError: true });

      expect(widget.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });
});

describe('CountersBlock — the edible split survives the cut (round 1, E6)', () => {
  /**
   * Five ornamentals, then four edibles — the aggregate's order, by count, and
   * NINE varieties for a Medium card that shows eight. One row has to go, and
   * which one is the whole finding.
   */
  const ornamentalsFirst = [
    ...Array.from({ length: 5 }, (_, i) =>
      variety({
        plantId: `orn-${i}`,
        commonName: `Fern ${i}`,
        plantType: 'Ornamental',
        isEdible: false,
        count: 20 - i,
      })
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      variety({
        plantId: `edi-${i}`,
        commonName: `Basil ${i}`,
        plantType: 'Herb',
        isEdible: true,
        count: 4 - i,
      })
    ),
  ];

  it('shows every edible variety at Medium even when ornamentals outrank them', () => {
    // The failure: `filtered` is ordered by placement count, so slicing it to
    // the limit BEFORE the R4 partition let the ferns take the card. The
    // headings stayed in the right order while the wrong rows survived.
    const widget = renderBlock({ size: 'medium', varieties: ornamentalsFirst });

    for (const name of ['Basil 0', 'Basil 1', 'Basil 2', 'Basil 3']) {
      expect(widget.getByText(name)).toBeInTheDocument();
    }
  });

  it('keeps the ORNAMENTAL section when ornamentals remain', () => {
    const widget = renderBlock({ size: 'medium', varieties: ornamentalsFirst });

    expect(widget.getByText('Ornamental')).toBeInTheDocument();
  });

  it('hides the ornamental tail rather than the edible head', () => {
    // Eight of eight fit at Medium, so cut deeper: twelve varieties, five
    // edible. Whatever is hidden must come from the ornamental end.
    const many = [
      ...Array.from({ length: 9 }, (_, i) =>
        variety({
          plantId: `orn-${i}`,
          commonName: `Fern ${i}`,
          plantType: 'Ornamental',
          isEdible: false,
          count: 30 - i,
        })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        variety({
          plantId: `edi-${i}`,
          commonName: `Basil ${i}`,
          plantType: 'Herb',
          isEdible: true,
          count: 5 - i,
        })
      ),
    ];

    const widget = renderBlock({ size: 'medium', varieties: many });

    for (let i = 0; i < 5; i++) {
      expect(widget.getByText(`Basil ${i}`)).toBeInTheDocument();
    }
    expect(widget.getByText('+6 varieties')).toBeInTheDocument();
  });

  it('counts the same hidden total as before the fix', () => {
    // `hidden` is arithmetic on the same list; only WHICH rows survive changes.
    // Nine varieties, eight shown: one hidden, whichever end it comes from.
    const widget = renderBlock({ size: 'medium', varieties: ornamentalsFirst });

    expect(widget.getByText('+1 variety')).toBeInTheDocument();
  });

  it('the ORNAMENT section goes when eight edible varieties fill the card', () => {
    // STATED, not hidden — it is the consequence of putting edibles first, and
    // it is what the frozen design's own Medium card draws (Main.dc.html shows
    // eight edible varieties and « +18 variétés » on a fixture that holds seven
    // ornamentals). Flagged for arbitration in the round-1 report: the widget
    // cannot both cut ornamentals first and keep their heading on a card that
    // fits eight rows.
    const eightEdible = [
      ...Array.from({ length: 8 }, (_, i) =>
        variety({
          plantId: `edi-${i}`,
          commonName: `Basil ${i}`,
          plantType: 'Herb',
          isEdible: true,
          count: 8 - i,
        })
      ),
      variety({
        plantId: 'orn-1',
        commonName: 'Fern',
        plantType: 'Ornamental',
        isEdible: false,
        count: 1,
      }),
    ];

    const widget = renderBlock({ size: 'medium', varieties: eightEdible });

    expect(widget.queryByText('Ornamental')).toBeNull();
    expect(widget.getByText('+1 variety')).toBeInTheDocument();
  });
});

describe('CountersBlock — the density lock (V9, _spec.md § 4)', () => {
  const many = Array.from({ length: 26 }, (_, i) =>
    variety({ plantId: `p-${i}`, commonName: `Plant ${i}`, count: 26 - i })
  );

  /** Rows actually drawn. (The `grid` query that used to ride along was read
      by nobody, and rested on MUI's class token and nesting — round 7, S03.) */
  function listShape(size: 'medium' | 'large') {
    const widget = renderBlock({ size, varieties: many });
    const rows = many
      .map((v) => widget.queryByText(v.commonName!))
      .filter(Boolean);
    return { rows: rows.length, widget };
  }

  it('Medium shows eight varieties over two columns — four data lines, cap six', () => {
    const { rows } = listShape('medium');

    expect(rows).toBe(8);
    // The lock is on LINES, not on varieties: eight in one column was eight
    // lines on a card that allows six, which is why the body scrolled instead
    // of capping.
    expect(Math.ceil(rows / 2)).toBeLessThanOrEqual(COUNTERS_LINE_CAP.medium);
  });

  it('Large shows nineteen varieties over two columns — ten data lines, cap ten', () => {
    const { rows } = listShape('large');

    expect(rows).toBe(19);
    expect(Math.ceil(rows / 2)).toBeLessThanOrEqual(COUNTERS_LINE_CAP.large);
  });

  it.each(['medium', 'large'] as const)(
    'draws %s in two columns, as the frozen design has it',
    (size) => {
      const widget = renderBlock({ size, varieties: many });

      const columns = [...widgetNode().querySelectorAll('*')]
        .map((node) => getComputedStyle(node).gridTemplateColumns)
        .filter((value) => value.includes('minmax'));

      expect(columns.length).toBeGreaterThan(0);
      expect(columns[0]).toBe('repeat(2, minmax(0, 1fr))');
      widget.getByText('Plant 0');
    }
  );

  it('Medium reaches the rest through « +18 varieties »', () => {
    expect(
      renderBlock({ size: 'medium', varieties: many }).getByText('+18 varieties')
    ).toBeInTheDocument();
  });

  it('Large reaches the rest through « +7 varieties »', () => {
    expect(
      renderBlock({ size: 'large', varieties: many }).getByText('+7 varieties')
    ).toBeInTheDocument();
  });
});

describe('CountersBlock — the garden chips actually filter (round 1, E7)', () => {
  const gardens = [garden('g1', 'Terrasse'), garden('g2', 'Balcon')];
  const varieties = [
    variety({ plantId: 'p-1', commonName: 'Basil', gardenIds: ['g1'] }),
    variety({ plantId: 'p-2', commonName: 'Mint', gardenIds: ['g2'] }),
  ];

  it('writes the same options document the gear panel writes', () => {
    const written: Record<string, unknown>[] = [];
    const widget = renderBlock({
      gardens,
      varieties,
      options: { photos: false, garden: COUNTERS_GARDEN_ALL },
      onOptionsChange: (options) => written.push(options),
    });

    fireEvent.click(widget.getByText('Balcon'));

    expect(written).toEqual([{ photos: false, garden: 'g2' }]);
  });

  it('carries the other option through untouched', () => {
    // The panel replaces the whole document, so a chip that wrote only `garden`
    // would silently turn the photos option off.
    const written: Record<string, unknown>[] = [];
    const widget = renderBlock({
      gardens,
      varieties,
      options: { photos: true, garden: 'g1' },
      onOptionsChange: (options) => written.push(options),
    });

    fireEvent.click(widget.getByText('All gardens'));

    expect(written).toEqual([{ photos: true, garden: COUNTERS_GARDEN_ALL }]);
  });

  it('is reachable and pressable from the keyboard', () => {
    const written: Record<string, unknown>[] = [];
    const widget = renderBlock({
      gardens,
      varieties,
      options: { photos: false, garden: COUNTERS_GARDEN_ALL },
      onOptionsChange: (options) => written.push(options),
    });

    const chip = widget.getByText('Balcon').closest('.MuiChip-root')!;
    expect(chip).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(chip, { key: 'Enter' });
    fireEvent.keyUp(chip, { key: 'Enter' });

    expect(written).toEqual([{ photos: false, garden: 'g2' }]);
  });

  it('says which chip is on, for a screen reader as well as for the eye', () => {
    const widget = renderBlock({
      gardens,
      varieties,
      options: { photos: false, garden: 'g2' },
      onOptionsChange: () => {},
    });

    expect(widget.getByText('Balcon').closest('.MuiChip-root')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      widget.getByText('Terrasse').closest('.MuiChip-root')
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters the list by the stored garden', () => {
    const widget = renderBlock({
      gardens,
      varieties,
      options: { photos: false, garden: 'g2' },
      onOptionsChange: () => {},
    });

    expect(widget.queryByText('Basil')).toBeNull();
    expect(widget.getByText('Mint')).toBeInTheDocument();
  });

  it('draws no selection it cannot honour when nothing can write the options', () => {
    // Without `onOptionsChange` the chips carry no handler, so they must not
    // pretend to be a single-select the user can operate.
    //
    // WIDENED by round 3 (E″4 / G″3): a stored garden is set here, so the row
    // has a selection to draw and deliberately does not. `tabindex` alone left
    // the two halves of the affordance in place — the filled variant and
    // `aria-pressed="true"` — which is a single-select drawn over nothing for
    // the eye and announced as a pressed toggle to a screen reader.
    const widget = renderBlock({
      gardens,
      varieties,
      options: { photos: false, garden: 'g2' },
    });

    const selected = widget.getByText('Balcon').closest('.MuiChip-root')!;
    const other = widget.getByText('Terrasse').closest('.MuiChip-root')!;
    const all = widget.getByText('All gardens').closest('.MuiChip-root')!;

    for (const chip of [selected, other, all]) {
      expect(chip).not.toHaveAttribute('tabindex');
      expect(chip).not.toHaveAttribute('aria-pressed');
      expect(chip.className).toContain('MuiChip-outlined');
      expect(chip.className).not.toContain('MuiChip-filled');
    }
  });

  it('keeps the whole affordance as soon as a writer is there', () => {
    // The other side of the same rule: nothing is taken away from the case that
    // works.
    const widget = renderBlock({
      gardens,
      varieties,
      options: { photos: false, garden: 'g2' },
      onOptionsChange: () => {},
    });

    const selected = widget.getByText('Balcon').closest('.MuiChip-root')!;

    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected.className).toContain('MuiChip-filled');
    expect(selected).toHaveAttribute('tabindex', '0');
  });
});

// ROUND 6 (partie A) — the filter reaches every figure the widget states. Each
// case below picks a garden whose figure DIFFERS from the page-wide one, so a
// site that still read the aggregate would print the wrong number.
describe('CountersBlock — the garden filter reaches every figure (round 6, A)', () => {
  // Basil once on the terrace and twice on the balcony; thyme twice on the
  // terrace only. Page-wide: 5 placements, 2 varieties. On the balcony: 2
  // placements, 1 variety, basil « × 2 ».
  const terrace = {
    ...garden('g1', 'Terrasse'),
    placements: [
      placement({ id: 'a', plantId: 'p-basil' }),
      placement({ id: 'b', plantId: 'p-thyme', startCol: 1 }),
      placement({ id: 'c', plantId: 'p-thyme', startCol: 2 }),
    ],
    placementCount: 3,
    varietyCount: 2,
  };
  const balcony = {
    ...garden('g2', 'Balcon'),
    placements: [
      placement({ id: 'd', plantId: 'p-basil' }),
      placement({ id: 'e', plantId: 'p-basil', startCol: 1 }),
    ],
    placementCount: 2,
    varietyCount: 1,
  };
  const twoGardens = [terrace, balcony];
  const twoVarieties = [
    variety({ plantId: 'p-basil', commonName: 'Basil', count: 3, gardenIds: ['g1', 'g2'] }),
    variety({ plantId: 'p-thyme', commonName: 'Thyme', count: 2, gardenIds: ['g1'] }),
  ];
  const pageTotals = totals({ gardenCount: 2, placementCount: 5, varietyCount: 2 });

  const onBalcony = (over: Partial<React.ComponentProps<typeof CountersBlock>> = {}) =>
    renderBlock({
      gardens: twoGardens,
      varieties: twoVarieties,
      totals: pageTotals,
      options: { garden: 'g2' },
      ...over,
    });

  it('control — with no filter, every figure is the page’s', () => {
    const widget = renderBlock({
      gardens: twoGardens,
      varieties: twoVarieties,
      totals: pageTotals,
    });

    expect(widget.getByText('2 varieties')).toBeInTheDocument();
    expect(widget.getByText('× 3')).toBeInTheDocument();
    expect(widget.getByText('× 2')).toBeInTheDocument();
  });

  it('the header chip counts the selected garden’s varieties', () => {
    const widget = onBalcony();

    expect(widget.getByText('1 variety')).toBeInTheDocument();
    expect(widget.queryByText('2 varieties')).toBeNull();
  });

  it('each row counts the placements of the selected garden, not the page’s', () => {
    // GitHub, hors diff, `CountersBlock.tsx:195`: the aggregate groups
    // placements by plant across every garden, so basil read « × 3 » on a
    // widget filtered to a balcony that holds two.
    const widget = onBalcony();

    expect(widget.getByText('Basil')).toBeInTheDocument();
    expect(widget.getByText('× 2')).toBeInTheDocument();
    expect(widget.queryByText('× 3')).toBeNull();
    expect(widget.queryByText('Thyme')).toBeNull();
  });

  it('the Small card states the selected garden’s placements and varieties', () => {
    // Extension #4-7: the filter is stored on the block, so it survives a
    // resize — and the Small card printed the page totals over it.
    const widget = onBalcony({ size: 'small' });

    expect(widget.getByText('2')).toBeInTheDocument();
    expect(widget.getByText('2 plants')).toBeInTheDocument();
    expect(widget.getByText('1 variety of 536 in the catalog')).toBeInTheDocument();
    expect(widget.queryByText('5')).toBeNull();
    expect(widget.queryByText('5 plants')).toBeNull();
  });

  it('« +N » counts what the filter hides, not what the page hides', () => {
    // Ten varieties on the terrace, nine of them also on the balcony: a Medium
    // card shows eight, so the page hides two and the balcony hides one.
    const many = Array.from({ length: 10 }, (_, index) =>
      variety({
        plantId: `p-${index}`,
        commonName: `Variety ${index}`,
        count: 1,
        gardenIds: index < 9 ? ['g1', 'g2'] : ['g1'],
      })
    );
    const widget = renderBlock({
      size: 'medium',
      gardens: twoGardens,
      varieties: many,
      totals: totals({ gardenCount: 2, placementCount: 19, varietyCount: 10 }),
      options: { garden: 'g2' },
    });

    expect(widget.getByText('+1 variety')).toBeInTheDocument();
    expect(widget.queryByText('+2 varieties')).toBeNull();
  });

  it('a stored garden that is gone falls back to the page figures', () => {
    const widget = onBalcony({ options: { garden: 'gone' } });

    expect(widget.getByText('2 varieties')).toBeInTheDocument();
    expect(widget.getByText('× 3')).toBeInTheDocument();
  });
});

// ROUND 6 (Extension #5-6) — « +N » collapses again when the list it was
// opened against changes.
describe('CountersBlock — the density lock survives a resize and a filter change (round 6)', () => {
  const many = Array.from({ length: 26 }, (_, index) =>
    variety({ plantId: `p-${index}`, commonName: `Variety ${index}`, gardenIds: ['g1', 'g2'] })
  );
  const two = [garden('g1', 'Terrasse'), garden('g2', 'Balcon')];

  function mount(size: 'medium' | 'large', options: Record<string, unknown> | null) {
    localStorage.setItem('smartcrops-language', 'en');
    const ui = (s: 'medium' | 'large', o: Record<string, unknown> | null) => (
      <ThemeProvider theme={createTheme()}>
        <LanguageProvider>
          <MemoryRouter>
            <CountersBlock
              size={s}
              options={o}
              varieties={many}
              gardens={two}
              totals={totals({ gardenCount: 2, placementCount: 26, varietyCount: 26 })}
              loading={false}
              loadError={false}
              onRetry={() => {}}
              onOptionsChange={() => {}}
            />
          </MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>
    );
    const rendered = render(ui(size, options));
    return {
      rerender: (s: 'medium' | 'large', o: Record<string, unknown> | null) =>
        rendered.rerender(ui(s, o)),
    };
  }

  const rows = () => widgetNode().querySelectorAll('[data-variety-row]').length;

  it('a Medium card expanded then resized to Large is capped again at ten lines', () => {
    // A bare boolean survived the resize: 26 rows on a card whose lock is ten
    // data lines — the V9 defect over again, one size later.
    const { rerender } = mount('medium', null);
    expect(rows()).toBe(8);

    fireEvent.click(within(widgetNode()).getByText('+18 varieties'));
    expect(rows()).toBe(26);

    rerender('large', null);
    expect(rows()).toBe(19);
    expect(within(widgetNode()).getByText('+7 varieties')).toBeInTheDocument();
  });

  it('a Large card expanded then filtered to another garden is capped again', () => {
    const { rerender } = mount('large', { garden: 'g1' });
    fireEvent.click(within(widgetNode()).getByText('+7 varieties'));
    expect(rows()).toBe(26);

    rerender('large', { garden: 'g2' });
    expect(rows()).toBe(19);
  });

  // ROUND 7 (S28 — Extension #7-9) — the « +N » is a two-way control.
  it('an expanded list offers « Show fewer », which caps it again in place', () => {
    // `setExpandedFor` was the only writer and the button left with `hidden`:
    // an expanded Large card scrolled inside the widget for the rest of the
    // session, and the only ways back — a resize, a filter change — worked by
    // accident, because they change the identity.
    mount('large', null);
    expect(within(widgetNode()).queryByText('Show fewer')).toBeNull();

    fireEvent.click(within(widgetNode()).getByText('+7 varieties'));
    expect(rows()).toBe(26);
    expect(within(widgetNode()).queryByText('+7 varieties')).toBeNull();

    fireEvent.click(within(widgetNode()).getByText('Show fewer'));
    expect(rows()).toBe(19);
    expect(within(widgetNode()).getByText('+7 varieties')).toBeInTheDocument();
    expect(within(widgetNode()).queryByText('Show fewer')).toBeNull();
  });
});

// ROUND 7 — the 🟡 Minor inline of `556f0d0` (`CountersBlock.tsx` L142): the
// expansion is keyed on the DATA too.
describe('CountersBlock — « +N » collapses again when the data under it is replaced (round 7)', () => {
  const list = () =>
    Array.from({ length: 26 }, (_, index) =>
      variety({ plantId: `p-${index}`, commonName: `Variety ${index}`, gardenIds: ['g1'] })
    );

  it('a refreshed aggregate under the same size and garden is capped again', () => {
    // A delete or a refetch hands the widget a NEW `varieties` array with the
    // same size and the same garden filter: the identity string did not
    // change, so the refreshed list stayed expanded past its ten-line cap.
    localStorage.setItem('smartcrops-language', 'en');
    const ui = (varieties: DashboardVarietyData[]) => (
      <ThemeProvider theme={createTheme()}>
        <LanguageProvider>
          <MemoryRouter>
            <CountersBlock
              size="large"
              options={null}
              varieties={varieties}
              gardens={[garden('g1', 'Terrasse')]}
              totals={totals({ placementCount: 26, varietyCount: 26 })}
              loading={false}
              loadError={false}
              onRetry={() => {}}
            />
          </MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>
    );
    const rows = () => widgetNode().querySelectorAll('[data-variety-row]').length;
    const rendered = render(ui(list()));
    expect(rows()).toBe(19);

    fireEvent.click(within(widgetNode()).getByText('+7 varieties'));
    expect(rows()).toBe(26);

    rendered.rerender(ui(list()));
    expect(rows()).toBe(19);
    expect(within(widgetNode()).getByText('+7 varieties')).toBeInTheDocument();
  });
});

// ROUND 6 (Extension #5-7) — one glyph per widget, from the one table.
describe('CountersBlock — the empty state draws the widget’s own glyph (round 6)', () => {
  it('reads BLOCK_ICONS.counters rather than restating a glyph', () => {
    const widget = renderBlock({ varieties: [] });

    expect(
      widget.getByText('No plant placed yet.').closest('[data-widget]')!
        .querySelector('svg[data-testid="LocalFloristOutlinedIcon"]')
    ).not.toBeNull();
    expect(widgetNode().querySelector('svg[data-testid="GrassOutlinedIcon"]')).toBeNull();
  });
});

// ROUND 6 (partie D / E1) — the ornamental heading and the row, at the
// artboard's own measurements.
describe('CountersBlock — the N5 finishes and the row (round 6)', () => {
  it('draws the ornamental heading as `.sec-t` — 800 / 0.06em (N5-3)', () => {
    const widget = renderBlock({
      varieties: [
        variety({ plantId: 'p-1', commonName: 'Basil', plantType: 'Herb' }),
        variety({ plantId: 'p-2', commonName: 'Lady fern', plantType: 'Fern', isEdible: false }),
      ],
    });

    const heading = widget.getByRole('heading', { level: 3, name: 'Ornamental' });
    const rules = rulesFor(heading).replace(/\s+/g, '');
    expect(rules).toContain('font-weight:800');
    expect(rules).toContain('letter-spacing:0.06em');
  });

  it('lays the row out as `Main.dc.html` draws it — 10 px gap, name 600, count 700 (E1)', () => {
    const widget = renderBlock();

    const row = widget.getByText('Basil').parentElement!;
    expect(rulesFor(row).replace(/\s+/g, '')).toContain('gap:10px');
    expect(rulesFor(widget.getByText('Basil')).replace(/\s+/g, '')).toContain('font-weight:600');
    expect(rulesFor(widget.getByText('× 4')).replace(/\s+/g, '')).toContain('font-weight:700');
  });

  it('draws the photo avatar at the artboard’s 26 px (E1)', () => {
    renderBlock({
      options: { photos: true },
      varieties: [variety({ imageUrl: 'https://bs.plantnet.org/habit.jpg' })],
    });

    const avatar = widgetNode().querySelector('.MuiAvatar-root')!;
    const rules = rulesFor(avatar).replace(/\s+/g, '');
    expect(rules).toContain('width:26px');
    expect(rules).toContain('height:26px');
  });
});

// ROUND 6 (N6-1 / N6-3) — the filter row and the grid, at `A3Expert`'s measures.
describe('CountersBlock — the filter row and the grid (round 6, N6)', () => {
  const two = [garden('g1', 'Terrasse'), garden('g2', 'Balcon')];

  it('draws the filter chips 30 px high, the selected one in the primary colour (N6-1)', () => {
    // `<span class="pill" style="height: 30px; padding: 0 13px; background:
    // var(--prim); color: var(--on-prim)">Tous les jardins</span>` and
    // `<span class="pill type" style="height: 30px; padding: 0 13px">` for the
    // others. MUI's default filled chip is grey, and the row was 26 px.
    const widget = renderBlock({
      gardens: two,
      options: { photos: false, garden: 'g2' },
      onOptionsChange: () => {},
    });

    const selected = widget.getByText('Balcon').closest('.MuiChip-root')!;
    const other = widget.getByText('Terrasse').closest('.MuiChip-root')!;
    expect(selected.className).toContain('MuiChip-colorPrimary');
    expect(selected.className).toContain('MuiChip-filled');
    expect(other.className).toContain('MuiChip-outlined');
    for (const chip of [selected, other]) {
      expect(rulesFor(chip).replace(/\s+/g, '')).toContain('height:30px');
    }
  });

  it('spaces the two columns 24 px apart (N6-3)', () => {
    const widget = renderBlock({
      varieties: [
        variety({ plantId: 'p-1', commonName: 'Basil' }),
        variety({ plantId: 'p-2', commonName: 'Thyme' }),
      ],
    });

    const grid = widget.getByText('Basil').parentElement!.parentElement!;
    expect(rulesFor(grid).replace(/\s+/g, '')).toContain('column-gap:24px');
  });
});
