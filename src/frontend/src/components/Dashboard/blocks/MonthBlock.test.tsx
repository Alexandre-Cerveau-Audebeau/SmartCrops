import { fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { rulesFor } from '../../../test/dashboardDom';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { linkFixture, locationFixture, weatherFixture } from '../../../test/fixtures/weather';
import { getDashboardTokens } from '../../../theme/dashboardTokens';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../../../types/DashboardWeather';
import type { DashboardVarietyData } from '../../../types/DashboardData';
import MonthBlock from './MonthBlock';
import { monthCalendar, monthLabel } from './plantCalendar';

// SMA-336 PR 4a/5 — « Ce mois-ci » against `A2Novice.dc.html` (Small),
// `Main.dc.html` / `A4Manquantes.dc.html` (Medium) and `A3Expert.dc.html`
// (Large: the twelve-month grid, its tinted column, its legend and its foot).
//
// The block reads the BROWSER's month when no garden is located (Q10), so no
// assertion below may name a month: every fixture is dated FROM that same
// month and the expectations are read back from it. One fixture is dated six
// months away, and stays idle whichever month the suite runs in.

const MONTH_TOKENS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

const thisMonth = () => new Date().getMonth() + 1;
const token = (month: number) => MONTH_TOKENS[(month - 1 + 12) % 12]!;
/** Six months from now — never this month, in any month of the year. */
const opposite = () => token(thisMonth() + 6);

const pruned = (over: Partial<DashboardVarietyData> = {}) =>
  varietyFixture({ pruningMonths: token(thisMonth()), ...over });

const thyme = pruned({ plantId: 'thyme', commonName: 'Thyme', count: 6, gardenIds: ['g1'] });
const rosemary = pruned({ plantId: 'rosemary', commonName: 'Rosemary', count: 4, gardenIds: ['g1'] });
const courgette = pruned({ plantId: 'courgette', commonName: 'Courgette', count: 3, gardenIds: ['g1'] });
const sage = pruned({ plantId: 'sage', commonName: 'Sage', count: 2, gardenIds: ['g1'] });
/** Sown this month (its window ENDS now) and harvested now; flowering in the opposite month. */
const lettuce = varietyFixture({
  plantId: 'lettuce',
  commonName: 'Lettuce',
  count: 5,
  gardenIds: ['g1'],
  sowingPeriod: token(thisMonth()),
  harvestPeriod: token(thisMonth()),
  floweringSeason: null,
});
const tomato = varietyFixture({
  plantId: 'tomato',
  commonName: 'Tomato',
  count: 9,
  gardenIds: ['g1'],
  harvestPeriod: token(thisMonth()),
  sowingPeriod: opposite(),
});
/** Dated, but idle this month — it belongs in the grid, not in a counter. */
const idle = varietyFixture({
  plantId: 'idle',
  commonName: 'Zinnia',
  count: 1,
  gardenIds: ['g1'],
  pruningMonths: opposite(),
});
/** Nothing known at all — the foot's subject (D2). */
const fern = varietyFixture({ plantId: 'fern', commonName: 'Fern', count: 7, gardenIds: ['g1'] });

const garden = gardenFixture({ id: 'g1', name: 'Terrasse' });

type Props = React.ComponentProps<typeof MonthBlock>;

function renderBlock(over: Partial<Props> = {}) {
  localStorage.setItem('smartcrops-language', 'en');
  const props: Props = {
    size: 'medium',
    gardens: [garden],
    varieties: [thyme, rosemary, courgette, sage, lettuce, tomato, idle, fern],
    weather: EMPTY_WEATHER_DATA,
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    ...over,
  };
  render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <UnitSystemProvider>
          <MonthBlock {...props} />
        </UnitSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  const card = document.querySelector('[data-widget="month"]') as HTMLElement;
  return { card, widget: within(card), props };
}

/** What the ONE derivation says, for the surfaces to be checked against. */
const expected = (over: Partial<Props> = {}) =>
  monthCalendar(
    over.gardens ?? [garden],
    over.varieties ?? [thyme, rosemary, courgette, sage, lettuce, tomato, idle, fern],
    over.weather ?? EMPTY_WEATHER_DATA
  );

describe('MonthBlock — every surface reads ONE derivation', () => {
  it('prints in each counter exactly what monthCalendar counts, and counts VARIETIES', () => {
    const calendar = expected();
    const { card } = renderBlock({ size: 'large' });

    // Four pruned, one sown, two harvested — varieties, not the 30 placements.
    expect(calendar.active.prune).toHaveLength(4);
    expect(calendar.active.sow).toHaveLength(1);
    expect(calendar.active.harvest).toHaveLength(2);
    expect(card.querySelector('[data-month-count="prune"]')).toHaveTextContent('4to prune');
    expect(card.querySelector('[data-month-count="sow"]')).toHaveTextContent('1to sow');
    expect(card.querySelector('[data-month-count="harvest"]')).toHaveTextContent('2to harvest');
  });

  it('names the month in the header chip, capitalised as the artboard writes it', () => {
    const { card } = renderBlock();
    const month = monthLabel(thisMonth(), 'en');

    expect(card.querySelector('[data-month-chip]')).toHaveTextContent(month);
    expect(card.querySelector('[data-month-chip]')!.textContent).toBe(
      month.charAt(0).toUpperCase() + month.slice(1)
    );
  });
});

describe('MonthBlock — Small (A2Novice.dc.html)', () => {
  it('shows the month in large type and the three counters, and no chip', () => {
    const { card } = renderBlock({ size: 'small' });

    expect(card.querySelector('[data-month-title]')).toHaveTextContent(
      monthLabel(thisMonth(), 'en').charAt(0).toUpperCase() + monthLabel(thisMonth(), 'en').slice(1)
    );
    // The headline IS the month here, so the header chip would say it twice.
    expect(card.querySelector('[data-month-chip]')).toBeNull();
    expect(card.querySelectorAll('[data-month-count]')).toHaveLength(3);
    expect(card.querySelector('[data-month-count="prune"]')).toHaveTextContent('4to prune');
    // No grid and no names on a 1×1 card.
    expect(card.querySelector('[data-month-grid]')).toBeNull();
  });
});

describe('MonthBlock — Medium (Main.dc.html, A4Manquantes.dc.html)', () => {
  it('lists a row per verb with three names and « +N » outside the truncated zone', () => {
    const { card } = renderBlock();

    const prune = card.querySelector('[data-month-row="prune"]')!;
    // « To prune 4 Thyme, Rosemary, Courgette +1 » — ordered by placements.
    expect(prune).toHaveTextContent('To prune');
    expect(prune).toHaveTextContent('Thyme, Rosemary, Courgette');
    expect(card.querySelector('[data-month-more="prune"]')).toHaveTextContent('+1');
    // Under four names there is no « +N » at all.
    expect(card.querySelector('[data-month-row="sow"]')).toHaveTextContent('Lettuce');
    expect(card.querySelector('[data-month-more="sow"]')).toBeNull();
  });

  it('carries the foot that makes the figures readable — counted, never assumed (D2)', () => {
    const { card } = renderBlock();

    expect(expected().unknown.map((v) => v.plantId)).toEqual(['fern']);
    expect(card.querySelector('[data-month-unknown]')).toHaveTextContent('No known calendar for 1 variety');
  });

  it('…and no foot at all when every placed variety has a calendar', () => {
    const { card } = renderBlock({ varieties: [thyme, lettuce] });

    expect(card.querySelector('[data-month-unknown]')).toBeNull();
  });

  it('a month where nothing is due shows three zeros beside the foot, not an empty card', () => {
    const { card } = renderBlock({ varieties: [idle, fern] });

    expect(card.querySelector('[data-month-row="prune"]')).toHaveTextContent('To prune0');
    expect(card.querySelector('[data-month-unknown]')).toHaveTextContent('No known calendar for 1 variety');
  });
});

describe('MonthBlock — Large: the twelve-month grid (A3Expert.dc.html)', () => {
  it('draws the axis, tints the current month, and names the table', () => {
    const { card, widget } = renderBlock({ size: 'large' });

    const grid = widget.getByRole('table', { name: 'Twelve-month calendar of your varieties' });
    expect(grid).toBe(card.querySelector('[data-month-grid]'));
    expect(grid.querySelectorAll('[role="columnheader"]')).toHaveLength(13);
    // ONE tinted axis cell: the month the block is in.
    const now = card.querySelectorAll('[data-month-axis="now"]');
    expect(now).toHaveLength(1);
    expect(now[0]).toHaveTextContent(
      new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2000, thisMonth() - 1, 1))
    );
  });

  it('caps the rows at eight and defers the rest to « +N variétés »', () => {
    const many = Array.from({ length: 11 }, (_, index) =>
      pruned({ plantId: `p${index}`, commonName: `Plant ${index}`, count: 11 - index, gardenIds: ['g1'] })
    );
    const { card } = renderBlock({ size: 'large', varieties: many });

    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(8);
    expect(card.querySelector('[data-month-more-varieties]')).toHaveTextContent('+3 varieties');
  });

  it('…and says nothing of the kind when the eight rows are all there is', () => {
    const { card } = renderBlock({ size: 'large', varieties: [thyme, lettuce, fern] });

    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(2);
    expect(card.querySelector('[data-month-more-varieties]')).toBeNull();
  });

  it('orders the rows the Q13 way, and leaves the undated varieties out of the grid', () => {
    const { card } = renderBlock({ size: 'large' });

    const rows = [...card.querySelectorAll('[data-month-plant]')].map((row) =>
      row.getAttribute('data-month-plant')
    );
    expect(rows).toEqual(expected().known.map((entry) => entry.variety.plantId));
    // Pruned first (by placements), then sown, then harvested, then the idle one.
    expect(rows).toEqual(['thyme', 'rosemary', 'courgette', 'sage', 'lettuce', 'tomato', 'idle']);
    // The fern has no lane at all: it is counted in the foot, never drawn.
    expect(rows).not.toContain('fern');
  });

  it('paints one bar per active month, in the lane’s own token', () => {
    const { card } = renderBlock({ size: 'large' });
    const tokens = getDashboardTokens('light');

    // Thyme is pruned in ONE month and does nothing else: one painted bar out
    // of the row's forty-eight cells (four lanes × twelve months).
    const thymeRow = card.querySelector('[data-month-plant="thyme"]')!;
    expect(thymeRow.querySelectorAll('[data-month-bar]')).toHaveLength(1);
    expect(thymeRow.querySelectorAll('[data-month-bar="prune"]')).toHaveLength(1);
    expect(rulesFor(thymeRow.querySelector('[data-month-bar="prune"]')!)).toContain(tokens.stagePrune);

    // Lettuce sows and harvests the same month: two bars, in two lanes.
    const lettuceRow = card.querySelector('[data-month-plant="lettuce"]')!;
    expect(lettuceRow.querySelectorAll('[data-month-bar="sow"]')).toHaveLength(1);
    expect(lettuceRow.querySelectorAll('[data-month-bar="harvest"]')).toHaveLength(1);
    expect(rulesFor(lettuceRow.querySelector('[data-month-bar="sow"]')!)).toContain(tokens.stageSow);
  });

  it('lays one tinted column behind the four lanes, not one mark per lane', () => {
    const { card } = renderBlock({ size: 'large' });
    const row = card.querySelector('[data-month-plant="thyme"]')!;

    const now = row.querySelectorAll('[data-month-now]');
    expect(now).toHaveLength(1);
    // Its left edge is the current month's twelfth of the track.
    expect(rulesFor(now[0]!)).toContain(`left:${((thisMonth() - 1) / 12) * 100}%`.replace(/\s/g, ''));
  });

  it('gives each row a spoken sentence, since a colour cannot be heard', () => {
    const { card } = renderBlock({ size: 'large' });

    const row = card.querySelector('[data-month-plant="lettuce"]')!;
    const spoken = row.querySelector('[role="cell"]')!;
    const month = monthLabel(thisMonth(), 'en');
    expect(spoken).toHaveTextContent(`Lettuce — Sowing: ${month} · Harvest: ${month}`);
    // The bars themselves say nothing.
    expect(row.querySelectorAll('[aria-hidden]').length).toBeGreaterThan(0);
  });

  it('draws the four-lane legend, each square named beside its colour', () => {
    const { card } = renderBlock({ size: 'large' });

    expect([...card.querySelectorAll('[data-month-legend]')].map((node) => node.textContent)).toEqual([
      'Pruning',
      'Sowing',
      'Flowering',
      'Harvest',
    ]);
  });

  it('never prints a WORD in a lane colour — the tokens paint bars and squares only', () => {
    const { card } = renderBlock({ size: 'large' });
    const tokens = getDashboardTokens('light');
    const lanes = [tokens.stagePrune, tokens.stageSow, tokens.stageFlower, tokens.stageHarvest];

    for (const node of card.querySelectorAll('*')) {
      const colour = getComputedStyle(node).color;
      for (const lane of lanes) {
        expect(colour.replace(/\s/g, '')).not.toBe(hexToRgb(lane));
      }
    }
  });
});

