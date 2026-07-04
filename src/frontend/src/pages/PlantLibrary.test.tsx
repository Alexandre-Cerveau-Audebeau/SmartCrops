import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import type { Plant } from '../types/Plant';
import type { FindPlantsParams, PlantFinderResult } from '../services/plantApi';

vi.mock('../services/plantApi', () => ({
  findPlants: vi.fn(),
  fetchPlantTypes: vi.fn(),
}));

import PlantLibrary, { PER_PAGE } from './PlantLibrary';
import { fetchPlantTypes, findPlants } from '../services/plantApi';

// SMA-255 T4 — the Library runs on the faceted finder with real server
// pagination, so this suite mocks findPlants (the single data path) and
// asserts the page/filter/language orchestration. The old suite's flake
// (SMA-174) came from real-timer debounce races; every debounce test below
// uses fake timers, everything else resolves synchronously-awaitable mocks.
// SMA-9 T2 — DELIBERATE updates: the single-select type-chip row is retired
// in favor of the filter panel (control row + rail/drawer, multi-select
// facets); the chip tests were replaced by panel tests accordingly.

// jsdom has no matchMedia; MUI's useMediaQuery drives the rail (md+) vs
// drawer (below md) split. Desktop is this suite's default; the mobile test
// remocks with false.
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
});

afterEach(async () => {
  vi.clearAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  // A test below flips the language; reset the shared i18next singleton so the
  // English-label assertions in the other tests stay deterministic.
  await i18next.changeLanguage('en');
});

// Minimal in-provider control that flips the language exactly like the real
// Navbar toggle does (via useLanguage().setLanguage), so PlantLibrary sees the
// context change and re-fetches — without pulling the whole Navbar into the test.
function LangSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
    >
      switch language
    </button>
  );
}

// Items keep the PlantListItemResponse shape (identity + type + factual
// scalars, NO translations array) — the neutral list DTO the finder hydrates
// server-side, and exactly the payload that crashed the Library before the
// SMA-73 getTranslation guard.
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

const makeMany = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    makeListItem({
      id: `id-${i}`,
      scientificName: `Plant ${String(i).padStart(2, '0')}`,
    })
  );

// Serves PER_PAGE-item pages out of `catalog`, mirroring the finder contract.
// Slice math derives from the component's own constant so a page-size change
// can't silently drift this mock; the 24/48 card-count ASSERTIONS below stay
// literal on purpose — they're the visible contract and must break loudly.
function pageOf(
  catalog: Plant[],
  page: number,
  overrides: Partial<PlantFinderResult> = {}
): PlantFinderResult {
  return {
    items: catalog.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    found: catalog.length,
    page,
    perPage: PER_PAGE,
    facetCounts: [],
    ...overrides,
  };
}

function mockFinderCatalog(
  catalog: Plant[],
  overrides: Partial<PlantFinderResult> = {}
) {
  vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
    Promise.resolve(pageOf(catalog, params.page ?? 1, overrides))
  );
}

function renderLibrary() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/library']}>
        <PlantLibrary />
      </MemoryRouter>
    </LanguageProvider>
  );
}

// The panel-toggle pill; its accessible name carries the live selection count.
const filtersButton = (count: number) =>
  screen.getByRole('button', { name: `Filters · ${count}` });

