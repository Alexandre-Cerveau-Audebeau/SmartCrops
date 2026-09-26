import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../theme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
import {
  dashboardFixture as dashboardWith,
  gardenFixture,
  varietyFixture,
} from '../test/fixtures/dashboard';
import { placement } from '../test/fixtures/placements';
import { linkFixture, weatherFixture } from '../test/fixtures/weather';
import { packGrid, spanFor } from '../utils/dashboardLayoutGrid';
import {
  DASHBOARD_BLOCK_KEYS,
  type DashboardBlock,
  type DashboardLevel,
} from '../types/Dashboard';
import type {
  DashboardData,
  DashboardGardenData,
  DashboardVarietyData,
} from '../types/DashboardData';
import { declaredAtBreakpoint, emittedRules, gridNode, rulesFor, slotOf } from '../test/dashboardDom';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

// SMA-448, PR #293, fix round 2 (A1) — the module's own `refusalOf` stays
// real: it is what turns a refused switch into what the panel says, and a
// mock of it would test nothing.
vi.mock('../services/dashboardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/dashboardApi')>()),
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
  changeFormula: vi.fn(),
}));

// SMA-336 PR 3b/5 — the weather aggregate and the profile city the Weather
// widget reads. NEVER a real provider call: the service is mocked whole.
vi.mock('../services/weatherApi', () => ({
  fetchDashboardWeather: vi.fn(),
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

vi.mock('../services/profileApi', () => ({ fetchProfile: vi.fn() }));

import GardensDashboard from './GardensDashboard';
import {
  changeFormula,
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { fetchDashboardWeather } from '../services/weatherApi';
import { HttpStatusError } from '../services/httpStatusError';
import { fetchProfile } from '../services/profileApi';

/**
 * SMA-336 PR 2/5 — the page reads the transport aggregate now, so the fixture
 * builds its shape. `plants: []` became the placement and variety counts the
 * aggregate carries; nothing else about these tests changes.
 */
const garden = (
  id: string,
  name: string,
  over: Partial<DashboardGardenData> = {}
): DashboardGardenData => gardenFixture({ id, name, ...over });

// The two sums DERIVED from the gardens (round 6, Extension #4-15): a builder
// that pins them at zero can express an aggregate that contradicts its own
// gardens. ONE builder for the three page suites since round 7 (S02) — see
// `dashboardFixture`.

/**
 * Round 1 (E14): `blocks` no longer carries a default value, so
 * `blocks === undefined` is a real question — the helper served `isPreset:
 * false` for every case, including the ones the tests name as presets.
 */
function servePreferences(level: DashboardLevel, blocks?: DashboardBlock[]) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: blocks === undefined,
    blocks: blocks ?? presetFor(level),
    updatedAt: null,
  });
}


/**
 * SMA-434 — two tests below date a fixture on « this month ». The fixture used
 * to read the wall clock at construction and the widget reads it again at
 * render (`blockMonth`): either side of midnight on the last day of a month
 * the two named different months, and the assertion failed at random. Both
 * now read ONE instant — mid-month at noon UTC, so the local month is the
 * same in every zone the suite may run in.
 */
const FROZEN_NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

/**
 * Pins `Date` on `FROZEN_NOW` for the rest of the test; the file's `afterEach`
 * puts the real clock back. ONLY `Date` is faked: the timers stay real, so
 * `waitFor` and `findBy…` keep polling on the engine's own `setTimeout`.
 */
function freezeDate() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
}

/** The widget keys the grid currently renders, in DOM order. */
const renderedKeys = () =>
  [...document.querySelectorAll('[data-widget]')].map((node) =>
    node.getAttribute('data-widget')
  );

function renderPage() {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([garden('g1', 'Casa Lolo')]));
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  // One garden, not located, no profile default: the Weather widget opens on
  // its invitation, which is what these page tests look at.
  vi.mocked(fetchDashboardWeather).mockResolvedValue(
    weatherFixture([], [linkFixture({ gardenId: 'g1', locationKey: null, source: null })])
  );
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  servePreferences('gardener');
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('GardensDashboard — grid from the stored preferences (SMA-336)', () => {
  it('renders the nine widgets of the Expert preset: the Key figures band first, then the eight in the canonical order', async () => {
    // SMA-437 lot 1, PR B, step B1 — « en tête du preset Expert ».
    servePreferences('expert');

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(9));
    expect(renderedKeys()).toEqual([
      'keyfigures',
      ...DASHBOARD_BLOCK_KEYS.filter((key) => key !== 'keyfigures'),
    ]);
  });

  // SMA-437 lot 1, PR B, step B4 — the band has its own body: its four
  // figures, as tiles, on the page's own aggregates. Without it the block fell
  // to the generic « Coming soon » shell.
  it('draws the Key figures band as its four tiles — on the page’s gardens — not as a « Coming soon » shell', async () => {
    servePreferences('expert');

    renderPage();

    const band = await waitFor(() => {
      const node = document.querySelector('[data-widget="keyfigures"]') as HTMLElement | null;
      expect(node).not.toBeNull();
      return node!;
    });
    const list = await within(band).findByRole('list', { name: 'Your four key figures' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    // Casa Lolo, 4 × 3, nothing planted: twelve free cells.
    expect(within(band).getByText('Free cells: 12 — where to plant next')).toBeInTheDocument();
    expect(within(band).queryByText('Coming soon')).toBeNull();
  });

  it('gives the band three Edit-mode controls — hide, move, options — and NO corner grip: it has one size (C28)', async () => {
    servePreferences('expert');

    renderPage();
    // « Edit » is drawn, DISABLED, while the layout loads: a click then is lost.
    const edit = await screen.findByRole('button', { name: 'Edit' });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);

    expect(await screen.findByRole('button', { name: 'Hide Key figures' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Key figures' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Key figures options' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change the size of Key figures/ })).toBeNull();
    // …while a widget with three sizes keeps its grip.
    expect(screen.getByRole('button', { name: /Change the size of Weather/ })).toBeInTheDocument();
  });

  it('shows, in the gallery, a hidden band’s FIRST figure — never « Soon » (pre-flight D16)', async () => {
    const blocks = presetFor('expert').map((block) =>
      block.key === 'keyfigures' ? { ...block, hidden: true } : block
    );
    servePreferences('expert', blocks);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));

    const panel = await screen.findByRole('dialog', { name: 'Customize' });
    const add = within(panel).getByRole('button', { name: 'Add Key figures' });
    const row = add.parentElement as HTMLElement;
    // The first default figure — free cells — of Casa Lolo: twelve.
    await waitFor(() => expect(row).toHaveTextContent('12'));
    expect(within(row).queryByText('Soon')).toBeNull();
  });

  it('leaves the level’s hidden widgets out of the grid', async () => {
    servePreferences('gardener');

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(renderedKeys()).toEqual([
      'weather',
      'gardens',
      'tips',
      'month',
      'todo',
      'counters',
    ]);
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Statistics' })
    ).toBeNull();
    // By ROLE, not by text (round 3, E″7). « Harvest » is a widget title AND a
    // column label of the Gardens table, so a page-wide text query answers on
    // either — and this assertion means « the widget is off the grid ».
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Harvest' })
    ).toBeNull();
  });

  it('applies the STORED order, not the preset order', async () => {
    const blocks = presetFor('gardener');
    const [weather, gardens] = [blocks[0]!, blocks[1]!];
    blocks[0] = gardens;
    blocks[1] = weather;
    servePreferences('gardener', blocks);

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(renderedKeys().slice(0, 2)).toEqual(['gardens', 'weather']);
  });

  it('renders the Gardens widget at the stored SIZE — Medium is the compact list', async () => {
    servePreferences('novice');

    renderPage();

    // Novice puts Gardens in Medium: one-line link rows, not the Large
    // comparison table.
    //
    // ADAPTED by round 2 (V12). This used to read the ABSENCE of the Delete
    // button as the sign of a Medium widget, because the frozen design put
    // rename and delete on the table only. That is exactly the defect V12
    // names: Novice is the preset that shows this widget in Medium, so it was
    // the one account with no way to rename or delete a garden at all. Both
    // buttons are on both sizes now, and what separates the sizes is the
    // table — which is what this asserts instead.
    await screen.findByRole('link', { name: 'Open Casa Lolo' });
    const widget = document.querySelector('[data-widget="gardens"]')!;
    expect(widget.querySelector('table')).toBeNull();
    expect(
      within(widget as HTMLElement).getByRole('button', {
        name: 'Delete Casa Lolo',
      })
    ).toBeInTheDocument();
  });

  it('renders the Gardens widget at Large as the comparison table', async () => {
    servePreferences('gardener');

    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Delete Casa Lolo' })
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-widget="gardens"] table')
    ).toBeInTheDocument();
  });
});

