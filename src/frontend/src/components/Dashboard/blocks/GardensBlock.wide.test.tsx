import { fireEvent, render, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18next from '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../../contexts/UnitSystemContext';
import { gardens as sceneGardens, gardensTwelve } from '../../../test/layout/scenes';
import { locationFixture } from '../../../test/fixtures/weather';
import { gardenViewOf } from '../../../utils/gardenStats';
import { formatPercent, formatSurface } from '../../../utils/formatNumber';
import { formatRelativeDate } from '../../../utils/formatRelativeDate';
import type { DashboardGardenData } from '../../../types/DashboardData';
import GardensBlock, { type GardensWeather } from './GardensBlock';

// SMA-448, lot F5-b — THE FULL WIDTH of the Gardens widget, the Expert's (V3-03
// § 1, V3-04 § 4; contract v3 § 4.7 a; pre-flight F5 § C.4, retained by
// Alexandre on 28/09): the seven-column table — JARDIN, TYPE, PLANTES,
// OCCUPATION, EXPOSITION, MÉTÉO when the Weather widget is on the page (V23),
// the actions — with NO MODIFIÉ column (the modification is in the identity
// sub-line) and NO RÉCOLTE column; the settings of lot F5-a (the cap, « + N
// autres jardins » unfolding in place, the search, the sort in the foot) hold
// in it; on a phone, the rows of the A9 form rather than a table.

const [terrasse, , potager] = sceneGardens as [DashboardGardenData, DashboardGardenData, DashboardGardenData];
const t = i18next.getFixedT('en');

/** The MÉTÉO column's weather: every garden in Lyon. */
const lyon = (list: readonly DashboardGardenData[]): GardensWeather => ({
  status: 'ready',
  byGarden: new Map(list.map((garden) => [garden.id, locationFixture()])),
});

interface RenderOptions {
  gardens?: readonly DashboardGardenData[];
  showWeatherColumn?: boolean;
  showHarvestColumn?: boolean;
  options?: Record<string, unknown> | null;
  /** The Full width unless said — the Large for what the two sizes share. */
  size?: 'large' | 'wide';
}

function renderWide({ gardens = sceneGardens, showWeatherColumn = true, showHarvestColumn = false, options = null, size = 'wide' }: RenderOptions = {}) {
  localStorage.setItem('smartcrops-language', 'en');
  render(
    <ThemeProvider theme={createTheme()}>
      <LanguageProvider>
        <UnitSystemProvider>
          <MemoryRouter>
            <GardensBlock
              size={size}
              gardens={[...gardens]}
              loading={false}
              loadError={false}
              showWeatherColumn={showWeatherColumn}
              showHarvestColumn={showHarvestColumn}
              weather={lyon(gardens)}
              onLocate={() => {}}
              onCreateClick={() => {}}
              onChanged={() => {}}
              onDeleted={() => {}}
              onExpand={() => {}}
              options={options}
              sorts={['lastOpened', 'name', 'created', 'updated', 'custom']}
            />
          </MemoryRouter>
        </UnitSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  return document.querySelector('[data-widget="gardens"]') as HTMLElement;
}

/** The table's column headers, in order — the visually hidden « Actions » included. */
const headers = (card: HTMLElement) => [...card.querySelectorAll('thead th')].map((th) => th.textContent);
/** The garden rows of the table — never the cut rule, which is a row of its own. */
const rows = (card: HTMLElement) => [...card.querySelectorAll('tbody tr:not([data-gardens-cut])')];
const rowNames = (card: HTMLElement) => rows(card).map((row) => row.querySelector('th a')?.textContent ?? '');
/** The identity cell of the row of `name`. */
const identityCell = (card: HTMLElement, name: string) =>
  rows(card).find((row) => row.querySelector('th a')?.textContent === name)!.querySelector('th') as HTMLElement;
/** The `n`-th data cell of the row of `name`. */
const cell = (card: HTMLElement, name: string, index: number) =>
  rows(card).find((row) => row.querySelector('th a')?.textContent === name)!.querySelectorAll('td')[index] as HTMLElement;

/** The page believes it is under 600 px: `useMediaQuery(down('sm'))` answers true. */
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

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('smartcrops.unitSystem');
});

