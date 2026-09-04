import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import type { Plant, PlantPerenualData } from '../types/Plant';

vi.mock('../services/plantApi', () => ({
  fetchPlantById: vi.fn(),
}));
// gardenApi mock dropped with the Add-to-my-garden flow (SMA-6 Option A):
// PlantDetail no longer imports it — the hero/CTA actions are plain links.
vi.mock('../services/authApi', () => ({
  fetchMe: vi.fn().mockRejectedValue(new Error('Not authenticated')),
}));
vi.mock('../services/adminApi', () => ({
  reEnrichTrefle: vi.fn(),
  reEnrichPerenual: vi.fn(),
  classifyReEnrich: vi.fn(),
}));

import PlantDetail from './PlantDetail';
import { fetchPlantById } from '../services/plantApi';
import { classifyReEnrich, reEnrichTrefle } from '../services/adminApi';
import type { ReEnrichResponse } from '../services/adminApi';
import { fetchMe } from '../services/authApi';

// Every spec queries English labels; since SMA-393 the no-choice default is
// French, so English is set the way a returning visitor sets it — the stored
// key wins when LanguageProvider re-applies it on mount.
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('smartcrops-language', 'en');
});

afterEach(() => {
  vi.clearAllMocks();
});

function makePlant(overrides: Partial<Plant> = {}): Plant {
  const base: Plant = {
    id: '00000000-0000-0000-0000-000000000001',
    scientificName: 'Ocimum basilicum',
    plantTypeId: 3,
    plantType: { id: 3, name: 'Herb', description: null },
    sunExposure: null,
    waterNeeds: null,
    sowingPeriod: null,
    harvestPeriod: null,
    imageUrl: null,
    gbifTaxonKey: 5341523,
    family: 'Lamiaceae',
    genus: 'Ocimum',
    speciesEpithet: 'basilicum',
    author: 'L.',
    wfoId: null,
    year: null,
    lifeCycle: null,
    growthRate: null,
    wateringNeedLevel: null,
    careLevel: null,
    growthHabit: null,
    hardinessZoneMin: null,
    hardinessZoneMax: null,
    minHeightCm: null,
    maxHeightCm: null,
    minSpreadCm: null,
    maxSpreadCm: null,
    soilPhMin: null,
    soilPhMax: null,
    lightLevel: null,
    soilNutriments: null,
    minTempC: null,
    maxTempC: null,
    isEdible: null,
    isVegetable: null,
    isMedicinal: null,
    isIndoor: null,
    isDroughtTolerant: null,
    isSaltTolerant: null,
    isThorny: null,
    isInvasive: null,
    isTropical: null,
    isToxicToHumans: null,
    isToxicToPets: null,
    attractsPollinators: null,
    flowerColors: null,
    nativeRegions: null,
    introducedRegions: null,
    edibleParts: null,
    sowingInstructions: null,
    propagationInstructions: null,
    enrichmentSources: ['Manual', 'GBIF'],
    lastEnrichmentAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    translations: [
      {
        id: 1,
        language: 'en',
        commonName: 'Basil',
        description: 'Sweet basil short description.',
      },
      {
        id: 2,
        language: 'fr',
        commonName: 'Basilic',
        description: 'Description courte du basilic.',
      },
    ],
    images: [],
    longDescriptions: [],
    commonNames: [],
    pests: [],
    synonyms: [],
    sources: [],
    trefleData: null,
    perenualData: null,
  };
  return { ...base, ...overrides };
}

