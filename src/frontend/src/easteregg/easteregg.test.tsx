import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import i18next from '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import type { Plant } from '../types/Plant';
import type { FindPlantsParams, PlantFinderResult } from '../services/plantApi';

vi.mock('../services/plantApi', () => ({
  findPlants: vi.fn(),
  fetchPlantTypes: vi.fn(),
  fetchPlantById: vi.fn(),
}));
vi.mock('../services/authApi', () => ({
  fetchMe: vi.fn().mockRejectedValue(new Error('Not authenticated')),
}));
vi.mock('../services/adminApi', () => ({
  reEnrichTrefle: vi.fn(),
  reEnrichPerenual: vi.fn(),
  classifyReEnrich: vi.fn(),
}));

import PlantLibrary, { PER_PAGE } from '../pages/PlantLibrary';
import PlantDetail from '../pages/PlantDetail';
import {
  fetchPlantById,
  fetchPlantTypes,
  findPlants,
} from '../services/plantApi';
import {
  EASTER_EGGS_ENABLED,
  getEasterEggBySlug,
  getEasterEggCards,
  matchEasterEggKey,
} from './index';
import type { EasterEggEntry } from './types';
import EasterEggDetail from './EasterEggDetail';
import { EggPests } from './sections';
import { HIKARI } from './entries/hikari';
import { spacingToCm } from '../utils/plantDetail';

/** The frozen 15-entry skeleton: every one of these must exist in the DOM. */
const SECTION_IDS = [
  'overview',
  'gallery',
  'distribution',
  'lifecycle',
  'scientific-data',
  'characteristics',
  'edible',
  'pests',
  'common-names',
  'synonyms',
  'plantnet',
  'sources',
  'similar',
  'faq',
  'community',
] as const;

/**
 * SMA-394: every test for the easter-egg feature lives here, so the suites of
 * the real application stay exactly as they were on develop and deleting this
 * folder deletes the tests with it.
 */

// Sourced from the entry, never re-typed: a slug edited in `hikari.ts` must
// move the tests with it rather than leave them asserting a dead route.
const SLUG = HIKARI.slug;
const HREF = `/library/${SLUG}`;
const NAME = 'えりな J';

/** usePlantFinder's typed-query debounce, in ms. */
const DEBOUNCE_MS = 300;

function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  mockMatchMedia(true);
  localStorage.clear();
  // SMA-393: the no-choice default is French now, so English is set the way a returning visitor sets it.
  localStorage.setItem('smartcrops-language', 'en');
});

afterEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  await i18next.changeLanguage('en');
});

function makeListItem(overrides: Partial<Plant> = {}): Plant {
  return {
    id: '00a098b2-b0d2-4ff8-a100-cee56088391e',
    scientificName: 'Achillea ptarmica',
    plantTypeId: 4,
    plantType: { id: 4, name: 'Ornamental', description: null },
    sunExposure: null,
    waterNeeds: null,
    ...overrides,
  } as unknown as Plant;
}

function pageOf(catalog: Plant[], page: number): PlantFinderResult {
  return {
    items: catalog.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    found: catalog.length,
    page,
    perPage: PER_PAGE,
    facetCounts: [],
  };
}

async function renderLibrarySettled() {
  vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
    Promise.resolve(pageOf([makeListItem()], params.page ?? 1))
  );
  vi.mocked(fetchPlantTypes).mockResolvedValue([]);
  render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/library']}>
          <PlantLibrary />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
  await screen.findByRole('heading', { name: 'Achillea ptarmica' });
}

const search = (value: string) =>
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search plants by name...' }),
    { target: { value } }
  );

/**
 * A library backed by a catalogue big enough to page through, so Load more is
 * live and the page number the finder receives can be asserted.
 */
async function renderLibraryWithPages(pages: number) {
  const catalog = Array.from({ length: PER_PAGE * pages }, (_, i) =>
    makeListItem({
      id: `cat-${i}`,
      scientificName: i === 0 ? 'Achillea ptarmica' : `Plantus ${i}`,
    } as Partial<Plant>)
  );
  vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
    Promise.resolve(pageOf(catalog, params.page ?? 1))
  );
  vi.mocked(fetchPlantTypes).mockResolvedValue([]);
  render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/library']}>
          <PlantLibrary />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
  await screen.findByRole('heading', { name: 'Achillea ptarmica' });
}

