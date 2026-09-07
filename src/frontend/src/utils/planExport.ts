import { AXIS_RAIL_PX, GAP_PX, getPlannerTokens } from '../theme/plannerTokens';

/**
 * Plan export helpers (SMA-18 lot 3, « Exporter le plan ») — the geometry,
 * naming and file plumbing shared by the PNG capture and the print view.
 * Everything here is PURE except {@link downloadBlob} (touches the DOM) and
 * {@link afterTwoFrames} (waits on the browser's frame clock).
 */

/** Outcome handed back by an export job — the page toasts on `ok: false`. */
export interface PlanExportOutcome {
  ok: boolean;
}

/** §4 desktop cell edge at zoom 100 %: both exports render the grid at this
 * size regardless of the on-screen zoom or breakpoint. */
export const EXPORT_CELL_PX = 58;

/** Desktop §4 gap — the export stages render at the sm+ breakpoint values. */
const EXPORT_GAP_PX = GAP_PX.sm;

/** Column-letter row above the cells (fs 10.5 line box + 2 px margin),
 * rounded UP so the scaled print wrapper never clips the last row. */
const COLUMN_AXIS_PX = 20;

/** The A4 landscape sheet and the print view's margins, in mm. The `@page`
 * rule keeps the LATERAL margins only; the vertical 12 mm are rendered by
 * the print view itself as one empty spacer row in its table's <thead> and
 * <tfoot> — repeated by the browser on every page (round 2, V3 + F7). On
 * Chrome and Edge the zero top/bottom `@page` margin is also what keeps the
 * browser's own header and footer (date, URL, page number) off the sheet —
 * they are drawn inside the page margin boxes, which a zero margin leaves no
 * room for; on other browsers that depends on the print dialog's « Headers
 * and footers » option (round 3). The printable area is the sheet minus this
 * 12 mm frame. */
export const PRINT_PAGE_MM = { width: 297, height: 210, margin: 12 } as const;

/** CSS reference pixel: 96 px per inch, 25.4 mm per inch. */
const CSS_PX_PER_MM = 96 / 25.4;

/**
 * Vertical room the header takes above the grid on the FIRST page, in px —
 * subtracted from the printable height before the grid's scale is computed,
 * so the header and the grid share page 1 (round 3, V4: a 40 × 30 garden
 * printed its header alone on page 1 and the grid on page 2). Measured on
 * the rendered header (Chrome, Inter): h1 24 px × line-height 1.2 = 28.8,
 * meta line 12.5 px × 1.5 = 18.75 under a 4 px margin, date 11 px × 1.5 =
 * 16.5 under a 2 px margin → 70.05 px — font-independent, every line height
 * being explicit, and exact as long as the title and the meta line stay on
 * one line each, which the print view enforces (nowrap + ellipsis) — plus the
 * grid's 10 px top margin = 80.05 px. 88 keeps 8 px against the paginator's
 * LayoutUnit rounding of the 12 mm spacer rows. The legend, the plant list
 * and the footer are NOT reserved: they flow onto the next page.
 */
export const PRINT_HEADER_RESERVE_PX = 88;

/** How long the print view waits for `afterprint` before unmounting on its
 * own — a safety net for a browser that never fires the event. */
export const PRINT_FALLBACK_MS = 15_000;

/** Upper bound on one html-to-image capture (CodeRabbit #266 round 1): the
 * library awaits every font and image `fetch` without a timeout, so a
 * resource request that never settles would otherwise leave the export job
 * running — and the panel locked — until a reload. Past this delay the
 * capture is abandoned and reported as a failure. */
export const PNG_CAPTURE_TIMEOUT_MS = 20_000;

/** Attribute marking the print view's root: the print stylesheet hides every
 * other direct child of `<body>` and the screen stylesheet hides this one. */
export const PLAN_PRINT_ROOT_ATTR = 'data-plan-print-root';

/**
 * The print stylesheet the print view injects while it is mounted: A4
 * landscape with the lateral 12 mm as native `@page` margins and a ZERO
 * top/bottom margin (on Chrome and Edge that is what keeps the browser's
 * own header and footer — date, URL, page number — off the sheet; on other
 * browsers it depends on the print dialog's « Headers and footers » option),
 * the user-agent `body` margin reset
 * (CodeRabbit #266 round 2, Major: it added ~8 px per side beyond the area
 * `printableAreaPx` models), the view hidden on screen and alone on paper
 * as a `display: table` root whose <thead>/<tfoot> spacer rows carry the
 * vertical 12 mm on every page, and `print-color-adjust: exact` so the
 * browser keeps the cell fills, the §3 hatch and the §15 soil trames (all
 * CSS backgrounds/gradients) on paper.
 */