function makePerenualData(
  overrides: Partial<PlantPerenualData> = {}
): PlantPerenualData {
  const base: PlantPerenualData = {
    id: 'pd-1',
    perenualId: 728,
    requestedPerenualId: 728,
    cultivar: null,
    perenualType: null,
    originCountries: null,
    propagationMethods: null,
    wateringBenchmark: null,
    wateringBenchmarkUnit: null,
    sunlightPreferences: null,
    pruningMonths: null,
    maintenance: null,
    floweringSeason: null,
    harvestSeason: null,
    hasEdibleFruit: null,
    hasEdibleLeaves: null,
    isCulinary: null,
    plantAnatomyJson: null,
    apiVersion: 'v2',
    hasSupremeData: false,
    lastSyncAt: '2026-01-01T00:00:00Z',
    xWateringBasedTempMinC: null,
    xWateringBasedTempMaxC: null,
    xWateringPhMin: null,
    xWateringPhMax: null,
    xSunlightHoursMin: null,
    xSunlightHoursMax: null,
    xTemperatureToleranceMinC: null,
    xTemperatureToleranceMaxC: null,
    xPlantSpacingValue: null,
    xPlantSpacingUnit: null,
    xWateringQualityJson: null,
    xWateringPeriodJson: null,
  };
  return { ...base, ...overrides };
}

// SMA-309 R2: renders the garden id it landed on — proves the back affordance
// returns to the RIGHT garden's planner, not just any planner route.
function PlannerProbe() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="planner-probe">{id}</div>;
}

