import { fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import type {
  DashboardGardenData,
  DashboardTotals,
  DashboardVarietyData,
} from '../../../types/DashboardData';
import { getPlantColor } from '../../../utils/plantColor';
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

const garden = (id: string, name: string): DashboardGardenData => ({
  id,
  name,
  description: null,
  width: 4,
  height: 3,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
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
});

/** The Emotion class of a node, matched by its `css-` prefix, not by position. */
const emotionClass = (node: Element) => {
  const found = [...node.classList].find((name) => name.startsWith('css-'));
  if (!found) throw new Error('No Emotion class on ' + node.className);
  return found;
};

/** The stylesheet rules Emotion emitted for a node, joined. */
const rulesFor = (node: Element) =>
  [...document.querySelectorAll('style')]
    .map((tag) => tag.textContent ?? '')
    .filter((text) => text.includes(emotionClass(node)))
    .join(' ');

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
      const pastille = widget.getByText('B');
      expect(pastille).toHaveStyle({ backgroundColor: getPlantColor('p-1') });
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

  /** Rows actually drawn, and the grid they are drawn in. */
  function listShape(size: 'medium' | 'large') {
    const widget = renderBlock({ size, varieties: many });
    const rows = many
      .map((v) => widget.queryByText(v.commonName!))
      .filter(Boolean);
    const grid = widgetNode().querySelector<HTMLElement>(
      '[class*="MuiBox-root"] > div'
    );
    return { rows: rows.length, widget, grid };
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