const loadMore = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

/** The `page` of every findPlants call so far, in order. */
const pagesRequested = () =>
  vi.mocked(findPlants).mock.calls.map(([p]) => p.page ?? 1);

/**
 * The hidden page rendered from an ARBITRARY entry, bypassing the registry, so
 * a fixture can exercise the entry-shape branches HIKARI cannot reach.
 */
function renderEgg(egg: EasterEggEntry) {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          <EasterEggDetail egg={egg} />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

function renderDetailAt(pathname: string) {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[{ pathname, state: null }]}>
            <Routes>
              <Route path="/library/:id" element={<PlantDetail />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

// ── The registry itself ────────────────────────────────────────────────────

describe('easter-egg registry', () => {
  it('is enabled, and every helper is empty when it is not', () => {
    // Guards the one-word switch: if this ever ships false, the assertions
    // below would silently pass for the wrong reason.
    expect(EASTER_EGGS_ENABLED).toBe(true);
    expect(matchEasterEggKey('erina_j')).not.toBeNull();
    expect(getEasterEggBySlug(SLUG)).not.toBeNull();
    expect(getEasterEggCards('erina_j')).toHaveLength(1);
  });

  it.each(['ERINA_J', '  erina_j  ', 'Erina J', 'Erina  J', 'erinaj'])(
    'matches %j, case, padding and inner whitespace insensitive',
    (key) => {
      expect(matchEasterEggKey(key)?.slug).toBe(SLUG);
    }
  );

  // A Japanese IME emits full-width forms: U+3000 IDEOGRAPHIC SPACE between
  // えりな and J, and full-width latin (U+FF21..U+FF5A, U+FF3F) whenever the
  // input mode is kana-width. Typing the invitation on her own keyboard has to
  // work, so NFKC folds both to the ASCII the keys are written in. The
  // ideographic spaces below are real characters and look like ordinary
  // spacing here; each case names what it carries.
  it.each([
    ['えりな　J', 'ideographic space'],
    ['えりな　j', 'ideographic space, lower case'],
    ['Ｅｒｉｎａ＿Ｊ', 'full-width latin and underscore'],
    ['ｅｒｉｎａ＿ｊ', 'full-width latin, lower case'],
    ['Ｅｒｉｎａ　Ｊ', 'full-width latin with an ideographic space'],
    ['えりな　Ｊ', 'kana with a full-width J'],
    ['　Ｅｒｉｎａ＿Ｊ　', 'full-width, padded with ideographic spaces'],
  ])('matches %j typed on a Japanese IME (%s)', (key) => {
    expect(matchEasterEggKey(key)?.slug).toBe(SLUG);
    expect(getEasterEggCards(key)).toHaveLength(1);
  });

  it.each(['erina', 'erina_', 'erinaj_', '', 'j'])(
    'does not match the near miss %j',
    (key) => {
      expect(matchEasterEggKey(key)).toBeNull();
      expect(getEasterEggCards(key)).toHaveLength(0);
    }
  );

  it('normalises the registered keys too, so both sides agree', () => {
    // The guarantee is symmetric: every key in the entry must be reachable by
    // typing it, whatever width or case the keyboard produces.
    for (const key of HIKARI.keys) {
      expect(matchEasterEggKey(key)?.slug).toBe(SLUG);
      expect(matchEasterEggKey(key.toUpperCase())?.slug).toBe(SLUG);
    }
  });

  it('resolves nothing for an ordinary plant id', () => {
    expect(
      getEasterEggBySlug('b9eb0675-9872-4b1b-9f5d-417195e98f03')
    ).toBeNull();
    expect(getEasterEggBySlug(undefined)).toBeNull();
  });

  it('carries the artwork as a decodable data URI, Japanese intact', () => {
    const url = HIKARI.card.imageUrl ?? '';
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length));
    // The name survives the round trip, code point for code point.
    expect(svg).toContain(NAME);
    expect([...NAME].map((c) => c.codePointAt(0))).toEqual([
      0x3048, 0x308a, 0x306a, 0x0020, 0x004a,
    ]);
    // Our own drawing: white ground, translucent red heart, blue name. The
    // heart reads as a heart at card size while staying behind the text.
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#e03131" opacity="0.3"');
    expect(svg).toContain('fill="#4c7fd6"');
    // No photograph, therefore no credit line anywhere.
    expect(HIKARI.card.imageAttribution).toBeNull();
  });

  it('goes completely silent when the switch is off', async () => {
    // The flag lives in its own module precisely so the disabled path can be
    // exercised: mock it false, re-import the registry, assert every helper.
    vi.resetModules();
    vi.doMock('./enabled', () => ({ EASTER_EGGS_ENABLED: false }));
    // try/finally, so a failed expectation cannot leave the mocked module and
    // the reset registry in place for every test that follows in this file.
    try {
      const off = await import('./index');

      expect(off.EASTER_EGGS_ENABLED).toBe(false);
      expect(off.matchEasterEggKey('erina_j')).toBeNull();
      expect(off.matchEasterEggKey('えりな j')).toBeNull();
      expect(off.getEasterEggBySlug(SLUG)).toBeNull();
      expect(off.getEasterEggCards('erina_j')).toHaveLength(0);
    } finally {
      vi.doUnmock('./enabled');
      vi.resetModules();
    }
  });

  it('states no size figure anywhere in the entry', () => {
    const p = HIKARI.plant;
    expect(p.minHeightCm).toBeNull();
    expect(p.maxHeightCm).toBeNull();
    expect(p.minSpreadCm).toBeNull();
    expect(p.maxSpreadCm).toBeNull();
    // Spacing is a PROPORTION, not a length: the unit is unconvertible, so the
    // formatter prints it verbatim and never derives a cm/in figure from it.
    // Assert both fields are really there first — with `?? 0` / `?? ''`
    // fallbacks a null field would make spacingToCm(0, '') return null and the
    // test would pass without the declared unit ever being exercised.
    const value = p.perenualData?.xPlantSpacingValue;
    const unit = p.perenualData?.xPlantSpacingUnit;
    expect(typeof value).toBe('number');
    expect(typeof unit).toBe('string');
    expect(spacingToCm(value as number, unit as string)).toBeNull();
  });
});