describe('PlantLibrary', () => {
  it('renders cards from the neutral list DTO (no translations) without crashing (SMA-73)', async () => {
    mockFinderCatalog([makeListItem()]);
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();

    // The card title falls back to the scientific name (no common name in the
    // list DTO). Before the SMA-73 fix, the render threw a TypeError here.
    expect(
      await screen.findByRole('heading', { name: 'Achillea ptarmica' })
    ).toBeInTheDocument();
  });

  it('requests page 1 with perPage 24 and the current lang on mount', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    // No exact call count: StrictMode double-invokes the mount effect (the
    // first run is aborted and never commits). The contract is the params.
    expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, perPage: PER_PAGE, lang: 'en', q: undefined }),
      expect.anything()
    );
    // Server pagination: only page 1 (24 cards) is in the DOM.
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
    expect(
      screen.getByRole('button', { name: 'Load more' })
    ).toBeInTheDocument();
  });

  it('shows the rest state: zero-count button, quick type chips, unfiltered counter, no rail', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([
      { id: 4, name: 'Ornamental', description: null },
    ]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    const button = filtersButton(0);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // Quick type row: "All" filled at rest, one count-less chip per type.
    expect(screen.getByRole('button', { name: 'All' })).toHaveClass(
      'MuiChip-filled'
    );
    expect(screen.getByRole('button', { name: 'Ornamental' })).toHaveClass(
      'MuiChip-outlined'
    );
    // Rich counter line — unfiltered variant, total from catalogTotal.
    expect(screen.getByText('50 plants')).toBeInTheDocument();
    expect(
      screen.getByText(/no active filter — the whole catalogue is visible/)
    ).toBeInTheDocument();
    // Panel closed by default — no rail in the tree.
    expect(
      screen.queryByRole('complementary', { name: 'Filters' })
    ).not.toBeInTheDocument();
  });

  it('quick type chips mirror the rail Type facet — one plantTypeIds state, "All" clears', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([
      { id: 1, name: 'Vegetable', description: null },
    ]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    // Quick chip → state (rail still closed, name unique).
    await user.click(screen.getByRole('button', { name: 'Vegetable' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ plantTypeIds: [1], page: 1 }),
        expect.anything()
      )
    );
    expect(filtersButton(1)).toBeInTheDocument();

    // The rail's Type chip mirrors the quick selection…
    await user.click(filtersButton(1));
    const rail = screen.getByRole('complementary', { name: 'Filters' });
    expect(
      within(rail).getByRole('button', { name: 'Vegetable' })
    ).toHaveClass('MuiChip-filled');

    // …and un-toggling in the rail mirrors back to the quick row.
    await user.click(within(rail).getByRole('button', { name: 'Vegetable' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ plantTypeIds: undefined }),
        expect.anything()
      )
    );
    const quickVegetable = screen
      .getAllByRole('button', { name: 'Vegetable' })
      .find((el) => !rail.contains(el))!;
    expect(quickVegetable).toHaveClass('MuiChip-outlined');
    expect(screen.getByRole('button', { name: 'All' })).toHaveClass(
      'MuiChip-filled'
    );

    // Select again via the quick row, then "All" clears the type selection.
    await user.click(quickVegetable);
    await waitFor(() => expect(filtersButton(1)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ plantTypeIds: undefined }),
        expect.anything()
      )
    );
    expect(filtersButton(0)).toBeInTheDocument();
  });

  it('the counter line switches to the filtered "N of M — updating live" variant', async () => {
    const catalogue = makeMany(50);
    const filtered = makeMany(3);
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      Promise.resolve(
        pageOf(params.careLevels ? filtered : catalogue, params.page ?? 1)
      )
    );

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(screen.getByText(/no active filter/)).toBeInTheDocument();

    await user.click(filtersButton(0));
    await user.click(screen.getByRole('button', { name: 'Easy' }));

    await waitFor(() =>
      expect(screen.getByText(/of 50 — updating live/)).toBeInTheDocument()
    );
    // Strong "found" segment (also echoed by the rail header pill).
    expect(screen.getAllByText('3 plants').length).toBeGreaterThan(0);
    expect(screen.queryByText(/no active filter/)).not.toBeInTheDocument();
  });

  it('the grouped Vivace chip sums both counts and toggles both wire values atomically', async () => {
    mockFinderCatalog(makeMany(50), {
      facetCounts: [
        {
          field: 'lifeCycle',
          counts: [
            { value: 'Perennial', count: 263 },
            { value: 'HerbaceousPerennial', count: 209 },
          ],
        },
      ],
    });
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    // 263 + 209 — the grouped chip shows the SUM.
    await user.click(screen.getByRole('button', { name: 'Perennial (472)' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lifeCycles: ['Perennial', 'HerbaceousPerennial'],
          page: 1,
        }),
        expect.anything()
      )
    );
    // The button counts wire values — a grouped chip selects two.
    expect(filtersButton(2)).toBeInTheDocument();

    // Un-toggling removes BOTH wire values.
    await user.click(screen.getByRole('button', { name: 'Perennial (472)' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ lifeCycles: undefined }),
        expect.anything()
      )
    );
    expect(filtersButton(0)).toBeInTheDocument();
  });

  it('the rail header X closes the rail and keeps the selection', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    const rail = screen.getByRole('complementary', { name: 'Filters' });
    await user.click(within(rail).getByRole('button', { name: 'Easy' }));
    await waitFor(() => expect(filtersButton(1)).toBeInTheDocument());

    await user.click(within(rail).getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByRole('complementary', { name: 'Filters' })
    ).not.toBeInTheDocument();
    // The selection survives the close.
    expect(filtersButton(1)).toBeInTheDocument();
  });

  it('omits the zero-hit vocabulary values: no Biennial chip, no High watering chip', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    expect(
      screen.queryByRole('button', { name: /Biennial/ })
    ).not.toBeInTheDocument();
    // 'High' remains ONLY as a growth-rate chip — the watering one is omitted.
    expect(screen.getAllByRole('button', { name: 'High' })).toHaveLength(1);
    // Watering renders exactly its three real-data chips.
    expect(
      screen.getByRole('button', { name: 'Average' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Frequent' })
    ).toBeInTheDocument();
  });

  it('debounces typing — keystrokes coalesce into one fetch 300ms after the last', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    // fireEvent (not userEvent) under fake timers: one synchronous change per
    // keystroke, no userEvent-internal timer coupling — deterministic by
    // construction (the SMA-174 flake came from real-timer debounce races).
    vi.useFakeTimers();
    const callsAfterMount = vi.mocked(findPlants).mock.calls.length;
    const textbox = screen.getByRole('textbox');

    fireEvent.change(textbox, { target: { value: 'la' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    fireEvent.change(textbox, { target: { value: 'lav' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    // The 'la' timer was cancelled by the 'lav' keystroke; 'lav' fires at
    // +300ms — one tick early, nothing has fired yet.
    expect(vi.mocked(findPlants).mock.calls).toHaveLength(callsAfterMount);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(vi.mocked(findPlants).mock.calls).toHaveLength(callsAfterMount + 1);
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'lav', page: 1 }),
      expect.anything()
    );
  });

  it('a single character stays match-all — no fetch until a 2nd character', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    vi.useFakeTimers();
    const callsAfterMount = vi.mocked(findPlants).mock.calls.length;
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'l' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(vi.mocked(findPlants).mock.calls).toHaveLength(callsAfterMount);
    // The current list stays visible.
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
  });

  it('toggling two values in one facet sends both (OR) and updates the button count', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    // Desktop: the panel is a left rail (complementary landmark), the grid
    // stays rendered beside it.
    expect(
      screen.getByRole('complementary', { name: 'Filters' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);

    await user.click(screen.getByRole('button', { name: 'Easy' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ careLevels: ['Easy'], page: 1 }),
        expect.anything()
      )
    );
    expect(filtersButton(1)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Medium' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ careLevels: ['Easy', 'Medium'], page: 1 }),
        expect.anything()
      )
    );
    expect(filtersButton(2)).toBeInTheDocument();
  });

  it('selections across two facets combine (AND) — both param arrays sent', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([
      { id: 4, name: 'Ornamental', description: null },
    ]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    // within(rail): the quick row renders a chip with the same name.
    const rail = screen.getByRole('complementary', { name: 'Filters' });
    await user.click(within(rail).getByRole('button', { name: 'Ornamental' }));
    await user.click(within(rail).getByRole('button', { name: 'Annual' }));

    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          plantTypeIds: [4],
          lifeCycles: ['Annual'],
          page: 1,
        }),
        expect.anything()
      )
    );
    expect(filtersButton(2)).toBeInTheDocument();
  });

  it('Reset clears every facet selection but keeps the search text', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    // Type a real query (debounced, fake timers for determinism)…
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'lavender' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();

    // …then select a facet and reset it away.
    fireEvent.click(filtersButton(0));
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'lavender', careLevels: ['Easy'] }),
        expect.anything()
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'lavender', careLevels: undefined }),
        expect.anything()
      )
    );
    // The search text survives a facet reset (design brief). Named query:
    // with the rail open, the For-me location input is a textbox too.
    expect(
      screen.getByRole('textbox', { name: 'Search plants by name...' })
    ).toHaveValue('lavender');
    expect(filtersButton(0)).toBeInTheDocument();
  });

  it('facet chips carry live counts from facetCounts; absent values render count-less but stay clickable', async () => {
    mockFinderCatalog(makeMany(50), {
      facetCounts: [
        {
          field: 'careLevel',
          counts: [
            { value: 'Easy', count: 280 },
            { value: 'Medium', count: 210 },
            // 'Difficult' deliberately absent from the distribution.
          ],
        },
      ],
    });
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    expect(
      screen.getByRole('button', { name: 'Easy (280)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Medium (210)' })
    ).toBeInTheDocument();

    // Everything-shown rule: no count, no parentheses — but still toggleable.
    const difficult = screen.getByRole('button', { name: 'Difficult' });
    await user.click(difficult);
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ careLevels: ['Difficult'] }),
        expect.anything()
      )
    );
  });

  it('renders the For-me block: Soon pills, disabled garden select and location input, microcopy', async () => {
    mockFinderCatalog(makeMany(5));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    expect(screen.getByText('My gardens')).toBeInTheDocument();
    expect(screen.getByText('Location / climate')).toBeInTheDocument();
    expect(screen.getAllByText('Soon')).toHaveLength(2);
    // Future controls are visible as a promise but disabled until their
    // features land (SMA-256 / SMA-257).
    expect(screen.getByText('All my gardens')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('City or region…')).toBeDisabled();
    expect(screen.getByText(/Soon: enter your city/)).toBeInTheDocument();
    // Not clickable rows: no button carries the row labels.
    expect(
      screen.queryByRole('button', { name: /My gardens/ })
    ).not.toBeInTheDocument();
  });

  it('below md the panel opens as a full-screen drawer whose footer button closes it', async () => {
    mockMatchMedia(false); // mobile
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    expect(
      await screen.findByRole('heading', { name: 'Filters' })
    ).toBeInTheDocument();
    // Enriched header parity: Reset lives in the header now — exactly one
    // Reset in the drawer, none in the footer.
    expect(screen.getAllByRole('button', { name: 'Reset' })).toHaveLength(1);

    // Live filtering while open: toggle Easy, the footer count is the live
    // `found` (the mock keeps serving the same 50-item catalogue).
    await user.click(screen.getByRole('button', { name: 'Easy' }));
    const footer = await screen.findByRole('button', {
      name: 'See the 50 plants',
    });
    await user.click(footer);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'See the 50 plants' })
      ).not.toBeInTheDocument()
    );
    // The selection survives the close.
    expect(filtersButton(1)).toBeInTheDocument();
  });

  it('Load more fetches the next page and APPENDS it (server pagination)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48)
    );
    expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.anything()
    );
    // Page 1 cards are still present — appended, not replaced.
    expect(
      screen.getByRole('heading', { name: 'Plant 00' })
    ).toBeInTheDocument();

    // 50 total → the last page (2 items) exhausts the results; button gone.
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(50)
    );
    expect(
      screen.queryByRole('button', { name: 'Load more' })
    ).not.toBeInTheDocument();
  });

  it('keeps the loaded slice on a language change by refetching the loaded pages (SMA-153)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/library']}>
          <LangSwitch />
          <PlantLibrary />
        </MemoryRouter>
      </LanguageProvider>
    );
    await screen.findByRole('heading', { name: 'Plant 00' });

    // Grow to two loaded pages (24 → 48).
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48)
    );
    vi.mocked(findPlants).mockClear();

    // Switching language refetches BOTH loaded pages in the new lang (no
    // exact call count — an aborted first pass from the i18next `t` identity
    // change can add framework-noise calls; the contract is that both pages
    // were requested in fr).
    await user.click(screen.getByRole('button', { name: 'switch language' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
        expect.objectContaining({ lang: 'fr', page: 1 }),
        expect.anything()
      )
    );
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenCalledWith(
        expect.objectContaining({ lang: 'fr', page: 2 }),
        expect.anything()
      )
    );
    // …and the visible slice is preserved — no collapse back to 24 (SMA-153).
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(48)
    );
  });

  it('shows noResults (not noPlants) when a search matches nothing', async () => {
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      Promise.resolve(
        params.q
          ? { items: [], found: 0, page: 1, perPage: 24, facetCounts: [] }
          : pageOf(makeMany(5), 1)
      )
    );

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zz' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();

    expect(
      await screen.findByText('No plants match your search.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No plants found yet — check back soon!')
    ).not.toBeInTheDocument();
  });

  it('shows noPlants when the catalogue itself is empty (no filter active)', async () => {
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockResolvedValue({
      items: [],
      found: 0,
      page: 1,
      perPage: 24,
      facetCounts: [],
    });

    renderLibrary();

    expect(
      await screen.findByText('No plants found yet — check back soon!')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No plants match your search.')
    ).not.toBeInTheDocument();
  });

  it('surfaces a finder failure through the error alert', async () => {
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockRejectedValue(
      new Error('Failed to find plants: 503')
    );

    renderLibrary();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to find plants: 503'
    );
  });

  it('exposes a polite status region that tracks the loaded/total count (a11y)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Showing 24 of 50 plants');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(status).toHaveTextContent('Showing 48 of 50 plants')
    );
  });
});
