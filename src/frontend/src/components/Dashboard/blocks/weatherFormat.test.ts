import { describe, expect, it } from 'vitest';
import { cityList, displaySpeed, displayTemperature, frenchElides, truncate } from './weatherFormat';

describe('displayTemperature — whole degrees in the chosen system', () => {
  it('metric keeps the Celsius value, rounded', () => {
    expect(displayTemperature(24, 'metric')).toBe(24);
    expect(displayTemperature(24.4, 'metric')).toBe(24);
    expect(displayTemperature(-2.5, 'metric')).toBe(-2);
  });

  it('imperial converts to whole Fahrenheit', () => {
    expect(displayTemperature(24, 'imperial')).toBe(75);
    expect(displayTemperature(0, 'imperial')).toBe(32);
    expect(displayTemperature(-2, 'imperial')).toBe(28);
    expect(displayTemperature(29, 'imperial')).toBe(84);
  });
});

describe('displaySpeed — whole km/h or mph', () => {
  it('metric keeps km/h, imperial converts on the exact mile', () => {
    expect(displaySpeed(55, 'metric')).toBe(55);
    expect(displaySpeed(55, 'imperial')).toBe(34);
    expect(displaySpeed(12.4, 'metric')).toBe(12);
    expect(displaySpeed(0, 'imperial')).toBe(0);
  });
});

// SMA-448, lot F4 — the cities the Gardener's honest line names.
describe('cityList — every city left out, joined as the language joins a list', () => {
  const french = (name: string) => (frenchElides(name) ? `d’${name}` : `de ${name}`);

  it('joins one, two and three cities the French way, with the preposition each name takes — never « N autres »', () => {
    expect(cityList(['Annecy'], 'fr', french)).toBe('d’Annecy');
    expect(cityList(['Annecy', 'Grenoble'], 'fr', french)).toBe('d’Annecy et de Grenoble');
    expect(cityList(['Annecy', 'Grenoble', 'Valence'], 'fr', french)).toBe('d’Annecy, de Grenoble et de Valence');
    expect(cityList(['Annecy', 'Grenoble', 'Valence', 'Chambéry'], 'fr', french)).toBe('d’Annecy, de Grenoble, de Valence et de Chambéry');
  });

  it('joins them the English way, names alone', () => {
    expect(cityList(['Annecy', 'Grenoble'], 'en', (name) => name)).toBe('Annecy and Grenoble');
    expect(cityList(['Annecy', 'Grenoble', 'Valence'], 'en', (name) => name)).toBe('Annecy, Grenoble, and Valence');
  });
});

describe('frenchElides — « d’ » before a vowel or an h, « de » otherwise', () => {
  it('elides before a vowel, an accented vowel and an h; not before a consonant', () => {
    expect(['Annecy', 'Évry', 'Honfleur', 'Orléans', 'Issoire', 'Uzès', 'Yvetot', 'Écully'].map(frenchElides)).toEqual([
      true, true, true, true, true, true, true, true,
    ]);
    expect(['Lyon', 'Grenoble', 'Valence', 'Chambéry', 'Saint-Étienne'].map(frenchElides)).toEqual([false, false, false, false, false]);
  });
});

describe('truncate — an official event cut to the chip', () => {
  it('leaves a short text whole and cuts a long one with an ellipsis', () => {
    expect(truncate('Vent violent', 40)).toBe('Vent violent');
    expect(truncate('a'.repeat(40), 40)).toBe('a'.repeat(40));
    expect(truncate('a'.repeat(41), 40)).toBe(`${'a'.repeat(39)}…`);
  });

  it('counts characters, not bytes, and trims a dangling space before the ellipsis', () => {
    expect(truncate('éèà', 3)).toBe('éèà');
    expect(truncate('Vent violent en Auvergne', 13)).toBe('Vent violent…');
  });
});