// ── The library card ───────────────────────────────────────────────────────

describe('the library card', () => {
  it('shows exactly one card, linking to the plant’s own page', async () => {
    await renderLibrarySettled();

    search('erina_j');

    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(1);
    const title = screen.getByRole('heading', { level: 6, name: NAME });
    expect(title.closest('a')).toHaveAttribute('href', HREF);
    expect(
      screen.queryByRole('heading', { name: 'Achillea ptarmica' })
    ).not.toBeInTheDocument();
  });

  it('never sends the key to the finder, no q parameter reaches the network', async () => {
    await renderLibrarySettled();
    // Forget the initial catalogue load: only what the keystroke causes counts.
    vi.mocked(findPlants).mockClear();

    // usePlantFinder DEBOUNCES a typed query by 300 ms before it fetches, so
    // asserting straight after the keystroke would pass even if the key were
    // handed to the hook — the request simply would not have been made yet.
    // Advance past the debounce and flush the effects it schedules, so a leak
    // has every opportunity to reach the mock before the assertion runs.
    vi.useFakeTimers();
    try {
      search('erina_j');
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS * 4);
      });
    } finally {
      vi.useRealTimers();
    }
    await act(async () => {});

    // findPlants writes `q` into the request URL, so a key reaching it would
    // be logged in clear text by the proxy and by the search engine.
    const queries = vi
      .mocked(findPlants)
      .mock.calls.map(([params]) => params.q);
    expect(queries.every((q) => q === undefined)).toBe(true);
    expect(vi.mocked(findPlants)).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: expect.anything() }),
      expect.anything()
    );
  });

  it('leaves the catalogue able to load more after the key is entered and cleared', async () => {
    // The regression: typing the key resets the page to 1 locally, but the key
    // is substituted to '' before it reaches the finder, so the hook never
    // refetches and keeps its page-2 snapshot. Clearing changes nothing for the
    // hook either. The next Load more then re-requests page 2, which the hook
    // already holds, and nothing is fetched — the visitor is stranded.
    await renderLibraryWithPages(3);
    expect(pagesRequested()).toEqual([1]);

    loadMore();
    await screen.findByRole('heading', { name: 'Plantus 20' });
    expect(pagesRequested()).toEqual([1, 2]);

    search('erina_j');
    expect(screen.getByRole('heading', { name: NAME })).toBeInTheDocument();

    search('');
    await screen.findByRole('heading', { name: 'Achillea ptarmica' });
    // The key never reached the finder, in either direction.
    expect(pagesRequested()).toEqual([1, 2]);

    loadMore();
    await screen.findByRole('heading', { name: 'Plantus 40' });
    // Page THREE, not a second request for page 2.
    expect(pagesRequested()).toEqual([1, 2, 3]);
  });

  it('falls through to the normal catalogue on a near miss, and on clearing', async () => {
    await renderLibrarySettled();

    search('erina');
    expect(
      screen.queryByRole('heading', { name: NAME })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Achillea ptarmica' })
    ).toBeInTheDocument();

    search('erina_j');
    expect(screen.getByRole('heading', { name: NAME })).toBeInTheDocument();

    search('');
    expect(
      screen.queryByRole('heading', { name: NAME })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Achillea ptarmica' })
    ).toBeInTheDocument();
  });
});