export const PLAN_PRINT_CSS = `
@page { size: A4 landscape; margin: 0 ${PRINT_PAGE_MM.margin}mm; }
@media screen { [${PLAN_PRINT_ROOT_ATTR}] { display: none; } }
@media print {
  html, body { margin: 0; padding: 0; background: ${getPlannerTokens('light').card}; }
  body > *:not([${PLAN_PRINT_ROOT_ATTR}]) { display: none !important; }
  [${PLAN_PRINT_ROOT_ATTR}] { display: table; width: 100%; border-collapse: collapse; }
  [${PLAN_PRINT_ROOT_ATTR}], [${PLAN_PRINT_ROOT_ATTR}] * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

/**
 * Pixel footprint of the exported grid (axes included) at the export cell
 * size — the exact track formula GardenGrid's overlays use, so the print
 * scale is computed from the column/row counts alone, without measuring a
 * node the screen stylesheet hides.
 */
export function gridPixelSize(
  cols: number,
  rows: number
): { width: number; height: number } {
  return {
    width:
      AXIS_RAIL_PX +
      EXPORT_GAP_PX +
      cols * EXPORT_CELL_PX +
      (cols - 1) * EXPORT_GAP_PX,
    height: COLUMN_AXIS_PX + rows * EXPORT_CELL_PX + (rows - 1) * EXPORT_GAP_PX,
  };
}

/** Printable area left to the grid on the first A4 landscape page, in px:
 * the sheet minus the 12 mm frame, the height minus the header reserve
 * (round 3, V4) so the header and the grid share page 1. */
export function printableAreaPx(): { width: number; height: number } {
  const usable = (mm: number) =>
    (mm - 2 * PRINT_PAGE_MM.margin) * CSS_PX_PER_MM;
  return {
    width: usable(PRINT_PAGE_MM.width),
    height: usable(PRINT_PAGE_MM.height) - PRINT_HEADER_RESERVE_PX,
  };
}

/**
 * Uniform scale (≤ 1) that fits the grid inside the printable area — bounded
 * by the width (the column count, the mockup's rule) AND by the height left
 * under the header on page 1, so a tall garden (up to 50 rows) shrinks to
 * fit instead of being pushed to the next page. Aspect ratio is preserved by
 * construction.
 */
export function printScale(cols: number, rows: number): number {
  const size = gridPixelSize(cols, rows);
  const area = printableAreaPx();
  return Math.min(1, area.width / size.width, area.height / size.height);
}

/**
 * File-name slug of a garden name: diacritics stripped, lowercased, runs of
 * anything else collapsed to one hyphen, no leading/trailing hyphen. Empty
 * when nothing survives — the caller substitutes its localized fallback.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Decodes a percent-encoded data-URL payload into raw bytes: every `%HH`
 * becomes one byte and the literal text between them is UTF-8 encoded —
 * never `decodeURIComponent`, which throws a `URIError` on a binary payload
 * such as `%89PNG` (CodeRabbit #266 round 1). A `%` not followed by two hex
 * digits is kept literally.
 */
function percentDecode(payload: string): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  let i = 0;
  while (i < payload.length) {
    const hex = payload.slice(i + 1, i + 3);
    if (payload[i] === '%' && /^[0-9a-f]{2}$/i.test(hex)) {
      chunks.push(Uint8Array.of(parseInt(hex, 16)));
      total += 1;
      i += 3;
      continue;
    }
    let end = i + 1;
    while (end < payload.length && payload[end] !== '%') end++;
    const text = encoder.encode(payload.slice(i, end));
    chunks.push(text);
    total += text.length;
    i = end;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Decodes a data URL (base64 or percent-encoded) into a Blob carrying the
 * URL's MIME type — html-to-image returns the PNG as a data URL, and the
 * download path works on Blobs (the Profile export precedent).
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) {
    throw new Error('Not a data URL');
  }
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  if (!/;base64$/i.test(header)) {
    return new Blob([percentDecode(payload)], { type });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

/**
 * Downloads a Blob under `filename` — the Profile export path (SMA-341):
 * a transient anchor with the `download` attribute, clicked then removed,
 * the blob URL revoked a tick later so the click can start consuming it.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** How many placements each plant has on the map, keyed by plant id. */
export function countPlacementsByPlant(
  placements: ReadonlyArray<{ plantId: string }>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    counts.set(placement.plantId, (counts.get(placement.plantId) ?? 0) + 1);
  }
  return counts;
}

/** Resolves after two animation frames — React has committed and the browser
 * has laid out the freshly mounted nodes. */
export function afterTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
