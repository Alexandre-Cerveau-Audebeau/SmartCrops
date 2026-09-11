import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { presetFor } from '../constants/dashboardPresets';
import { gardenFixture } from '../test/fixtures/dashboard';
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
import { emittedRules, gridNode, rulesFor, slotOf } from '../test/dashboardDom';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
}));

import GardensDashboard from './GardensDashboard';
import {
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

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

// The two sums DERIVED from the gardens (round 6, Extension #4-15), as the
// sibling fixture in `GardensDashboard.gardens.test.tsx` already does: a
// builder that pins them at zero can express an aggregate that contradicts its
// own gardens, and every assertion built on it is weaker for it.
const dashboardWith = (gardens: DashboardGardenData[]): DashboardData => ({
  gardens,
  varieties: [],
  totals: {
    gardenCount: gardens.length,
    placementCount: gardens.reduce((sum, g) => sum + g.placementCount, 0),
    varietyCount: gardens.reduce((sum, g) => sum + g.varietyCount, 0),
    catalogPlantCount: 536,
  },
});

/**
 * Round 1 (E14): `blocks` no longer carries a default value, so
 * `blocks === undefined` is a real question — the helper served `isPreset:
 * false` for every case, including the ones the tests name as presets.
 */
function servePreferences(level: DashboardLevel, blocks?: DashboardBlock[]) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    isPreset: blocks === undefined,
    blocks: blocks ?? presetFor(level),
    updatedAt: null,
  });
}


/** The widget keys the grid currently renders, in DOM order. */
const renderedKeys = () =>
  [...document.querySelectorAll('[data-widget]')].map((node) =>
    node.getAttribute('data-widget')
  );

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <GardensDashboard />
      </MemoryRouter>
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardWith([garden('g1', 'Casa Lolo')]));
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  servePreferences('gardener');
});

afterEach(() => vi.clearAllMocks());

