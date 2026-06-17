import type { PlantType } from './PlantType';

/** Localised display fields (common name + short description) per language. */
export interface PlantTranslation {
  id: number;
  language: string;
  commonName: string;
  description: string | null;
}

/** A categorised photo with licensing/attribution and per-source ordering. */
export interface PlantImage {
  id: number;
  imageType: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  licenseName: string | null;
  licenseUrl: string | null;
  credit: string | null;
  source: string;
  sourceExternalId: string | null;
  displayOrder: number;
  isFlagged: boolean;
  /**
   * Server-composed, always-non-null attribution line shipped by the detail DTO
   * via `ImageAttribution.Compose` (format "© credit — license"). NOT rendered
   * verbatim by the gallery: its format differs from the approved design
   * ("© credit · source · license"), so `PlantGallerySection` composes its own
   * line from credit/source/licenseName. Aligning the backend format is SMA-180.
   */
  attribution: string;
}

/** Long-form rich description in a single language, one row per locale. */
export interface PlantLongDescription {
  id: number;
  language: string;
  longDescription: string;
  sourceMethod: string | null;
}

/** A vernacular name in one language, with `isPrimary` flagging the preferred entry. */
export interface PlantCommonName {
  id: number;
  languageCode: string;
  name: string;
  isPrimary: boolean;
}

/** A pest or pathogen affecting the plant, sourced from Perenual today. */
export interface PlantPest {
  id: number;
  name: string;
  type: string;
  description: string | null;
  symptoms: string | null;
  solutions: string | null;
  imageUrl: string | null;
  source: string;
  sourceExternalId: string | null;
}

/** A historical / alternative scientific name used during ETL fuzzy match. */
export interface PlantSynonym {
  id: number;
  synonym: string;
  authority: string | null;
}

/** Cross-reference to an external taxonomy/enrichment API, with link metadata. */
export interface PlantSource {
  id: number;
  sourceType: string;
  externalId: string;
  url: string | null;
  notes: string | null;
  lastFetchedAt: string | null;
}

/** Trefle-specific structured data (1-1 with Plant); `RawResponseJson` is omitted from the DTO. */
export interface PlantTrefleData {
  id: string;
  trefleSlug: string | null;
  wfoId: string | null;
  growthHabit: string | null;
  flowerColors: string | null;
  foliageColors: string | null;
  nativeRegionsJson: string | null;
  introducedRegionsJson: string | null;
  soilNutrimentsLevel: number | null;
  soilSalinityLevel: number | null;
  atmosphericHumidityLevel: number | null;
  apiVersion: string | null;
  lastSyncAt: string;
}

/** Perenual-specific structured data (1-1 with Plant); `RawResponseJson` is omitted from the DTO. */
export interface PlantPerenualData {
  id: string;
  perenualId: number;
  /**
   * Id originally requested from Perenual. Differs from `perenualId` (the
   * canonical id returned by `response.id`) when Perenual rewrites the
   * server-side id mapping (cf. backend issue #67). Frontend prefers this
   * value when building user-facing public URLs so the link lands on the
   * correct species page. `null` on rows enriched before this column existed
   * — caller falls back to `perenualId`.
   */
  requestedPerenualId: number | null;
  cultivar: string | null;
  perenualType: string | null;
  originCountries: string | null;
  propagationMethods: string | null;
  wateringBenchmark: string | null;
  wateringBenchmarkUnit: string | null;
  sunlightPreferences: string | null;
  pruningMonths: string | null;
  maintenance: string | null;
  floweringSeason: string | null;
  harvestSeason: string | null;
  hasEdibleFruit: boolean | null;
  hasEdibleLeaves: boolean | null;
  isCulinary: boolean | null;
  plantAnatomyJson: string | null;
  apiVersion: string | null;
  hasSupremeData: boolean;
  lastSyncAt: string;
  // Perenual Supreme xData (Sprint 1.5 PR B) — surfaced in Section F.6 (Phase 3).
  xWateringBasedTempMinC: number | null;
  xWateringBasedTempMaxC: number | null;
  xWateringPhMin: number | null;
  xWateringPhMax: number | null;
  xSunlightHoursMin: number | null;
  xSunlightHoursMax: number | null;
  xTemperatureToleranceMinC: number | null;
  xTemperatureToleranceMaxC: number | null;
  xPlantSpacingValue: number | null;
  xPlantSpacingUnit: string | null;
  xWateringQualityJson: string | null;
  xWateringPeriodJson: string | null;
}