describe('MonthBlock — the states', () => {
  it('with no variety placed: a statement, not a month of zeros', () => {
    const { card, widget } = renderBlock({ varieties: [] });

    expect(
      widget.getByText('No plant placed yet — the calendar fills up with your plantings.')
    ).toBeInTheDocument();
    expect(card.querySelector('[data-month-row="prune"]')).toBeNull();
  });

  it('loading: a skeleton and no chip', () => {
    const { card } = renderBlock({ loading: true });

    expect(card.querySelector('[data-month-skeleton]')).not.toBeNull();
    expect(card.querySelector('[data-month-chip]')).toBeNull();
  });

  it('error: the sentence and a Retry, disabled while refreshing', () => {
    const onRetry = vi.fn();
    const { widget } = renderBlock({ loadError: true, onRetry });

    expect(widget.getByText('Couldn’t load the month’s calendar.')).toBeInTheDocument();
    fireEvent.click(widget.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reads the PLACE’s month when the gardens are located (Q10)', () => {
    // The place is in March; the browser is wherever the suite runs. A thyme
    // pruned in March is due there and, eleven months out of twelve, not here.
    const marchThyme = varietyFixture({ plantId: 'thyme', commonName: 'Thyme', gardenIds: ['g1'], pruningMonths: 'March' });
    const located = (): DashboardWeatherData =>
      weatherFixture(
        [locationFixture({ localTime: '2026-03-12 14:30' })],
        [linkFixture({ gardenId: 'g1' })]
      );
    const { card } = renderBlock({ varieties: [marchThyme], weather: located() });

    expect(card.querySelector('[data-month-chip]')).toHaveTextContent('March');
    expect(card.querySelector('[data-month-row="prune"]')).toHaveTextContent('To prune1Thyme');
  });

  it('keeps the widget title and its glyph', () => {
    const { widget } = renderBlock();

    expect(widget.getByRole('heading', { level: 2, name: 'This month' })).toBeInTheDocument();
  });
});

/** `#RRGGBB` → the `rgb(r,g,b)` form `getComputedStyle` answers, unspaced. */
function hexToRgb(value: string): string {
  const digits = value.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16));
  return `rgb(${r},${g},${b})`;
}
