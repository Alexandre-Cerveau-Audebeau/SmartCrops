/**
 * SMA-394: the hidden plant's card artwork, inlined as a data URI.
 *
 * Our own drawing: no photograph, no third-party asset, so the card carries no
 * credit and no licence line. Same 400×400 box as PLANT_HERO_PLACEHOLDER
 * (`utils/plantDetail.ts`) so the card grid cannot shift.
 *
 * White ground, a translucent red heart sitting as a watermark, legible as a
 * heart at card size and still clearly behind the text, with the name over it
 * in a light translucent blue. Nothing on the page explains the palette; it
 * simply sits there.
 *
 * The source below holds the REAL code points (verifiable with a byte-level
 * check); `encodeURIComponent` is what carries them safely through the data
 * URI, and decoding the URI returns them unchanged.
 */

/** Material's heart glyph path, drawn in a 24×24 box. */
const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

/**
 * The JP fallback stack, repeated inside the SVG: an image loaded through
 * `<img>` cannot reach the application's self-hosted Inter, and Inter carries
 * no kana anyway.
 */
const SVG_FONT =
  "Inter, 'Hiragino Sans', 'Yu Gothic UI', Meiryo, 'Noto Sans JP', sans-serif";

/**
 * XML-escape a value that lands in both an attribute and a text node.
 * `encodeURIComponent` further down makes the document transport-safe, not
 * well-formed: a label carrying `&`, `<`, `>` or `"` would still produce
 * malformed XML and a blank card. No current entry does, and this builder's
 * whole point is that the next one is a single file.
 */
const escapeXml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c] as string
  );

export function buildCardArtwork(label: string): string {
  const safe = escapeXml(label);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"',
    ` role="img" aria-label="${safe}">`,
    '<rect width="400" height="400" fill="#ffffff"/>',
    `<path transform="translate(50 44) scale(12.5)" d="${HEART}" fill="#e03131" opacity="0.3"/>`,
    `<text x="200" y="208" text-anchor="middle" dominant-baseline="central"`,
    ` font-family="${SVG_FONT}" font-size="74" font-weight="600"`,
    ` fill="#4c7fd6" fill-opacity="0.8">${safe}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