describe('GardensDashboard — header (SMA-336)', () => {
  it('shows the page title, the WHOLE meta line and the level chip', async () => {
    // ROUND 4 (A3). `Main.dc.html` writes three figures under the title —
    // `<div class="meta">3 jardins · 128 plantes · 42,5 m²</div>` — and the
    // page printed the first alone. The fixture garden is 4 × 3 at 50 cm, so
    // 12 active cells at 0.25 m² make 3 m², and it holds no placement.
    //
    // Scoped to the header: the Gardens widget's own chip carries the garden
    // count too, and both saying "1 garden" is the point, not an ambiguity.
    renderPage();

    const heading = await screen.findByRole('heading', { name: 'My Gardens' });
    await waitFor(() =>
      expect(
        within(heading.parentElement!).getByText('1 garden · 0 plants · 3.0 m²')
      ).toBeInTheDocument()
    );
    expect(await screen.findByText('Gardener view')).toBeInTheDocument();
  });

  it('derives the surface from the plans, and each figure agrees with its own number', async () => {
    // Three cardinalities in one sentence: i18next selects a plural form from
    // ONE `count`, so a single string could only ever agree with the first —
    // « 2 gardens · 1 plants ». Each figure is its own plural-aware fragment.
    //
    // The surface is DERIVED here (decision D9): the aggregate transports
    // plans, not areas, and `totals` carries no surface at all. Two gardens of
    // 4 × 3 at 50 cm make 6 m².
    // The placement sits on a GARDEN and the totals follow (round 7, S19 —
    // Extension #6-16): the fixture used to pin `placementCount: 1` over two
    // gardens holding none, an aggregate the server never emits, on which the
    // test passed even if the page derived the figure from the gardens.
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([
        garden('g1', 'Terrasse', { placementCount: 1, varietyCount: 1 }),
        garden('g2', 'Balcon'),
      ])
    );

    renderPage();

    const heading = await screen.findByRole('heading', { name: 'My Gardens' });
    await waitFor(() =>
      expect(
        within(heading.parentElement!).getByText('2 gardens · 1 plant · 6.0 m²')
      ).toBeInTheDocument()
    );
  });

  // SMA-437 lot 1, PR A, step A6 (A-N16) — « 2,66 ha », never « 26 642 m² »:
  // hectares beyond 10 000 m², two decimals at most, no useless zero.
  it('writes the surface in hectares beyond 10 000 m² — « 1.01 ha » (SMA-437, A-N16)', async () => {
    // 101 × 100 cells of 1 m: 10 100 m² — beyond 10 000, so « 1.01 ha ».
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([garden('g1', 'Domaine', { width: 101, height: 100, cellSize: '1m' })])
    );

    renderPage();

    const heading = await screen.findByRole('heading', { name: 'My Gardens' });
    const meta = await within(heading.parentElement!).findByText('1 garden · 0 plants · 1.01 ha');
    expect(meta.textContent).toContain('1.01\u00a0ha');
  });

  it('never lets a figure and its unit part at a line end: a NO-BREAK space before « m² » (SMA-437, pre-flight constat 19)', async () => {
    // The contract (§ 5.3): « espace insécable […] avant m² ». The meta line
    // wrote an ordinary space, which a line may break at.
    renderPage();

    const heading = await screen.findByRole('heading', { name: 'My Gardens' });
    const meta = await within(heading.parentElement!).findByText('1 garden · 0 plants · 3.0 m²');
    expect(meta.textContent).toContain('3.0\u00a0m²');
    expect(meta.textContent).not.toContain('3.0 m²');
  });

  it('marks the chip « adjusted » when the layout diverges from its preset', async () => {
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'large';
    servePreferences('gardener', blocks);

    renderPage();

    expect(
      await screen.findByText('Gardener view · adjusted')
    ).toBeInTheDocument();
  });

  it('puts the artboard’s own glyph in front of the level chip (A10-11)', async () => {
    // `Main.dc.html` writes `<span class="lvl"><svg class="ic" …/>Vue
    // Jardinier</span>`, and gives each of the four header elements a glyph;
    // this was the one without. The path matches `@mui/icons-material`'s `Tune`
    // attribute for attribute.
    renderPage();

    const chip = (await screen.findByText('Gardener view')).closest(
      '.MuiChip-root'
    )!;
    expect(
      chip.querySelector('svg[data-testid="TuneOutlinedIcon"]')
    ).not.toBeNull();
  });

  it('draws the level chip at `.lvl`’s 32 px, and the two buttons with the artboard’s glyphs (N5-5 / N5-6 / N5-7)', async () => {
    // `.lvl { height: 32px; padding: 0 13px 0 10px; border-radius: 16px; gap:
    // 7px; font-size: 13px; font-weight: 600 }` — a `size="small"` chip was
    // 24 px. « Modifier » draws `EditOutlined`, « Créer un jardin » draws
    // `Add`, both matched attribute for attribute in `Main.dc.html`.
    renderPage();

    const chip = (await screen.findByText('Gardener view')).closest('.MuiChip-root')!;
    const rules = rulesFor(chip).replace(/\s+/g, '');
    expect(rules).toContain('height:32px');
    expect(rules).toContain('border-radius:16px');
    expect(rules).toContain('font-size:13px');
    expect(rules).toContain('font-weight:600');

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit.querySelector('svg[data-testid="EditOutlinedIcon"]')).not.toBeNull();
    const create = screen.getByRole('button', { name: 'Create Garden' });
    expect(create.querySelector('svg[data-testid="AddIcon"]')).not.toBeNull();
  });

  it('keeps the four header glyphs distinct from one another (A10-11)', async () => {
    // The sliders of `Tune` belong to the level chip; the artboard puts the
    // four squares of `DashboardCustomizeOutlined` on « Personnaliser », and
    // the page had the two swapped. Restoring the chip's glyph without moving
    // this one would have drawn the same sliders twice, side by side.
    renderPage();

    const customize = await screen.findByRole('button', { name: 'Customize' });
    expect(
      customize.querySelector(
        'svg[data-testid="DashboardCustomizeOutlinedIcon"]'
      )
    ).not.toBeNull();
    expect(
      customize.querySelector('svg[data-testid="TuneOutlinedIcon"]')
    ).toBeNull();
  });

  it('offers Edit, Customize and Create Garden outside the Edit mode', async () => {
    renderPage();

    // ENABLED is a state the page reaches one render after the preferences
    // land, not a property of the first paint — `findByRole` resolves on that
    // first paint, so the enabled state is WAITED for, as `openPanel` does.
    // Edit and Customize share one `disabled` expression: once Edit is
    // enabled, the same render enabled Customize.
    const edit = await screen.findByRole('button', { name: 'Edit' });
    await waitFor(() => expect(edit).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Customize' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create Garden' })).toBeEnabled();
  });
});

describe('GardensDashboard — page states (SMA-336)', () => {
  it('shows a skeleton grid while the preferences load, then the widgets', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(fetchDashboardPreferences).mockReturnValue(
      new Promise((r) => {
        resolve = r as (value: unknown) => void;
      }) as ReturnType<typeof fetchDashboardPreferences>
    );

    const { container } = renderPage();

    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    expect(renderedKeys()).toHaveLength(0);

    resolve({
      schemaVersion: 1,
      level: 'gardener',
      capabilities: capabilitiesFor('gardener'),
      isPreset: true,
      blocks: presetFor('gardener'),
      updatedAt: null,
    });

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
  });

  it('never shows a blank page: a failed load offers a retry that reloads', async () => {
    vi.mocked(fetchDashboardPreferences)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        schemaVersion: 1,
        level: 'gardener',
        capabilities: capabilitiesFor('gardener'),
        isPreset: true,
        blocks: presetFor('gardener'),
        updatedAt: null,
      });

    renderPage();

    expect(
      await screen.findByText('Couldn’t load your dashboard.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(fetchDashboardPreferences).toHaveBeenCalledTimes(2);
  });

  it('a widget’s Retry says a request is out, instead of taking a click that changes nothing (round 7, S33 — Extension #7-17)', async () => {
    // The aggregate fails; the three data widgets show their error and a
    // Retry. `loading` never returns to `true` (a refetch keeps the figures —
    // or the error — on screen, SMA-288 / SMA-421) and `loadError` is cleared
    // only by an answer, so the click used to change nothing a widget could
    // read until the response landed. The button now disables itself while
    // the replacement is in flight, and comes back with the answer.
    let answer: (data: DashboardData) => void = () => {};
    vi.mocked(fetchDashboardData)
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(
        () =>
          new Promise<DashboardData>((resolve) => {
            answer = resolve;
          })
      );
    servePreferences('gardener');

    renderPage();
    const counters = () =>
      within(document.querySelector('[data-widget="counters"]') as HTMLElement);
    // Three widgets, three Retry buttons: the Counters one is the witness.
    await screen.findAllByRole('button', { name: 'Try again' }, { timeout: 10000 });
    const button = counters().getByRole('button', { name: 'Try again' });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    // Still the error, still the button — disabled, because the request is out.
    await waitFor(() => expect(counters().getByRole('button', { name: 'Try again' })).toBeDisabled());
    expect(counters().getByText('Couldn’t load your dashboard.')).toBeInTheDocument();
    expect(fetchDashboardData).toHaveBeenCalledTimes(2);

    answer(dashboardWith([garden('g1', 'Casa Lolo')]));

    await waitFor(() => expect(counters().queryByRole('button', { name: 'Try again' })).toBeNull());
    expect(await screen.findByText('Casa Lolo')).toBeInTheDocument();
  });

  it('disables Edit and Customize while the layout is unavailable', async () => {
    vi.mocked(fetchDashboardPreferences).mockRejectedValue(new Error('boom'));

    renderPage();

    await screen.findByText('Couldn’t load your dashboard.');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Customize' })).toBeDisabled();
  });
});

