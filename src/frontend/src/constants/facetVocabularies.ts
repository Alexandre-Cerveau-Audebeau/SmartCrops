import type { PlantFinderFilters } from '../hooks/usePlantFinder';

/**
 * One chip of an enum facet (SMA-9 T2). A chip may GROUP several wire values
 * (mockup decision: a gardener filtering "Vivace" must match herbaceous
 * perennials too): its displayed count is the SUM of its wireValues'
 * facetCounts, toggling sends/removes ALL wireValues together, and it renders
 * selected when all of them are in the filter array.
 */
export interface FacetChipConfig {
  /** i18n suffix: library.filters.values.<facetField>.<labelKeySuffix>. */
  labelKeySuffix: string;
  /** Backend C# enum member names — the exact wire/facetCounts strings. */
  wireValues: string[];
}

/**
 * One enum facet section of the Library filter panel.
 * Wire values mirror the backend enums EXACTLY; the 'unknown' sentinel is
 * never listed (engine-side detail the backend ORs into every selection —
 * "absence never excludes", SMA-9). Values with zero real-data hits are
 * deliberately absent per the validated mockups (checked against the live
 * DB): PlantLifeCycle.Biennial (0 rows) and PlantWateringNeed.High (0 rows).
 */
export interface EnumFacetConfig {
  /** Key into PlantFinderFilters (the query param name). */
  filterKey: Exclude<keyof PlantFinderFilters, 'plantTypeIds'>;
  /** Field name in the API's facetCounts payload. */
  facetField: 'careLevel' | 'wateringNeedLevel' | 'lifeCycle' | 'growthRate';
  /** i18n key of the section title. */
  titleKey: string;
  /** Optional explanatory microcopy under the title (mockup captions). */
  captionKey?: string;
  /** Mockup group the section renders under. */
  group: 'plant' | 'care';
  /** Chips in display order. */
  chips: FacetChipConfig[];
}

const single = (value: string): FacetChipConfig => ({
  labelKeySuffix: value,
  wireValues: [value],
});

/** Panel display order within each group (Plant type renders first in 'plant'). */
export const ENUM_FACETS: EnumFacetConfig[] = [
  {
    filterKey: 'lifeCycles',
    facetField: 'lifeCycle',
    titleKey: 'library.filters.lifeCycle',
    captionKey: 'library.filters.lifeCycleHint',
    group: 'plant',
    chips: [
      // "Vivace" groups both perennial wire values (see FacetChipConfig doc).
      { labelKeySuffix: 'Perennial', wireValues: ['Perennial', 'HerbaceousPerennial'] },
      single('Annual'),
    ],
  },
  {
    filterKey: 'growthRates',
    facetField: 'growthRate',
    titleKey: 'library.filters.growthRate',
    group: 'plant',
    chips: [single('Low'), single('Moderate'), single('High')], // PlantGrowthRate
  },
  {
    filterKey: 'careLevels',
    facetField: 'careLevel',
    titleKey: 'library.filters.careLevel',
    group: 'care',
    chips: [single('Easy'), single('Medium'), single('Difficult')], // PlantCareLevel
  },
  {
    filterKey: 'wateringNeedLevels',
    facetField: 'wateringNeedLevel',
    titleKey: 'library.filters.watering',
    group: 'care',
    chips: [single('Low'), single('Average'), single('Frequent')], // PlantWateringNeed sans High (0 rows)
  },
];
