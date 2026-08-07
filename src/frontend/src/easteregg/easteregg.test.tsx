import { fireEvent, render, screen, within } from '@testing-library/react';
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
 * SMA-394 — every test for the easter-egg feature lives here, so the suites of
 * the real application stay exactly as they were on develop and deleting this
 * folder deletes the tests with it.
 */

const SLUG = 'erina-j-mon-coeur-since-october-31-2024';
const HREF = `/library/${SLUG}`;
const NAME = 'えりな J';

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
    'matches %j — case, padding and inner whitespace insensitive',
    (key) => {
      expect(matchEasterEggKey(key)?.slug).toBe(SLUG);
    }
  );

  it.each(['erina', 'erina_', 'erinaj_', '', 'j'])(
    'does not match the near miss %j',
    (key) => {
      expect(matchEasterEggKey(key)).toBeNull();
      expect(getEasterEggCards(key)).toHaveLength(0);
    }
  );

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
    const off = await import('./index');

    expect(off.EASTER_EGGS_ENABLED).toBe(false);
    expect(off.matchEasterEggKey('erina_j')).toBeNull();
    expect(off.matchEasterEggKey('えりな j')).toBeNull();
    expect(off.getEasterEggBySlug(SLUG)).toBeNull();
    expect(off.getEasterEggCards('erina_j')).toHaveLength(0);

    vi.doUnmock('./enabled');
    vi.resetModules();
  });

  it('states no size figure anywhere in the entry', () => {
    const p = HIKARI.plant;
    expect(p.minHeightCm).toBeNull();
    expect(p.maxHeightCm).toBeNull();
    expect(p.minSpreadCm).toBeNull();
    expect(p.maxSpreadCm).toBeNull();
    // Spacing is a PROPORTION, not a length: the unit is unconvertible, so the
    // formatter prints it verbatim and never derives a cm/in figure from it.
    const unit = p.perenualData?.xPlantSpacingUnit ?? '';
    expect(spacingToCm(p.perenualData?.xPlantSpacingValue ?? 0, unit)).toBeNull();
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

  it('never sends the key to the finder — no q parameter reaches the network', async () => {
    await renderLibrarySettled();

    search('erina_j');

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

  it('still fetches a normal plant exactly once — the injection is inert elsewhere', async () => {
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
    // them — not bucketed into continents.
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
    // Synonyms keep their glosses — the real chip carries them as its
    // authority, announced through the accessible name.
    expect(
      screen.getByLabelText('Erina japonica (syn. えりちゃん)')
    ).toBeInTheDocument();
    // Observations.
    expect(screen.getByText(/Type locality/)).toBeInTheDocument();
    // Resources — the things she loves, not dead botanical searches.
    expect(screen.getByText('Daiso')).toBeInTheDocument();
    expect(screen.queryByText('POWO')).not.toBeInTheDocument();
    // Similar plants.
    expect(screen.getByText('None.')).toBeInTheDocument();
    // FAQ — the written questions, not the generated ones.
    expect(screen.getByText('げんき？')).toBeInTheDocument();
    expect(screen.queryByText('Is this plant edible?')).not.toBeInTheDocument();
  });

  it('renders through the REAL section components, not stand-ins', async () => {
    renderDetailAt(HREF);
    await screen.findByRole('heading', { name: NAME });

    // 04 — the twelve-month timeline table and its legend (LifecycleSection).
    const timeline = screen.getByRole('table', {
      name: 'Seasonal timeline (sowing, flowering, harvest by month)',
    });
    expect(timeline).toBeInTheDocument();
    expect(within(timeline).getAllByRole('columnheader')).toHaveLength(13);
    expect(within(timeline).getByText('Flowering')).toBeInTheDocument();

    // 05 — the two-column Available / Coming card (ScientificDataSection),
    // fed so the left column actually fills, chips included.
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText(/Coming .* exact measurements/)).toBeInTheDocument();
    expect(screen.getByText('Daily sunlight')).toBeInTheDocument();
    expect(screen.getByText('Recommended spacing')).toBeInTheDocument();
    expect(screen.getByText('80 % of the bed')).toBeInTheDocument();

    // 06 — the progress bars, driven by this entry's values.
    expect(screen.getByText('Full sun')).toBeInTheDocument();
    expect(screen.getByText('Low (frost-tender)')).toBeInTheDocument();
    // …and the three the site shows as "Not provided" for every plant.
    expect(screen.getAllByText('Not provided').length).toBeGreaterThanOrEqual(3);

    // 07 — the icon row of CultureSection.
    expect(screen.getByText('Watering rhythm')).toBeInTheDocument();
    // Twice: the hero gauge and the culture row read the same written value.
    expect(screen.getAllByText('Frequent & particular')).toHaveLength(2);

    // 08 — three real pest CARDS with the "view details" affordance.
    for (const name of ['Cockroaches', 'Grasshoppers', 'Flies']) {
      expect(
        screen.getByRole('button', { name: `View details for ${name}` })
      ).toBeInTheDocument();
    }
    expect(screen.getAllByText('Pest · insect')).toHaveLength(3);

    // 12 — the resource CARDS, with their two-letter pill. No URL is guessed,
    // so none of them is a link.
    expect(screen.getByText('SG')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Studio Ghibli/ })
    ).not.toBeInTheDocument();

    // 14 — real accordions: one open at a time, first open by default.
    const q = screen.getByRole('button', { name: /Do you love me\?/ });
    expect(q).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(q);
    expect(q).toHaveAttribute('aria-expanded', 'true');
    // Twice once open: the cultivation closing line, and this answer quoting it.
    expect(
      screen.getAllByText('Nobody loves her more than アレックス.')
    ).toHaveLength(2);
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