describe('GardensDashboard — the widget shells still waiting for data (SMA-336)', () => {
  const INVITATIONS_EN: Array<[string, string]> = [
    // Weather LEFT this list in PR 3b/5: it carries the weather aggregate now,
    // and its invitation has a field behind it — see the two tests below.
    // Tips LEFT it in PR 4b/5: it derives its advice from the plans, the
    // catalog and the weather — `TipsBlock.test.tsx` covers what it shows,
    // and the test below what it says on a page with nothing planted.
    // To do today LEFT this list in PR 3b/5 (step 8): it derives its tasks
    // from the weather aggregate — `TodoBlock.test.tsx` covers what it shows.
    // This month LEFT it in PR 4a/5: it carries the calendar of the placed
    // varieties now — `MonthBlock.test.tsx` covers what it shows.
    // Counts by variety and Statistics LEFT this list in PR 2/5: they carry
    // real data now, and their own tests cover what they show.
    [
      'Harvest',
      'Your plants have no growth stage yet — the estimate can’t count them.',
    ],
  ];

  it.each(INVITATIONS_EN)(
    'the %s widget states honestly that its data is not here yet',
    async (title, sentence) => {
      servePreferences('expert');

      renderPage();

      // By ROLE: since PR 2/5 the Gardens table labels WEATHER and HARVEST
      // columns, so those two words match a column header as well as a title.
      expect(
        await screen.findByRole('heading', { level: 2, name: title })
      ).toBeInTheDocument();
      expect(screen.getByText(sentence)).toBeInTheDocument();
    }
  );

  it('every invitation carries the « Coming soon » mention', async () => {
    servePreferences('expert');

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(9));
    // ONE shell — Harvest, and Harvest alone: Gardens, Counts by variety,
    // Statistics, Weather and To do today carry data, This month joined them
    // in PR 4a/5, Tips in PR 4b/5 and the Key figures band in SMA-437 lot 1
    // (PR B, step B4).
    expect(screen.getAllByText('Coming soon')).toHaveLength(1);
    expect(screen.queryByText('Coming soon', { selector: '[data-widget="tips"] *' })).toBeNull();
  });

  it('the Tips widget carries its own body (PR 4b/5): with nothing planted, its honest sentence, not « Coming soon »', async () => {
    servePreferences('expert');

    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: 'Tips' })).toBeInTheDocument();
    const card = document.querySelector('[data-widget="tips"]') as HTMLElement;
    expect(card).toHaveTextContent('No plant placed yet — tips arrive with your plantings.');
    expect(within(card).queryByText('Coming soon')).toBeNull();
  });

  it('the Weather widget offers the city field and « Use » in its invitation (PR 3b/5, decision R4 lifted)', async () => {
    // R4 held while no endpoint stood behind the field; the geocoding and
    // location endpoints of PR 3a/5 do now, so the frozen design's field is
    // drawn — disabled « Use » until a place is picked from the list.
    servePreferences('expert');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled();
    expect(screen.queryByText('Coming soon', { selector: '[data-widget="weather"] *' })).toBeNull();
  });

  it('the Weather widget has NO title row: the place stands as its title (arbitrage Q1)', async () => {
    servePreferences('expert');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    const card = document.querySelector('[data-widget="weather"]') as HTMLElement;
    expect(within(card).queryByRole('heading', { level: 2 })).toBeNull();
    expect(card).toHaveAttribute('role', 'region');
    expect(card).toHaveAttribute('aria-label', 'Weather');
    // The seven others keep their h2 (amendments A1 / A2, untouched).
    expect(screen.getByRole('heading', { level: 2, name: 'Gardens' })).toBeInTheDocument();
  });

  it('renders the invitations in French too', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    servePreferences('expert');

    renderPage();

    expect(
      await screen.findByText(
        'La météo a besoin de savoir où se trouvent vos jardins.'
      )
    ).toBeInTheDocument();
    // Tips carries its own body since PR 4b/5 — its French empty sentence,
    // where its « bientôt » shell used to be.
    expect(
      screen.getByText('Aucune plante placée — les conseils arrivent avec vos plantations.')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Bientôt disponible')).toHaveLength(1);
    expect(screen.getByLabelText('Ville')).toBeInTheDocument();
  });
});

describe('GardensDashboard — invitation layout (SMA-336 round 1, V3)', () => {
  it('gives the invitation an intrinsic height instead of stretching it', async () => {
    // V3: the tinted panel used to fill a Large card top to bottom. It now
    // takes the height of what it says and sits in the middle.
    servePreferences('expert');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    const panel = document.querySelector('[data-invite-panel]') as HTMLElement;
    const style = getComputedStyle(panel);

    expect(style.flexGrow).not.toBe('1');
    expect(style.height).not.toBe('100%');
    expect(style.margin).toBe('auto');
    expect(style.maxWidth).toBe('360px');
  });

  it('stays compact on a phone, where the grid row is 200px at least (round 2, V5)', async () => {
    // V3 held on a desktop and not on a phone, and the breakpoint-conditioned
    // rule behind that is `DashboardGrid`'s `gridAutoRows: {xs: minmax(200px,
    // auto), sm: 273px}`. A 200px card leaves about 128px of body once its
    // 20px padding, its title row and its 12px gap are taken; the stacked
    // panel — 44px disc ABOVE the sentence above « Bientôt disponible » —
    // needed about 164px, so it overflowed and the card's `overflow: hidden`
    // clipped a dashed frame edge to edge. The frozen artboards draw `.inv` as
    // a ROW (disc beside the text): the same words then need about 119px. No
    // media query is involved, which is what makes the rule hold at EVERY
    // width — the mobile lot let the phone row GROW past 200px, it did not
    // let a panel need it.
    servePreferences('novice');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    const panel = document.querySelector('[data-invite-panel]') as HTMLElement;

    // The phone geometry the panel has to fit inside: one column, rows of
    // 200px at least (SMA-336 mobile lot, D1).
    const gridRules = emittedRules(gridNode());
    expect(gridRules.some((text) => text.includes('grid-template-columns:1fr'))).toBe(true);
    expect(gridRules.some((text) => text.includes('grid-auto-rows:minmax(200px, auto)'))).toBe(true);

    const panelRules = emittedRules(panel);
    expect(panelRules.length).toBeGreaterThan(0);
    // Not stacked: that is the ~56px the phone card does not have.
    expect(panelRules.some((text) => text.includes('flex-direction:column'))).toBe(false);
    // And nothing keyed on a breakpoint, so no width restores the stretch.
    expect(panelRules.some((text) => text.includes('@media'))).toBe(false);
  });

  it('gives the invitation icon a fixed disc that never squeezes the text', async () => {
    servePreferences('novice');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    const panel = document.querySelector('[data-invite-panel]') as HTMLElement;
    const disc = panel.firstElementChild as HTMLElement;

    // `.inv-ic` of the frozen artboards: 34px, `flex-shrink: 0` — the sentence
    // wraps beside it instead of the disc collapsing on a narrow card.
    expect(getComputedStyle(disc).width).toBe('34px');
    expect(getComputedStyle(disc).flexShrink).toBe('0');
  });


  it('draws the tinted ground and the dashed border around the content only', async () => {
    servePreferences('expert');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    const panel = document.querySelector('[data-invite-panel]') as HTMLElement;

    expect(getComputedStyle(panel).border).toContain('dashed');
  });

  it('gives every garden one comparable row in the Large table', async () => {
    // The V3 rule was written for the card grid: two gardens must not leave
    // half a Large card empty. The Large body is the comparison table now, and
    // the equivalent statement is stronger — one row per garden, each carrying
    // the same labelled columns, so two gardens are actually comparable.
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([garden('g1', 'Casa Lolo'), garden('g2', 'Le Potager')])
    );
    servePreferences('gardener');

    renderPage();

    await screen.findByText('Casa Lolo');
    const widget = document.querySelector('[data-widget="gardens"]')!;
    const table = widget.querySelector('table');

    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2);
    // SIX labelled columns plus the actions cell — the frozen design's own
    // arbitration, measured: seven labelled columns need 590 px and a Large
    // card offers 516. WEATHER is among them because the Gardener preset shows
    // the Weather widget; HARVEST is not, because it hides the Harvest one.
    //
    // Round 1 (E18): the RAW list, blanks included. The `.filter(Boolean)` this
    // replaces discarded a seventh, empty `th` that the production headers
    // array emitted — so the assertion read as « six columns and an Actions
    // header » while the table declared one more column than any row filled.
    // A blank header is exactly what this test has to be able to see.
    const headerTexts = [...table!.querySelectorAll('thead th')].map(
      (th) => th.textContent?.trim() ?? ''
    );
    expect(headerTexts).toEqual([
      'Garden',
      'Plants',
      'Occupancy',
      'Exposure',
      'Weather',
      'Modified',
      'Actions',
    ]);

    // The ACTIONS header is screen-reader-only — it names a column of icon
    // buttons — and it uses MUI's shared `visuallyHidden` since round 1 (E11 /
    // G3) instead of a local copy of the same six declarations. Still hidden by
    // clip, still announced.
    const actionsHeader = [...table!.querySelectorAll('thead th')].at(-1)!;
    expect(actionsHeader.textContent).toBe('Actions');
    const label = actionsHeader.querySelector('span')!;
    const hidden = getComputedStyle(label);
    expect(hidden.position).toBe('absolute');
    expect(hidden.overflow).toBe('hidden');
    expect(hidden.whiteSpace).toBe('nowrap');
    expect(hidden.width).toBe('1px');
    expect(hidden.height).toBe('1px');

    // And the invariant the blank header broke (round 1, E9 / G2): every body
    // row fills exactly as many cells as the head declares columns. Without it
    // the ACTIONS header sat one column right of the actions cells, and
    // assistive technology announced « Modified » over the edit and delete
    // buttons.
    // Cells, not `td`s: the identity cell is the row's `th` since round 7
    // (S31), and it fills a column like the others.
    const bodyRows = [...table!.querySelectorAll('tbody tr')];
    expect(bodyRows).not.toHaveLength(0);
    for (const row of bodyRows) {
      expect(row.querySelectorAll('th, td')).toHaveLength(headerTexts.length);
      expect(row.querySelectorAll('th[scope="row"]')).toHaveLength(1);
    }
  });
});

