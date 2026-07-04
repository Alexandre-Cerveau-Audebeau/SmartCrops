import type { PlantFinderFilters } from '../hooks/usePlantFinder';

/**
 * One enum facet of the Library filter panel (SMA-9 T2).
 * Values mirror the backend C# enum member names EXACTLY — they are the wire
 * values sent as repeated query keys AND the strings facetCounts returns.
 * The 'unknown' sentinel is never listed: it is an engine-side detail the
 * backend ORs into every selection ("absence never excludes", SMA-9) and must
 * never render as a chip.
 */
export interface EnumFacetConfig {
  /** Key into PlantFinderFilters (the query param name). */
  filterKey: Exclude<keyof PlantFinderFilters, 'plantTypeIds'>;
  /** Field name in the API's facetCounts payload. */
  facetField: 'careLevel' | 'wateringNeedLevel' | 'lifeCycle' | 'growthRate';
  /** i18n key of the section title. */
  titleKey: string;
  /** Wire values, in display order. Labels: library.filters.values.<facetField>.<value>. */
  values: string[];
}

/** Panel display order (after the Plant type section). */
export const ENUM_FACETS: EnumFacetConfig[] = [
  {
    filterKey: 'careLevels',
    facetField: 'careLevel',
    titleKey: 'library.filters.careLevel',
    values: ['Easy', 'Medium', 'Difficult'], // PlantCareLevel
  },
  {
    filterKey: 'wateringNeedLevels',
    facetField: 'wateringNeedLevel',
    titleKey: 'library.filters.watering',
    values: ['Low', 'Average', 'High', 'Frequent'], // PlantWateringNeed
  },
  {
    filterKey: 'lifeCycles',
    facetField: 'lifeCycle',
    titleKey: 'library.filters.lifeCycle',
    values: ['Annual', 'Biennial', 'Perennial', 'HerbaceousPerennial'], // PlantLifeCycle
  },
  {
    filterKey: 'growthRates',
    facetField: 'growthRate',
    titleKey: 'library.filters.growthRate',
    values: ['Low', 'Moderate', 'High'], // PlantGrowthRate
  },
];