function renderAtPlant(plant: Plant, entryState?: unknown) {
  vi.mocked(fetchPlantById).mockResolvedValue(plant);
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <AuthProvider>
          <MemoryRouter
            initialEntries={[
              // A plain visit carries state null — exactly what a pasted or
              // bookmarked /library URL has (SMA-309 R2).
              { pathname: `/library/${plant.id}`, state: entryState ?? null },
            ]}
          >
            <Routes>
              <Route path="/library/:id" element={<PlantDetail />} />
              <Route path="/gardens/:id/planner" element={<PlannerProbe />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

describe('PlantDetail', () => {
  it('renders a minimal (non-enriched) plant without crashing and falls back to the short translation description', async () => {
    renderAtPlant(makePlant());

    expect(
      await screen.findByRole('heading', { name: 'Basil' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sweet basil short description.')
    ).toBeInTheDocument();
    // Empty collections → conditional sections must be absent.
    expect(screen.queryByText(/Diseases & pests \(/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Common names' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Botanical synonyms' })
    ).not.toBeInTheDocument();
  });

  it('has no Add-to-my-garden action anymore — the hero/CTA route to the gardens page (SMA-6 Option A)', async () => {
    renderAtPlant(makePlant());

    await screen.findByRole('heading', { name: 'Basil' });
    expect(screen.queryByText('Add to my garden')).not.toBeInTheDocument();
    const planLinks = screen.getAllByRole('link', { name: 'Plan my garden' });
    expect(planLinks.length).toBeGreaterThan(0);
    planLinks.forEach((link) => expect(link).toHaveAttribute('href', '/gardens'));
  });

  it('renders the rich (tomato-shaped) plant with images and pests', async () => {
    renderAtPlant(
      makePlant({
        id: '00000000-0000-0000-0000-0000000000aa',
        scientificName: 'Solanum lycopersicum',
        translations: [
          { id: 10, language: 'en', commonName: 'Tomato', description: null },
          { id: 11, language: 'fr', commonName: 'Tomate', description: null },
        ],
        images: [
          {
            id: 1,
            imageType: 'Main',
            url: 'https://img.test/main.jpg',
            thumbnailUrl: 'https://img.test/thumb.jpg',
            width: 800,
            height: 600,
            licenseName: 'CC BY-SA 4.0',
            licenseUrl: null,
            credit: 'Photographer',
            source: 'Perenual',
            sourceExternalId: null,
            displayOrder: 0,
            isFlagged: false,
            attribution: '© Photographer — CC BY-SA 4.0',
          },
        ],
        longDescriptions: [
          {
            id: 5,
            language: 'en',
            longDescription: 'Tomato is a warm-season crop.',
            sourceMethod: 'perenual',
          },
        ],
        pests: [
          {
            id: 1,
            name: 'Aphids',
            type: 'Insect',
            description: null,
            symptoms: null,
            solutions: null,
            imageUrl: null,
            source: 'perenual',
            sourceExternalId: null,
          },
          {
            id: 2,
            name: 'Powdery Mildew',
            type: 'Fungus',
            description: null,
            symptoms: null,
            solutions: null,
            imageUrl: null,
            source: 'perenual',
            sourceExternalId: null,
          },
        ],
        enrichmentSources: ['Manual', 'GBIF', 'Perenual'],
      })
    );

    expect(
      await screen.findByRole('heading', { name: 'Tomato' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tomato is a warm-season crop.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Diseases & pests' })
    ).toBeInTheDocument();
    expect(screen.getByText('Aphids')).toBeInTheDocument();
    expect(screen.getByText('Powdery Mildew')).toBeInTheDocument();
  });

  it('renders Section F.6 when hasSupremeData and at least one xData field is present', async () => {
    renderAtPlant(
      makePlant({
        enrichmentSources: ['Manual', 'GBIF', 'Perenual'],
        perenualData: makePerenualData({
          hasSupremeData: true,
          xWateringBasedTempMinC: 18,
          xWateringBasedTempMaxC: 24,
          xWateringQualityJson: '["Rainwater"]',
        }),
      })
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Scientific data · cultivation / greenhouse',
      })
    ).toBeInTheDocument();
    // Scoped to the F.6 section — the same value also appears in the hero gauge
    // row now (SMA-169, temporary hero/Characteristics duplication).
    const sciSection = document.getElementById('scientific-data');
    expect(sciSection).toBeTruthy();
    expect(within(sciSection!).getByText('18–24 °C')).toBeInTheDocument();
    // Water-quality chip is i18n-labelled via toCamelKey lookup.
    expect(screen.getByText('Rainwater')).toBeInTheDocument();
  });

  it('hides individual F.6 rows whose xData field is null', async () => {
    renderAtPlant(
      makePlant({
        perenualData: makePerenualData({
          hasSupremeData: true,
          // pH absent, temperature present.
          xWateringPhMin: null,
          xWateringPhMax: null,
          xWateringBasedTempMinC: 18,
          xWateringBasedTempMaxC: 24,
        }),
      })
    );
    await screen.findByRole('heading', {
      name: 'Scientific data · cultivation / greenhouse',
    });
    expect(screen.queryByText('Watering pH range')).not.toBeInTheDocument();
    expect(screen.getByText('Ideal watering temperature')).toBeInTheDocument();
  });

  it('does NOT render Section F.6 when hasSupremeData is true but every xData field is null', async () => {
    renderAtPlant(
      makePlant({ perenualData: makePerenualData({ hasSupremeData: true }) })
    );
    await screen.findByRole('heading', { name: 'Basil' });
    expect(
      screen.queryByRole('heading', {
        name: 'Scientific data · cultivation / greenhouse',
      })
    ).not.toBeInTheDocument();
  });

  it('hides the Pests section when pests are empty', async () => {
    renderAtPlant(makePlant());
    await screen.findByRole('heading', { name: 'Basil' });
    expect(screen.queryByText(/Diseases & pests \(/)).not.toBeInTheDocument();
  });

  it('hides the Common names section when only one common name exists', async () => {
    renderAtPlant(
      makePlant({
        commonNames: [
          { id: 1, languageCode: 'en', name: 'Sweet basil', isPrimary: true },
        ],
      })
    );
    await screen.findByRole('heading', { name: 'Basil' });
    expect(
      screen.queryByRole('heading', { name: 'Common names' })
    ).not.toBeInTheDocument();
  });

  it('renders the Characteristics bar-gauge section (SMA-39)', async () => {
    renderAtPlant(makePlant());
    await screen.findByRole('heading', { name: 'Basil' });
    const charSection = document.getElementById('characteristics');
    expect(charSection).toBeTruthy();
    // Bar labels come from i18n; assert the first and last gauges render.
    expect(within(charSection!).getByText('Light')).toBeInTheDocument();
    expect(
      within(charSection!).getByText('Frost tolerance')
    ).toBeInTheDocument();
    // TOC contract: section 06 is now always "live" → a clickable anchor to it.
    expect(document.querySelector('a[href="#characteristics"]')).toBeTruthy();
  });

  it('uses the inline SVG placeholder when the plant has no images and no legacy imageUrl', async () => {
    renderAtPlant(makePlant());
    const heroImg = await waitFor(
      () => screen.getByAltText('Basil') as HTMLImageElement
    );
    expect(heroImg.src.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('renders the hero as a keyboard-accessible button when images are present', async () => {
    renderAtPlant(
      makePlant({
        images: [
          {
            id: 1,
            imageType: 'Habit',
            url: 'https://img.test/habit.jpg',
            thumbnailUrl: null,
            width: null,
            height: null,
            licenseName: null,
            licenseUrl: null,
            credit: null,
            source: 'Trefle',
            sourceExternalId: null,
            displayOrder: 0,
            isFlagged: false,
            attribution: '© Trefle',
          },
        ],
      })
    );
    await screen.findByRole('heading', { name: 'Basil' });
    // The hero is exposed as a <button> with the openHero aria-label; tab order
    // therefore reaches it and Enter / Space triggers the lightbox.
    const heroButton = screen.getByRole('button', {
      name: 'Open photo gallery',
    });
    expect(heroButton.tagName).toBe('BUTTON');
  });

  it('shows the gallery empty state, still listed in the TOC, when the plant has no stable images (SMA-154)', async () => {
    // Base plant has images: [] → no stable gallery pool.
    renderAtPlant(makePlant());
    await screen.findByRole('heading', { name: 'Basil' });
    expect(
      screen.getByText('No photos yet for this plant.')
    ).toBeInTheDocument();
    // The gallery section always renders now, so the TOC always links to it.
    expect(screen.getByRole('link', { name: 'Photo gallery' })).toHaveAttribute(
      'href',
      '#gallery'
    );
  });

  it('renders the gallery inline (grid tile + attribution, no modal) for a plant with stable images (SMA-154)', async () => {
    renderAtPlant(
      makePlant({
        images: [
          {
            id: 1,
            imageType: 'Flower',
            url: 'https://img.test/flower.jpg',
            thumbnailUrl: 'https://img.test/flower-thumb.jpg',
            width: 100,
            height: 100,
            licenseName: 'CC BY-SA',
            licenseUrl: null,
            credit: 'Photographer',
            source: 'Trefle',
            sourceExternalId: null,
            displayOrder: 0,
            isFlagged: false,
            attribution: '© Photographer — CC BY-SA',
          },
        ],
      })
    );
    await screen.findByRole('heading', { name: 'Basil' });

    // Tile rendered inline — no "view all" button, no modal. (The hero is also a
    // button labelled "Open photo gallery"; match the tile's lightbox label.)
    expect(
      screen.getByRole('button', { name: /Open photo 1 in lightbox/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /View all photos/ })
    ).toBeNull();
    // Credit / license line ("{credit} · {license}", design format) under the
    // tile. Scoped to the gallery section because the same attribution now also
    // renders as the hero image overlay (SMA-39).
    const gallerySection = document.getElementById('gallery');
    expect(gallerySection).not.toBeNull();
    expect(
      within(gallerySection!).getByText('Photographer · CC BY-SA')
    ).toBeInTheDocument();
  });

  it('opens the lightbox with a type badge, counter, composed attribution, and bounded zoom (SMA-154)', async () => {
    const user = userEvent.setup();
    renderAtPlant(
      makePlant({
        images: [
          {
            id: 1,
            imageType: 'Flower',
            url: 'https://img.test/flower.jpg',
            thumbnailUrl: 'https://img.test/flower-thumb.jpg',
            width: 100,
            height: 100,
            licenseName: 'CC BY-SA',
            licenseUrl: null,
            credit: 'Photographer',
            source: 'Trefle',
            sourceExternalId: null,
            displayOrder: 0,
            isFlagged: false,
            attribution: '© Photographer — CC BY-SA',
          },
        ],
      })
    );
    await screen.findByRole('heading', { name: 'Basil' });

    await user.click(
      screen.getByRole('button', { name: 'Open photo gallery' })
    );
    const dialog = within(screen.getByRole('dialog'));

    // Type badge, counter, and composed attribution — scoped to the lightbox.
    expect(dialog.getByText('Flower')).toBeInTheDocument();
    expect(dialog.getByText('1 / 1')).toBeInTheDocument();
    expect(
      dialog.getByText('© Photographer · Trefle · CC BY-SA')
    ).toBeInTheDocument();

    // Zoom is clamped: out is disabled at 1×, in is disabled at the 3× ceiling.
    const zoomIn = dialog.getByRole('button', { name: 'Zoom in' });
    const zoomOut = dialog.getByRole('button', { name: 'Zoom out' });
    expect(zoomOut).toBeDisabled();
    await user.click(zoomIn); // 1.5×
    expect(zoomOut).toBeEnabled();
    await user.click(zoomIn); // 2×
    await user.click(zoomIn); // 2.5×
    await user.click(zoomIn); // 3× — ceiling
    expect(zoomIn).toBeDisabled();
  });

  it('navigates the lightbox with the arrow keys (SMA-154)', async () => {
    const user = userEvent.setup();
    const stable = (id: number, imageType: string) => ({
      id,
      imageType,
      url: `https://img.test/${id}.jpg`,
      thumbnailUrl: null,
      width: null,
      height: null,
      licenseName: null,
      licenseUrl: null,
      credit: null,
      source: 'Trefle',
      sourceExternalId: null,
      displayOrder: id,
      isFlagged: false,
      attribution: '© Trefle',
    });
    renderAtPlant(
      makePlant({ images: [stable(1, 'Flower'), stable(2, 'Fruit')] })
    );
    await screen.findByRole('heading', { name: 'Basil' });

    await user.click(
      screen.getByRole('button', { name: 'Open photo gallery' })
    );
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('1 / 2')).toBeInTheDocument();

    // Zoom in, then navigate — zoom must reset to 1× on the new image, which we
    // observe via the zoom-out button going back to disabled.
    const zoomOut = dialog.getByRole('button', { name: 'Zoom out' });
    await user.click(dialog.getByRole('button', { name: 'Zoom in' }));
    expect(zoomOut).toBeEnabled();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(dialog.getByText('2 / 2')).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // wraps to the first
    expect(dialog.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' }); // wraps back to the last
    expect(dialog.getByText('2 / 2')).toBeInTheDocument();
  });
});

// SMA-309 R2 — the back-to-garden affordance rides router state (the
// PlantsInGardenSection mechanism, now shared by the placement panel's link):
// present when the visit carries the planner origin, absent on a direct visit.
describe('PlantDetail back-to-garden affordance (SMA-309 R2)', () => {
  it('offers the way back to the RIGHT garden when arriving with the planner origin', async () => {
    renderAtPlant(makePlant(), {
      from: 'planner',
      gardenId: 'g1',
      gardenName: 'Test garden',
    });
    const back = await screen.findByRole('button', {
      name: 'Back to Test garden',
    });
    fireEvent.click(back);
    // Landed on /gardens/:id/planner for the SAME garden the state named.
    expect(screen.getByTestId('planner-probe')).toHaveTextContent('g1');
  });

  it('renders no back affordance when reached directly', async () => {
    renderAtPlant(makePlant());
    await screen.findByRole('heading', { name: 'Basil' });
    expect(screen.queryByRole('button', { name: /Back to/ })).toBeNull();
  });
});

// SMA-421 (S11): the catalogue page is keyed on the route id (remount per
// plant) and fetches through usePlant (an admin reload happens in place, the
// plant on screen stays up).
describe('PlantDetail keyed per route id and in-place reload (SMA-421 S11)', () => {
  const flowerImage = {
    id: 1,
    imageType: 'Flower',
    url: 'https://img.test/flower.jpg',
    thumbnailUrl: 'https://img.test/flower-thumb.jpg',
    width: 100,
    height: 100,
    licenseName: 'CC BY-SA',
    licenseUrl: null,
    credit: 'Photographer',
    source: 'Trefle',
    sourceExternalId: null,
    displayOrder: 0,
    isFlagged: false,
    attribution: '© Photographer — CC BY-SA',
  };
  const mint = makePlant({
    id: '00000000-0000-0000-0000-000000000002',
    scientificName: 'Mentha piperita',
    translations: [
      {
        id: 3,
        language: 'en',
        commonName: 'Peppermint',
        description: 'Peppermint short description.',
      },
      {
        id: 4,
        language: 'fr',
        commonName: 'Menthe poivrée',
        description: 'Description courte de la menthe.',
      },
    ],
  });

  it('remounts on a /library/:id change: the previous plant and its open lightbox are gone', async () => {
    const user = userEvent.setup();
    const basil = makePlant({ images: [flowerImage] });
    vi.mocked(fetchPlantById).mockImplementation((id) =>
      Promise.resolve(id === mint.id ? mint : basil)
    );
    function GoToMint() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(`/library/${mint.id}`)}>
          go-to-mint
        </button>
      );
    }
    render(
      <LanguageProvider>
        <UnitSystemProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/library/${basil.id}`]}>
              <GoToMint />
              <Routes>
                <Route path="/library/:id" element={<PlantDetail />} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </UnitSystemProvider>
      </LanguageProvider>
    );
    await screen.findByRole('heading', { name: 'Basil' });
    await user.click(
      screen.getByRole('button', { name: 'Open photo gallery' })
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The open modal hides its siblings from role queries — target the text.
    fireEvent.click(screen.getByText('go-to-mint'));

    await screen.findByRole('heading', { name: 'Peppermint' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Basil' })).toBeNull();
    expect(fetchPlantById).toHaveBeenLastCalledWith(
      mint.id,
      expect.anything()
    );
  });

  it('an admin re-enrich refetches in place: no spinner, the plant and its toast stay mounted', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMe).mockResolvedValueOnce({
      userId: 'u-admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      isAdmin: true,
    });
    vi.mocked(reEnrichTrefle).mockResolvedValue({
      matched: true,
      imagesAdded: 1,
      commonNamesAdded: 0,
      synonymsAdded: 0,
    } as ReEnrichResponse);
    vi.mocked(classifyReEnrich).mockReturnValue('matched');

    const plant = makePlant();
    let resolveReload!: (reloaded: Plant) => void;
    vi.mocked(fetchPlantById)
      .mockResolvedValueOnce(plant)
      .mockImplementationOnce(
        () =>
          new Promise<Plant>((resolve) => {
            resolveReload = resolve;
          })
      );
    renderAtPlant(plant);
    await screen.findByRole('heading', { name: 'Basil' });

    await user.click(
      await screen.findByRole('button', { name: 'Admin actions' })
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Re-enrich from Trefle' })
    );

    // The success toast is page state: it survives only if the page did NOT
    // remount for the reload.
    const toastText = 'Trefle: 1 images, 0 common names, 0 synonyms added.';
    await screen.findByText(toastText);
    await waitFor(() => expect(fetchPlantById).toHaveBeenCalledTimes(2));
    expect(fetchPlantById).toHaveBeenLastCalledWith(
      plant.id,
      expect.anything()
    );
    // In flight: no spinner, the current plant is still on screen.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Basil' })).toBeInTheDocument();

    // The refreshed payload renders (a photo now exists) and the toast is
    // still there.
    resolveReload({ ...plant, images: [flowerImage] });
    expect(
      await screen.findByRole('button', { name: 'Open photo gallery' })
    ).toBeInTheDocument();
    expect(screen.getByText(toastText)).toBeInTheDocument();
  });
});
