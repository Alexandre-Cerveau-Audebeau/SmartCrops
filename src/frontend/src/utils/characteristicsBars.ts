/**
 * Pure mappers for the section-06 characteristic bars (SMA-39). Each turns raw
 * Perenual/Plant numeric data into a discrete level + fill percentage, or
 * `null` when the source data is absent (→ the UI shows "Not provided").
 * `levelKey` is the full i18n key under `plantDetail.characteristics.levels`.
 */
export interface BarValue {
  levelKey: string;
  pct: number;
}

const P = 'plantDetail.characteristics.levels';

/** Average of a min/max pair; the lone bound when only one is set; null if both absent. */
function avgOf(
  min: number | null | undefined,
  max: number | null | undefined
): number | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return (min + max) / 2;
  return (min ?? max) as number;
}

/** Daily sunlight hours → light requirement bar. */
export function lightBar(
  min: number | null | undefined,
  max: number | null | undefined
): BarValue | null {
  const avg = avgOf(min, max);
  if (avg == null) return null;
  if (avg < 3) return { levelKey: `${P}.light.shade`, pct: 18 };
  if (avg < 4.5) return { levelKey: `${P}.light.partialShade`, pct: 42 };
  if (avg < 6) return { levelKey: `${P}.light.partialSun`, pct: 65 };
  return { levelKey: `${P}.light.fullSun`, pct: 92 };
}

/** USDA hardiness zone min → frost-tolerance bar (cascade, no gaps). */
export function frostBar(zoneMin: number | null | undefined): BarValue | null {
  if (zoneMin == null) return null;
  if (zoneMin <= 3) return { levelKey: `${P}.frost.veryHigh`, pct: 90 };
  if (zoneMin <= 5) return { levelKey: `${P}.frost.high`, pct: 70 };
  if (zoneMin <= 7) return { levelKey: `${P}.frost.medium`, pct: 50 };
  if (zoneMin <= 9) return { levelKey: `${P}.frost.low`, pct: 30 };
  return { levelKey: `${P}.frost.lowFrostTender`, pct: 14 };
}

/** Soil pH range → soil-pH bar. */
export function phBar(
  min: number | null | undefined,
  max: number | null | undefined
): BarValue | null {
  const avg = avgOf(min, max);
  if (avg == null) return null;
  if (avg < 5.5) return { levelKey: `${P}.ph.acidic`, pct: 22 };
  if (avg < 6.5) return { levelKey: `${P}.ph.slightlyAcidic`, pct: 46 };
  if (avg < 7.3) return { levelKey: `${P}.ph.neutral`, pct: 58 };
  if (avg <= 8) return { levelKey: `${P}.ph.slightlyAlkaline`, pct: 72 };
  return { levelKey: `${P}.ph.alkaline`, pct: 88 };
}
