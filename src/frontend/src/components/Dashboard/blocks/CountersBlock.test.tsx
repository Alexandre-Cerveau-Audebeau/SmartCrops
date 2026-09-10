import { fireEvent, render, screen, within } from '@testing-library/react';
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
      const widget = renderBlock({
        options: { photos: true },
        varieties: [variety({ imageUrl: 'https://bs.plantnet.org/habit.jpg' })],
      });

      const img = widgetNode().querySelector('img');
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute('src', 'https://bs.plantnet.org/habit.jpg');
    });

    it('falls back to the brand placeholder for a variety with no photo', () => {
      // A quarter of the placed varieties have none.
      const widget = renderBlock({
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