describe('GardensDashboard — headings and dialogs (SMA-336 round 1)', () => {
  it('makes the page title the h1 and the widget titles h2', async () => {
    // Round 1 (E16 / G5).
    servePreferences('gardener');

    renderPage();

    const title = await screen.findByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('My Gardens');
    const widgetTitles = await screen.findAllByRole('heading', { level: 2 });
    expect(widgetTitles.map((node) => node.textContent)).toContain('Gardens');
  });

  it('resets the create form on every close path', async () => {
    // Round 1 (E15): the name and the error used to survive a cancel.
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Create Garden' }));
    const name = await screen.findByLabelText(/Name/);
    fireEvent.change(name, { target: { value: 'Half-typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The dialog unmounts after its exit transition; the header button is
    // behind the modal until then.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByDisplayValue('Half-typed')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create Garden' }));
    expect(await screen.findByLabelText(/Name/)).toHaveValue('');
  });

  it('keeps every control out of the row link', async () => {
    // Round 1 (E7), kept through PR 2/5: a <button> nested in an <a> is invalid
    // HTML that assistive technology cannot resolve into two targets. The
    // « See more » toggle it was written for went with the card body — the Large
    // widget is a table and shows no description — but the rule outlived it: the
    // row still puts a link and two buttons side by side.
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([garden('g1', 'Casa Lolo', { description: 'x'.repeat(120) })])
    );
    servePreferences('gardener');

    renderPage();

    const link = await screen.findByRole('link', { name: /Casa Lolo/ });
    expect(link.querySelector('button')).toBeNull();

    for (const name of ['Edit Casa Lolo', 'Delete Casa Lolo']) {
      expect(screen.getByRole('button', { name }).closest('a')).toBeNull();
    }
  });
});

describe('GardensDashboard — the widget header (round 4, A1 / A2)', () => {
  it('opens every widget title on a primary-coloured glyph', async () => {
    // The artboards put one before every `<span class="hd-t">`:
    //   <div class="hd"><svg class="ic" width="18" …/><span class="hd-t">…
    //   .hd .ic { color: var(--prim); }
    // The implementation had none at all — Alexandre: « il n'y a pas les logos
    // non plus ».
    renderPage();
    await screen.findByText('Gardener view');

    for (const card of document.querySelectorAll('[data-widget]')) {
      if (card.getAttribute('data-widget') === 'weather') {
        // The declared exception (PR 3b/5, arbitrage Q1): the one widget the
        // artboards do not title has no title row at all — the place line is
        // its title — and names itself as a region instead.
        expect(card.querySelector('h2')).toBeNull();
        expect(card).toHaveAttribute('role', 'region');
        continue;
      }
      const heading = card.querySelector('h2')!;
      const glyph = heading.previousElementSibling;
      expect(glyph, `${card.getAttribute('data-widget')} has no title glyph`)
        .not.toBeNull();
      expect(glyph!.tagName.toLowerCase()).toBe('svg');
      // Decorative: the h2 beside it already names the widget, so the glyph is
      // not announced a second time.
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('writes the title at 15 px, not the artboard’s 13 (amendment A1)', async () => {
    // Alexandre, 10/09: « les titres en haut des widgets doivent être un peu
    // plus gros, avec une plus grande police ». Everything else about `.hd-t`
    // is the artboard's — 800, uppercase, .06em of tracking, muted.
    renderPage();
    await screen.findByText('Gardener view');

    const heading = document.querySelector('[data-widget] h2')!;
    const rules = rulesFor(heading).replace(/\s+/g, '');
    expect(rules).toContain('font-size:15px');
    expect(rules).toContain('font-weight:800');
    expect(rules).toContain('text-transform:uppercase');
    expect(rules).toContain('letter-spacing:0.06em');
  });

  it('gives each widget the glyph its artboard draws', async () => {
    // Identified rather than chosen (round 4, A2): every `<svg class="ic">` of
    // a `.hd` was matched path-for-path against `@mui/icons-material`, and four
    // entries moved — Tips, Today, Counts and Statistics were near-enough
    // guesses. MUI stamps the icon name in `data-testid`, which is what makes
    // the identification assertable rather than a comment.
    servePreferences('expert');
    renderPage();
    await screen.findByText('Expert view');

    const glyphOf = (key: string) =>
      document
        .querySelector(`[data-widget="${key}"] h2`)!
        .previousElementSibling!.getAttribute('data-testid');

    expect(glyphOf('gardens')).toBe('YardOutlinedIcon');
    expect(glyphOf('tips')).toBe('TipsAndUpdatesOutlinedIcon');
    expect(glyphOf('month')).toBe('CalendarMonthOutlinedIcon');
    expect(glyphOf('todo')).toBe('TaskAltOutlinedIcon');
    expect(glyphOf('counters')).toBe('LocalFloristOutlinedIcon');
    expect(glyphOf('stats')).toBe('InsightsOutlinedIcon');
    expect(glyphOf('harvest')).toBe('AgricultureOutlinedIcon');
    // Weather is the one widget the artboards do not title: since PR 3b/5
    // (arbitrage Q1) its card has no header at all — it opens on the place
    // line's pin, and its hero glyph is the condition's own (WeatherBlock's
    // tests). `BLOCK_ICONS.weather` still serves the Customize gallery.
    expect(document.querySelector('[data-widget="weather"] h2')).toBeNull();
  });
});

describe('GardensDashboard — Customize panel (SMA-336)', () => {
  const openPanel = async () => {
    renderPage();
    const customize = await screen.findByRole('button', { name: 'Customize' });
    // ENABLED, not merely present — the same trap `enterEditMode` and
    // `openCountersOptions` already guard against (round 1, E17). The page
    // renders Customize `disabled={loading || loadError}` from its very first
    // paint, and `findByRole` resolves on its first, synchronous check, so it
    // can hand back the disabled button; the enabling re-render is one
    // macrotask away, and so is the `setTimeout(0)` `findByRole` drains before
    // returning. Whichever fires first decides whether the click is swallowed.
    // CI run 34626480539 lost that race on two tests of this describe.
    await waitFor(() => expect(customize).toBeEnabled());
    fireEvent.click(customize);
    return await screen.findByRole('heading', { name: 'Customize' });
  };

  it('offers the three levels with their taglines', async () => {
    await openPanel();

    expect(screen.getByRole('radio', { name: /Novice/ })).toBeInTheDocument();
    expect(screen.getByText('the essentials, nothing more')).toBeInTheDocument();
    expect(screen.getByText('weather, tasks and counts')).toBeInTheDocument();
    // Round 1 (E13): the three taglines share one casing convention.
    expect(screen.getByText('everything, in large')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Gardener/ })).toBeChecked();
  });

  it('names the drawer and the level group for assistive technology', async () => {
    // Round 1 (E5): the heading was a plain Typography with nothing tying it
    // to either the dialog or the RadioGroup, so both were announced unnamed.
    await openPanel();

    expect(screen.getByRole('dialog', { name: 'Customize' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Level' })).toBeInTheDocument();
  });

  // SMA-448, lot F1, S5 — this test used to pin « choosing a level applies its
  // preset and persists it »: the page wrote the Expert preset over the layout
  // it left (V4, fact F1 of the contract). Choosing a level now switches the
  // account's formula on the server, and the page draws what the server then
  // holds — here the Expert preset, for a formula never visited.
  it('choosing a level switches the formula on the server, then draws the layout the server holds', async () => {
    vi.mocked(changeFormula).mockResolvedValue(undefined);
    await openPanel();
    // What the server holds once the account is Expert.
    servePreferences('expert');

    fireEvent.click(screen.getByRole('radio', { name: /Expert/ }));

    // The Expert preset: the Key figures band, then the eight (PR B, B1).
    await waitFor(() => expect(renderedKeys()).toHaveLength(9));
    expect(await screen.findByText('Expert view')).toBeInTheDocument();
    expect(changeFormula).toHaveBeenCalledWith('expert');
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
  });

  it('the reset names the current level and restores its preset', async () => {
    const blocks = presetFor('gardener');
    blocks[2]!.hidden = true;
    servePreferences('gardener', blocks);

    await openPanel();
    expect(
      await screen.findByText('Gardener view · adjusted')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to the Gardener level' })
    );

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(await screen.findByText('Gardener view')).toBeInTheDocument();
  });

  it('puts a glyph in front of the reset, as the artboard has it (A10-12)', async () => {
    // `A7Personnaliser.dc.html` draws this control as a `.lnk` opening on an
    // 18 px `<svg class="ic">` whose path is `RestartAltOutlined`.
    await openPanel();

    const reset = screen.getByRole('button', {
      name: 'Reset to the Gardener level',
    });
    expect(
      reset.querySelector('svg[data-testid="RestartAltOutlinedIcon"]')
    ).not.toBeNull();
  });

  /**
   * SMA-448, lot F1 — the Statistics thumbnail lives at the Expert formula,
   * the one that has Statistics (R1): an Expert layout with Statistics and
   * Harvest hidden, so the gallery offers both, as the Gardener's used to.
   */
  const serveExpertWithStatisticsAndHarvestHidden = () =>
    servePreferences(
      'expert',
      presetFor('expert').map((block) =>
        block.key === 'stats' || block.key === 'harvest' ? { ...block, hidden: true } : block
      )
    );

  it('the gallery lists the hidden widgets and « + » puts one back on the page — never Statistics at the Gardener formula (SMA-448, R1)', async () => {
    await openPanel();
    // Round 1 (G9): MUI renders the open temporary Drawer as role="dialog";
    // since round 1 it also carries an accessible name (E5).
    const gallery = screen.getByRole('dialog', { name: 'Customize' });

    expect(within(gallery).getByText('Harvest')).toBeInTheDocument();
    expect(within(gallery).queryByText('Statistics')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Statistics' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add Harvest' }));

    await waitFor(() => expect(renderedKeys()).toContain('harvest'));
    expect(renderedKeys()).not.toContain('stats');
  });

  // SMA-448, lot F1, S5 — the gallery offers the widgets of the FORMULA, as the
  // served capabilities list them: a hidden block they do not permit is never
  // offered back, whatever the layout carries.
  it('offers in the gallery only the widgets the served capabilities permit — never a hidden block they do not', async () => {
    servePreferences('gardener', [
      ...presetFor('gardener'),
      { key: 'stats', size: 'large', hidden: true },
    ]);

    await openPanel();
    const gallery = screen.getByRole('dialog', { name: 'Customize' });

    expect(within(gallery).getByText('Harvest')).toBeInTheDocument();
    expect(within(gallery).queryByText('Statistics')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Statistics' })).toBeNull();
  });

  // SMA-448, lot F1, S5 — V4 on the page: choosing a formula in the panel
  // switches it on the server, which keeps every formula's layout; the page
  // never writes the chosen formula's preset over what the user arranged.
  it('choosing another formula in the panel switches it on the server — it never writes its preset', async () => {
    vi.mocked(changeFormula).mockResolvedValue(undefined);
    await openPanel();

    fireEvent.click(screen.getByRole('radio', { name: /Expert/ }));

    await waitFor(() => expect(changeFormula).toHaveBeenCalledWith('expert'));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(
      vi.mocked(saveDashboardPreferences).mock.calls.filter(([saved]) => saved.level === 'expert')
    ).toEqual([]);
  });

  // SMA-448, PR #293, fix round 1 — S5: while a switch is on the wire the
  // panel takes no gesture, so none can be made and then lost — its levels,
  // its reset and its « + » are disabled until the page stands at the new
  // formula.
  it('while a switch is in flight the panel takes no gesture: its levels, its reset and its « + » are disabled until the new formula stands', async () => {
    let release!: () => void;
    vi.mocked(changeFormula).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    await openPanel();

    fireEvent.click(screen.getByRole('radio', { name: /Expert/ }));
    await waitFor(() => expect(changeFormula).toHaveBeenCalledWith('expert'));

    for (const name of [/Novice/, /Gardener/, /Expert/]) {
      expect(screen.getByRole('radio', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Reset to the Gardener level' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Harvest' })).toBeDisabled();

    servePreferences('expert');
    release();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Expert/ })).toBeChecked());
    expect(screen.getByRole('radio', { name: /Novice/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reset to the Expert level' })).toBeEnabled();
  });

  // SMA-448, PR #293, fix round 1 — S6: the switch lands but its layout
  // cannot be read back. The page used to keep the formula left on screen,
  // under its name, the panel still open on it; it now shows its load error
  // and its retry — the panel closed, no « Changes not saved » for a layout
  // that was saved — and the retry brings the new formula.
  it('a switch whose layout cannot be read back closes the panel on the load error and its retry, which brings the new formula', async () => {
    vi.mocked(changeFormula).mockResolvedValue(undefined);
    await openPanel();
    vi.mocked(fetchDashboardPreferences).mockRejectedValueOnce(new Error('network'));

    fireEvent.click(screen.getByRole('radio', { name: /Expert/ }));

    expect(await screen.findByText('Couldn’t load your dashboard.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Customize' })).toBeNull());
    expect(renderedKeys()).toEqual([]);
    expect(screen.queryByText('Changes not saved')).toBeNull();

    servePreferences('expert');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(renderedKeys()).toHaveLength(9));
    expect(await screen.findByText('Expert view')).toBeInTheDocument();
  });

  // SMA-448, PR #293, fix round 2 — A1 (Alexandre's visual finding, 26/09):
  // a formula the server refused showed « Changes not saved » in the header —
  // false, nothing was unsaved — and nothing else. The panel now says the
  // refusal and each reason the server served, where the user just acted;
  // the indicator says nothing false; the formula and the layout stay.
  const refuseNovice = () =>
    vi.mocked(changeFormula).mockRejectedValue(
      new HttpStatusError('Request failed (409)', 409, {
        status: 409,
        code: 'formula.tooSmall',
        formula: 'novice',
        reasons: [
          { kind: 'gardens', have: 5, limit: 3 },
          { kind: 'size', gardenId: 'g1', width: 30, height: 30, maxWidth: 20, maxHeight: 20 },
        ],
      })
    );

  it('a formula the server refuses is said in the panel, with each reason served — never « Changes not saved » — and the formula stays', async () => {
    refuseNovice();
    await openPanel();
    const panel = screen.getByRole('dialog', { name: 'Customize' });

    fireEvent.click(screen.getByRole('radio', { name: /Novice/ }));

    const said = await within(panel).findByText(
      'Can’t switch to Novice: 5 gardens for 3 at most and a garden of 30 × 30 cells for 20 × 20 at most'
    );
    expect(said).toHaveAttribute('role', 'status');
    expect(said).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText('Changes not saved')).toBeNull();
    expect(screen.queryByText('Couldn’t load your dashboard.')).toBeNull();
    expect(screen.getByRole('radio', { name: /Gardener/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Novice/ })).toBeEnabled();
    expect(renderedKeys()).toHaveLength(6);
  });

  it('the panel’s refusal region is born empty and stays mounted, so what it then says is announced', async () => {
    await openPanel();
    const panel = screen.getByRole('dialog', { name: 'Customize' });

    const region = within(panel).getByRole('status');
    expect(region).toHaveTextContent('');
    expect(region).not.toHaveAttribute('aria-live', 'assertive');
  });

  it('dit le refus en français, avec chaque raison servie', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    refuseNovice();
    renderPage();
    const customize = await screen.findByRole('button', { name: 'Personnaliser' });
    await waitFor(() => expect(customize).toBeEnabled());
    fireEvent.click(customize);
    const panel = await screen.findByRole('dialog', { name: 'Personnaliser' });

    fireEvent.click(screen.getByRole('radio', { name: /Novice/ }));

    expect(
      await within(panel).findByText(
        'Impossible de passer en Novice : 5 jardins pour 3 au plus et un jardin de 30 × 30 cases pour 20 × 20 au plus'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Modifications non enregistrées')).toBeNull();
  });

  // SMA-448, PR #293, fix round 2 — R2-E1 (the Extension, on the correction
  // of S6): the panel was hidden by its condition while `panelOpen` stayed
  // true, so it came back by itself once « Try again » had succeeded, and its
  // closing never ran the effect that gives the focus back. The handler that
  // sees the failure now closes the panel; the focus goes to « Try again »,
  // the one action the page offers while its layout is unavailable.
  it('after a switch whose layout cannot be read back, the focus goes to « Try again », and the panel does not come back by itself once the retry succeeds', async () => {
    vi.mocked(changeFormula).mockResolvedValue(undefined);
    await openPanel();
    vi.mocked(fetchDashboardPreferences).mockRejectedValueOnce(new Error('network'));

    fireEvent.click(screen.getByRole('radio', { name: /Expert/ }));

    // The error first, then the drawer gone: while it closes, the page behind
    // it is still hidden from the accessibility tree, and its buttons with it.
    expect(await screen.findByText('Couldn’t load your dashboard.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Customize' })).toBeNull());
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(document.activeElement).toBe(retry));

    servePreferences('expert');
    fireEvent.click(retry);

    await waitFor(() => expect(renderedKeys()).toHaveLength(9));
    expect(screen.queryByRole('dialog', { name: 'Customize' })).toBeNull();
    expect(await screen.findByText('Expert view')).toBeInTheDocument();
  });

  it('says so when nothing is hidden', async () => {
    servePreferences('expert');

    await openPanel();

    expect(screen.getByText('No hidden widget.')).toBeInTheDocument();
  });

  it('draws a MINIATURE of what a hidden widget holds (round 4, A8)', async () => {
    // `A7Personnaliser.dc.html` fills its `.gal-th` with the widget's own
    // headline — « 42,5 m² » over two occupancy bars for Statistics — so the
    // card shows what is being put back rather than the widget's name twice.
    // The row carried a bare 20 px icon beside that name and nothing else.
    //
    // The fixture is one 4 × 3 garden at 50 cm: 12 active cells make 3 m², and
    // the plan is empty, so the occupancy bar sits at 0.
    serveExpertWithStatisticsAndHarvestHidden();
    await openPanel();
    const gallery = screen.getByRole('dialog', { name: 'Customize' });

    expect(within(gallery).getByText('3.0 m²')).toBeInTheDocument();

    // A FILLED disc, not a bare glyph: `.plus { width: 36px; height: 36px;
    // border-radius: 50%; background: var(--prim) }`.
    const add = within(gallery).getByRole('button', { name: 'Add Statistics' });
    const rules = rulesFor(add).replace(/\s+/g, '');
    expect(rules).toContain('width:36px');
    expect(rules).toContain('height:36px');
  });

  it('writes the Statistics thumbnail in hectares beyond 10 000 m², as the widget does (SMA-437, arbitrage 5)', async () => {
    // 101 × 100 cells of 1 m: 10 100 m² — beyond 10 000, so « 1.01 ha ».
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith([garden('g1', 'Domaine', { width: 101, height: 100, cellSize: '1m' })])
    );
    serveExpertWithStatisticsAndHarvestHidden();

    await openPanel();
    const gallery = screen.getByRole('dialog', { name: 'Customize' });

    const value = await within(gallery).findByText('1.01 ha');
    expect(value.textContent).toBe('1.01\u00a0ha');
  });

  it('counts the Counters thumbnail through the widget’s own filter (C4)', async () => {
    // ROUND 5 (C4). The branch read `totals.varietyCount` unconditionally, so a
    // user who had narrowed the widget to one garden and then hidden it was
    // offered a thumbnail counting every garden: the card in the gallery said
    // something the widget it stands for does not say.
    const blocks = presetFor('gardener');
    const counters = blocks.find((block) => block.key === 'counters')!;
    counters.hidden = true;
    counters.options = { garden: 'g2' };
    servePreferences('gardener', blocks);

    const variety = (
      plantId: string,
      commonName: string,
      gardenIds: string[]
    ): DashboardVarietyData => ({
      plantId,
      scientificName: 'Ocimum basilicum',
      commonName,
      plantType: 'Herb',
      isEdible: true,
      imageUrl: null,
      imageAttribution: null,
      wateringNeedLevel: null,
      minToleratedTempC: null,
      pruningMonths: null,
      sowingPeriod: null,
      harvestPeriod: null,
      sunlightHoursMin: null,
      sunlightHoursMax: null,
      floweringSeason: null,
      harvestSeason: null,
      count: 1,
      cells: 1,
      gardenIds,
    });

    vi.mocked(fetchDashboardData).mockResolvedValue({
      gardens: [garden('g1', 'Terrasse'), garden('g2', 'Balcon')],
      varieties: [
        variety('p-1', 'Basil', ['g1']),
        variety('p-2', 'Thyme', ['g2']),
        variety('p-3', 'Sage', ['g1']),
      ],
      totals: {
        gardenCount: 2,
        placementCount: 3,
        varietyCount: 3,
        catalogPlantCount: 536,
      },
    });

    await openPanel();
    const gallery = within(screen.getByRole('dialog', { name: 'Customize' }));

    expect(gallery.getByText('Counts by variety')).toBeInTheDocument();
    // ONE variety in « Balcon », not the three the aggregate holds.
    expect(gallery.getByText('1')).toBeInTheDocument();
    expect(gallery.queryByText('3')).toBeNull();
  });

  it('counts the Tips thumbnail through the widget’s own derivation (C4, PR 4b/5)', async () => {
    // Same rule again: the figure comes from `gardenAdvice`, the function the
    // widget's chip reads, on the page's own `gardenViews`. A shade lover in
    // full sun on an oriented garden is ONE tip; a sun lover beside it in full
    // sun is none — the thumbnail prints 1, never « 2 plants ».
    const blocks = presetFor('gardener');
    blocks.find((block) => block.key === 'tips')!.hidden = true;
    servePreferences('gardener', blocks);

    const sunny = (plantId: string, commonName: string, min: number, max: number) =>
      varietyFixture({ plantId, scientificName: plantId, commonName, sunlightHoursMin: min, sunlightHoursMax: max });
    vi.mocked(fetchDashboardData).mockResolvedValue({
      gardens: [
        garden('g1', 'Terrasse', {
          config: { orientation: 'S', gardenType: null, lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
          placements: [
            placement({ id: 'h', plantId: 'hydrangea', startRow: 0, startCol: 0 }),
            placement({ id: 't', plantId: 'tomato', startRow: 0, startCol: 1 }),
          ],
          placementCount: 2,
          varietyCount: 2,
        }),
      ],
      varieties: [sunny('hydrangea', 'Hydrangea', 4, 6), sunny('tomato', 'Tomato', 8, 12)],
      totals: { gardenCount: 1, placementCount: 2, varietyCount: 2, catalogPlantCount: 536 },
    });

    await openPanel();
    const gallery = within(screen.getByRole('dialog', { name: 'Customize' }));

    expect(gallery.getByText('Tips')).toBeInTheDocument();
    expect(gallery.getByText('1 tip')).toBeInTheDocument();
    expect(gallery.queryByText('2 tips')).toBeNull();
  });

  it('counts the This-month thumbnail through the widget’s own derivation (C4, PR 4a/5)', async () => {
    // The same rule as the Counters card above: the figure comes from
    // `monthCalendar`, the function the widget itself counts with, so a hidden
    // « Ce mois-ci » cannot be offered a number it would not print.
    const blocks = presetFor('gardener');
    blocks.find((block) => block.key === 'month')!.hidden = true;
    servePreferences('gardener', blocks);

    // Two varieties pruned THIS month — the frozen instant's, which the widget
    // reads too (SMA-434) — and one pruned six months away: the figure must
    // be 2, never 3.
    freezeDate();
    const MONTHS = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const now = new Date(FROZEN_NOW).getMonth();
    const pruned = (plantId: string, commonName: string, monthIndex: number): DashboardVarietyData => ({
      plantId,
      scientificName: plantId,
      commonName,
      plantType: 'Herb',
      isEdible: true,
      imageUrl: null,
      imageAttribution: null,
      wateringNeedLevel: null,
      minToleratedTempC: null,
      pruningMonths: MONTHS[monthIndex % 12]!,
      sowingPeriod: null,
      harvestPeriod: null,
      sunlightHoursMin: null,
      sunlightHoursMax: null,
      floweringSeason: null,
      harvestSeason: null,
      count: 1,
      cells: 1,
      gardenIds: ['g1'],
    });

    vi.mocked(fetchDashboardData).mockResolvedValue({
      gardens: [garden('g1', 'Terrasse')],
      varieties: [
        pruned('thyme', 'Thyme', now),
        pruned('rosemary', 'Rosemary', now),
        pruned('zinnia', 'Zinnia', now + 6),
      ],
      totals: { gardenCount: 1, placementCount: 3, varietyCount: 3, catalogPlantCount: 536 },
    });

    await openPanel();
    const gallery = within(screen.getByRole('dialog', { name: 'Customize' }));

    expect(gallery.getByText('This month')).toBeInTheDocument();
    // The two due THIS month — not the three varieties the aggregate holds,
    // which is the figure a thumbnail deriving its own count would have shown.
    expect(gallery.getByText('2 to prune')).toBeInTheDocument();
    expect(gallery.queryByText('3 to prune')).toBeNull();
  });

  it('falls back to every garden when the filtered one is gone (C4)', async () => {
    // The same fallback the widget and its options panel make, in the same
    // order: a filter naming a deleted garden resolves to « all » rather than
    // counting nothing (round 1, E8). Three readers of one contract now, still
    // one owner.
    const blocks = presetFor('gardener');
    const counters = blocks.find((block) => block.key === 'counters')!;
    counters.hidden = true;
    counters.options = { garden: 'gone' };
    servePreferences('gardener', blocks);

    vi.mocked(fetchDashboardData).mockResolvedValue({
      gardens: [garden('g1', 'Terrasse')],
      varieties: [
        {
          plantId: 'p-1',
          scientificName: 'Ocimum basilicum',
          commonName: 'Basil',
          plantType: 'Herb',
          isEdible: true,
          imageUrl: null,
          imageAttribution: null,
          wateringNeedLevel: null,
          minToleratedTempC: null,
          pruningMonths: null,
          sowingPeriod: null,
          harvestPeriod: null,
          sunlightHoursMin: null,
          sunlightHoursMax: null,
          floweringSeason: null,
          harvestSeason: null,
          count: 1,
          cells: 1,
          gardenIds: ['g1'],
        },
      ],
      totals: {
        gardenCount: 1,
        placementCount: 1,
        varietyCount: 1,
        catalogPlantCount: 536,
      },
    });

    await openPanel();
    const gallery = within(screen.getByRole('dialog', { name: 'Customize' }));

    expect(gallery.getByText('1')).toBeInTheDocument();
  });

  it('exposes the thumbnail’s figure to assistive technology, and hides only the ornament (round 6, #4-5 / #5-4)', async () => {
    // « 3.0 m² » or « Soon » is the one fact of the row that decides whether
    // adding the widget is worth doing now — it existed nowhere a screen reader
    // could reach, because the whole thumbnail was `aria-hidden`. The glyph and
    // the bars are decorative and stay hidden; the sentence is content.
    serveExpertWithStatisticsAndHarvestHidden();
    await openPanel();
    const gallery = screen.getByRole('dialog', { name: 'Customize' });

    const value = within(gallery).getByText('3.0 m²');
    expect(value.closest('[aria-hidden="true"]')).toBeNull();
    const soon = within(gallery).getByText('Soon');
    expect(soon.closest('[aria-hidden="true"]')).toBeNull();

    const thumbnail = value.parentElement!;
    const glyph = thumbnail.querySelector('svg')!.parentElement!;
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    // Statistics draws two occupancy bars on a two-garden aggregate; here the
    // fixture holds one garden, so one bar.
    const bars = [...thumbnail.children].filter(
      (child) => child !== glyph && child !== value
    );
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(bar).toHaveAttribute('aria-hidden', 'true');
  });

  it('says « soon » where a widget has no figure yet, never a zero', async () => {
    // Rule 4 of the design contract: a missing datum is an invitation, never a
    // page blanche and never a misleading zero. Five of the eight widgets are
    // fed by no endpoint before PR 3/5 and PR 4/5, and Harvest is one of them.
    await openPanel();
    const gallery = screen.getByRole('dialog', { name: 'Customize' });

    expect(within(gallery).getByText('Harvest')).toBeInTheDocument();
    expect(within(gallery).getByText('Soon')).toBeInTheDocument();
    expect(within(gallery).queryByText('0 m²')).toBeNull();
  });

  it('mentions no price, no quota and no plan anywhere on the page', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    servePreferences('expert');

    renderPage();
    // The French twin of `openPanel`: same button, same `disabled` while the
    // preferences are in flight, same wait for ENABLED before the click.
    const personnaliser = await screen.findByRole('button', { name: 'Personnaliser' });
    await waitFor(() => expect(personnaliser).toBeEnabled());
    fireEvent.click(personnaliser);
    await screen.findByRole('heading', { name: 'Personnaliser' });

    expect(document.body.textContent).not.toMatch(
      /tarif|abonnement|limite|premium|€/i
    );
  });
});

