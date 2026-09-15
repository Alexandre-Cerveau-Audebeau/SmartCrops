import { fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { placement } from '../../../test/fixtures/placements';
import {
  dayFixture,
  hoursOf,
  linkFixture,
  locationFixture,
  weatherFixture,
} from '../../../test/fixtures/weather';
import { rulesFor } from '../../../test/dashboardDom';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../../../types/DashboardWeather';
import TodoBlock from './TodoBlock';
import { todoTasks } from './todoTasks';

// SMA-336 PR 3b/5 — « À faire aujourd'hui » against `Main.dc.html` (Medium:
// four rows, « +N tâches → ») and `A4Manquantes.dc.html` (two rows, the
// invitation for the gardens without weather, « +2 tâches → »), the Large
// grouping with session-only ticks, and the honest empty state.
//
// The scene: three gardens in Lyon on a dry Saturday, 9° on Tuesday.
//   Terrasse        — 3 basils (Frequent, tolerate 8°) + 15 tomatoes (High, 5°)
//                     → water 18 tonight; cold: the 3 basils on Tuesday (9° ≤ 11°).
//   Balcon sud      — 4 sages (Low, 12°) + 2 mints (Frequent, unknown)
//                     → water 2; cold: the 4 sages on Tuesday (9° ≤ 15°) — not
//                     on Sunday: 15° is within their margin but above the 12°
//                     ceiling of rule (a) (round 1, O1).
//   Potager du fond — 6 tomatoes (High, 5°) + 4 lettuces (Average, 10°)
//                     → water 6; cold: the 4 lettuces on Tuesday (9° ≤ 13°).
// Six tasks, two per garden.

const varieties = [
  varietyFixture({ plantId: 'basil', commonName: 'Basil', wateringNeedLevel: 'Frequent', minToleratedTempC: 8 }),
  varietyFixture({ plantId: 'tomato', commonName: 'Tomato', wateringNeedLevel: 'High', minToleratedTempC: 5 }),
  varietyFixture({ plantId: 'sage', commonName: 'Sage', wateringNeedLevel: 'Low', minToleratedTempC: 12 }),
  varietyFixture({ plantId: 'mint', commonName: 'Mint', wateringNeedLevel: 'Frequent', minToleratedTempC: null }),
  varietyFixture({ plantId: 'lettuce', commonName: 'Lettuce', wateringNeedLevel: 'Average', minToleratedTempC: 10 }),
];

const plants = (...specs: Array<[string, number]>) =>
  specs.flatMap(([plantId, count]) =>
    Array.from({ length: count }, (_, i) => placement({ id: `${plantId}-${i}`, plantId, startCol: i }))
  );

const terrasse = gardenFixture({ id: 'g1', name: 'Terrasse', placements: plants(['basil', 3], ['tomato', 15]), placementCount: 18 });
const balcon = gardenFixture({ id: 'g2', name: 'Balcon sud', placements: plants(['sage', 4], ['mint', 2]), placementCount: 6 });
const potager = gardenFixture({ id: 'g3', name: 'Potager du fond', placements: plants(['tomato', 6], ['lettuce', 4]), placementCount: 10 });
const gardens = [terrasse, balcon, potager];

/** A dry Saturday, 9° on Tuesday (the artboard's week), at 14:30. */
const days = () => [
  dayFixture({ date: '2026-09-12', minTempC: 16, maxTempC: 29, chanceOfRain: 0, totalPrecipMm: 0, hours: hoursOf('2026-09-12', 16, 29) }),
  dayFixture({ date: '2026-09-13', minTempC: 15, maxTempC: 28 }),
  dayFixture({ date: '2026-09-14', minTempC: 14, maxTempC: 27 }),
  dayFixture({ date: '2026-09-15', minTempC: 9, maxTempC: 17, chanceOfRain: 80 }),
  dayFixture({ date: '2026-09-16', minTempC: 11, maxTempC: 20 }),
];

/** Every garden in Lyon. */
const allLocated = (): DashboardWeatherData =>
  weatherFixture([locationFixture({ days: days() })], gardens.map((g) => linkFixture({ gardenId: g.id })));

/** The A4 state: Terrasse located, the two others not. */
const partial = (): DashboardWeatherData =>
  weatherFixture(
    [locationFixture({ days: days() })],
    [
      linkFixture({ gardenId: 'g1', source: 'garden' }),
      linkFixture({ gardenId: 'g2', locationKey: null, source: null }),
      linkFixture({ gardenId: 'g3', locationKey: null, source: null }),
    ]
  );

type Props = React.ComponentProps<typeof TodoBlock>;

function renderBlock(over: Partial<Props> = {}) {
  localStorage.setItem('smartcrops-language', 'en');
  const props: Props = {
    size: 'medium',
    gardens,
    varieties,
    weather: allLocated(),
    loading: false,
    loadError: false,
    onRetry: vi.fn(),
    onLocate: vi.fn(),
    onExpand: vi.fn(),
    ...over,
  };
  render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <UnitSystemProvider>
          <TodoBlock {...props} />
        </UnitSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  const card = document.querySelector('[data-widget="todo"]') as HTMLElement;
  return { card, widget: within(card), props };
}

describe('TodoBlock — the chip and the list come from ONE function', () => {
  it('prints in the chip exactly as many tasks as todoTasks derives and the list shows', () => {
    const { card, widget } = renderBlock({ size: 'large' });
    const expected = todoTasks(gardens, varieties, allLocated());

    expect(expected).toHaveLength(6);
    expect(card.querySelector('[data-todo-chip]')).toHaveTextContent('6 tasks');
    expect(widget.getAllByRole('checkbox')).toHaveLength(6);
  });
});

describe('TodoBlock — Medium (Main.dc.html)', () => {
  it('lists four tasks, the garden in brackets, and « +2 tasks → » that grows the widget', () => {
    const onExpand = vi.fn();
    const { card, widget } = renderBlock({ onExpand });

    const rows = [...card.querySelectorAll('[data-todo-task]')];
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Water tonight — 18 plants (Terrasse), no rain expected');
    expect(rows[1]).toHaveTextContent('Protect from cold — 3 plants tender below 8° (Terrasse), 9° Tuesday evening');
    expect(rows[2]).toHaveTextContent('Water tonight — 2 plants (Balcon sud), no rain expected');
    expect(rows[3]).toHaveTextContent('Protect from cold — 4 plants tender below 12° (Balcon sud), 9° Tuesday evening');
    expect(widget.queryByRole('checkbox')).toBeNull();

    fireEvent.click(widget.getByRole('button', { name: '+2 tasks →' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('A4: two tasks for the located garden, the invitation naming the others, and no invented task', () => {
    const onLocate = vi.fn();
    const { card, widget } = renderBlock({ weather: partial(), onLocate });

    const rows = [...card.querySelectorAll('[data-todo-task]')];
    expect(rows).toHaveLength(2);
    expect(card.querySelector('[data-todo-chip]')).toHaveTextContent('2 tasks');
    // The two unlocated gardens produce nothing — no « +N » to reach.
    expect(widget.queryByRole('button', { name: /^\+/ })).toBeNull();

    const invite = card.querySelector('[data-todo-invite]')!;
    expect(invite).toHaveTextContent(
      'Without the weather of Balcon sud and Potager du fond, their watering is not planned —'
    );
    fireEvent.click(within(invite as HTMLElement).getByRole('button', { name: 'Add a city →' }));
    expect(onLocate).toHaveBeenCalledWith(null);
  });

  it('with an invitation, caps the rows at two and defers the rest to « +N »', () => {
    // Terrasse and Balcon located (4 tasks), Potager not: 2 rows + invitation + « +2 ».
    const weather = weatherFixture(
      [locationFixture({ days: days() })],
      [
        linkFixture({ gardenId: 'g1' }),
        linkFixture({ gardenId: 'g2' }),
        linkFixture({ gardenId: 'g3', locationKey: null, source: null }),
      ]
    );
    const { card, widget } = renderBlock({ weather });

    expect(card.querySelectorAll('[data-todo-task]')).toHaveLength(2);
    expect(card.querySelector('[data-todo-invite]')).toHaveTextContent(
      'Without the weather of Potager du fond, its watering is not planned —'
    );
    expect(widget.getByRole('button', { name: '+2 tasks →' })).toBeInTheDocument();
  });

  it('omits the garden brackets when there is only one garden', () => {
    const { card } = renderBlock({
      gardens: [terrasse],
      weather: weatherFixture([locationFixture({ days: days() })], [linkFixture({ gardenId: 'g1' })]),
    });

    expect(card.querySelector('[data-todo-task="water"]')).toHaveTextContent(
      'Water tonight — 18 plants with high needs, no rain expected'
    );
  });

  it('with nothing to do: the honest statement, and NO promise of what is not shown (PR 4a/5)', () => {
    // PR 3b/5 pinned « Pruning and sowing tasks are coming soon » here. They
    // arrived in PR 4a/5, so the note went: the block no longer announces
    // anything, and the sentence dropped its « weather-wise » — nothing at
    // all is due today, calendar included.
    const rainyAndMild = weatherFixture(
      [locationFixture({ days: [dayFixture({ date: '2026-09-12', chanceOfRain: 90, minTempC: 20 })] })],
      gardens.map((g) => linkFixture({ gardenId: g.id }))
    );
    const { card, widget } = renderBlock({ weather: rainyAndMild });

    expect(widget.getByText('Nothing to do today.')).toBeInTheDocument();
    expect(card.querySelector('[data-todo-soon]')).toBeNull();
    expect(card.textContent).not.toMatch(/coming soon/i);
    expect(card.querySelector('[data-todo-chip]')).toBeNull();
    expect(card.querySelector('[data-todo-invite]')).toBeNull();
    expect(widget.queryByText('Coming soon')).toBeNull();
  });

  it('with no located garden at all: the statement AND the invitation for every garden', () => {
    const { card } = renderBlock({
      weather: weatherFixture([], gardens.map((g) => linkFixture({ gardenId: g.id, locationKey: null, source: null }))),
    });

    expect(card.querySelector('[data-todo-invite]')).toHaveTextContent(
      'Without the weather of Terrasse, Balcon sud, and Potager du fond, their watering is not planned —'
    );
  });
});

describe('TodoBlock — Large', () => {
  it('groups by garden with « Terrasse · 2 » headers, checkboxes for the session, and the note', () => {
    const { card, widget } = renderBlock({ size: 'large' });

    expect(widget.getByRole('heading', { level: 3, name: 'Terrasse · 2' })).toBeInTheDocument();
    expect(widget.getByRole('heading', { level: 3, name: 'Balcon sud · 2' })).toBeInTheDocument();
    expect(widget.getByRole('heading', { level: 3, name: 'Potager du fond · 2' })).toBeInTheDocument();
    // Grouped labels carry no brackets: the header names the garden.
    expect(card.querySelector('[data-todo-group="g1"] [data-todo-task="water"]')).toHaveTextContent(
      'Water tonight — 18 plants with high needs, no rain expected'
    );
    expect(card.querySelector('[data-todo-group="g3"] [data-todo-task="cold"]')).toHaveTextContent(
      'Protect from cold — 4 plants tender below 10°, 9° Tuesday evening'
    );
    expect(card.querySelector('[data-todo-session]')).toHaveTextContent(
      'Boxes ticked for this session only — not saved'
    );

    // Nothing may reach the browser's storage: a tick is not a preference
    // (§ 7 — preferences live on the server), and « pour cette session
    // seulement » means the component's lifetime.
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const box = widget.getByRole('checkbox', {
      name: 'Mark “Water tonight — 18 plants with high needs, no rain expected” as done',
    });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    // NO write at all (round 1, E1): a filter on the key let a persistence
    // under any other name through.
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('a freezing week: « Protéger du gel » counts EVERY placement of the garden', () => {
    const freezing = weatherFixture(
      [locationFixture({ days: [dayFixture({ date: '2026-09-12', minTempC: -2, chanceOfRain: 90 })] })],
      [linkFixture({ gardenId: 'g2' })]
    );
    const { card } = renderBlock({ size: 'large', gardens: [balcon], weather: freezing });

    expect(card.querySelector('[data-todo-task="frost"]')).toHaveTextContent(
      'Protect from frost — 6 plants, -2° tonight'
    );
    expect(card.querySelector('[data-todo-task="cold"]')).toBeNull();
  });

  it('keeps the list COMPACT at the top of the card — never stretched (O2, the V3 rule)', () => {
    // Three tasks in a Large card left a void between them and the notes: the
    // group list took the leftover height with `flex: 1`. It now takes the
    // height of what it lists, shrinks (with its own scroll) only when the
    // card is too short, and the notes follow it directly.
    const { card } = renderBlock({ size: 'large', gardens: [terrasse], weather: allLocated() });

    const groups = card.querySelector('[data-todo-groups]') as HTMLElement;
    const rules = rulesFor(groups).replace(/\s+/g, '');
    expect(rules).not.toMatch(/(?:^|[{;])flex-grow:1/);
    expect(rules).not.toMatch(/(?:^|[{;])flex:1(?:[;}])/);
    // `flex: 0 1 auto` — no growth, shrinkable, intrinsic basis.
    expect(rules).toContain('flex:01auto');
    expect(getComputedStyle(groups).flexGrow).not.toBe('1');
    // The notes sit right under the list, in document order.
    const session = card.querySelector('[data-todo-session]')!;
    expect(groups.compareDocumentPosition(session)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('says « (last known weather) » on every task planned from a STALE place (G2)', () => {
    const stale = weatherFixture(
      [locationFixture({ status: 'stale', days: days() })],
      [linkFixture({ gardenId: 'g1' })]
    );
    const { card } = renderBlock({ size: 'large', gardens: [terrasse], weather: stale });

    const rows = [...card.querySelectorAll('[data-todo-task]')];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveAttribute('data-todo-stale');
      expect(row.textContent).toMatch(/\(last known weather\)$/);
    }
  });

  it('…and says nothing of the kind on a fresh place', () => {
    const { card } = renderBlock({ size: 'large', gardens: [terrasse], weather: allLocated() });

    expect(card.querySelectorAll('[data-todo-task]')).toHaveLength(2);
    expect(card.querySelector('[data-todo-stale]')).toBeNull();
    expect(card.textContent).not.toContain('last known weather');
  });

  it('never nests the « Add a city → » button in a paragraph (E2)', () => {
    const { card } = renderBlock({ size: 'large', weather: partial() });

    const invite = card.querySelector('[data-todo-invite]')!;
    expect(invite.querySelector('p')).toBeNull();
    expect(invite.querySelector('button')).not.toBeNull();
  });
});

// ── SMA-336 PR 4a/5 — the calendar rows ───────────────────────────────────
//
// The block reads the BROWSER's month when no garden is located (Q10), and a
// component test may not depend on the day it runs: each fixture below is
// dated FROM that same month, so the row exists in September and in February
// alike, and the assertions read the month back rather than spell it.

const MONTH_TOKENS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

/** The month the block is in when nothing is located — 1..12. */
const currentMonthToken = () => MONTH_TOKENS[new Date().getMonth()]!;

/** A hedge the catalog prunes THIS month, and a lettuce whose sowing window ENDS this month. */
const hedge = varietyFixture({
  plantId: 'hedge',
  commonName: 'Hedge',
  wateringNeedLevel: 'Low',
  pruningMonths: currentMonthToken(),
});
const sownLettuce = varietyFixture({
  plantId: 'sown',
  commonName: 'Lettuce',
  wateringNeedLevel: 'Low',
  sowingPeriod: currentMonthToken(),
});

/** One unlocated garden holding both — no weather task, two calendar ones. */
const jardin = gardenFixture({
  id: 'g1',
  name: 'Terrasse',
  placements: plants(['hedge', 2], ['sown', 3]),
  placementCount: 5,
});
const unlocated = (): DashboardWeatherData =>
  weatherFixture([], [linkFixture({ gardenId: 'g1', locationKey: null, source: null })]);

describe('TodoBlock — « Prune » and « Sow » (PR 4a/5)', () => {
  it('draws the two calendar rows with their glyphs, for a garden with NO city', () => {
    const { card } = renderBlock({
      gardens: [jardin],
      varieties: [hedge, sownLettuce],
      weather: unlocated(),
    });

    const rows = [...card.querySelectorAll('[data-todo-task]')];
    expect(rows.map((row) => row.getAttribute('data-todo-task'))).toEqual(['prune', 'sow']);
    // The sentence NAMES the plants — it does not count them (2 hedges, one name).
    expect(rows[0]).toHaveTextContent(/^Prune — Hedge \(\w+\)$/);
    expect(rows[1]).toHaveTextContent(/^Sow — Lettuce, last month to sow \(\w+\)$/);
    // `ContentCutOutlined` and `SpaOutlined`, the artboard's own glyphs.
    expect(rows[0]!.querySelector('svg[data-testid="ContentCutOutlinedIcon"]')).not.toBeNull();
    expect(rows[1]!.querySelector('svg[data-testid="SpaOutlinedIcon"]')).not.toBeNull();
    expect(card.querySelector('[data-todo-chip]')).toHaveTextContent('2 tasks');
  });

  it('still invites a city for the watering the calendar cannot plan', () => {
    const { card } = renderBlock({
      gardens: [jardin],
      varieties: [hedge, sownLettuce],
      weather: unlocated(),
    });

    expect(card.querySelector('[data-todo-invite]')).toHaveTextContent(
      'Without the weather of Terrasse, its watering is not planned —'
    );
  });

  it('names the garden when several are listed ungrouped, and drops it under a Large group header', () => {
    const other = gardenFixture({ id: 'g2', name: 'Balcon sud', placements: plants(['hedge', 1]), placementCount: 1 });
    const two = (): DashboardWeatherData =>
      weatherFixture(
        [],
        [
          linkFixture({ gardenId: 'g1', locationKey: null, source: null }),
          linkFixture({ gardenId: 'g2', locationKey: null, source: null }),
        ]
      );

    const medium = renderBlock({ gardens: [jardin, other], varieties: [hedge, sownLettuce], weather: two() });
    expect(medium.card.querySelector('[data-todo-task="prune"]')).toHaveTextContent(
      /^Prune — Hedge \(Terrasse, \w+\)$/
    );
  });

  it('Large: the calendar rows group by garden and carry a session checkbox', () => {
    const { card, widget } = renderBlock({
      size: 'large',
      gardens: [jardin],
      varieties: [hedge, sownLettuce],
      weather: unlocated(),
    });

    expect(widget.getByRole('heading', { level: 3, name: 'Terrasse · 2' })).toBeInTheDocument();
    expect(card.querySelector('[data-todo-group="g1"] [data-todo-task="prune"]')).toHaveTextContent(
      /^Prune — Hedge \(\w+\)$/
    );
    expect(widget.getAllByRole('checkbox')).toHaveLength(2);
    // The note that promised them is gone from the Large foot too.
    expect(card.querySelector('[data-todo-soon]')).toBeNull();
    expect(card.querySelector('[data-todo-session]')).toHaveTextContent(
      'Boxes ticked for this session only — not saved'
    );
  });

  it('never says « last known weather » on a calendar row: no forecast is involved', () => {
    const staleTerrasse = weatherFixture(
      [locationFixture({ status: 'stale', days: days() })],
      [linkFixture({ gardenId: 'g1' })]
    );
    const { card } = renderBlock({
      size: 'large',
      gardens: [jardin],
      varieties: [hedge, sownLettuce],
      weather: staleTerrasse,
    });

    const prune = card.querySelector('[data-todo-task="prune"]')!;
    expect(prune).not.toHaveAttribute('data-todo-stale');
    expect(prune.textContent).not.toContain('last known weather');
  });
});

describe('TodoBlock — Small and the states', () => {
  it('Small: the count, and the first task', () => {
    const { card } = renderBlock({ size: 'small' });

    expect(card.querySelector('[data-todo-count]')).toHaveTextContent('6');
    expect(card).toHaveTextContent('6 tasks');
    expect(card).toHaveTextContent('Water tonight');
  });

  it('loading: a skeleton and no chip', () => {
    const { card } = renderBlock({ loading: true, weather: EMPTY_WEATHER_DATA });

    expect(card.querySelector('[data-todo-skeleton]')).not.toBeNull();
    expect(card.querySelector('[data-todo-chip]')).toBeNull();
  });

  it('error: the sentence and a Retry, disabled while refreshing', () => {
    const onRetry = vi.fn();
    const { widget } = renderBlock({ loadError: true, weather: EMPTY_WEATHER_DATA, onRetry });

    expect(widget.getByText('Couldn’t load today’s tasks.')).toBeInTheDocument();
    fireEvent.click(widget.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('follows the imperial system for the cold temperature', () => {
    localStorage.setItem('smartcrops.unitSystem', 'imperial');
    try {
      const { card } = renderBlock({
        size: 'large',
        gardens: [terrasse],
        weather: weatherFixture([locationFixture({ days: days() })], [linkFixture({ gardenId: 'g1' })]),
      });
      expect(card.querySelector('[data-todo-task="cold"]')).toHaveTextContent('48° Tuesday evening');
    } finally {
      localStorage.removeItem('smartcrops.unitSystem');
    }
  });

  it('keeps the widget title and its glyph — this card is not the headless one', () => {
    const { widget } = renderBlock();

    expect(widget.getByRole('heading', { level: 2, name: 'To do today' })).toBeInTheDocument();
  });
});