describe('GardensBlock in the Full width — the seven columns (SMA-448, lot F5-b; C.4)', () => {
  it('draws JARDIN, TYPE, PLANTES, OCCUPATION, EXPOSITION, MÉTÉO and the actions — no MODIFIÉ column, no RÉCOLTE column even with the Harvest widget on the page', () => {
    const card = renderWide({ showHarvestColumn: true });

    expect(headers(card)).toEqual(['Garden', 'Type', 'Plants', 'Occupancy', 'Exposure', 'Weather', 'Actions']);
    expect(rowNames(card)).toEqual(['Terrasse', 'Balcon sud', 'Potager du fond']);
    expect(card.querySelector('table')).toHaveAttribute('aria-label', 'Gardens');
  });

  it('the MÉTÉO column follows the Weather widget (V23): absent when it is off the page', () => {
    const card = renderWide({ showWeatherColumn: false });

    expect(headers(card)).toEqual(['Garden', 'Type', 'Plants', 'Occupancy', 'Exposure', 'Actions']);
    expect(card.querySelector('[data-weather-column]')).toBeNull();
  });

  it('the identity cell: the name as the door to the garden, the sub-line « 10 × 8 · 50 cm · 20 m² · modified … », the description on its own truncated line (V33), the thumbnail and « Ornamental » — the type chip has its own column', () => {
    const card = renderWide();
    const identity = identityCell(card, 'Terrasse');
    const view = gardenViewOf(terrasse);
    const surface = formatSurface(view.surfaceM2, 'en');
    const when = formatRelativeDate(new Date(terrasse.updatedAt), new Date(), 'en', 'short');

    expect(within(identity).getByRole('link', { name: 'Open Terrasse' })).toHaveAttribute('href', '/gardens/g1/planner');
    expect(identity.querySelector('[data-garden-sub]')).toHaveTextContent(`10 × 8 · 50 cm · ${surface.value} m² · modified ${when}`);
    expect(identity.querySelector('[data-garden-description]')).toHaveTextContent(terrasse.description!);
    expect(identity.querySelector('[data-testid="template-preview"]')).not.toBeNull();
    // No type chip in the identity cell: TYPE is a column of its own.
    expect(within(identity).queryByText('Terrace')).toBeNull();

    const ornamental = identityCell(card, 'Balcon sud');
    expect(within(ornamental).getByText('Ornamental')).toBeInTheDocument();
    expect(within(identity).queryByText('Ornamental')).toBeNull();
  });

  it('TYPE: the chip with its glyph; « Type? » marked, without a gesture, for a garden whose type is unknown', () => {
    const untyped = { ...potager, config: { ...potager.config, gardenType: null } };
    const card = renderWide({ gardens: [terrasse, untyped] });

    const type = cell(card, 'Terrasse', 0);
    expect(within(type).getByText('Terrace')).toBeInTheDocument();
    expect(type.querySelector('.MuiChip-icon')).not.toBeNull();

    const marked = cell(card, 'Potager du fond', 0);
    expect(within(marked).getByText('Type?')).toBeInTheDocument();
    expect(marked.querySelector('[data-missing-mark]')).not.toBeNull();
    expect(within(marked).queryByRole('button')).toBeNull();
  });

  it('PLANTES: the green pill « 21 plants » and « 8 varieties » in full; OCCUPATION: the bar without its own figure and « N% · N free cells »; EXPOSITION: the dot and the label', () => {
    const card = renderWide();
    const view = gardenViewOf(terrasse);

    const plants = cell(card, 'Terrasse', 1);
    expect(within(plants).getByText('21 plants')).toBeInTheDocument();
    expect(within(plants).getByText('8 varieties')).toBeInTheDocument();

    const occupancy = cell(card, 'Terrasse', 2);
    expect(occupancy.querySelector('[data-occupancy-track]')).not.toBeNull();
    expect(occupancy.querySelector('[data-garden-occupancy]')).toHaveTextContent(
      `${formatPercent(view.occupancyPercent, 'en')} · ${view.freeCells} free cells`
    );
    // The figure is written once, under the bar — the bar does not repeat it.
    expect(within(occupancy).getAllByText(/%/)).toHaveLength(1);

    const exposure = cell(card, 'Terrasse', 3);
    expect(within(exposure).getByText(t(`dashboard.exposure.short.${view.dominantExposure!}`))).toBeInTheDocument();

    const weather = cell(card, 'Terrasse', 4);
    expect(within(weather).getByText('24°')).toBeInTheDocument();
    expect(within(weather).getByText('Lyon')).toBeInTheDocument();
  });
});