// ── Round 3, phase D: the breakpoints, locked. The column count is a product
// decision (09/09), and it is what the drag model reads to know where a widget
// lands — so it is asserted on the DEFINITION the browser resolves, not on a
// rendered width.
describe('GardensDashboard — responsive breakpoints (SMA-336 round 3)', () => {
  /**
   * The `grid-template-columns` declared inside a given media query. Sliced,
   * not matched with a built regular expression: a dynamic pattern needs its
   * parentheses escaped, and an unescaped one turns the media query into a
   * capture group that silently matches nothing.
   */
  function columnsAt(css: string, minWidth: string): string {
    const marker = `@media (min-width:${minWidth})`;
    const at = css.indexOf(marker);
    if (at < 0) throw new Error(`No ${marker} block in: ${css}`);
    const block = css.slice(at, css.indexOf('}}', at));
    const declared = /grid-template-columns:([^;}]+)/.exec(block);
    if (!declared) throw new Error(`No grid-template-columns in ${marker}: ${block}`);
    return declared[1]!.trim();
  }

  async function gridCss() {
    servePreferences('gardener');
    renderPage();
    // By ROLE, not by text: the Gardens table now labels a WEATHER column, so
    // the bare word matches both a widget title and a column header. On the
    // Gardens heading since PR 3b/5 — the Weather card has no h2 (Q1).
    await screen.findByRole('heading', { level: 2, name: 'Gardens' });
    return rulesFor(gridNode());
  }

  it('one column on a phone, and rows of 200px at least that grow with their card', async () => {
    // SMA-336 mobile lot (D1). Measured on `5282852` in Chrome at 360 px: the
    // fixed 200 px row gave a Medium To-do card 120 px of body for 220 px of
    // tasks (V34), the Tips card 120 for 192 (V37). In one column a fixed
    // track protects no tiling — every card is alone on its row — so the
    // phone row is `minmax(200px, auto)`: the frozen minimum, then the
    // content's own height.
    const css = await gridCss();

    expect(columnsAt(css, '0px')).toBe('1fr');
    expect(declaredAt(css, '0px', 'grid-auto-rows')).toBe('minmax(200px, auto)');
    // Never a bare 200px on the phone any more, at any breakpoint.
    expect(css).not.toContain('grid-auto-rows:200px');
  });

  it('two columns on a tablet, and auto rows from 600px — the 273px are pinned on the cards (SMA-437, A-N10)', async () => {
    // A-N10: a Full-width row takes the height of its content, with no floor,
    // while the three other sizes keep 273 / 566 px — so the TRACK is `auto`
    // and the height is declared on each card (the test below). The pre-flight
    // measured it: 0 gap on seven layouts at four widths.
    const css = await gridCss();

    expect(columnsAt(css, '600px')).toBe('repeat(2, 1fr)');
    expect(declaredAt(css, '600px', 'grid-auto-rows')).toBe('auto');
    // No floor from 600px up: neither the 273px track nor a `minmax` (A-N10).
    expect(declaredAt(css, '600px', 'grid-auto-rows')).not.toContain('minmax');
    expect(css).not.toContain('grid-auto-rows:273px');
  });

  it('four columns from 1200px', async () => {
    const css = await gridCss();

    expect(columnsAt(css, '1200px')).toBe('repeat(4, 1fr)');
  });

  it('four columns means TWO Medium widgets per row, two columns means one', async () => {
    // The consequence the four columns exist for, stated on the model the drag
    // preview packs with — the same `spanFor` the widget CSS is built from.
    const two = [
      { key: 'a', ...spanFor('medium', 4) },
      { key: 'b', ...spanFor('medium', 4) },
    ];
    const desktop = packGrid(two, 4);
    expect(desktop.get('a')!.row).toBe(desktop.get('b')!.row);

    const tablet = packGrid(
      [
        { key: 'a', ...spanFor('medium', 2) },
        { key: 'b', ...spanFor('medium', 2) },
      ],
      2
    );
    expect(tablet.get('a')!.row).toBe(0);
    expect(tablet.get('b')!.row).toBe(1);
  });

  it('a Medium and a Large are one column wide on a phone', async () => {
    expect(spanFor('medium', 1)).toEqual({ cols: 1, rows: 1 });
    expect(spanFor('large', 1)).toEqual({ cols: 1, rows: 2 });
  });

  /**
   * The value a property takes inside one media-query block. Sliced rather
   * than matched with a built pattern, for the same reason `columnsAt` slices.
   */
  function declaredAt(css: string, minWidth: string, property: string): string {
    const marker = `@media (min-width:${minWidth})`;
    const at = css.indexOf(marker);
    if (at < 0) throw new Error(`No ${marker} block in: ${css}`);
    const block = css.slice(at, css.indexOf('}}', at));
    const start = block.indexOf(`${property}:`);
    if (start < 0) throw new Error(`No ${property} in ${marker}: ${block}`);
    return block
      .slice(start + property.length + 1)
      .split(/[;}]/)[0]!
      .trim();
  }


  it('every widget declares the span spanFor gives it at each breakpoint', async () => {
    // Round 4 (E'''1). `DashboardGrid` packs with 1, then 2, then 4 columns;
    // the widget CSS must name the SAME footprint at each of those, or the
    // drag preview is computed on a grid the browser is not drawing. Asserted
    // against `spanFor` itself — the one table both sides read — and not
    // against literals, so a change to the table moves both together or fails.
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'small';
    blocks[1]!.size = 'medium';
    blocks[2]!.size = 'large';
    servePreferences('gardener', blocks);
    renderPage();
    // By ROLE (round 3, E″7). The Gardens table's MÉTÉO column header carries
    // the same word as the Weather widget's title, so a page-wide
    // `findByText('Weather')` answers on whichever the layout happens to
    // render — here Gardens is Medium and there is no table, which is the only
    // reason it resolved. One fixture change away from failing on « found
    // multiple elements ». Waited on the Gardens heading since PR 3b/5: the
    // Weather card has no h2 (Q1).
    await screen.findByRole('heading', { level: 2, name: 'Gardens' });

    for (const block of blocks.slice(0, 3)) {
      const css = rulesFor(slotOf(block.key));

      expect(declaredAt(css, '0px', 'grid-column')).toBe(
        `span ${spanFor(block.size, 1).cols}`
      );
      expect(declaredAt(css, '600px', 'grid-column')).toBe(
        `span ${spanFor(block.size, 2).cols}`
      );
      expect(declaredAt(css, '1200px', 'grid-column')).toBe(
        `span ${spanFor(block.size, 4).cols}`
      );
      // `grid-row` is not responsive: `spanFor` never changes the row span, so
      // the one declaration outside any media query has to match all three.
      expect(css).toContain(`grid-row:span ${spanFor(block.size, 4).rows}`);
    }
  });

  it('pins Small and Medium at 273px and Large at 566px from 600px up, and nothing on a phone (SMA-437, A-N10)', async () => {
    // Written by hand, not derived: one row is 273px, a Large two rows and
    // the 20px gutter between them. The track is `auto` from 600px up, so
    // these heights are what keeps the tiling — and what clips a widget
    // taller than its card instead of letting it stretch its row.
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'small';
    blocks[1]!.size = 'medium';
    blocks[2]!.size = 'large';
    servePreferences('gardener', blocks);
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Gardens' });

    const pinned = { small: '273px', medium: '273px', large: '566px' } as const;
    for (const block of blocks.slice(0, 3)) {
      const slot = slotOf(block.key);
      expect(declaredAtBreakpoint(slot, '600px', 'height'), block.key).toBe(
        pinned[block.size as keyof typeof pinned]
      );
      // The phone keeps `minmax(200px, auto)` and cards sized by their content.
      expect(declaredAtBreakpoint(slot, '0px', 'height'), block.key).toBeNull();
    }
  });
});

