import type { TFunction } from 'i18next';
import type {
  ArrayFilterKey,
  BooleanFilterKey,
  RangeBounds,
  RangeFilterKey,
} from '../hooks/usePlantFinder';
import type { UnitSystem } from '../contexts/unitSystemContextValue';
import { celsiusToFahrenheit, cmToInches } from '../utils/plantDetail';

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
  filterKey: Exclude<ArrayFilterKey, 'plantTypeIds'>;
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

/**
 * One hero boolean checkbox of the filter panel (SMA-9 T3). The index stores
 * these as 3-state string facets (true/false/unknown); `countedValue` is the
 * bucket the checkbox filters on AND counts — 'true' for the direct traits,
 * 'false' for the two toxicity fields, where the checkbox promises SAFETY
 * (inverted polarity: "Pet-safe" = isToxicToPets false). The unknown bucket
 * is never counted and never rendered — the backend ORs it into every
 * selection ("absence never excludes").
 */
export interface BooleanFacetConfig {
  /** Key into PlantFinderFilters (UI semantics: checked = true). */
  filterKey: BooleanFilterKey;
  /** Field name in the API's facetCounts payload. */
  facetField:
    | 'isIndoor'
    | 'isDroughtTolerant'
    | 'isEdible'
    | 'isToxicToPets'
    | 'isToxicToHumans'
    | 'isMedicinal'
    | 'isSaltTolerant'
    | 'isThorny'
    | 'isTropical'
    | 'isInvasive';
  /** Facet bucket the checkbox filters on/counts (see interface doc). */
  countedValue: 'true' | 'false';
  /** i18n key of the checkbox label. */
  labelKey: string;
  /** Optional explanatory microcopy under the label (mockup captions). */
  captionKey?: string;
  /** Mockup group the row renders under ('traits' = the "Autres traits" rows
   * inside the collapsed "Plus de filtres" section, T4). */
  group: 'care' | 'safety' | 'traits';
}

/** Panel display order (care rows follow the Watering facet; safety rows form
 * the SÉCURITÉ & USAGE group). */
export const BOOLEAN_FACETS: BooleanFacetConfig[] = [
  {
    filterKey: 'indoor',
    facetField: 'isIndoor',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.indoor',
    group: 'care',
  },
  {
    filterKey: 'droughtTolerant',
    facetField: 'isDroughtTolerant',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.droughtTolerant',
    group: 'care',
  },
  {
    filterKey: 'edible',
    facetField: 'isEdible',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.edible',
    captionKey: 'library.filters.booleans.edibleHint',
    group: 'safety',
  },
  {
    filterKey: 'petSafe',
    facetField: 'isToxicToPets',
    countedValue: 'false',
    labelKey: 'library.filters.booleans.petSafe',
    captionKey: 'library.filters.booleans.petSafeHint',
    group: 'safety',
  },
  {
    filterKey: 'humanSafe',
    facetField: 'isToxicToHumans',
    countedValue: 'false',
    labelKey: 'library.filters.booleans.humanSafe',
    captionKey: 'library.filters.booleans.humanSafeHint',
    group: 'safety',
  },
  // T4 bonus traits ("Autres traits", no captions per the mockup) — direct
  // polarity, endpoint + facet counts already live since the T3 audit.
  {
    filterKey: 'medicinal',
    facetField: 'isMedicinal',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.medicinal',
    group: 'traits',
  },
  {
    filterKey: 'saltTolerant',
    facetField: 'isSaltTolerant',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.saltTolerant',
    group: 'traits',
  },
  {
    filterKey: 'thorny',
    facetField: 'isThorny',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.thorny',
    group: 'traits',
  },
  {
    filterKey: 'tropical',
    facetField: 'isTropical',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.tropical',
    group: 'traits',
  },
  {
    filterKey: 'invasive',
    facetField: 'isInvasive',
    countedValue: 'true',
    labelKey: 'library.filters.booleans.invasive',
    group: 'traits',
  },
];

/**
 * One dual-thumb range slider of the filter panel (SMA-9 T4). Filter state
 * (PlantFinderFilters) carries RangeBounds in the facet's FILTER unit; the
 * wire params derive from minParam/maxParam, through toWire where the wire
 * unit differs. The track is linear from floor to ceiling with `step`,
 * UNLESS `scale` is set: the slider then runs over the scale's INDICES —
 * equal visual spacing between marks, only the scale values selectable (the
 * mockup's compressed height scale). `openEnded` makes the top of the track
 * an open band ("3 m +" / "150 cm +"): a thumb resting there sends NO max
 * param. A thumb on the floor likewise sends no min — the full track is the
 * inactive (null) state, any narrower selection counts as ONE active filter.
 */
