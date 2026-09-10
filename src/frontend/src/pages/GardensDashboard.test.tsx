import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { presetFor } from '../constants/dashboardPresets';
import { packGrid, spanFor } from '../utils/dashboardLayoutGrid';
import {
  DASHBOARD_BLOCK_KEYS,
  type DashboardBlock,
  type DashboardLevel,
} from '../types/Dashboard';
import type {
  DashboardData,
  DashboardGardenData,
} from '../types/DashboardData';

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
): DashboardGardenData => ({
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
  ...over,
});

const dashboardWith = (gardens: DashboardGardenData[]): DashboardData => ({
  gardens,
  varieties: [],
  totals: {
    gardenCount: gardens.length,
    placementCount: 0,
    varietyCount: 0,
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

/**
 * The Emotion class of a node, matched by the `css-` prefix rather than taken
 * as "the last class" (round 3, E″2): MUI puts a `MuiBox-root` before it and
 * may put a component class after it, so position is not a contract. Throws
 * rather than returning nothing, so a structural change is reported as a
 * missing node and not as a missing CSS rule.
 */
function emotionClass(node: Element): string {
  const found = [...node.classList].find((name) => name.startsWith('css-'));
  if (!found) {
    throw new Error(
      `No Emotion class on <${node.tagName.toLowerCase()} class="${node.className}">`
    );
  }
  return found;
}

/** The stylesheet rules Emotion emitted for a node. */
const rulesFor = (node: Element) =>
  [...document.querySelectorAll('style')]
    .map((tag) => tag.textContent ?? '')
    .filter((text) => text.includes(emotionClass(node)));

/**
 * The grid container: the widget cards sit inside a SortableWidget slot, which
 * sits inside the grid. Guarded at every step (round 3, E″2) so a change of
 * structure fails as "the grid was not found" instead of silently handing back
 * an unrelated node whose rules happen to be empty.
 */
function gridNode(): HTMLElement {
  const card = document.querySelector('[data-widget]');
  if (!card) throw new Error('No widget rendered: the grid cannot be located');
  const slot = card.parentElement?.parentElement;
  const grid = slot?.parentElement;
  if (!grid) throw new Error('The grid container is not where it was expected');
  const rules = [...document.querySelectorAll('style')]
    .map((tag) => tag.textContent ?? '')
    .filter((text) => text.includes(emotionClass(grid)));
  if (!rules.some((text) => text.includes('display:grid'))) {
    throw new Error('The node reached is not the display:grid container');
  }
  return grid as HTMLElement;
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
    expect(screen.queryByText('Statistics')).toBeNull();
    expect(screen.queryByText('Harvest')).toBeNull();
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

    // Novice puts Gardens in Medium: one-line rows and the create link, not
    // the Large card list with its per-card Edit / Delete controls.
    await screen.findByRole('link', { name: 'Open Casa Lolo' });
    expect(screen.queryByRole('button', { name: 'Delete Casa Lolo' })).toBeNull();
  });

  it('renders the Gardens widget at Large as the full card list', async () => {
    servePreferences('gardener');

    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Delete Casa Lolo' })
    ).toBeInTheDocument();
  });
});

describe('GardensDashboard — header (SMA-336)', () => {
  it('shows the page title, the garden count and the level chip', async () => {
    renderPage();

    const heading = await screen.findByRole('heading', { name: 'My Gardens' });
    // Scoped to the header: the Gardens widget's own chip carries the same
    // count, and both saying "1 garden" is the point, not an ambiguity.
    await waitFor(() =>
      expect(
        within(heading.parentElement!).getByText('1 garden')
      ).toBeInTheDocument()
    );
    expect(await screen.findByText('Gardener view')).toBeInTheDocument();
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
    const gridRules = rulesFor(gridNode());
    expect(gridRules.some((text) => text.includes('grid-template-columns:1fr'))).toBe(true);
    expect(gridRules.some((text) => text.includes('grid-auto-rows:200px'))).toBe(true);

    const panelRules = rulesFor(panel);
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
    expect(
      [...table!.querySelectorAll('thead th')]
        .map((th) => th.textContent)
        .filter(Boolean)
    ).toEqual([
      'Garden',
      'Plants',
      'Occupancy',
      'Exposure',
      'Weather',
      'Modified',
      'Actions',
    ]);
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
    return rulesFor(gridNode()).join(' ');
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

  /** The SortableWidget slot of a key — the node the spans are declared on. */
  function slotNode(key: string): HTMLElement {
    const card = document.querySelector(`[data-widget="${key}"]`);
    if (!card) throw new Error(`No widget "${key}" rendered`);
    const slot = card.parentElement?.parentElement;
    if (!slot) {
      throw new Error(`The slot of "${key}" is not where it was expected`);
    }
    return slot as HTMLElement;
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
    await screen.findByText('Weather');

    for (const block of blocks.slice(0, 3)) {
      const css = rulesFor(slotNode(block.key)).join(' ');

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
