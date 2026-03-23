import type { PlantType } from './PlantType';

export interface PlantTranslation {
  id: number;
  plantId: string;
  language: string;
  commonName: string;
  description: string | null;
}

export interface Plant {
  id: string;
  scientificName: string;
  plantTypeId: number;
  plantType: PlantType;
  sunExposure: string | null;
  waterNeeds: string | null;
  sowingPeriod: string | null;
  harvestPeriod: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  translations: PlantTranslation[];
  suggestions: unknown[];
}