// ── V7: a widget's content stays in its card, at every size. Asserted on the
// DECLARATIONS the browser resolves — jsdom lays nothing out, so a measured
// height would be zero here and would prove nothing either way.
describe('GardensDashboard — no widget draws outside its card (V7)', () => {

  async function renderExpert() {
    servePreferences('expert');
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Statistics' });
  }

  it('every grid item declares min-height:0, so a fixed row can clip it', async () => {
    // The defect: a grid item's automatic minimum size in the block axis is its
    // content's min-content height, and this grid's rows are FIXED tracks. An
    // item taller than its track therefore grew past it instead of being
    // clipped by it — the Statistics card's last line was drawn under its own
    // border and over the header of the widget below.
    await renderExpert();

    for (const widget of ['gardens', 'counters', 'stats']) {
      const rules = rulesFor(slotOf(widget));
      expect(rules).toContain('min-height:0');
    }
  });

  it('every widget card hides what does not fit, rather than letting it out', async () => {
    await renderExpert();

    for (const widget of ['gardens', 'counters', 'stats']) {
      const card = document.querySelector(`[data-widget="${widget}"]`)!;
      expect(rulesFor(card)).toContain('overflow:hidden');
    }
  });

  it('the fed widgets bound their body instead of growing it', async () => {
    // The other half of the same rule: inside the card, a list that outgrows
    // the space scrolls in place. `min-height:0` on the flex child is what lets
    // `overflow` apply at all — without it the child refuses to shrink and the
    // scrollbar never appears.
    await renderExpert();

    for (const widget of ['gardens', 'counters', 'stats']) {
      const card = document.querySelector(`[data-widget="${widget}"]`)!;
      const bodies = [...card.querySelectorAll('*')]
        .map((node) => getComputedStyle(node))
        .filter((style) => style.flex === '1' || style.flexGrow === '1');

      expect(bodies.length).toBeGreaterThan(0);
      expect(bodies.some((style) => style.minHeight === '0px')).toBe(true);
    }
  });
});