describe('GardensDashboard — grid from the stored preferences (SMA-336)', () => {
  it('renders the eight widgets of the Expert preset, in the canonical order', async () => {
    servePreferences('expert');

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(8));
    expect(renderedKeys()).toEqual([...DASHBOARD_BLOCK_KEYS]);
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
    vi.mocked(fetchDashboardData).mockResolvedValue({
      ...dashboardWith([garden('g1', 'Terrasse'), garden('g2', 'Balcon')]),
      totals: {
        gardenCount: 2,
        placementCount: 1,
        varietyCount: 1,
        catalogPlantCount: 536,
      },
    });

    renderPage();

    const heading = await screen.findByRole('heading', { name: 'My Gardens' });
    await waitFor(() =>
      expect(
        within(heading.parentElement!).getByText('2 gardens · 1 plant · 6.0 m²')
      ).toBeInTheDocument()
    );
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

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeEnabled();
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
    ['Weather', 'The weather needs to know where your gardens are.'],
    ['Tips', 'Tips arrive with the exposure and the calendar of your gardens.'],
    [
      'This month',
      'The month’s calendar arrives with the sowings and harvests of your plantings.',
    ],
    ['To do today', 'Today’s tasks arrive with the weather and the calendar.'],
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

    await waitFor(() => expect(renderedKeys()).toHaveLength(8));
    // Five shells: Gardens, Counts by variety and Statistics carry data.
    expect(screen.getAllByText('Coming soon')).toHaveLength(5);
  });

  it('the Weather widget offers NO city field in this lot (decision R4)', async () => {
    servePreferences('expert');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    expect(screen.queryByLabelText(/City or postal code/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull();
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
    expect(
      screen.getByText(
        'Les conseils arrivent avec l’exposition et le calendrier de vos jardins.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('Bientôt disponible')).toHaveLength(5);
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

  it('stays compact on a phone, where the grid row is 200px (round 2, V5)', async () => {
    // V3 held on a desktop and not on a phone, and the breakpoint-conditioned
    // rule behind that is `DashboardGrid`'s `gridAutoRows: {xs: 200px, sm:
    // 273px}`. A 200px card leaves about 128px of body once its 20px padding,
    // its title row and its 12px gap are taken; the stacked panel — 44px disc
    // ABOVE the sentence above « Bientôt disponible » — needed about 164px, so
    // it overflowed and the card's `overflow: hidden` clipped a dashed frame
    // edge to edge. The frozen artboards draw `.inv` as a ROW (disc beside the
    // text): the same words then need about 119px. No media query is involved,
    // which is what makes the rule hold at EVERY width.
    servePreferences('novice');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    const panel = document.querySelector('[data-invite-panel]') as HTMLElement;

    // The phone geometry the panel has to fit inside: one column, 200px rows.
    const gridRules = emittedRules(gridNode());
    expect(gridRules.some((text) => text.includes('grid-template-columns:1fr'))).toBe(true);
    expect(gridRules.some((text) => text.includes('grid-auto-rows:200px'))).toBe(true);

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
    const bodyRows = [...table!.querySelectorAll('tbody tr')];
    expect(bodyRows).not.toHaveLength(0);
    for (const row of bodyRows) {
      expect(row.querySelectorAll('td')).toHaveLength(headerTexts.length);
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
    // Weather is the one widget the artboards do not title: its card opens on
    // the place name, so there is no header glyph to match. It keeps the
    // artboard's own 44 px hero sun.
    expect(glyphOf('weather')).toBe('WbSunnyOutlinedIcon');
  });
});

describe('GardensDashboard — Customize panel (SMA-336)', () => {
  const openPanel = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));
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

  it('choosing a level applies its preset and persists it', async () => {
    await openPanel();

    fireEvent.click(screen.getByRole('radio', { name: /Expert/ }));

    await waitFor(() => expect(renderedKeys()).toHaveLength(8));
    expect(await screen.findByText('Expert view')).toBeInTheDocument();
    await waitFor(() =>
      expect(saveDashboardPreferences).toHaveBeenCalledWith(
        { level: 'expert', blocks: presetFor('expert') },
        false,
        expect.any(AbortSignal)
      )
    );
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

  it('the gallery lists the hidden widgets and « + » puts one back on the page', async () => {
    await openPanel();
    // Round 1 (G9): MUI renders the open temporary Drawer as role="dialog";
    // since round 1 it also carries an accessible name (E5).
    const gallery = screen.getByRole('dialog', { name: 'Customize' });

    expect(within(gallery).getByText('Statistics')).toBeInTheDocument();
    expect(within(gallery).getByText('Harvest')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Statistics' }));

    await waitFor(() => expect(renderedKeys()).toContain('stats'));
    expect(renderedKeys()).not.toContain('harvest');
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
    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }));
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
    // the bare word matches both a widget title and a column header.
    await screen.findByRole('heading', { level: 2, name: 'Weather' });
    return rulesFor(gridNode());
  }

  it('one column on a phone, and 200px rows', async () => {
    const css = await gridCss();

    expect(columnsAt(css, '0px')).toBe('1fr');
    expect(css).toContain('grid-auto-rows:200px');
  });

  it('two columns on a tablet, and 273px rows', async () => {
    const css = await gridCss();

    expect(columnsAt(css, '600px')).toBe('repeat(2, 1fr)');
    expect(css).toContain('grid-auto-rows:273px');
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
    // multiple elements ».
    await screen.findByRole('heading', { level: 2, name: 'Weather' });

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
  it('at Expert, the widget title and the table column carry the same words', async () => {
    servePreferences('expert');

    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Weather' });

    const gardensWidget = () =>
      document.querySelector('[data-widget="gardens"]') as HTMLElement;

    for (const label of ['Weather', 'Harvest']) {
      // One heading, one column header — a text query would have to choose.
      expect(screen.getAllByText(label)).toHaveLength(2);
      // The role narrows it to the widget, which is what those tests mean...
      expect(
        screen.getByRole('heading', { level: 2, name: label })
      ).toBeInTheDocument();
      // ...and the second occurrence really is the table's column header.
      const header = within(gardensWidget()).getByText(label);
      expect(header.tagName).toBe('TH');
      expect(header).toHaveAttribute('scope', 'col');
    }
  });
});
