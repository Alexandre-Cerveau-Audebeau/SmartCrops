import { describe, expect, it } from 'vitest';
import { encodeResults, toBase64 } from './encode';

// SMA-336 mobile lot, fix round 1 (#5) — the results of a run are base64 of
// their JSON's UTF-8 bytes, encoded three bytes at a time: no call receives
// one argument per byte, so a run of any size reaches the dump.

/** Base64 as the platform computes it, byte by byte — the reference the encoder is checked against. */
function referenceBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The bytes back from a base64 text, through the platform's decoder. */
function decode(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

describe('toBase64 — the harness encodes its results without spreading the bytes (#5)', () => {
  it('matches the platform’s base64 on every padding case, accents included', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'é ∩ « 14 h »', '\u{1F331}']) {
      const bytes = new TextEncoder().encode(text);
      expect(toBase64(bytes), JSON.stringify(text)).toBe(referenceBase64(bytes));
    }
  });

  it('matches the platform’s base64 on every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 * 3 + 1 }, (_, i) => i % 256);
    expect(toBase64(bytes)).toBe(referenceBase64(bytes));
  });

  it('round-trips a run of more than 200 KB — the size a defect-heavy run reaches', () => {
    // Twenty-nine scenes, each with a hundred overlap records of 44-character
    // labels: 29 × 100 × ~130 bytes ≈ 380 KB of JSON.
    /** A 44-character overlap label, as `measure.ts` prints them. */
    const label = (i: number) => `"Protéger du froid — 3 plantes sensibles ${String(i).padStart(4, '0')}"`;
    const results = Array.from({ length: 29 }, (_, s) => ({
      scene: `scene-${s}`,
      overlaps: Array.from({ length: 100 }, (_, i) => ({ a: label(i), b: label(i + 1), kinds: 'text/text', w: 36.1, h: 19, x: 12.5, y: 200 + i })),
    }));
    const json = JSON.stringify(results);
    expect(json.length).toBeGreaterThan(200_000);

    const encoded = encodeResults(results);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const back = JSON.parse(new TextDecoder().decode(decode(encoded)));
    expect(back).toEqual(results);
  });
});