// ── Round 3 (E″7): two labels of this page are not unique ────────────────────
// The Gardens table's column headers reuse the widget titles, so on a layout
// that shows both, a page-wide text query has two answers. The collision is
// stated here rather than left for the next test to discover: it is a property
// of the frozen design (« MÉTÉO » and « RÉCOLTE » are column labels AND widget
// names), not a defect — what has to change is how tests select.
//
// The sweep this finding asked for: three call sites carried one of the two
// words. Two were page-wide and are role-based now (« the Harvest widget is off
// the grid », line 189, and the span assertion's wait, line 822); the third is
// scoped to the Customize drawer, which the table is not part of, so it stays
// as it is.
describe('GardensDashboard — Weather and Harvest name two things each (E″7)', () => {
  it('at Expert, the widget and the table column carry the same words', async () => {
    servePreferences('expert');

    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Harvest' });

    const gardensWidget = () =>
      document.querySelector('[data-widget="gardens"]') as HTMLElement;

    // Harvest: one heading, one column header — a text query would have to
    // choose. The role narrows it to the widget, which is what those tests
    // mean, and the second occurrence really is the table's column header.
    expect(screen.getAllByText('Harvest')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: 'Harvest' })).toBeInTheDocument();
    const harvestHeader = within(gardensWidget()).getByText('Harvest');
    expect(harvestHeader.tagName).toBe('TH');
    expect(harvestHeader).toHaveAttribute('scope', 'col');

    // Weather, since PR 3b/5 (Q1): the widget is a REGION named « Weather »
    // (or by its place once located), with no h2 — so the word appears as
    // text once, on the column header, and the widget is reached by its role.
    expect(screen.getByRole('region', { name: 'Weather' })).toHaveAttribute(
      'data-widget',
      'weather'
    );
    const weatherHeader = within(gardensWidget()).getByText('Weather');
    expect(weatherHeader.tagName).toBe('TH');
    expect(weatherHeader).toHaveAttribute('scope', 'col');
  });
});