export interface RangeFacetConfig {
  /** Key into PlantFinderFilters. */
  filterKey: RangeFilterKey;
  /** Wire param names (FindPlantsParams keys). */
  minParam:
    | 'heightCmMin'
    | 'hardinessZoneMin'
    | 'xWateringPhMin'
    | 'xPlantSpacingValueMin'
    | 'xWateringBasedTempCMin';
  maxParam:
    | 'heightCmMax'
    | 'hardinessZoneMax'
    | 'xWateringPhMax'
    | 'xPlantSpacingValueMax'
    | 'xWateringBasedTempCMax';
  /** i18n key of the row title. */
  titleKey: string;
  /** Optional explanatory microcopy under the slider (mockup captions). */
  captionKey?: string;
  /** i18n prefix of the label/chip/mark strings
   * (`<base>.label`, `.labelOpen`, `.chip`, `.chipOpen`, `.mark*`). */
  labelKeyBase: string;
  /** Track domain in the FILTER unit. */
  floor: number;
  ceiling: number;
  step: number;
  /** Compressed non-linear scale: the selectable filter values, mark per
   * value, slider space = indices (see interface doc). */
  scale?: number[];
  /** Top of the track is an open band — no max param sent from there. */
  openEnded?: boolean;
  /** Filter unit → wire unit conversion (spacing: cm → whole inches). */
  toWire?: (value: number) => number;
  /** How a bound renders (formatRangeValue). */
  display: 'heightM' | 'zones' | 'cm' | 'ph' | 'tempC';
  /** Mockup group ('more' = inside "Plus de filtres"). */
  group: 'plant' | 'care' | 'more';
}

/**
 * Panel display order within each group. Bounds calibrated on the audited
 * live distributions (T4 pre-flight): height p95 ≈ 21 m but 63% of the
 * catalogue under 3 m (hence the compressed open-ended scale), hardiness
 * real spread 2–12 within USDA 1–13, watering pH 4.5–8.5, spacing p95 ≈
 * 91 cm within an open-ended 0–150 cm track (max 610 cm), watering-based
 * temperature 10–38 °C.
 */
export const RANGE_FACETS: RangeFacetConfig[] = [
  {
    filterKey: 'heightCm',
    minParam: 'heightCmMin',
    maxParam: 'heightCmMax',
    titleKey: 'library.filters.ranges.height.title',
    captionKey: 'library.filters.ranges.height.caption',
    labelKeyBase: 'library.filters.ranges.height',
    floor: 0,
    ceiling: 300,
    step: 1,
    // 0 / 0,5 m / 1 m / 2 m / 3 m + (mockup marks), values in cm.
    scale: [0, 50, 100, 200, 300],
    openEnded: true,
    display: 'heightM',
    group: 'plant',
  },
  {
    filterKey: 'hardinessZone',
    minParam: 'hardinessZoneMin',
    maxParam: 'hardinessZoneMax',
    titleKey: 'library.filters.ranges.hardiness.title',
    captionKey: 'library.filters.ranges.hardiness.caption',
    labelKeyBase: 'library.filters.ranges.hardiness',
    floor: 1,
    ceiling: 13,
    step: 1,
    display: 'zones',
    group: 'care',
  },
  {
    filterKey: 'wateringPh',
    minParam: 'xWateringPhMin',
    maxParam: 'xWateringPhMax',
    titleKey: 'library.filters.ranges.ph.title',
    labelKeyBase: 'library.filters.ranges.ph',
    floor: 4.5,
    ceiling: 8.5,
    step: 0.1,
    display: 'ph',
    group: 'more',
  },
  {
    filterKey: 'spacingCm',
    minParam: 'xPlantSpacingValueMin',
    maxParam: 'xPlantSpacingValueMax',
    titleKey: 'library.filters.ranges.spacing.title',
    labelKeyBase: 'library.filters.ranges.spacing',
    floor: 0,
    ceiling: 150,
    step: 5,
    openEnded: true,
    // Display/wire unit split: the whole site is metric so the slider and
    // its labels live in cm, but the indexed Perenual value is INCHES —
    // bounds convert to whole inches only when they go on the wire.
    toWire: (cm) => Math.round(cmToInches(cm)),
    display: 'cm',
    group: 'more',
  },
  {
    filterKey: 'wateringTempC',
    minParam: 'xWateringBasedTempCMin',
    maxParam: 'xWateringBasedTempCMax',
    titleKey: 'library.filters.ranges.temp.title',
    labelKeyBase: 'library.filters.ranges.temp',
    floor: 10,
    ceiling: 38,
    step: 1,
    display: 'tempC',
    group: 'more',
  },
];

/** Track domain in SLIDER space: scale facets slide over mark indices. */
export function sliderDomain(facet: RangeFacetConfig): {
  min: number;
  max: number;
  step: number;
} {
  if (facet.scale) return { min: 0, max: facet.scale.length - 1, step: 1 };
  return { min: facet.floor, max: facet.ceiling, step: facet.step };
}

/** One slider position → its filter-unit value. */
export function sliderToFilterValue(
  facet: RangeFacetConfig,
  position: number
): number {
  return facet.scale ? (facet.scale[position] ?? facet.ceiling) : position;
}

