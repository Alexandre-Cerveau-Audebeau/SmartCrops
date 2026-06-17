import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { Plant, PlantPerenualData } from '../types/Plant';

vi.mock('../services/plantApi', () => ({
  fetchPlantById: vi.fn(),
}));
vi.mock('../services/gardenApi', () => ({
  fetchGardens: vi.fn().mockResolvedValue([]),
  addPlantToGarden: vi.fn().mockResolvedValue(undefined),
}));
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

// Avoid carrying the en/fr preference between tests — every spec assumes a
// fresh page boot with the default English locale.
beforeEach(() => {
  localStorage.clear();
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

function renderAtPlant(plant: Plant) {
  vi.mocked(fetchPlantById).mockResolvedValue(plant);
  return render(
    <LanguageProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/library/${plant.id}`]}>
          <Routes>
            <Route path="/library/:id" element={<PlantDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
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
    expect(screen.queryByText(/Pests & diseases \(/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Common names' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Botanical synonyms' })
    ).not.toBeInTheDocument();
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
    expect(screen.getByText(/Pests & diseases \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Aphids')).toBeInTheDocument();
    expect(screen.getByText('Powdery Mildew')).toBeInTheDocument();
  });

  it('always renders the "Scientific data (coming soon)" section regardless of enrichment state', async () => {
    renderAtPlant(makePlant());
    expect(
      await screen.findByRole('heading', {
        name: /Scientific data \(coming soon\)/,
      })
    ).toBeInTheDocument();
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
        name: /Scientific data \(Perenual Supreme\)/,
      })
    ).toBeInTheDocument();
    // Scoped to the F.6 section — the same value also appears in the hero gauge
    // row now (SMA-169, temporary hero/Characteristics duplication).
    const sciSection = document.getElementById('scientific-data');
    expect(sciSection).toBeTruthy();
    expect(within(sciSection!).getByText('18–24°C')).toBeInTheDocument();
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
      name: /Scientific data \(Perenual Supreme\)/,
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
        name: /Scientific data \(Perenual Supreme\)/,
      })
    ).not.toBeInTheDocument();
  });

  it('drops the temperatureRange and geoDistribution items from the F.5 placeholder', async () => {
    renderAtPlant(makePlant());
    await screen.findByRole('heading', { name: 'Basil' });
    expect(
      screen.queryByText('Optimal temperature range (°C)')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Geographic distribution')
    ).not.toBeInTheDocument();
    // Kept items still present.
    expect(screen.getByText('Required nutrients (NPK)')).toBeInTheDocument();
  });

  it('hides the Pests section when pests are empty', async () => {
    renderAtPlant(makePlant());
    await screen.findByRole('heading', { name: 'Basil' });
    expect(screen.queryByText(/Pests & diseases \(/)).not.toBeInTheDocument();
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

  it('shows a hardiness warning chip when zone min === max === 2', async () => {
    renderAtPlant(
      makePlant({
        hardinessZoneMin: 2,
        hardinessZoneMax: 2,
      })
    );
    await screen.findByRole('heading', { name: 'Basil' });
    // The warning icon's aria-label is the warning string; the chip itself reads "2".
    // Scoped to Characteristics — the hardiness gauge also shows "2" now (SMA-169).
    const charSection = document.getElementById('characteristics');
    expect(charSection).toBeTruthy();
    expect(within(charSection!).getByText('2')).toBeInTheDocument();
    // The warning icon (WarningAmber) renders with role="img" via testid-less material.
    // We test that the suspicious-flag path triggered by querying the warning tooltip title.
    const warningEls = charSection!.querySelectorAll(
      'svg[data-testid="WarningAmberIcon"]'
    );
    expect(warningEls.length).toBe(1);
  });

  it('does not show the hardiness warning for a normal zone range', async () => {
    renderAtPlant(
      makePlant({
        hardinessZoneMin: 5,
        hardinessZoneMax: 7,
      })
    );
    await screen.findByRole('heading', { name: 'Basil' });
    // Scoped to Characteristics — the hardiness gauge also shows "5-7" now (SMA-169).
    const charSection = document.getElementById('characteristics');
    expect(charSection).toBeTruthy();
    expect(within(charSection!).getByText('5-7')).toBeInTheDocument();
    const warningEls = charSection!.querySelectorAll(
      'svg[data-testid="WarningAmberIcon"]'
    );
    expect(warningEls.length).toBe(0);
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

  it('shows the correct "+N more" count on the gallery overlay (31 images → +25, not +26)', async () => {
    // Mirror Aloe vera's gallery shape from the production smoke matrix.
    const images = Array.from({ length: 31 }, (_, i) => ({
      id: i + 1,
      imageType: i === 0 ? 'Main' : 'Other',
      url: `https://img.test/aloe-${i}.jpg`,
      thumbnailUrl: `https://img.test/aloe-${i}-thumb.jpg`,
      width: null,
      height: null,
      licenseName: null,
      licenseUrl: null,
      credit: null,
      source: 'Trefle',
      sourceExternalId: null,
      displayOrder: i,
      isFlagged: false,
    }));
    renderAtPlant(makePlant({ images }));
    await screen.findByRole('heading', { name: 'Basil' });
    // GALLERY_PREVIEW_COUNT is 6, so 31 - 6 = 25 remaining (NOT 26 — the
    // overlay tile counts as one of the 6 preview slots).
    expect(screen.getByText('+25')).toBeInTheDocument();
    expect(screen.queryByText('+26')).not.toBeInTheDocument();
  });
});
