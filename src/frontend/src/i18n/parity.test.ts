import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';

// SMA-414 — fr.json and en.json must declare exactly the same leaf keys. A key
// added on one side only would silently fall back (fallbackLng: 'fr') instead
// of failing; this lock makes the drift a red test.

function leafKeys(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    leafKeys(value, prefix ? `${prefix}.${key}` : key)
  );
}

describe('i18n parity (SMA-414)', () => {
  it('fr.json and en.json declare exactly the same leaf keys', () => {
    const frKeys = new Set(leafKeys(fr));
    const enKeys = new Set(leafKeys(en));
    const missingInEn = [...frKeys].filter((k) => !enKeys.has(k)).sort();
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k)).sort();

    expect({ missingInEn, missingInFr }).toEqual({
      missingInEn: [],
      missingInFr: [],
    });
  });
});
