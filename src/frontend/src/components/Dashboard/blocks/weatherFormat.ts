import type { UnitSystem } from '../../../contexts/unitSystemContextValue';
import { celsiusToFahrenheit, kmhToMph } from '../../../utils/plantDetail';

/**
 * SMA-336 PR 3b/5 — the unit conversions the weather surfaces apply on the
 * way to the screen. The aggregate is METRIC (decision T8); °F and mph follow
 * `useUnitSystem`, the product's one global toggle (`_spec.md` § 6: « elles
 * suivent la bascule globale de la barre du haut »), never a toggle of the
 * widget's own. Rainfall stays in millimetres in both systems: no reader of the
 * dashboard asked for inches, and a chip that said « 0.8 in » beside « 55 mph »
 * would be a unit nobody chose.
 *
 * Whole numbers on screen, like every temperature of the artboards (« 24° »,
 * « 9° »): `Math.round` on the converted value, so « 24.4 °C » reads « 24° »
 * and « 76 °F », never « 75.9 °F ».
 */

/** A temperature in °C, as the whole number the chosen system displays. */
export function displayTemperature(celsius: number, system: UnitSystem): number {
  return Math.round(system === 'imperial' ? celsiusToFahrenheit(celsius) : celsius);
}

/** A speed in km/h, as the whole number the chosen system displays. */
export function displaySpeed(kph: number, system: UnitSystem): number {
  return Math.round(system === 'imperial' ? kmhToMph(kph) : kph);
}

/**
 * « A et B », « A, B et C », « A, B et 2 autres » — the names of the unlocated
 * gardens in the partial invitation (pre-flight § F.4). `Intl.ListFormat`
 * writes the conjunction the language writes it; past three names the third
 * item becomes the caller's « N autres » fragment, so the list never grows
 * past three items whatever the account holds.
 */
export function nameList(
  names: readonly string[],
  language: string,
  others: (count: number) => string
): string {
  const items =
    names.length <= 3 ? [...names] : [names[0]!, names[1]!, others(names.length - 2)];
  return new Intl.ListFormat(language, { type: 'conjunction' }).format(items);
}

/** « Vent violent en Auvergne-Rhône-Alpes… » cut to `max` characters with an ellipsis. */
export function truncate(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}
