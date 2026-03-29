import type { Plant } from './Plant';

export interface GardenPlant {
  gardenId: string;
  plantId: string;
  addedAt: string;
  notes?: string;
  plant?: Plant;
}

export interface Garden {
  id: string;
  name: string;
  description?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  gardenPlants: GardenPlant[];
}
