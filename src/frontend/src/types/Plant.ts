import type { PlantType } from './PlantType';

export interface PlantTranslation {
  id: number;
  language: string;
  commonName: string;
  description: string | null;
}

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
}

export interface PlantLongDescription {
  id: number;
  language: string;
  longDescription: string;
  sourceMethod: string | null;
}

export interface PlantCommonName {
  id: number;
  languageCode: string;
  name: string;
  isPrimary: boolean;
}

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

export interface PlantSynonym {
  id: number;
  synonym: string;
  authority: string | null;
}

export interface PlantSource {
  id: number;
  sourceType: string;
  externalId: string;
  url: string | null;
  notes: string | null;
  lastFetchedAt: string | null;
}

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

export interface PlantPerenualData {
  id: string;
  perenualId: number;
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

  enrichmentSources: string[];
  lastEnrichmentAt: string | null;

  createdAt: string;
  updatedAt: string;

  translations: PlantTranslation[];
  images: PlantImage[];
  longDescriptions: PlantLongDescription[];
  commonNames: PlantCommonName[];
  pests: PlantPest[];
  synonyms: PlantSynonym[];
  sources: PlantSource[];

  trefleData: PlantTrefleData | null;
  perenualData: PlantPerenualData | null;
}
