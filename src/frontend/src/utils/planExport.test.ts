import { afterEach, describe, expect, it, vi } from 'vitest';
import { AXIS_RAIL_PX, GAP_PX } from '../theme/plannerTokens';
import {
  afterTwoFrames,
  countPlacementsByPlant,
  dataUrlToBlob,
  downloadBlob,
  EXPORT_CELL_PX,
  gridPixelSize,
  PLAN_PRINT_CSS,
  PLAN_PRINT_ROOT_ATTR,
  printableAreaPx,
  printScale,
  slugify,
} from './planExport';

// SMA-18 lot 3 — the pure plumbing behind « Exporter le plan ».

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('slugify', () => {
  it('strips diacritics, lowercases and hyphenates runs of anything else', () => {
    expect(slugify('Mon Jardin Été 2026')).toBe('mon-jardin-ete-2026');
    expect(slugify('Ça va ? — oui/non')).toBe('ca-va-oui-non');
  });

  it('is empty when nothing survives (the caller substitutes its fallback)', () => {
    expect(slugify('')).toBe('');
    expect(slugify('  --- ??? ')).toBe('');
  });
});

describe('dataUrlToBlob', () => {
  it('decodes a base64 data URL into a Blob of the declared type', async () => {
    // The 8-byte PNG signature.
    const blob = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(8);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it('decodes a percent-encoded (non-base64) text data URL', async () => {
    const blob = dataUrlToBlob('data:text/plain,a%20b');
    expect(blob.type).toBe('text/plain');
    expect(await blob.text()).toBe('a b');
  });

  // CodeRabbit #266 round 1: percent-encoded BINARY payloads used to throw a
  // URIError through decodeURIComponent — every %HH is now one raw byte.
  it('decodes percent-encoded binary bytes instead of throwing', async () => {
    const one = dataUrlToBlob('data:application/octet-stream,%FF');
    expect(one.type).toBe('application/octet-stream');
    expect(Array.from(new Uint8Array(await one.arrayBuffer()))).toEqual([0xff]);

    const png = dataUrlToBlob('data:application/octet-stream,%89PNG');
    expect(Array.from(new Uint8Array(await png.arrayBuffer()))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  it('UTF-8 encodes the literal text between escapes and keeps a stray % literal', async () => {
    expect(await dataUrlToBlob('data:text/plain,caf%C3%A9').text()).toBe(
      'café'
    );
    expect(await dataUrlToBlob('data:text/plain,café%21').text()).toBe('café!');
    expect(await dataUrlToBlob('data:text/plain,100%').text()).toBe('100%');
    expect(await dataUrlToBlob('data:text/plain,%%41').text()).toBe('%A');
  });

  it('rejects anything that is not a data URL', () => {
    expect(() => dataUrlToBlob('nope')).toThrow('Not a data URL');
    expect(() => dataUrlToBlob('https://example.test/x.png')).toThrow(
      'Not a data URL'
    );
  });
});

describe('grid geometry and print scale', () => {
  it('sizes the exported grid from the §4 track formula (axes included)', () => {
    const { width, height } = gridPixelSize(10, 6);
    expect(width).toBe(
      AXIS_RAIL_PX + GAP_PX.sm + 10 * EXPORT_CELL_PX + 9 * GAP_PX.sm
    );
    expect(height).toBe(20 + 6 * EXPORT_CELL_PX + 5 * GAP_PX.sm);
  });

  it('keeps a 10 × 6 garden at scale 1 (it fits the printable width and height)', () => {
    expect(printScale(10, 6)).toBe(1);
  });

  it('shrinks a wide garden to the printable width, aspect preserved', () => {
    const size = gridPixelSize(50, 2);
    const area = printableAreaPx();
    expect(printScale(50, 2)).toBeCloseTo(area.width / size.width, 6);
    expect(printScale(50, 2)).toBeLessThan(1);
  });

  it('shrinks a tall garden to the printable height instead of clipping it', () => {
    const size = gridPixelSize(10, 50);
    const area = printableAreaPx();
    expect(printScale(10, 50)).toBeCloseTo(area.height / size.height, 6);
    expect(printScale(10, 50)).toBeLessThan(printScale(10, 6));
  });
});

describe('PLAN_PRINT_CSS', () => {
  it('declares the A4 landscape page with lateral margins only, resets the body margin, frames the root as a table, hides the view on screen and keeps colours on paper', () => {
    // Round 2 (V3 + F7): zero top/bottom @page margin (no browser header or
    // footer), the vertical 12 mm are the print view's spacer rows.
    expect(PLAN_PRINT_CSS).toContain(
      '@page { size: A4 landscape; margin: 0 12mm; }'
    );
    // CodeRabbit #266 round 2 (Major): the user-agent body margin is reset.
    expect(PLAN_PRINT_CSS).toContain('html, body { margin: 0; padding: 0;');
    expect(PLAN_PRINT_CSS).not.toContain('padding: 12mm');
    expect(PLAN_PRINT_CSS).toContain(
      `[${PLAN_PRINT_ROOT_ATTR}] { display: table; width: 100%; border-collapse: collapse; }`
    );
    expect(PLAN_PRINT_CSS).toContain(
      `@media screen { [${PLAN_PRINT_ROOT_ATTR}] { display: none; } }`
    );
    expect(PLAN_PRINT_CSS).toContain(
      `body > *:not([${PLAN_PRINT_ROOT_ATTR}]) { display: none !important; }`
    );
    expect(PLAN_PRINT_CSS).toContain(
      'print-color-adjust: exact; -webkit-print-color-adjust: exact;'
    );
  });
});

describe('countPlacementsByPlant', () => {
  it('counts placements per plant id', () => {
    const counts = countPlacementsByPlant([
      { plantId: 'a' },
      { plantId: 'b' },
      { plantId: 'a' },
    ]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('c')).toBeUndefined();
  });
});

describe('downloadBlob', () => {
  it('clicks a transient download anchor and revokes the blob URL a tick later (the Profile precedent)', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      }
    );
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const blob = new Blob(['x'], { type: 'image/png' });

    downloadBlob(blob, 'plan.png');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('plan.png');
    expect(anchor.href).toBe('blob:mock-url');
    // Removed right after the click — nothing lingers in the body.
    expect(document.body.contains(anchor)).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('afterTwoFrames', () => {
  it('resolves once two animation frames have elapsed', async () => {
    let frames = 0;
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        frames += 1;
        cb(performance.now());
        return frames;
      });
    await afterTwoFrames();
    expect(raf).toHaveBeenCalledTimes(2);
  });
});