describe('GardensBlock in the Full width — the settings of lot F5-a hold in it (A-N4, A-N23, A-N3)', () => {
  it('cuts twelve at eight, « + 4 more gardens » unfolds IN PLACE under a rule « Beyond the 8 shown », « Show 8 gardens » folds back; the foot names the sort', () => {
    const card = renderWide({ gardens: gardensTwelve });

    expect(rows(card)).toHaveLength(8);
    expect(card.querySelector('[data-gardens-cut]')).toBeNull();
    expect(within(card).getByText('Sorted by last opened')).toBeInTheDocument();

    const more = within(card).getByRole('button', { name: '+ 4 more gardens' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);

    expect(rows(card)).toHaveLength(12);
    const cuts = card.querySelectorAll('[data-gardens-cut]');
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toHaveTextContent('Beyond the 8 shown');
    // The rule stands between the eighth garden and the ninth.
    const all = [...card.querySelectorAll('tbody tr')];
    expect(all.indexOf(cuts[0] as HTMLTableRowElement)).toBe(8);

    fireEvent.click(within(card).getByRole('button', { name: 'Show 8 gardens' }));
    expect(rows(card)).toHaveLength(8);
    expect(card.querySelector('[data-gardens-cut]')).toBeNull();
  });

  it('the search exists only while a garden is hidden by the setting, finds beyond the cut and marks it; « all » shows every garden and no search', () => {
    const card = renderWide({ gardens: gardensTwelve });
    const input = within(card).getByRole('textbox', { name: 'Search a garden' });

    fireEvent.change(input, { target: { value: 'VERGÉR' } });
    expect(rowNames(card)).toEqual(['Grand verger', 'Verger bas']);
    expect([...card.querySelectorAll('[data-garden-beyond]')].map((node) => node.textContent)).toEqual(['beyond the 8 shown']);
    expect(within(card).getByRole('status')).toHaveTextContent('2 gardens of 12 contain “VERGÉR”');

    fireEvent.change(input, { target: { value: 'verger nord' } });
    expect(card.querySelector('table')).toBeNull();
    expect(within(card).getByRole('button', { name: 'Clear the search' })).toBeInTheDocument();
  });

  it('« all »: the twelve, no search bar, no « + N »', () => {
    const card = renderWide({ gardens: gardensTwelve, options: { count: 'all' } });

    expect(rows(card)).toHaveLength(12);
    expect(within(card).queryByRole('textbox', { name: 'Search a garden' })).toBeNull();
    expect(within(card).queryByRole('button', { name: /more garden/ })).toBeNull();
  });
});

describe('GardensBlock in the Full width — on a phone, the rows of the A9 form (C.4; V3-03 § 6 défaut 8)', () => {
  it('draws rows, not a table: the thumbnail, the name as the door, « 10 × 8 · 50 cm · 20 m² », the chips (type, plants, weather), « N% · N free cells · exposure », the actions', () => {
    stubPhone();
    const card = renderWide();
    const view = gardenViewOf(terrasse);
    const surface = formatSurface(view.surfaceM2, 'en');

    expect(card.querySelector('table')).toBeNull();
    const list = [...card.querySelectorAll('[data-garden-row]')] as HTMLElement[];
    expect(list).toHaveLength(3);
    const row = list[0]!;
    expect(within(row).getByRole('link', { name: 'Open Terrasse' })).toBeInTheDocument();
    expect(row.querySelector('[data-testid="template-preview"]')).not.toBeNull();
    expect(row.querySelector('[data-garden-sub]')).toHaveTextContent(`10 × 8 · 50 cm · ${surface.value} m²`);
    const chips = row.querySelector('[data-garden-row-chips]') as HTMLElement;
    expect(within(chips).getByText('Terrace')).toBeInTheDocument();
    expect(within(chips).getByText('21 plants')).toBeInTheDocument();
    expect(within(chips).getByText('24°')).toBeInTheDocument();
    expect(row.querySelector('[data-garden-occupancy]')).toHaveTextContent(
      `${formatPercent(view.occupancyPercent, 'en')} · ${view.freeCells} free cells · ${t(`dashboard.exposure.short.${view.dominantExposure!}`)}`
    );
    expect(within(row).getByRole('button', { name: /^Rename Terrasse|^Edit Terrasse/ })).toBeInTheDocument();
    expect(row.querySelector('[data-row-actions]')).not.toBeNull();
  });

  it('cuts twelve at five on a phone, and the rule « Beyond the 5 shown » stands between the rows once unfolded', () => {
    stubPhone();
    const card = renderWide({ gardens: gardensTwelve });

    expect(card.querySelectorAll('[data-garden-row]')).toHaveLength(5);
    fireEvent.click(within(card).getByRole('button', { name: '+ 7 more gardens' }));

    expect(card.querySelectorAll('[data-garden-row]')).toHaveLength(12);
    const items = [...(card.querySelector('[data-gardens-rows]') as HTMLElement).children];
    const cut = card.querySelector('[data-gardens-cut]') as HTMLElement;
    expect(cut).toHaveTextContent('Beyond the 5 shown');
    expect(items.indexOf(cut)).toBe(5);
  });
});

// PR #300, fix round 1, A (Extension EXT-1 / EXT-2, GitHub 4132607962) — THE
// RANK OF A GARDEN A SEARCH FOUND, read from an index built once per sort. A
// search draws EVERY garden it finds, each marked when it lies beyond the cut;
// `beyondOf` read that rank with `sorted.indexOf(garden)`, and the Large
// carried the same scan inline — one scan of the sorted list per row, O(n²)
// for an Expert, who has no limit on gardens. The marks are unchanged by
// construction (the tests above hold them): what is proven here is the
// mechanism, as for A of #299 — the renders look no garden up in a list.

/** The array lookups by value, then by predicate. */
const VALUE_LOOKUPS = ['indexOf', 'lastIndexOf', 'includes'] as const;
const PREDICATE_LOOKUPS = ['find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every'] as const;
type Lookup = (typeof VALUE_LOOKUPS)[number] | (typeof PREDICATE_LOOKUPS)[number];

/**
 * Every lookup `draw` makes in a list of `gardens` — a garden sought by value
 * (named: `indexOf(Verger bas)`), or an array of gardens searched by a
 * predicate (the method alone). Spied on `Array.prototype`, since the lists
 * the widget sorts and filters are its own; the calls are copied out, then the
 * spies restored, before anything is read.
 */
function gardenLookups(gardens: readonly DashboardGardenData[], draw: () => void): string[] {
  const methods: readonly Lookup[] = [...VALUE_LOOKUPS, ...PREDICATE_LOOKUPS];
  const spies = methods.map((name) => ({ name, spy: vi.spyOn(Array.prototype, name) }));
  let calls: { name: Lookup; value: unknown; context: unknown }[] = [];
  try {
    draw();
  } finally {
    calls = spies.flatMap(({ name, spy }) =>
      spy.mock.calls.map((args, index) => ({ name, value: args[0], context: spy.mock.contexts[index] }))
    );
    for (const { spy } of spies) spy.mockRestore();
  }
  const own = new Set<unknown>(gardens);
  return calls.flatMap(({ name, value, context }) => {
    if ((VALUE_LOOKUPS as readonly string[]).includes(name)) {
      return own.has(value) ? [`${name}(${(value as DashboardGardenData).name})`] : [];
    }
    return Array.isArray(context) && context.some((item) => own.has(item)) ? [name] : [];
  });
}

/** The « beyond » marks of the drawn rows, top to bottom. */
const beyondMarks = (card: HTMLElement) => [...card.querySelectorAll('[data-garden-beyond]')].map((node) => node.textContent);

describe('GardensBlock — a search marks the gardens beyond the cut from an index, never a scan per row (PR #300, fix round 1, A)', () => {
  // « e »: eleven of the twelve (all but « Balcon sud »), in the index order
  // « Derniers ouverts » lists them — so the four last lie beyond a cut of 8,
  // the seven last beyond a cut of 5.
  const search = (card: HTMLElement) =>
    fireEvent.change(within(card).getByRole('textbox', { name: 'Search a garden' }), { target: { value: 'e' } });

  it('Large: four gardens marked beyond the 8 shown — and no garden looked up in a list', () => {
    let card!: HTMLElement;
    const lookups = gardenLookups(gardensTwelve, () => {
      card = renderWide({ gardens: gardensTwelve, size: 'large' });
      search(card);
    });

    expect(beyondMarks(card)).toEqual(Array(4).fill('beyond the 8 shown'));
    expect(lookups).toEqual([]);
  });

  it('Full width: four gardens marked beyond the 8 shown — and no garden looked up in a list', () => {
    let card!: HTMLElement;
    const lookups = gardenLookups(gardensTwelve, () => {
      card = renderWide({ gardens: gardensTwelve });
      search(card);
    });

    expect(beyondMarks(card)).toEqual(Array(4).fill('beyond the 8 shown'));
    expect(lookups).toEqual([]);
  });

  it('Full width on a phone: seven gardens marked beyond the 5 shown — and no garden looked up in a list', () => {
    stubPhone();
    let card!: HTMLElement;
    const lookups = gardenLookups(gardensTwelve, () => {
      card = renderWide({ gardens: gardensTwelve });
      search(card);
    });

    expect(card.querySelector('table')).toBeNull();
    expect(beyondMarks(card)).toEqual(Array(7).fill('beyond the 5 shown'));
    expect(lookups).toEqual([]);
  });
});
