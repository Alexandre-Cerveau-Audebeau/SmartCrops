import { describe, expect, it } from 'vitest';
import { displaySpeed, displayTemperature, truncate } from './weatherFormat';

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
