import { describe, expect, it } from 'vitest';
import { groupCommonNamesByLanguage } from './plantDetail';
import type { PlantCommonName } from '../types/Plant';

function name(
  id: number,
  languageCode: string,
  text: string,
  isPrimary: boolean,
): PlantCommonName {
  return { id, languageCode, name: text, isPrimary };
}

describe('groupCommonNamesByLanguage', () => {
  it('sorts the primary common name first within each language group', () => {
    // Insertion order deliberately puts secondary names first to prove the
    // function reorders rather than preserving insertion order.
    const input = [
      name(1, 'en', 'Love apple', false),
      name(2, 'en', 'Tomato', true),
      name(3, 'fr', 'Pomme d’amour', false),
      name(4, 'fr', 'Tomate', true),
    ];

    const grouped = groupCommonNamesByLanguage(input, 'en');

    expect(grouped.get('en')?.map((c) => c.name)).toEqual(['Tomato', 'Love apple']);
    expect(grouped.get('fr')?.map((c) => c.name)).toEqual(['Tomate', 'Pomme d’amour']);
  });

  it('breaks ties alphabetically by name when several non-primary entries share a language', () => {
    const input = [
      name(1, 'en', 'Cherokee Purple', false),
      name(2, 'en', 'Brandywine', false),
      name(3, 'en', 'Tomato', true),
    ];

    const grouped = groupCommonNamesByLanguage(input, 'en');

    expect(grouped.get('en')?.map((c) => c.name)).toEqual(['Tomato', 'Brandywine', 'Cherokee Purple']);
  });

  it('orders language groups with the UI language first, then alphabetical', () => {
    const input = [
      name(1, 'de', 'Tomate', true),
      name(2, 'en', 'Tomato', true),
      name(3, 'fr', 'Tomate', true),
    ];

    const grouped = groupCommonNamesByLanguage(input, 'fr');

    expect([...grouped.keys()]).toEqual(['fr', 'de', 'en']);
  });
});
