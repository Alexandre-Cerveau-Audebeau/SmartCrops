import type { TFunction } from 'i18next';
import type { UnitSystem } from '../contexts/unitSystemContextValue';
import type { Plant } from '../types/Plant';
import { formatSpacing, formatXDataRange } from './plantDetail';

export interface FaqItem {
  q: string;
  a: string;
}

const F = 'plantDetail.faq';

/**
 * Build the Plant Detail FAQ Q/A list from the plant's REAL fields (SMA-78, PR C).
 * A question is included only when its source field exists, so the section is
 * data-driven and never shows an empty answer. Sun exposure and soil pH are
 * sourced from the better-filled Perenual xData (the legacy `sunExposure` /
 * `soilPh` columns are too sparse). Unit-aware for spacing. Pure — also used by
 * PlantDetail to decide TOC entry 14's live/empty state.
 */
export function buildFaqItems(
  plant: Plant,
  t: TFunction,
  system: UnitSystem
): FaqItem[] {
  const pd = plant.perenualData;
  const items: FaqItem[] = [];

  // 1. Edibility.
  if (plant.isEdible != null) {
    if (plant.isEdible) {
      const parts = [
        pd?.hasEdibleFruit ? t(`${F}.edible.partFruit`) : null,
        pd?.hasEdibleLeaves ? t(`${F}.edible.partLeaves`) : null,
      ].filter(Boolean);
      items.push({
        q: t(`${F}.edible.q`),
        a: parts.length
          ? t(`${F}.edible.aYesParts`, { parts: parts.join(', ') })
          : t(`${F}.edible.aYes`),
      });
    } else {
      items.push({ q: t(`${F}.edible.q`), a: t(`${F}.edible.aNo`) });
    }
  }

  // 2. Pet toxicity.
  if (plant.isToxicToPets != null) {
    items.push({
      q: t(`${F}.toxic.q`),
      a: plant.isToxicToPets ? t(`${F}.toxic.aYes`) : t(`${F}.toxic.aNo`),
    });
  }

  // 3. Sun exposure (Perenual sunlight hours).
  const sun = formatXDataRange(
    pd?.xSunlightHoursMin ?? null,
    pd?.xSunlightHoursMax ?? null,
    ' h'
  );
  if (sun) {
    items.push({ q: t(`${F}.sun.q`), a: t(`${F}.sun.a`, { hours: sun }) });
  }

  // 4. Hardiness zones (+ annual note when the plant is an annual).
  const hardinessMin = plant.hardinessZoneMin ?? plant.hardinessZoneMax;
  const hardinessMax = plant.hardinessZoneMax ?? plant.hardinessZoneMin;
  if (hardinessMin != null && hardinessMax != null) {
    let a = t(`${F}.hardiness.a`, { min: hardinessMin, max: hardinessMax });
    if (plant.lifeCycle === 'Annual') a += ` ${t(`${F}.hardiness.annualNote`)}`;
    items.push({ q: t(`${F}.hardiness.q`), a });
  }

  // 5. Soil pH (Perenual watering pH).
  const ph = formatXDataRange(
    pd?.xWateringPhMin ?? null,
    pd?.xWateringPhMax ?? null
  );
  if (ph) {
    items.push({ q: t(`${F}.ph.q`), a: t(`${F}.ph.a`, { ph }) });
  }

  // 6. Spacing (unit-aware).
  const spacing = formatSpacing(
    pd?.xPlantSpacingValue ?? null,
    pd?.xPlantSpacingUnit ?? null,
    system
  );
  if (spacing) {
    items.push({ q: t(`${F}.spacing.q`), a: t(`${F}.spacing.a`, { spacing }) });
  }

  return items;
}