/**
 * MUI's keyboard stepping accumulates binary-float error on fractional steps
 * (8.5 − 10×0.1 arrives as 7.500000000000004); re-snap a committed position
 * onto the step grid so neither the wire nor the filtersKey carries the
 * residue. toFixed(4) kills the re-multiplication error, far below any real
 * step (0.1 pH is the finest).
 */
function snapToStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(4));
}

/**
 * Slider pair → filter state. A thumb on the floor drops the min bound and a
 * thumb on the ceiling drops the max (the open-ended band, or simply "no
 * upper narrowing" — the ceiling IS the data maximum on the closed sliders);
 * both dropped = the inactive null.
 */
export function sliderToRange(
  facet: RangeFacetConfig,
  value: [number, number]
): RangeBounds | null {
  const domain = sliderDomain(facet);
  const min =
    value[0] <= domain.min
      ? undefined
      : snapToStep(sliderToFilterValue(facet, value[0]), facet.step);
  const max =
    value[1] >= domain.max
      ? undefined
      : snapToStep(sliderToFilterValue(facet, value[1]), facet.step);
  // Branch on the defined bound so the at-least-one-bound union type-checks.
  if (min !== undefined) return { min, max };
  if (max !== undefined) return { max };
  return null;
}

/** Filter state → slider pair (absent bounds rest on the track ends). */
export function rangeToSlider(
  facet: RangeFacetConfig,
  range: RangeBounds | null
): [number, number] {
  const domain = sliderDomain(facet);
  if (!range) return [domain.min, domain.max];
  const toPosition = (bound: number | undefined, rest: number): number => {
    if (bound === undefined) return rest;
    if (!facet.scale) return bound;
    const index = facet.scale.indexOf(bound);
    return index === -1 ? rest : index;
  };
  return [toPosition(range.min, domain.min), toPosition(range.max, domain.max)];
}

/**
 * One bound formatted for display (locale-aware decimals; temperature honors
 * the global metric/imperial toggle — the ONLY unit-system-aware facet, the
 * others are metric per the mockup). Input is a FILTER-unit value.
 */
export function formatRangeValue(
  facet: RangeFacetConfig,
  value: number,
  language: string,
  system: UnitSystem
): string {
  switch (facet.display) {
    case 'heightM':
      // cm → m with the locale's decimal separator ("0,5" in fr).
      return new Intl.NumberFormat(language).format(value / 100);
    case 'ph':
      return new Intl.NumberFormat(language, {
        maximumFractionDigits: 1,
      }).format(value);
    case 'tempC':
      return system === 'imperial'
        ? String(Math.round(celsiusToFahrenheit(value)))
        : String(value);
    default:
      // 'zones' | 'cm' — plain integers.
      return String(value);
  }
}

/** Interpolation payload of the range label/chip i18n strings. */
export interface RangeLabelParts {
  lo: string;
  hi: string;
  /** Top thumb rests on the open band → the `labelOpen`/`chipOpen` variant. */
  open: boolean;
  /** '°C'/'°F' on the temperature facet (its keys carry `{{unit}}`). */
  unit: string;
}

/**
 * Formats a SLIDER-space pair for the dynamic label and the active chip —
 * single source so the two surfaces can't drift.
 */
export function rangeLabelParts(
  facet: RangeFacetConfig,
  value: [number, number],
  language: string,
  system: UnitSystem
): RangeLabelParts {
  const domain = sliderDomain(facet);
  return {
    lo: formatRangeValue(
      facet,
      sliderToFilterValue(facet, value[0]),
      language,
      system
    ),
    hi: formatRangeValue(
      facet,
      sliderToFilterValue(facet, value[1]),
      language,
      system
    ),
    open: (facet.openEnded ?? false) && value[1] >= domain.max,
    unit:
      facet.display === 'tempC'
        ? system === 'imperial'
          ? '°F'
          : '°C'
        : '',
  };
}

/**
 * The slider row's dynamic label — takes the LIVE slider pair so the label
 * keeps tracking the thumbs mid-drag (before any commit). Single home of the
 * open/closed key pick, shared with {@link rangeChipLabel} so the two
 * surfaces can't drift.
 */
export function rangeRowLabel(
  t: TFunction,
  facet: RangeFacetConfig,
  sliderValue: [number, number],
  language: string,
  system: UnitSystem
): string {
  const parts = rangeLabelParts(facet, sliderValue, language, system);
  return t(`${facet.labelKeyBase}.${parts.open ? 'labelOpen' : 'label'}`, {
    ...parts,
  });
}

/** The active chip's label — from the COMMITTED filter state. */
export function rangeChipLabel(
  t: TFunction,
  facet: RangeFacetConfig,
  range: RangeBounds | null,
  language: string,
  system: UnitSystem
): string {
  const parts = rangeLabelParts(
    facet,
    rangeToSlider(facet, range),
    language,
    system
  );
  return t(`${facet.labelKeyBase}.${parts.open ? 'chipOpen' : 'chip'}`, {
    ...parts,
  });
}