// ROUND 6 (N6-4) — the outlined chips carry the artboards' own border token.
describe('GardensDashboard — outlined chips draw `--chip-bd` (round 6, N6-4)', () => {
  it.each([
    ['light', '#b4c1b4'],
    ['dark', '#2c3f63'],
  ])('borders the level chip with the %s token', async (mode, border) => {
    // `.lvl { border: 1px solid var(--chip-bd) }` — `#B4C1B4` by day,
    // `#2C3F63` by night, where MUI's outlined chip draws `grey[400]` and
    // `grey[700]`. Under the product theme, so the token is the one that
    // resolves.
    render(
      <ThemeProvider theme={createAppTheme(mode as 'light' | 'dark')}>
        <LanguageProvider><UnitSystemProvider>
          <MemoryRouter>
            <GardensDashboard />
          </MemoryRouter>
        </UnitSystemProvider></LanguageProvider>
      </ThemeProvider>
    );

    const chip = (await screen.findByText('Gardener view')).closest('.MuiChip-root')!;
    expect(rulesFor(chip).toLowerCase().replace(/\s+/g, '')).toContain(`border-color:${border}`);
  });
});

// PR 4b/5 round 1 (S-2) — the same two statuses for the Tips block: the
// gardens' failure empties it, the weather's is said in one line with a retry.
describe('GardensDashboard — a weather outage is said in « Conseils », with its retry (round 1, S-2)', () => {
  it('keeps the exposure tips, says the watering tips are out, and « Try again » refetches the weather', async () => {
    // A shade lover in full sun on an oriented garden: ONE exposure tip, from
    // the plans alone (the C4 thumbnail test's scene).
    const hydrangea = varietyFixture({ plantId: 'hydrangea', scientificName: 'hydrangea', commonName: 'Hydrangea', sunlightHoursMin: 4, sunlightHoursMax: 6 });
    vi.mocked(fetchDashboardData).mockResolvedValue({
      gardens: [
        garden('g1', 'Terrasse', {
          config: { orientation: 'S', gardenType: null, lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
          placements: [placement({ id: 'h', plantId: 'hydrangea', startRow: 0, startCol: 0 })],
          placementCount: 1,
          varietyCount: 1,
        }),
      ],
      varieties: [hydrangea],
      totals: { gardenCount: 1, placementCount: 1, varietyCount: 1, catalogPlantCount: 536 },
    });
    // The provider is down. The plans are not.
    vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('provider down'));

    renderPage();

    const tips = (await screen.findByRole('heading', { level: 2, name: 'Tips' })).closest('[data-widget="tips"]') as HTMLElement;
    await waitFor(() =>
      expect(tips.querySelector('[data-tips-weather-note]')).toHaveTextContent(
        'Weather unavailable — the watering tips can’t be checked for now.'
      )
    );
    // The family that never needed a forecast is still there…
    expect(tips.querySelector('[data-tips-tip="shadeLover"]')).toHaveTextContent('Your Hydrangea (A1, Terrasse) prefers part shade');
    // …and the fatal branch, which the gardens' failure alone selects, is not.
    expect(tips).not.toHaveTextContent('Couldn’t load the tips.');
    // Round 2, S-4: the note's sentence reached the card's ONE live region —
    // and no region above the card would say it a second time.
    const regions = tips.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
    expect(regions).toHaveLength(1);
    expect(regions[0]!.textContent).toBe('Weather unavailable — the watering tips can’t be checked for now.');
    expect(tips.parentElement!.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();

    // The retry reaches the weather half of the page's `onRetry`.
    expect(fetchDashboardWeather).toHaveBeenCalledTimes(1);
    fireEvent.click(within(tips.querySelector('[data-tips-weather-note]') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchDashboardWeather).toHaveBeenCalledTimes(2));
  });
});

// ROUND 1 (C2) — the page hands the To-do block TWO statuses, not their union.
describe('GardensDashboard — a weather outage no longer empties « À faire » (round 1, C2)', () => {
  it('keeps the calendar tasks and says the watering half is out', async () => {
    // A hedge pruned THIS month — the frozen instant's, which « À faire »
    // reads too (SMA-434): the row must exist whatever day the suite runs.
    freezeDate();
    const MONTHS = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const hedge: DashboardVarietyData = {
      ...varietyFixture({ plantId: 'hedge', commonName: 'Hedge', gardenIds: ['g1'] }),
      pruningMonths: MONTHS[new Date(FROZEN_NOW).getMonth()]!,
    };
    vi.mocked(fetchDashboardData).mockResolvedValue(
      dashboardWith(
        [
          garden('g1', 'Terrasse', {
            placements: [placement({ id: 'h-0', plantId: 'hedge' })],
            placementCount: 1,
            varietyCount: 1,
          }),
        ],
        { varieties: [hedge] }
      )
    );
    // The provider is down. The plans are not.
    vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('provider down'));

    renderPage();

    const todo = (await screen.findByRole('heading', { level: 2, name: 'To do today' })).closest(
      '[data-widget="todo"]'
    ) as HTMLElement;
    await waitFor(() =>
      expect(todo.querySelector('[data-todo-weather-note]')).toHaveTextContent(
        'Weather unavailable — watering is not planned for now.'
      )
    );
    // The half that never needed a forecast is still there…
    expect(todo.querySelector('[data-todo-task="prune"]')).toHaveTextContent(/^Prune — Hedge \(\w+\)$/);
    // …and the fatal branch, which the union used to select, is not.
    expect(todo).not.toHaveTextContent('Couldn’t load today’s tasks.');
  });
});
