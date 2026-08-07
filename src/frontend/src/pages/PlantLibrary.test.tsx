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
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { useLanguage } from '../hooks/useLanguage';
import type { Plant } from '../types/Plant';
import type { PlantType } from '../types/PlantType';
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
// SMA-9 T3 — boolean checkboxes, the removable active-filter chips row, the
// filtered-empty reset action and the SMA-271 error-state pins live at the
// end of the suite.

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
      {/* T4: the temperature slider reads the metric/imperial preference. */}
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/library']}>
          <PlantLibrary />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

// The panel-toggle pill; its accessible name carries the live selection count.
const filtersButton = (count: number) =>
  screen.getByRole('button', { name: `Filters · ${count}` });

// The removable active-filter chips (T3). They are the only deletable chips
// on the page, so MUI's delete affordance (CancelIcon) is their signature;
// each entry is the chip root, whose textContent is the chip label.
const activeChips = () =>
  screen
    .queryAllByTestId('CancelIcon')
    .map((icon) => icon.closest('.MuiChip-root') as HTMLElement);

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
      expect.objectContaining({
        page: 1,
        perPage: PER_PAGE,
        lang: 'en',
        q: undefined,
      }),
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
    expect(within(rail).getByRole('button', { name: 'Vegetable' })).toHaveClass(
      'MuiChip-filled'
    );

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

  it('ghost sizing: chips and the header pill keep the catalogue-count ghost while live counts shrink', async () => {
    const catalogueCounts = [
      {
        field: 'careLevel',
        counts: [
          { value: 'Easy', count: 280 },
          { value: 'Medium', count: 210 },
        ],
      },
    ];
    const filteredCounts = [
      { field: 'careLevel', counts: [{ value: 'Easy', count: 3 }] },
    ];
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      Promise.resolve(
        params.careLevels
          ? pageOf(makeMany(3), params.page ?? 1, {
              facetCounts: filteredCounts,
            })
          : pageOf(makeMany(50), params.page ?? 1, {
              facetCounts: catalogueCounts,
            })
      )
    );

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    const rail = screen.getByRole('complementary', { name: 'Filters' });
    await user.click(within(rail).getByRole('button', { name: 'Easy (280)' }));

    // Live layer: Easy shows the filtered count, Medium collapsed to bare —
    // that's the accessible name (the ghost is aria-hidden).
    const easy = await within(rail).findByRole('button', { name: 'Easy (3)' });
    const medium = within(rail).getByRole('button', { name: 'Medium' });
    // …but the hidden ghosts still reserve the CATALOGUE counts (the width
    // anchor: a value's unfiltered count is the widest it can ever show).
    expect(easy).toHaveTextContent('Easy (280)');
    expect(medium).toHaveTextContent('Medium (210)');
    // Header pill: visible = live found, ghost = catalogue total.
    const pill = within(rail).getByText('3 plants').closest('.MuiChip-root');
    expect(pill).toHaveTextContent('50 plants');
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
    expect(screen.getByRole('button', { name: 'Average' })).toBeInTheDocument();
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
    // Toggle state is exposed to AT, not only via color (a11y fix).
    expect(screen.getByRole('button', { name: 'Easy' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Difficult' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

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
    // 3 Soon pills since T4: the two For-me rows + the Coming-soon header.
    expect(screen.getAllByText('Soon')).toHaveLength(3);
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

  it('checking a boolean sends its wire param, bumps the button count and grows a bare-label active chip (T3)', async () => {
    mockFinderCatalog(makeMany(50), {
      facetCounts: [
        {
          field: 'isEdible',
          counts: [
            { value: 'true', count: 72 },
            { value: 'false', count: 452 },
            { value: 'unknown', count: 12 },
          ],
        },
      ],
    });
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    // The checkbox label carries the counted bucket ('true' for the direct
    // traits) — the unknown bucket is never rendered.
    const edible = screen.getByRole('checkbox', { name: 'Edible (72)' });
    expect(edible).not.toBeChecked();
    // The caption is wired to the checkbox via aria-describedby — real
    // semantics for AT, not just adjacent text.
    expect(
      screen.getByRole('checkbox', { name: 'Pet-safe' })
    ).toHaveAccessibleDescription('non-toxic to cats and dogs');
    await user.click(edible);

    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ isEdible: true, page: 1 }),
        expect.anything()
      )
    );
    expect(filtersButton(1)).toBeInTheDocument();
    // Boolean active chips are BARE labels (no "Section : " prefix — mockup).
    expect(activeChips().map((chip) => chip.textContent)).toEqual(['Edible']);
  });

  it('an enum selection grows a "Section : Value" active chip whose delete toggles the value off (T3)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(activeChips()).toHaveLength(0);

    await user.click(filtersButton(0));
    await user.click(screen.getByRole('button', { name: 'Easy' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ careLevels: ['Easy'] }),
        expect.anything()
      )
    );
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Care level : Easy',
    ]);

    // Deleting the chip = un-toggling the value (same state, same wire).
    await user.click(screen.getByTestId('CancelIcon'));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ careLevels: undefined }),
        expect.anything()
      )
    );
    expect(activeChips()).toHaveLength(0);
    expect(filtersButton(0)).toBeInTheDocument();
  });

  it('the grouped Vivace active chip is ONE chip whose delete removes BOTH wire values (T3)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    await user.click(screen.getByRole('button', { name: 'Perennial' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lifeCycles: ['Perennial', 'HerbaceousPerennial'],
        }),
        expect.anything()
      )
    );
    // Two wire values, ONE chip (the button count still says 2 — T2 rule).
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Life cycle : Perennial',
    ]);
    expect(filtersButton(2)).toBeInTheDocument();

    await user.click(screen.getByTestId('CancelIcon'));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ lifeCycles: undefined }),
        expect.anything()
      )
    );
    expect(filtersButton(0)).toBeInTheDocument();
  });

  it('"Clear all" clears every facet — enums and booleans — but keeps the search text (T3)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'lavender' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();

    fireEvent.click(filtersButton(0));
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pet-safe' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: 'lavender',
          careLevels: ['Easy'],
          // INVERTED polarity: the safety checkbox filters toxicity on FALSE.
          isToxicToPets: false,
        }),
        expect.anything()
      )
    );
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Care level : Easy',
      'Pet-safe',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: 'lavender',
          careLevels: undefined,
          isToxicToPets: undefined,
        }),
        expect.anything()
      )
    );
    // The whole row (chips + Clear all) is gone; the search text survives.
    expect(activeChips()).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: 'Clear all' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Search plants by name...' })
    ).toHaveValue('lavender');
  });

  // T4 sliders: the two hidden <input type=range> thumbs carry the row title
  // as their accessible name (aria-labelledby); a `change` on one commits
  // immediately (MUI fires onChangeCommitted for input-driven changes — the
  // keyboard path), which is exactly the component's commit-on-release seam.
  const sliderThumbs = (name: string | RegExp) =>
    screen.getAllByRole('slider', { name });

  it('committing the height slider sends the mapped cm range, grows the chip, delete resets to full (T4)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    fireEvent.click(filtersButton(0));

    // Compressed scale: indices 0..4 ↔ 0/50/100/200/300+ cm. Thumbs to
    // 1 ("0,5 m") and 3 ("2 m") → the mockup's 0.5–2 m example.
    const [minThumb, maxThumb] = sliderThumbs('Height');
    fireEvent.change(minThumb!, { target: { value: '1' } });
    fireEvent.change(maxThumb!, { target: { value: '3' } });

    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          heightCmMin: 50,
          heightCmMax: 200,
          page: 1,
        }),
        expect.anything()
      )
    );
    expect(filtersButton(1)).toBeInTheDocument();
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Height : 0.5 – 2 m',
    ]);

    // Chip delete = reset THAT range to the full track: params gone, slider
    // thumbs back on the ends, button count back to zero.
    fireEvent.click(screen.getByTestId('CancelIcon'));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          heightCmMin: undefined,
          heightCmMax: undefined,
        }),
        expect.anything()
      )
    );
    expect(activeChips()).toHaveLength(0);
    expect(filtersButton(0)).toBeInTheDocument();
    const [minAfter, maxAfter] = sliderThumbs('Height');
    expect(minAfter).toHaveValue('0');
    expect(maxAfter).toHaveValue('4');
  });

  it('the height top thumb on "3 m +" sends NO max param and reads the open label (T4)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    fireEvent.click(filtersButton(0));

    // Only the min thumb moves (index 3 = 2 m); the max stays on the open
    // band → half-open range.
    const [minThumb] = sliderThumbs('Height');
    fireEvent.change(minThumb!, { target: { value: '3' } });

    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ heightCmMin: 200 }),
        expect.anything()
      )
    );
    expect(vi.mocked(findPlants).mock.lastCall![0].heightCmMax).toBeUndefined();
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Height : 2 – 3 m +',
    ]);
  });

  it('the hardiness slider sends the USDA zone bounds and chips "zones 4 – 9" (T4 mockup example)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    fireEvent.click(filtersButton(0));

    const [minThumb, maxThumb] = sliderThumbs('Cold hardiness');
    fireEvent.change(minThumb!, { target: { value: '4' } });
    fireEvent.change(maxThumb!, { target: { value: '9' } });

    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ hardinessZoneMin: 4, hardinessZoneMax: 9 }),
        expect.anything()
      )
    );
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Hardiness : zones 4 – 9',
    ]);
    expect(filtersButton(1)).toBeInTheDocument();
  });

  it('"More filters" is collapsed by default with its hint, expands to the secondary sliders and traits (T4)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    fireEvent.click(filtersButton(0));

    // Collapsed at rest: N = the 8 controls inside (3 sliders + 5 traits),
    // hint line listing the content. The content stays MOUNTED (so the
    // toggle's aria-controls resolves) but Collapse's visibility:hidden
    // keeps it out of the a11y tree — role queries must come up empty.
    const moreButton = screen.getByRole('button', {
      name: 'More filters (8)',
    });
    expect(moreButton).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByText('watering pH · spacing · temperature · other traits')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /Medicinal/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryAllByRole('slider', { name: 'Watering pH' })
    ).toHaveLength(0);

    fireEvent.click(moreButton);
    expect(moreButton).toHaveAttribute('aria-expanded', 'true');
    // The hint collapses away once open; the three sliders and the five
    // trait checkboxes are live controls now.
    expect(
      screen.queryByText('watering pH · spacing · temperature · other traits')
    ).not.toBeInTheDocument();
    expect(sliderThumbs('Watering pH')).toHaveLength(2);
    expect(sliderThumbs('Spacing')).toHaveLength(2);
    expect(sliderThumbs('Temperature')).toHaveLength(2);
    for (const trait of [
      'Medicinal',
      'Salt tolerant',
      'Thorny',
      'Tropical',
      'Invasive',
    ]) {
      expect(screen.getByRole('checkbox', { name: trait })).not.toBeChecked();
    }

    // A bonus trait behaves like any hero boolean: direct-polarity wire
    // param + bare-label chip. N stays 8 — it counts controls, not picks.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Medicinal' }));
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({ isMedicinal: true }),
        expect.anything()
      )
    );
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Medicinal',
    ]);
    expect(filtersButton(1)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'More filters (8)' })
    ).toBeInTheDocument();
  });

  it('the spacing slider maps its cm track to wire inches (T4)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    fireEvent.click(filtersButton(0));
    fireEvent.click(screen.getByRole('button', { name: 'More filters (8)' }));

    const [minThumb, maxThumb] = sliderThumbs('Spacing');
    fireEvent.change(minThumb!, { target: { value: '50' } });
    fireEvent.change(maxThumb!, { target: { value: '100' } });

    // Display/wire split: the 50–100 cm selection travels as 20–39 in.
    await waitFor(() =>
      expect(vi.mocked(findPlants)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          xPlantSpacingValueMin: 20,
          xPlantSpacingValueMax: 39,
        }),
        expect.anything()
      )
    );
    expect(activeChips().map((chip) => chip.textContent)).toEqual([
      'Spacing : 50 – 100 cm',
    ]);
  });

  it('the Coming-soon block renders disabled previews that never fetch (T4)', async () => {
    mockFinderCatalog(makeMany(50));
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);

    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });
    fireEvent.click(filtersButton(0));

    // Scope every query to the block itself — 'Low'/'High' also exist as
    // enum facet chips higher in the panel.
    const blockRoot = screen
      .getByText('Coming soon in the Finder')
      .closest('[aria-disabled="true"]') as HTMLElement;
    expect(blockRoot).not.toBeNull();
    const block = within(blockRoot);
    expect(
      block.getByText(/their data is still incomplete/)
    ).toBeInTheDocument();
    // Every preview control is disabled: the habit and light chips, the 12
    // month buttons, the soil-pH slider.
    for (const label of [
      'Tree',
      'Shrub',
      'Climber',
      'Herbaceous',
      'Low',
      'High',
    ]) {
      expect(block.getByText(label).closest('.MuiChip-root')).toHaveClass(
        'Mui-disabled'
      );
    }
    const monthButtons = block
      .getAllByRole('button', { hidden: true })
      .filter((b) => /^[JFMASOND]$/.test(b.textContent ?? ''));
    expect(monthButtons).toHaveLength(12);
    for (const month of monthButtons) {
      expect(month).toBeDisabled();
    }
    // Clicking through the previews fires nothing — the fetch count is flat.
    const callsBefore = vi.mocked(findPlants).mock.calls.length;
    fireEvent.click(block.getByText('Tree'));
    fireEvent.click(monthButtons[0]!);
    expect(vi.mocked(findPlants).mock.calls.length).toBe(callsBefore);
  });

  it('the filtered empty state offers a reset that recovers the catalogue (T3)', async () => {
    const catalogue = makeMany(50);
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      Promise.resolve(
        params.careLevels
          ? { items: [], found: 0, page: 1, perPage: 24, facetCounts: [] }
          : pageOf(catalogue, params.page ?? 1)
      )
    );

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('heading', { name: 'Plant 00' });

    await user.click(filtersButton(0));
    await user.click(screen.getByRole('button', { name: 'Easy' }));
    expect(
      await screen.findByText('No plants match your search.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24)
    );
    expect(
      screen.queryByText('No plants match your search.')
    ).not.toBeInTheDocument();
    expect(filtersButton(0)).toBeInTheDocument();
  });

  it('an initial-fetch error keeps the finder controls and Retry recovers the grid in place (SMA-271)', async () => {
    const catalogue = makeMany(50);
    // Mutable failure switch (NOT a once-rejection): under StrictMode the
    // aborted first mount run may or may not consume a queued rejection, so
    // the failure must hold for every call until Retry is clicked.
    let apiDown = true;
    vi.mocked(fetchPlantTypes).mockResolvedValue([
      { id: 4, name: 'Ornamental', description: null },
    ]);
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      apiDown
        ? Promise.reject(new Error('Failed to find plants: 503'))
        : Promise.resolve(pageOf(catalogue, params.page ?? 1))
    );

    const user = userEvent.setup();
    renderLibrary();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to find plants: 503'
    );
    // The controls survive the error (the pre-T3 gate hid them — the page
    // was dead until a full reload).
    expect(
      screen.getByRole('textbox', { name: 'Search plants by name...' })
    ).toBeInTheDocument();
    expect(filtersButton(0)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    // Only the counter hides — its numbers would be stale.
    expect(screen.queryByText(/no active filter/)).not.toBeInTheDocument();

    apiDown = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    // In-place recovery: grid, counter and alert-lessness — no reload.
    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(24);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/no active filter/)).toBeInTheDocument();
  });

  it('Retry also recovers the plant types when their mount fetch died with the API (SMA-271 follow-up)', async () => {
    const catalogue = makeMany(50);
    // One switch downs BOTH endpoints — the realistic outage shape, and
    // deterministic under StrictMode (once-rejections are not).
    let apiDown = true;
    vi.mocked(fetchPlantTypes).mockImplementation(() =>
      apiDown
        ? Promise.reject(new Error('Failed to fetch plant types: 502'))
        : Promise.resolve([{ id: 4, name: 'Ornamental', description: null }])
    );
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      apiDown
        ? Promise.reject(new Error('Failed to find plants: 502'))
        : Promise.resolve(pageOf(catalogue, params.page ?? 1))
    );

    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('alert');
    // The types died with the API: the quick row is down to "All".
    expect(
      screen.queryByRole('button', { name: 'Ornamental' })
    ).not.toBeInTheDocument();

    apiDown = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    // The grid recovers AND the quick row fills in — no reload needed.
    await screen.findByRole('heading', { name: 'Plant 00' });
    expect(
      await screen.findByRole('button', { name: 'Ornamental' })
    ).toBeInTheDocument();
  });

  it('a stale Retry plant-types resolution never overwrites a fresher one (double-click race)', async () => {
    const catalogue = makeMany(50);
    let apiDown = true;
    // Controllable promises: each healthy fetchPlantTypes call parks its
    // resolver here so the test dictates resolution ORDER — no timers.
    const pendingTypes: Array<(types: PlantType[]) => void> = [];
    vi.mocked(fetchPlantTypes).mockImplementation(() =>
      apiDown
        ? Promise.reject(new Error('Failed to fetch plant types: 502'))
        : new Promise((resolve) => {
            pendingTypes.push(resolve);
          })
    );
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      apiDown
        ? Promise.reject(new Error('Failed to find plants: 502'))
        : Promise.resolve(pageOf(catalogue, params.page ?? 1))
    );

    renderLibrary();
    await screen.findByRole('alert');

    apiDown = false;
    // Two SYNCHRONOUS clicks: no microtask runs in between, so both see the
    // still-empty types list and issue two in-flight fetches (seq 1, seq 2).
    const retry = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(pendingTypes).toHaveLength(2));

    // The SECOND (fresher) request resolves first and commits…
    await act(async () => {
      pendingTypes[1]!([{ id: 2, name: 'Fruit', description: null }]);
    });
    expect(
      await screen.findByRole('button', { name: 'Fruit' })
    ).toBeInTheDocument();

    // …then the FIRST (stale) one resolves late: the sequence guard must
    // drop it — the committed list stays the fresher call's result.
    await act(async () => {
      pendingTypes[0]!([{ id: 1, name: 'Vegetable', description: null }]);
    });
    expect(
      screen.queryByRole('button', { name: 'Vegetable' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fruit' })).toBeInTheDocument();
  });

  it('a slow mount plant-types response never overwrites a fresher Retry commit (unified loader guard)', async () => {
    const catalogue = makeMany(50);
    // The CR round-3 scenario: /planttypes is SLOW (pending, not failed)
    // while the finder fails fast — Retry then races the still-in-flight
    // mount fetch. Every types call parks its resolver; the finder heals
    // via the switch.
    let finderDown = true;
    const pendingTypes: Array<(types: PlantType[]) => void> = [];
    vi.mocked(fetchPlantTypes).mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingTypes.push(resolve);
        })
    );
    vi.mocked(findPlants).mockImplementation((params: FindPlantsParams) =>
      finderDown
        ? Promise.reject(new Error('Failed to find plants: 502'))
        : Promise.resolve(pageOf(catalogue, params.page ?? 1))
    );

    renderLibrary();
    await screen.findByRole('alert');
    // Only the mount fetch(es) are in flight so far (two under StrictMode —
    // the first invalidated by the cleanup's sequence bump).
    const mountCalls = pendingTypes.length;
    expect(mountCalls).toBeGreaterThan(0);

    finderDown = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(pendingTypes).toHaveLength(mountCalls + 1));

    // The Retry fetch (freshest sequence) resolves FIRST and commits…
    await act(async () => {
      pendingTypes[mountCalls]!([{ id: 2, name: 'Fruit', description: null }]);
    });
    expect(
      await screen.findByRole('button', { name: 'Fruit' })
    ).toBeInTheDocument();

    // …then every mount fetch resolves late: all stale, all dropped.
    await act(async () => {
      for (const resolveMount of pendingTypes.slice(0, mountCalls)) {
        resolveMount([{ id: 1, name: 'Vegetable', description: null }]);
      }
    });
    expect(
      screen.queryByRole('button', { name: 'Vegetable' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fruit' })).toBeInTheDocument();
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
    // The drawer is a named modal dialog: its accessible name comes from the
    // header title via aria-labelledby (Major a11y fix).
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
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
        <UnitSystemProvider>
          <MemoryRouter initialEntries={['/library']}>
            <LangSwitch />
            <PlantLibrary />
          </MemoryRouter>
        </UnitSystemProvider>
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

// SMA-394 — the hidden plant. The key is matched BEFORE usePlantFinder runs, so
// it never reaches findPlants and therefore never lands in a proxy or
// search-engine access log; substituting the empty query also leaves the
// context UNFILTERED, so the counter and the facet counts cannot move. What the
// match changes is only what the grid renders: ONE ordinary card, which links
// to the plant's own page exactly like any other result. The route itself is
// covered in App.test.tsx, against App's real route table.
describe('PlantLibrary · hidden plant card (SMA-394)', () => {
  const searchBox = () =>
    screen.getByRole('textbox', { name: 'Search plants by name...' });

  // fireEvent.change commits the whole value at once — the "the key was typed"
  // scenario, with no intermediate query states racing the 300 ms debounce.
  const search = (value: string) =>
    fireEvent.change(searchBox(), { target: { value } });

  const CARD_NAME = 'えりな J';
  // The card's id IS this slug — that is what makes PlantCard link here with no
  // change to PlantCard, so asserting the href is asserting the whole mechanism.
  const SECRET_HREF = '/library/erina-j-mon-coeur-since-october-31-2024';

  async function renderSettled() {
    mockFinderCatalog([makeListItem()]);
    vi.mocked(fetchPlantTypes).mockResolvedValue([]);
    renderLibrary();
    await screen.findByRole('heading', { name: 'Achillea ptarmica' });
  }

  it('shows exactly one card, linking to the plant’s own page', async () => {
    await renderSettled();

    search('erina_j');

    // Card titles are the h6 headings — the same count the rest of this suite
    // uses to assert page size. Exactly one, and it is not the catalogue's.
    expect(screen.getAllByRole('heading', { level: 6 })).toHaveLength(1);
    const title = screen.getByRole('heading', { level: 6, name: CARD_NAME });
    expect(title.closest('a')).toHaveAttribute('href', SECRET_HREF);
    expect(screen.getByText('Erina J.')).toBeInTheDocument();
    // Our own artwork, served from public/ — no photograph, no credit line.
    expect(screen.getByAltText(CARD_NAME)).toHaveAttribute(
      'src',
      '/images/plants/erina-j.svg'
    );
    expect(
      screen.queryByRole('heading', { name: 'Achillea ptarmica' })
    ).not.toBeInTheDocument();
  });

  it('never sends the key to the finder — no q parameter reaches the network', async () => {
    await renderSettled();

    search('erina_j');

    // The direct proof of the pre-hook seam: findPlants writes `q` into the
    // request URL, so a key reaching it would be logged in clear text.
    const queries = vi
      .mocked(findPlants)
      .mock.calls.map(([params]) => params.q);
    expect(queries.every((q) => q === undefined)).toBe(true);
    expect(vi.mocked(findPlants)).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: expect.anything() }),
      expect.anything()
    );
  });

  it.each(['ERINA_J', '  erina_j  ', 'Erina J', 'Erina  J', 'erinaj'])(
    'matches %j — case, padding and inner whitespace insensitive',
    async (key) => {
      await renderSettled();

      search(key);

      expect(
        screen.getByRole('heading', { level: 6, name: CARD_NAME })
      ).toBeInTheDocument();
    }
  );

  it.each(['erina', 'erina_', 'erinaj_'])(
    'does not match the near miss %j',
    async (key) => {
      await renderSettled();

      search(key);

      expect(
        screen.queryByRole('heading', { name: CARD_NAME })
      ).not.toBeInTheDocument();
      // Falls through to the normal search path.
      expect(
        screen.getByRole('heading', { name: 'Achillea ptarmica' })
      ).toBeInTheDocument();
    }
  );

  it('returns to the normal catalogue when the field is cleared', async () => {
    await renderSettled();

    search('erina_j');
    expect(
      screen.getByRole('heading', { level: 6, name: CARD_NAME })
    ).toBeInTheDocument();

    search('');

    expect(
      screen.queryByRole('heading', { name: CARD_NAME })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Achillea ptarmica' })
    ).toBeInTheDocument();
  });
});