// ── The detail page ────────────────────────────────────────────────────────

describe('the detail page', () => {
  it('serves the hidden plant from the registry, without calling the API', async () => {
    renderDetailAt(HREF);

    expect(
      await screen.findByRole('heading', { name: NAME })
    ).toBeInTheDocument();
    expect(screen.getByText('Erina J.')).toBeInTheDocument();
    expect(vi.mocked(fetchPlantById)).not.toHaveBeenCalled();
  });

  it('still fetches a normal plant exactly once, the injection is inert elsewhere', async () => {
    const plant = {
      ...HIKARI.plant,
      id: 'b9eb0675-9872-4b1b-9f5d-417195e98f03',
      translations: [
        { id: 1, language: 'en', commonName: 'Pea', description: 'A pea.' },
      ],
    } as Plant;
    vi.mocked(fetchPlantById).mockResolvedValue(plant);

    renderDetailAt('/library/b9eb0675-9872-4b1b-9f5d-417195e98f03');

    await screen.findByRole('heading', { name: 'Pea' });
    expect(vi.mocked(fetchPlantById)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchPlantById)).toHaveBeenCalledWith(
      'b9eb0675-9872-4b1b-9f5d-417195e98f03',
      expect.anything()
    );
  });

  it('keeps the About to its eight paragraphs, with nothing spilled into it', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    const about = screen.getByRole('heading', { name: 'About' }).parentElement;
    expect(about).not.toBeNull();
    const text = about!.textContent ?? '';

    // The opening paragraph is there…
    expect(text).toContain('The most beautiful plant on this site');
    // …and nothing that belongs to another section is.
    for (const stray of [
      'Recommended treatment',
      'Cockroaches',
      'Studio Ghibli',
      'Daiso',
      'Did you wash your hands?',
      'Propagation by division',
      'Type locality',
      'ごろごろベッド',
    ]) {
      expect(text).not.toContain(stray);
    }
  });

  it('renders each section’s own written content instead of a placeholder', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    // Gauges: the eight that matter here, and NOT hardiness or soil pH.
    expect(screen.getAllByText('12+ h').length).toBeGreaterThan(0);
    expect(screen.getByText('Immediate flowering')).toBeInTheDocument();
    expect(screen.queryByText('Hardiness')).not.toBeInTheDocument();
    // Calendar, with the morning protocol.
    expect(screen.getByText('ごろごろベッド')).toBeInTheDocument();
    // Scientific data.
    expect(screen.getByText('ほうじ茶 (hojicha)')).toBeInTheDocument();
    // Characteristics: the written wording, and the ranges as the copy writes
    // them, not bucketed into continents.
    expect(
      screen.getByText(/Only when insufficiently rested/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Japan').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Japan · California · France (soon)')
    ).toBeInTheDocument();
    // Pests keep their descriptions.
    expect(
      screen.getByText(/The single greatest documented threat/)
    ).toBeInTheDocument();
    expect(screen.getByText(/ideally アレックス/)).toBeInTheDocument();
    // Synonyms keep their glosses: the real chip carries them as its
    // authority, announced through the accessible name.
    expect(
      screen.getByLabelText('Erina japonica (syn. えりちゃん)')
    ).toBeInTheDocument();
    // Observations: the cities are IN the chart, not listed beneath it.
    expect(screen.getByText('Observations per city')).toBeInTheDocument();
    expect(screen.getByText('アレックス')).toBeInTheDocument();
    // Resources: the things she loves, not dead botanical searches.
    expect(screen.getByText('Daiso')).toBeInTheDocument();
    expect(screen.queryByText('POWO')).not.toBeInTheDocument();
    // Similar plants, over the ghost cards.
    expect(
      screen.getByText(/There are no similar plants in the world/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Recommendation engine coming soon')
    ).not.toBeInTheDocument();
    // The distribution map keeps its map and gains its message.
    expect(
      screen.getByText('There is only one Erina in the world.')
    ).toBeInTheDocument();
    // The gallery says why there is nothing to show.
    expect(screen.getByText('No photographs on record.')).toBeInTheDocument();
    // FAQ: the written questions, not the generated ones.
    expect(screen.getByText('げんき？')).toBeInTheDocument();
    expect(screen.queryByText('Is this plant edible?')).not.toBeInTheDocument();
  });

  it('renders through the REAL section components, not stand-ins', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    // 04: her day, hour by hour, in the real timeline (LifecycleSection).
    // Twenty-four hour columns plus the stage header, seven written stages.
    const timeline = screen.getByRole('table', {
      name: 'Daily timeline (activity by hour)',
    });
    const headers = within(timeline).getAllByRole('columnheader');
    expect(headers).toHaveLength(25);
    expect(headers.map((h) => h.textContent)).toEqual([
      '',
      ...Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
    ]);
    expect(within(timeline).getAllByRole('row')).toHaveLength(8);
    for (const stage of [
      'Sleep time',
      'Make up time',
      'Eating time',
      'Time to enjoy the sun',
      'Job hunting in Paris',
      'Costume time',
      'Planning life in Paris',
    ]) {
      // Once in the stage row, once in the legend below the timeline.
      expect(screen.getAllByText(stage)).toHaveLength(2);
    }
    // The sleep block spans 00 to 09 inclusive; the screen-reader summary of
    // each row states its own span.
    expect(within(timeline).getByText('00 – 09')).toBeInTheDocument();
    expect(within(timeline).getByText('12, 19')).toBeInTheDocument();

    // 05: the two-column Available / Coming card (ScientificDataSection),
    // fed so the left column actually fills, chips included.
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText(/Coming .* exact measurements/)).toBeInTheDocument();
    expect(screen.getByText('Daily sunlight')).toBeInTheDocument();
    expect(screen.getByText('Recommended spacing')).toBeInTheDocument();
    expect(screen.getByText('80 % of the bed')).toBeInTheDocument();
    // The row is renamed, and the written rows and chips join the column.
    expect(screen.getByText('Ideal temperature')).toBeInTheDocument();
    expect(
      screen.queryByText('Ideal watering temperature')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Monthly 温泉')).toBeInTheDocument();
    expect(screen.getByText('Sushi')).toBeInTheDocument();
    expect(screen.getByText('Ratatouille')).toBeInTheDocument();

    // 06: the progress bars, driven by this entry's values.
    expect(screen.getByText('Full sun')).toBeInTheDocument();
    expect(screen.getByText('Low (frost-tender)')).toBeInTheDocument();
    // The four bars the catalogue could never fill here are gone, not empty.
    expect(screen.queryByText('Not provided')).not.toBeInTheDocument();
    expect(screen.getByText('Patience for cockroaches')).toBeInTheDocument();
    expect(screen.getAllByText('Max')).toHaveLength(4);

    // 07: the icon rows of CultureSection.
    expect(screen.getByText('Propagation methods')).toBeInTheDocument();
    expect(screen.getByText('Still thinking about it')).toBeInTheDocument();
    expect(screen.getByText(/kisses and hugs from アレックス/)).toBeInTheDocument();

    // 08: nine real pest CARDS with the "view details" affordance.
    for (const name of [
      'Cockroaches',
      'Flies',
      'Grasshoppers',
      'Spiders',
      'Ants',
      'Coriander',
      'Natto',
      'Broken nails',
      'Anime',
    ]) {
      expect(
        screen.getByRole('button', { name: `View details for ${name}` })
      ).toBeInTheDocument();
    }
    expect(screen.getAllByText('Pest · insect')).toHaveLength(5);
    expect(screen.getAllByText('Dislike · food')).toHaveLength(2);

    // 12: the resource CARDS, with their two-letter pill. No URL is guessed,
    // so none of them is a link.
    expect(screen.getByText('SG')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Studio Ghibli/ })
    ).not.toBeInTheDocument();

    // 14: real accordions: one open at a time, first open by default.
    const q = screen.getByRole('button', { name: /Do you love me\?/ });
    expect(q).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(q);
    expect(q).toHaveAttribute('aria-expanded', 'true');
    // Twice once open: the cultivation closing line, and this answer quoting it.
    expect(
      screen.getAllByText('Nobody loves her more than アレックス.')
    ).toHaveLength(2);
  });

  it('drops the #pests anchor entirely for an entry with no pests', () => {
    // The skeleton makes #pests conditional on pests.length > 0. HIKARI carries
    // nine, so the test above passes whether the rule is honoured or not; only
    // an empty entry can tell the difference.
    const bare = {
      ...HIKARI,
      plant: { ...HIKARI.plant, pests: [] },
    } as EasterEggEntry;

    const { container } = render(
      <LanguageProvider>
        <UnitSystemProvider>
          <MemoryRouter>
            <EggPests egg={bare} />
          </MemoryRouter>
        </UnitSystemProvider>
      </LanguageProvider>
    );

    expect(container.querySelector('[id="pests"]')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  // The rail renders one of two layouts, and SMA-394 changed the anchor branch
  // in BOTH, so both are exercised. mockMatchMedia(true) is the beforeEach
  // default (mobile pill bar); false selects the desktop sidebar.
  it.each([
    ['mobile pill bar', true],
    ['desktop rail', false],
  ])(
    'reaches every one of the fifteen sections from the %s',
    async (_layout, mobile) => {
      mockMatchMedia(mobile);
      const { container } = renderDetailAt(HREF);
      await screen.findByRole('heading', { name: NAME });

      const anchors = Array.from(
        container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
      );
      // Every entry is an anchor, none is an inert div: the four teasers used
      // to render as `component="div"` with no href, so four sections that DO
      // render content could not be reached from the rail.
      expect(anchors.map((a) => a.getAttribute('href'))).toEqual(
        SECTION_IDS.map((id) => `#${id}`)
      );
      // ...and every one of those hrefs lands on an element that exists.
      for (const a of anchors) {
        const id = a.getAttribute('href')!.slice(1);
        expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
      }
    }
  );

  // ── One gate per section: the section, its notes and its TOC entry all read
  // the same derived value, so an entry that suppresses a section suppresses
  // all three. HIKARI has pests AND perenualData, so only a fixture without
  // them can tell whether the three agree. These two tests are the guard on
  // easter egg number two.
  it('drops #pests everywhere at once for an entry with no pests', () => {
    const bare = {
      ...HIKARI,
      plant: { ...HIKARI.plant, pests: [] },
    } as EasterEggEntry;

    const { container } = renderEgg(bare);

    // ...no section,
    expect(container.querySelector('[id="pests"]')).toBeNull();
    // ...no table-of-contents entry pointing at it,
    const hrefs = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    ).map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('#pests');
    // ...and no orphaned prose card left floating where the section was.
    expect(
      screen.queryByText('Primary threat: insects. Tolerance: zero.')
    ).not.toBeInTheDocument();
    // The rest of the rail is untouched, so this cannot pass by rendering
    // nothing at all.
    expect(hrefs).toContain('#overview');
    expect(hrefs).toHaveLength(SECTION_IDS.length - 1);
  });

  it('KEEPS #scientific-data for an entry with no xData, showing it unavailable', () => {
    // #scientific-data is a REQUIRED anchor of the frozen skeleton — unlike
    // #pests, it may not be dropped. Round 9 made it conditional and this test
    // asserted the disappearance; that was the wrong behaviour, and the shape
    // of the assertions is inverted here rather than the test deleted.
    const bare = {
      ...HIKARI,
      plant: { ...HIKARI.plant, perenualData: null },
      // The written extras would otherwise fill the card and hide the very
      // state under test.
      scientific: { ...HIKARI.scientific, extraRows: [], chipGroups: [] },
    } as unknown as EasterEggEntry;

    const { container } = renderEgg(bare);

    // The anchor and its heading are present...
    expect(container.querySelector('[id="scientific-data"]')).not.toBeNull();
    // ...so is the sommaire entry, and all fifteen still resolve.
    const hrefs = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    ).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#scientific-data');
    expect(hrefs).toHaveLength(SECTION_IDS.length);
    // ...and the Perenual-derived values read as unavailable.
    expect(screen.getByTestId('scientific-unavailable')).toHaveTextContent(
      'Not provided'
    );
    // No legacy `Plants` column is substituted for a missing xData value: the
    // entry's own hardiness and height fields must not surface here.
    const card = screen.getByTestId('scientific-unavailable').parentElement!;
    expect(card.textContent).not.toMatch(/\d/);
  });

  it('leaves the four teasers inert on a REAL plant page', async () => {
    // The guard on the 536: `distribution`, `plantnet`, `similar` and
    // `community` are hard-coded teasers in PlantDetail's own tocSections, and
    // those sections genuinely do not render there. They must stay non-anchors.
    vi.mocked(fetchPlantById).mockResolvedValue({
      ...HIKARI.plant,
      id: 'b9eb0675-9872-4b1b-9f5d-417195e98f03',
      translations: [
        { id: 1, language: 'en', commonName: 'Pea', description: 'A pea.' },
      ],
    } as Plant);

    const { container } = renderDetailAt(
      '/library/b9eb0675-9872-4b1b-9f5d-417195e98f03'
    );
    await screen.findByRole('heading', { name: 'Pea' });

    const hrefs = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    ).map((a) => a.getAttribute('href'));
    for (const id of ['distribution', 'plantnet', 'similar', 'community']) {
      expect(hrefs).not.toContain(`#${id}`);
    }
    // The live entries on that page are still anchors, so the assertion above
    // cannot pass merely because the rail failed to render.
    expect(hrefs).toContain('#overview');
  });

  it('renders all fifteen sections, each resolving to its own anchor', async () => {
    const { container } = renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    for (const id of SECTION_IDS) {
      expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
    // The two the previous round hid are back, badges and all.
    expect(
      screen.getByRole('heading', { name: 'Worldwide distribution map' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Community · corrections & comments' })
    ).toBeInTheDocument();
  });

  it('opens a pest card onto its own answer, not the coming-soon teaser', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    fireEvent.click(
      screen.getByRole('button', { name: 'View details for Cockroaches' })
    );
    expect(await screen.findByTestId('pest-detail')).toHaveTextContent(
      'Just ask アレックス, or buy a spray.'
    );
  });

  it('answers a non-insect pest in its own words', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    fireEvent.click(
      screen.getByRole('button', { name: 'View details for Broken nails' })
    );
    expect(await screen.findByTestId('pest-detail')).toHaveTextContent('いたい！');
  });

  it('annotates the written bars with hover tooltips', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    fireEvent.mouseOver(screen.getByText('Love for dogs'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Woof woof');
  });

  it('carries no em dash in any string this entry owns', () => {
    // U+2014 reads as machine-written, so it is banned from everything this
    // folder writes. Walks the whole entry, strings and nested objects alike.
    // Written as an escape on purpose: a grep for the character itself must
    // come back empty across this folder, test included.
    const EM_DASH = '\u2014';
    const offenders: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') {
        if (node.includes(EM_DASH)) offenders.push(node);
      } else if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (node && typeof node === 'object') {
        Object.values(node).forEach(walk);
      }
    };
    walk(HIKARI);
    expect(offenders).toEqual([]);
  });

  it('makes no planner promise, and closes on the final line', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    // This plant can never be placed in a garden.
    expect(
      screen.queryByRole('link', { name: 'Plan my garden' })
    ).not.toBeInTheDocument();
    // The last thing on the page.
    expect(
      screen.getByText('Would you like to live with me?')
    ).toBeInTheDocument();
  });
});
