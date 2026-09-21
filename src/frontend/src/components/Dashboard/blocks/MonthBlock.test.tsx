import { act, fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme, type Theme } from '@mui/material/styles';
import i18next from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { declaredAtBreakpoint, rulesFor } from '../../../test/dashboardDom';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { linkFixture, locationFixture, weatherFixture } from '../../../test/fixtures/weather';
import { createAppTheme } from '../../../theme';
import { contrast, hex, resolveColor } from '../../../test/contrast';
import { getDashboardTokens } from '../../../theme/dashboardTokens';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../../../types/DashboardWeather';
import type { DashboardVarietyData } from '../../../types/DashboardData';
import MonthBlock from './MonthBlock';
import { browserClock, monthCalendar, monthLabel, zonedYearMonthOf } from './plantCalendar';

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

/** N varieties all pruned this month; their names are already in alphabetical order (V28). */
const manyVarieties = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    pruned({
      plantId: `p${index}`,
      commonName: `Plant ${String(index).padStart(2, '0')}`,
      count: count - index,
      gardenIds: ['g1'],
    })
  );

type Props = React.ComponentProps<typeof MonthBlock>;

/** The theme is a parameter so the two-mode assertions render through ONE helper. */
function renderBlock(over: Partial<Props> = {}, theme: Theme = createTheme()) {
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
    <ThemeProvider theme={theme}>
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

/**
 * What the ONE derivation says, for the surfaces to be checked against — in
 * the language the block is rendered in, since V28 orders the rows by that
 * language's own alphabet.
 */
const expected = (over: Partial<Props> = {}) =>
  monthCalendar(
    over.gardens ?? [garden],
    over.varieties ?? [thyme, rosemary, courgette, sage, lettuce, tomato, idle, fern],
    over.weather ?? EMPTY_WEATHER_DATA,
    browserClock,
    'en'
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
  it('draws the thirteen axis cells and tints the current month', () => {
    const { card } = renderBlock({ size: 'large' });
    const axisRow = card.querySelector('[data-month-axis-row]')!;

    // One corner cell plus twelve labels — the arity the LAYOUT needs, which
    // is not the same question as what a screen reader is told (C3 + F4).
    expect(axisRow.children).toHaveLength(13);
    // ONE tinted axis cell: the month the block is in.
    const now = card.querySelectorAll('[data-month-axis="now"]');
    expect(now).toHaveLength(1);
    expect(now[0]).toHaveTextContent(
      new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2000, thisMonth() - 1, 1))
    );
  });

  it('caps the rows at TEN and offers the rest on a button (V26)', () => {
    const { card } = renderBlock({ size: 'large', varieties: manyVarieties(16) });

    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(10);
    expect(card.querySelector('[data-month-more-varieties]')).toHaveTextContent(
      'Show the 6 other varieties'
    );
  });

  it('…and says nothing of the kind when the ten rows are all there is', () => {
    const { card } = renderBlock({ size: 'large', varieties: [thyme, lettuce, fern] });

    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(2);
    expect(card.querySelector('[data-month-more-varieties]')).toBeNull();
  });

  it('orders the rows by NAME, and leaves the undated varieties out of the grid (V28)', () => {
    const { card } = renderBlock({ size: 'large' });

    const rows = [...card.querySelectorAll('[data-month-plant]')].map((row) =>
      row.getAttribute('data-month-plant')
    );
    expect(rows).toEqual(expected().known.map((entry) => entry.variety.plantId));
    // Alphabetical — « je ne comprends pas l'ordre dans lequel les plantes sont
    // listées ». Zinnia is the `idle` one, and it is last because of its NAME,
    // not because it is idle: the Q13 rank no longer orders anything here.
    expect(rows).toEqual(['courgette', 'lettuce', 'rosemary', 'sage', 'thyme', 'tomato', 'idle']);
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

  /**
   * The grid track a cell of the axis row lands on. jsdom performs no layout,
   * so the position cannot be measured — it is DERIVED the way the browser
   * derives it: a grid child in `position: absolute` is out of the flow and
   * consumes no track, so the index is taken among the IN-FLOW children only.
   * That distinction is the whole of V23.
   */
  const trackOf = (cell: Element): number => {
    const row = cell.parentElement!;
    const inFlow = [...row.children].filter(
      (child) => !rulesFor(child).replace(/\s/g, '').includes('position:absolute')
    );
    return inFlow.indexOf(cell) + 1;
  };

  it('lines the axis up with the lanes: the month’s label sits on the track its bars do (V23)', () => {
    const { card } = renderBlock({ size: 'large' });
    const axis = card.querySelector('[data-month-axis="now"]')!;
    const lanes = card.querySelector('[data-month-plant="thyme"] [data-month-lanes]')!;

    // `.lanes { grid-column: 2 / 14 }` (`A3Expert.dc.html` l. 213): the twelve
    // month columns of a row begin on track 2, so month m is on track 1 + m.
    expect(rulesFor(lanes).replace(/\s/g, '')).toContain('grid-column:2/14');
    expect(trackOf(axis)).toBe(1 + thisMonth());
  });

  it('…because the corner cell is empty but IN the flow, as the plate draws it (V23)', () => {
    const { card } = renderBlock({ size: 'large' });
    const corner = card.querySelector('[data-month-corner]')!;

    // `A3Expert.dc.html` l. 336: `<div class="cal"><div></div><div class="mh">Jan</div>…`
    expect(corner).toBeEmptyDOMElement();
    expect(rulesFor(corner).replace(/\s/g, '')).not.toContain('position:absolute');
    // The row's spoken sentence is the one thing that MUST stay out of flow:
    // it shifts nothing, which is why the rows never drifted.
    const spoken = card.querySelector('[data-month-plant="thyme"] [data-month-spoken]')!;
    expect(rulesFor(spoken).replace(/\s/g, '')).toContain('position:absolute');
  });

  it('hides the bars from assistive technology ONCE, on their container (F1)', () => {
    const { card } = renderBlock({ size: 'large' });
    const row = card.querySelector('[data-month-plant="thyme"]')!;
    const lanes = row.querySelector('[data-month-lanes]')!;

    expect(lanes).toHaveAttribute('aria-hidden');
    // One owner: the four lane grids and the tinted column no longer repeat it.
    expect(lanes.querySelectorAll('[aria-hidden]')).toHaveLength(0);
    // …and the sentence, which lives outside that container, is still spoken.
    expect(row.querySelector('[data-month-spoken]')).toHaveTextContent(/Thyme/);
  });

  it('gives each row a spoken sentence, since a colour cannot be heard', () => {
    const { card } = renderBlock({ size: 'large' });

    const row = card.querySelector('[data-month-plant="lettuce"]')!;
    const spoken = row.querySelector('[data-month-spoken]')!;
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

  it('reads the PLACE’s ZONE for the month when the gardens are located (Q10, round 1 C1)', () => {
    // The place is Sydney and its stored snapshot says March — a photograph
    // taken at fetch time. The block must read the ZONE and the clock, so the
    // month it shows is Sydney's own now, whatever the snapshot froze and
    // whatever zone the suite runs in. Before round 1 it said March.
    const SYDNEY = '-33.87,151.21';
    const there = zonedYearMonthOf(new Date(), 'Australia/Sydney')!;
    const thymeThere = varietyFixture({
      plantId: 'thyme',
      commonName: 'Thyme',
      gardenIds: ['g1'],
      pruningMonths: MONTH_TOKENS[there.month - 1]!,
    });
    const located = (): DashboardWeatherData =>
      weatherFixture(
        [
          locationFixture({
            key: SYDNEY,
            name: 'Sydney',
            timeZone: 'Australia/Sydney',
            localTime: '2026-03-12 14:30',
          }),
        ],
        [linkFixture({ gardenId: 'g1', locationKey: SYDNEY })]
      );
    const { card } = renderBlock({ varieties: [thymeThere], weather: located() });

    expect(card.querySelector('[data-month-chip]')).toHaveTextContent(monthLabel(there.month, 'en'));
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

// ROUND 1 — V24, V25, V26: the three amendments Alexandre's visual pass took
// on the Large grid. V24 raises the type and the heights above the plate's own
// figures; V25 returns the plate's `flex: 1` / `space-evenly` so the rows
// share the card instead of leaving a void under the legend; V26 turns the
// « +N variétés » sentence into a deploy button over a scrolling list.

/** The three counted lanes, in the artboard's order. */
const COUNTERS = ['prune', 'sow', 'harvest'] as const;

/** Emotion's rules for a node, whitespace removed — the suite's own idiom. */
const ruleText = (node: Element) => rulesFor(node).replace(/\s/g, '');

describe('MonthBlock — Large: the amended scale (V24)', () => {
  it('draws the name at 15 px, the axis at 13, the rows at 40 and the bars at 7', () => {
    const { card } = renderBlock({ size: 'large' });
    const row = card.querySelector('[data-month-plant="thyme"]')!;

    // The plate is at 14 / 12 / 28 / 4 (`A3Expert.dc.html` l. 210-214). This
    // is a DEVIATION, taken because that scale does not read on a card. Round
    // 2 widened it twice more: V30 for the air between rows, V31 for the bars.
    expect(ruleText(row.querySelector('[data-month-name]')!)).toContain('font-size:15px');
    expect(ruleText(card.querySelector('[data-month-axis="now"]')!)).toContain('font-size:13px');
    expect(ruleText(row)).toContain('min-height:40px');
    const bar = ruleText(row.querySelector('[data-month-bar="prune"]')!);
    expect(bar).toContain('height:7px');
    // …and the bar is still a PILL: the radius is half the height, which is
    // the whole of round 1's écart n° 5. A bar that grew without its radius
    // would come back as a rectangle.
    expect(bar).toContain('border-radius:3.5px');
    // The row is taller; the four lanes and their three gutters still fit in
    // it — 4 × 7 + 3 × 3 = 37 — so nothing is clipped by the growth.
    expect(4 * 7 + 3 * 3).toBeLessThanOrEqual(40);
  });
});

describe('MonthBlock — the enlarged labels still read, in both themes (V24)', () => {
  it.each([['light'], ['dark']])(
    '%s: the plant name and the month labels clear the 4.5:1 text floor',
    (mode) => {
      const { palette } = createAppTheme(mode as 'light' | 'dark');
      const ground = hex(palette.background.paper);
      const name = resolveColor(palette.text.primary, ground);
      const axis = resolveColor(palette.text.secondary, ground);

      // 15 px / 600 and 13 px / 700 are NORMAL text under WCAG 2 § 1.4.3 —
      // the large-text relief starts at 18.66 px bold — so both owe 4.5:1.
      // Unlike the four lane tokens, which colour bars, owe 3:1 as graphical
      // objects and are only RECORDED (`dashboardTokens.test.ts`), these two
      // carry words: they are asserted.
      expect(name).not.toBeNull();
      expect(axis).not.toBeNull();
      expect(contrast(name!, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(axis!, ground)).toBeGreaterThanOrEqual(4.5);
    }
  );
});

describe('MonthBlock — Large: the void at the foot, and the legend that closes the card (V25)', () => {
  it('spreads the rows over the card instead of massing them at the top', () => {
    // Two rows in a Large card: the plate shares the height between them
    // (`A3Expert.dc.html` l. 336, `flex: 1; justify-content: space-evenly`).
    const { card } = renderBlock({ size: 'large', varieties: [thyme, lettuce] });
    const rows = card.querySelector('[data-month-rows]')!;
    // Round 2, V27: the axis moved INSIDE the scrolling zone, so the rows have
    // a wrapper of their own below it — that wrapper is what distributes them.
    const body = card.querySelector('[data-month-body]')!;

    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(2);
    expect(ruleText(body)).toContain('justify-content:space-evenly');
    expect(ruleText(rows)).toContain('flex:1');
    // …and the grid takes the slack, so none of it piles up below the legend.
    expect(ruleText(card.querySelector('[data-month-grid]')!)).toContain('flex:1');
  });

  it('closes the card on the legend, outside the scrolling zone', () => {
    // No variety without a calendar here, so no foot: the legend is last.
    const { card } = renderBlock({ size: 'large', varieties: [thyme, rosemary, lettuce] });
    const legend = card.querySelector('[data-month-legend-row]')!;

    // `DashboardBlock` wraps every widget body in one flex column; « the foot
    // of the card » is the last child of that column.
    const body = card.querySelector('[data-month-grid]')!.parentElement!;
    expect(body.lastElementChild).toBe(legend);
    expect(card.querySelector('[data-month-grid]')!.contains(legend)).toBe(false);
    expect(ruleText(legend)).toContain('flex-shrink:0');
  });
});

describe('MonthBlock — Large: deploying the rest, and folding it back (V26)', () => {
  const namesOf = (card: HTMLElement) =>
    [...card.querySelectorAll('[data-month-plant]')].map((row) => row.getAttribute('data-month-plant'));

  it('names the button in full, ties it to the grid, and deploys every variety', () => {
    const { card, widget } = renderBlock({ size: 'large', varieties: manyVarieties(16) });
    const button = widget.getByRole('button', { name: 'Show the 6 other varieties' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', card.querySelector('[data-month-grid]')!.id);
    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(10);

    fireEvent.click(button);

    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(16);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveTextContent('Show less');
  });

  it('folds back, because a deploy with no way out traps the reader', () => {
    const { card, widget } = renderBlock({ size: 'large', varieties: manyVarieties(16) });

    fireEvent.click(widget.getByRole('button', { name: 'Show the 6 other varieties' }));
    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(16);

    fireEvent.click(widget.getByRole('button', { name: 'Show less' }));
    expect(card.querySelectorAll('[data-month-plant]')).toHaveLength(10);
    expect(widget.getByRole('button', { name: 'Show the 6 other varieties' })).toBeInTheDocument();
  });

  it('keeps the deployed list INSIDE the card, and every row reachable (V7)', () => {
    const { card, widget } = renderBlock({ size: 'large', varieties: manyVarieties(16) });
    fireEvent.click(widget.getByRole('button', { name: 'Show the 6 other varieties' }));

    const grid = card.querySelector('[data-month-grid]')!;
    const rows = card.querySelector('[data-month-rows]')!;

    // The list scrolls inside a clipped grid: the card itself does not grow.
    expect(ruleText(grid)).toContain('overflow:hidden');
    expect(ruleText(grid)).toContain('min-height:0');
    expect(ruleText(rows)).toContain('overflow-y:auto');
    expect(ruleText(rows)).toContain('min-height:0');
    // Packed from the top: `space-evenly` on a scrolling box pushes the first
    // rows above the scrollable area, where no scrollbar reaches them. Since
    // V27 that is declared on the rows' own wrapper, under the stuck axis.
    const body = card.querySelector('[data-month-body]')!;
    expect(ruleText(body)).toContain('justify-content:flex-start');
    // …and it can never be squeezed below its content, which is what stops
    // `space-evenly` distributing NEGATIVE space in the collapsed state.
    expect(ruleText(body)).not.toContain('min-height:0');
    expect(ruleText(card.querySelector('[data-month-plant="p0"]')!)).toContain('flex-shrink:0');
    // The legend stays out of the scrolling zone and keeps its place.
    expect(grid.contains(card.querySelector('[data-month-legend-row]'))).toBe(false);
    // Nothing is animated by the toggle, so `prefers-reduced-motion` has
    // nothing to neutralise here.
    expect(ruleText(rows)).not.toContain('transition:');
  });

  it('keeps the alphabetical order in BOTH states (V28)', () => {
    const varieties = manyVarieties(16);
    const { card, widget } = renderBlock({ size: 'large', varieties });
    const all = expected({ varieties }).known.map((entry) => entry.variety.plantId);

    expect(namesOf(card)).toEqual(all.slice(0, 10));
    fireEvent.click(widget.getByRole('button', { name: 'Show the 6 other varieties' }));
    expect(namesOf(card)).toEqual(all);
  });

  it('lays the axis INSIDE the scrolling zone, so one scrollbar narrows both grids (V27)', () => {
    const { card } = renderBlock({ size: 'large', varieties: manyVarieties(16) });
    const rows = card.querySelector('[data-month-rows]')!;
    const axis = card.querySelector('[data-month-axis="now"]')!.parentElement!;
    const rules = rulesFor(axis).replace(/\s/g, '');

    // ONE content box for the axis and for the bars: whatever a scrollbar
    // takes, it takes from both, so the twelve 1fr tracks resolve alike.
    expect(rows.contains(axis)).toBe(true);
    expect(rules).toContain('position:sticky');
    expect(rules).toContain('top:0');
    // …and the fix is structural, never a magic number compensating a
    // scrollbar width the platform is free to change.
    expect(rules).not.toMatch(/padding-right:\d/);
  });

  it('counts EVERY variety in the chip and the three counters, deployed or not', () => {
    // The `resolveCountersFigures` rule: a figure states what the derivation
    // holds, never what the grid happens to be drawing.
    const { card, widget } = renderBlock({ size: 'large', varieties: manyVarieties(16) });
    const readCounters = () =>
      COUNTERS.map((key) => card.querySelector(`[data-month-count="${key}"]`)!.textContent);

    const collapsed = readCounters();
    const chip = card.querySelector('[data-month-chip]')!.textContent;
    expect(card.querySelector('[data-month-count="prune"]')).toHaveTextContent('16');

    fireEvent.click(widget.getByRole('button', { name: 'Show the 6 other varieties' }));

    expect(readCounters()).toEqual(collapsed);
    expect(card.querySelector('[data-month-chip]')!.textContent).toBe(chip);
  });
});

// ROUND 2 — V27: the axis and the bars drifted apart by a scrollbar's width,
// nothing at « Jan » and the whole of it at « Déc », because the axis resolved
// the shared thirteen-track template on a content box the scrollbar had not
// narrowed. The axis now lives inside the scrolling zone. It has to stand on
// an opaque ground there, or the bars would scroll visibly under the labels.

describe('MonthBlock — the stuck axis stands on the card’s own ground (V27)', () => {
  it.each([['light'], ['dark']])('%s: the axis row is painted, not see-through', (mode) => {
    const theme = createAppTheme(mode as 'light' | 'dark');
    const { card } = renderBlock({ size: 'large', varieties: manyVarieties(16) }, theme);
    const axis = card.querySelector('[data-month-axis="now"]')!.parentElement!;

    // The card is a MUI `Card`, so its ground IS `background.paper`: the
    // stuck row reads as part of the card and not as a band over it.
    expect(rulesFor(axis).replace(/\s/g, '')).toContain(
      `background-color:${theme.palette.background.paper}`
    );
  });
});

// ROUND 2 — C3 + F4: the two findings on the ARIA table, answered together by
// dropping it. C3 counted an arity that never matched (13 columnheaders over
// 1 rowheader + 1 cell a row); F4 found the scrolling box breaking the
// ownership of the rows. Both say the same thing — there was no table. A row
// has one name and one drawing, so the calendar is a LIST of varieties.

describe('MonthBlock — the calendar is a list of varieties, not a table (C3 + F4)', () => {
  it('declares no table role anywhere, and owns every item with a list', () => {
    const { card, widget } = renderBlock({ size: 'large' });

    // Nothing of the table vocabulary is left: an incomplete one is worse
    // than none, and this one could never be completed honestly.
    for (const role of ['table', 'row', 'rowgroup', 'columnheader', 'rowheader', 'cell']) {
      expect(card.querySelectorAll(`[role="${role}"]`)).toHaveLength(0);
    }

    const list = widget.getByRole('list', { name: 'Twelve-month calendar of your varieties' });
    expect(list).toBe(card.querySelector('[data-month-body]'));
    // Every child of the list is an item of it — the ownership F4 asked for,
    // exact this time: the axis is no longer between the two.
    const items = widget.getAllByRole('listitem');
    expect(items).toHaveLength(card.querySelectorAll('[data-month-plant]').length);
    for (const item of items) expect(item.parentElement).toBe(list);
  });

  it('reads one sentence an item, and never a colour or an empty cell', () => {
    const { card } = renderBlock({ size: 'large' });
    const item = card.querySelector('[data-month-plant="thyme"]')!;
    const month = monthLabel(thisMonth(), 'en');

    // « Thyme — Pruning: September », and that is the whole of the item.
    expect(item).toHaveTextContent(`Thyme — Pruning: ${month}`);
    // The visible name is hidden from the reading: the sentence opens with it,
    // and a listitem that said « Thyme Thyme — Pruning: September » would be
    // paying the stutter the table roles used to cost.
    expect(card.querySelector('[data-month-plant="thyme"] [data-month-name]')).toHaveAttribute(
      'aria-hidden'
    );
    // The axis is a visual scale, like the bars it labels: the months a
    // variety works in are spoken as WORDS inside its own sentence.
    const axisRow = card.querySelector('[data-month-axis-row]')!;
    expect(axisRow).toHaveAttribute('aria-hidden');
    // …and it sits OUTSIDE the list, so no item inherits an « Jan Feb Mar »
    // the twelve labels would otherwise trail behind every sentence.
    expect(card.querySelector('[data-month-body]')!.contains(axisRow)).toBe(false);
  });
});

// ROUND 2 — Alexandre's visual pass on the ROW itself: V29 the capital, V30
// the air, V31 the bars, V32 the clipped names, V33 the zebra. None of these
// is a finding: no surface reported any of them, and the sort the same pass
// questioned was in fact approved twice. They are product choices.

/** « langue de cerf » as the catalog stores it — lower-case, and two words. */
const hartsTongue = pruned({
  plantId: 'harts',
  commonName: 'langue de cerf',
  count: 1,
  gardenIds: ['g1'],
});
/** Short enough for the 108 px column to show whole. */
const short = pruned({ plantId: 'mint', commonName: 'menthe', count: 1, gardenIds: ['g1'] });

describe('MonthBlock — the name as it is shown (V29)', () => {
  it('capitalises the FIRST letter only, and only for the eye', () => {
    const { card } = renderBlock({ size: 'large', varieties: [hartsTongue] });
    const name = card.querySelector('[data-month-plant="harts"] [data-month-name]')!;

    // « Langue de cerf » — NOT « Langue De Cerf », which is what
    // `text-transform: capitalize` would draw and which is wrong in French.
    expect(name).toHaveTextContent('Langue de cerf');
    expect(ruleText(name)).not.toContain('text-transform:capitalize');
    // The DATA is untouched: the widget decides how a sentence begins, the
    // catalog keeps what its source wrote (DATA_PROVENANCE).
    expect(hartsTongue.commonName).toBe('langue de cerf');
  });

  it('…and the spoken sentence opens the same way', () => {
    const { card } = renderBlock({ size: 'large', varieties: [hartsTongue] });

    expect(card.querySelector('[data-month-plant="harts"] [data-month-spoken]')).toHaveTextContent(
      /^Langue de cerf —/
    );
  });
});

describe('MonthBlock — the full name over a clipped one (V32)', () => {
  it('describes a name the column cannot show, on hover and on a long press', () => {
    const { card } = renderBlock({ size: 'large', varieties: [hartsTongue] });
    const name = card.querySelector('[data-month-plant="harts"] [data-month-name]')!;

    // `describeChild` writes the name into the node's own `title` — the
    // pattern PR 3b/5 established on the Gardens rows, touch delays included.
    expect(name).toHaveAttribute('title', 'Langue de cerf');
  });

  it('…and says nothing at all when the name fits', () => {
    const { card } = renderBlock({ size: 'large', varieties: [short] });
    const name = card.querySelector('[data-month-plant="mint"] [data-month-name]')!;

    // A tooltip that repeats a name already legible is noise on every row.
    expect(name).not.toHaveAttribute('title');
    expect(name).toHaveTextContent('Menthe');
  });
});

describe('MonthBlock — one row in two on a ground of its own (V33)', () => {
  it('bands every other row, full width, and leaves the first on the card', () => {
    const { card } = renderBlock({ size: 'large', varieties: manyVarieties(6) });
    const rows = [...card.querySelectorAll('[data-month-plant]')];
    const tokens = getDashboardTokens('light');

    expect(rows.map((row) => row.hasAttribute('data-month-zebra'))).toEqual([
      false, true, false, true, false, true,
    ]);
    expect(ruleText(rows[1]!)).toContain(`background-color:${tokens.zebraRow}`);
    expect(ruleText(rows[0]!)).toContain('background-color:transparent');
    // The band is the ROW: a stripe under the bars alone would read as a
    // fifth lane, and the name would sit off it.
    expect(rows[1]!.querySelector('[data-month-name]')!.parentElement).toBe(rows[1]);
  });

  it.each([['light'], ['dark']])(
    '%s: the names clear 4.5:1 on the card AND on the band',
    (mode) => {
      const { palette } = createAppTheme(mode as 'light' | 'dark');
      const tokens = getDashboardTokens(mode as 'light' | 'dark');
      const card = hex(palette.background.paper);
      const band = hex(tokens.zebraRow);

      // 15 px / 600 is NORMAL text under WCAG 2 § 1.4.3 — the large-text
      // relief starts at 18.66 px bold — so the name owes 4.5:1 on BOTH
      // grounds. A band legible in one theme and not in the other is not a
      // ground, it is a trap.
      for (const ground of [card, band]) {
        const name = resolveColor(palette.text.primary, ground);
        const secondary = resolveColor(palette.text.secondary, ground);
        expect(name).not.toBeNull();
        expect(secondary).not.toBeNull();
        expect(contrast(name!, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(secondary!, ground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  );
});

// ── SMA-336 mobile lot, step 4 (pre-flight D3, arbitrage 2): on a phone the
// Large grid STAYS a grid — rule 3, a larger size shows more, never something
// else — with one letter a month and an 84 px name column. Measured on
// `5282852` at 360 px: 13.2 px a column for labels of 22-30 px, « Août » over
// « Sep » by 16 px (V38); measured at zero after this step. Asserted here on
// the declarations per breakpoint; the pixels are the layout harness's.
describe('MonthBlock — Large on a phone: one letter a month, an 84px name column (mobile lot, step 4)', () => {
  const INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  it('declares the 84px column under 600px and the 108px column from 600px — on the axis and on every row alike', () => {
    const { card } = renderBlock({ size: 'large' });
    const axisRow = card.querySelector('[data-month-axis-row]')!;
    const row = card.querySelector('[data-month-plant="thyme"]')!;

    for (const grid of [axisRow, row]) {
      expect(declaredAtBreakpoint(grid, '0px', 'grid-template-columns')).toBe('84px repeat(12, minmax(0, 1fr))');
      expect(declaredAtBreakpoint(grid, '600px', 'grid-template-columns')).toBe('108px repeat(12, minmax(0, 1fr))');
    }
  });

  it('draws each month twice — the short name shown from 600px, its initial shown under — and names the month in full on the cell', () => {
    const { card } = renderBlock({ size: 'large' });
    const cells = [...card.querySelectorAll('[data-month-axis-row] > *')].slice(1);
    expect(cells).toHaveLength(12);

    cells.forEach((cell, index) => {
      const short = cell.querySelector('[data-month-axis-short]')!;
      const initial = cell.querySelector('[data-month-axis-initial]')!;
      expect(declaredAtBreakpoint(short, '0px', 'display')).toBe('none');
      expect(declaredAtBreakpoint(short, '600px', 'display')).toBe('inline');
      expect(declaredAtBreakpoint(initial, '0px', 'display')).toBe('inline');
      expect(declaredAtBreakpoint(initial, '600px', 'display')).toBe('none');
      expect(initial.textContent).toBe(INITIALS[index]);
      expect(short.textContent).toBe(
        new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2000, index, 1))
      );
      // The full month on the cell, whatever form is shown.
      expect(cell.getAttribute('aria-label')).toBe(monthLabel(index + 1, 'en'));
    });
    // The axis stays the visual scale F4 made it: hidden from the reading as a whole.
    expect(card.querySelector('[data-month-axis-row]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('in French, the same twelve initials — the month starts with the same letter in both languages', async () => {
    const { card } = renderBlock({ size: 'large' });
    await act(() => i18next.changeLanguage('fr'));
    const initials = [...card.querySelectorAll('[data-month-axis-initial]')].map((node) => node.textContent);
    expect(initials).toEqual(INITIALS);
    const shorts = [...card.querySelectorAll('[data-month-axis-short]')].map((node) => node.textContent);
    expect(shorts).toEqual(['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']);
    await act(() => i18next.changeLanguage('en'));
  });

  it('keeps the desktop axis as it was: 13px, thirteen cells, the current month tinted, the labels on their tracks', () => {
    const { card } = renderBlock({ size: 'large' });
    const axisRow = card.querySelector('[data-month-axis-row]')!;
    expect(axisRow.children).toHaveLength(13);
    expect(ruleText(card.querySelector('[data-month-axis="now"]')!)).toContain('font-size:13px');
    expect(card.querySelectorAll('[data-month-axis="now"]')).toHaveLength(1);
  });

  describe('the tooltip of a clipped name follows the phone’s column (V32, at 84px)', () => {
    /** The page believes it is under 600px: `useMediaQuery(down('sm'))` answers true. */
    const stubPhone = () =>
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches: query.includes('max-width:599.95px'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }))
      );

    afterEach(() => vi.unstubAllGlobals());

    /** Ten characters: whole in the 108px column (twelve fit), clipped in the 84px one (nine fit). */
    const tenLetters = pruned({ plantId: 'ten', commonName: 'courgettes', count: 1, gardenIds: ['g1'] });

    it('a ten-letter name is described on a phone…', () => {
      stubPhone();
      const { card } = renderBlock({ size: 'large', varieties: [tenLetters] });
      expect(card.querySelector('[data-month-plant="ten"] [data-month-name]')).toHaveAttribute('title', 'Courgettes');
    });

    it('…and not on a desktop, where the 108px column shows it whole', () => {
      const { card } = renderBlock({ size: 'large', varieties: [tenLetters] });
      expect(card.querySelector('[data-month-plant="ten"] [data-month-name]')).not.toHaveAttribute('title');
    });
  });
});