/**
 * Mirrors `SmartCrops.Api.Dtos.PlantDetailResponse`. Enum-typed scalars arrive
 * as strings (the backend mapper applies `.ToString()`); the frontend resolves
 * human labels via `plantDetail.enumValues.*` i18n keys.
 */
export interface Plant {
  id: string;
  scientificName: string;
  plantTypeId: number;
  plantType: PlantType | null;

  sunExposure: string | null;
  waterNeeds: string | null;
  sowingPeriod: string | null;
  harvestPeriod: string | null;
  imageUrl: string | null;
  /** Attribution line for {@link imageUrl} — only the list DTO carries it (the detail view attributes per gallery image), so optional. */
  imageAttribution?: string | null;
  /** Localised common name (list DTO, `?lang=`); optional — detail uses {@link translations}/{@link commonNames} instead. */
  commonName?: string | null;
  /** Localised short description (list DTO, `?lang=`); optional. */
  description?: string | null;

  gbifTaxonKey: number | null;
  family: string | null;
  genus: string | null;
  speciesEpithet: string | null;
  author: string | null;
  wfoId: string | null;
  year: number | null;

  lifeCycle: string | null;
  growthRate: string | null;
  wateringNeedLevel: string | null;
  careLevel: string | null;
  growthHabit: string | null;

  hardinessZoneMin: number | null;
  hardinessZoneMax: number | null;
  minHeightCm: number | null;
  maxHeightCm: number | null;
  minSpreadCm: number | null;
  maxSpreadCm: number | null;
  soilPhMin: number | null;
  soilPhMax: number | null;
  lightLevel: number | null;
  soilNutriments: number | null;
  minTempC: number | null;
  maxTempC: number | null;

  isEdible: boolean | null;
  isVegetable: boolean | null;
  isMedicinal: boolean | null;
  isIndoor: boolean | null;
  isDroughtTolerant: boolean | null;
  isSaltTolerant: boolean | null;
  isThorny: boolean | null;
  isInvasive: boolean | null;
  isTropical: boolean | null;
  isToxicToHumans: boolean | null;
  isToxicToPets: boolean | null;
  attractsPollinators: boolean | null;

  flowerColors: string | null;
  nativeRegions: string | null;
  introducedRegions: string | null;
  edibleParts: string | null;
  sowingInstructions: string | null;
  propagationInstructions: string | null;

  enrichmentSources: readonly string[];
  lastEnrichmentAt: string | null;

  createdAt: string;
  updatedAt: string;

  // Collections mirror the backend `IReadOnlyList<T>` contract — surfacing
  // them as `readonly` here prevents callers from accidentally mutating
  // shared Plant state (e.g. via `plant.images.sort(...)`); use a spread
  // (`[...plant.images].sort()`) or array methods that return a new array.
  // Optional: the neutral list DTO (PlantListItemResponse, PR #100) omits
  // translations, so list-sourced Plant objects carry none at runtime. Marked
  // optional so the type forces a guard at every access site (SMA-73).
  translations?: readonly PlantTranslation[];
  images: readonly PlantImage[];
  longDescriptions: readonly PlantLongDescription[];
  commonNames: readonly PlantCommonName[];
  pests: readonly PlantPest[];
  synonyms: readonly PlantSynonym[];
  sources: readonly PlantSource[];

  trefleData: PlantTrefleData | null;
  perenualData: PlantPerenualData | null;
}
