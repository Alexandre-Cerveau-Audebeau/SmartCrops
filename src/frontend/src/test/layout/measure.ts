/**
 * SMA-336 mobile lot, step 7 (pre-flight D7) — the in-page measurement of ONE
 * dashboard card, run inside a real layout engine (Chrome headless, see
 * `dashboardLayout.test.tsx`). jsdom lays nothing out — every rect is zero
 * there — so a chevauchement or a clipped line can only be PROVEN absent by a
 * browser. This module is what the pre-flight measured `5282852` with, typed
 * and kept.
 *
 * What it reads, with `getBoundingClientRect`, `Range` rects and
 * `getComputedStyle` only:
 *
 * - the ATOMS of the card: every text node (its own Range rect), every `svg`,
 *   and every painted box (a background or a border) — a chevauchement is a
 *   pair of atoms whose VISIBLE boxes intersect, visible meaning clipped by
 *   every `overflow` ancestor up to the card and by the card's own padding
 *   box, and cut by the sticky occluders that legitimately paint over the
 *   flow (the frozen actions column of the Gardens table, the calendar's
 *   month axis);
 * - what the card or an `overflow: hidden` ancestor CLIPS — the « rogné » of
 *   the visual pass — apart from what a scrolling zone merely keeps below its
 *   fold, which rule 5 of the design contract allows. Measured against EVERY
 *   clipping ancestor at once, each edge of the cut owned by the ancestor
 *   whose box is tightest there (fix round 2, #11 — GitHub `5263906213`): a
 *   line a zone holds but the card cuts — a zone running past the card — is
 *   the card's clip, not a fold, whatever the nearest ancestor scrolls;
 * - the text wider than its own block (a spill), the ellipsized lines, the
 *   scrolling zones and their excess, the smallest font drawn.
 *
 * A chevauchement is VISIBLE from {@link VISIBLE_OVERLAP_PX} in both
 * dimensions; below that, two line boxes touch without their glyphs meeting
 * (the 56 px temperature at `line-height: 1` against the place line above it,
 * measured at 3-4 px on `5282852`) — counted apart, as contacts.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface OverlapMeasure {
  a: string;
  b: string;
  kinds: string;
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface ClipMeasure {
  label: string;
  kind: string;
  /**
   * `card`, or the tag and data attribute of the ancestor whose edge cuts the
   * most — of the ones that cut for good, when a scroller's fold and an outer
   * edge both do (#11).
   */
  by: string;
  /** Every cut edge is a scrolling ancestor's: what is hidden is reachable, not lost. False as soon as one edge is not. */
  scroller: boolean;
  top: number;
  right: number;
  bottom: number;
  left: number;
  h: number;
}

export interface SpillMeasure {
  label: string;
  container: string;
  containerW: number;
  textW: number;
  spill: number;
}

export interface EllipsisMeasure {
  text: string;
  lost: number;
  where: string;
}

export interface ScrollerMeasure {
  where: string;
  axis: string;
  overflowX: number;
  overflowY: number;
  scrollbar: number;
}

export interface CardMeasure {
  card: { w: number; h: number; padding: string };
  body: { h: number; scrollH: number; overflow: number; beyondCard: number };
  gridAutoRows: string;
  gridColumns: string;
  atoms: number;
  overlaps: OverlapMeasure[];
  /** Pairs overlapping by at least {@link VISIBLE_OVERLAP_PX} in both dimensions. */
  visibleOverlaps: number;
  /** Pairs overlapping by less: line boxes touching, no glyph under another. */
  contacts: number;
  clipped: ClipMeasure[];
  /** Atoms cut by the card or by an `overflow: hidden` ancestor — never by a scroller. */
  hardClipped: number;
  spills: SpillMeasure[];
  ellipsized: EllipsisMeasure[];
  scrollers: ScrollerMeasure[];
  minFont: number;
  smallFonts: { label: string; px: number }[];
  fontLoaded: boolean;
}

export const VISIBLE_OVERLAP_PX = 5;

/** The id of the `<pre>` the harness page ends on — its results, base64 — and the prefix of its error and progress lines. */
export const RESULTS_ID = 'layout-results';

/** To a tenth of a pixel — what the report prints. */
const round = (v: number) => Math.round(v * 10) / 10;

/** A box with its width and height, from any rect-like. */
const boxOf = (r: { left: number; top: number; right: number; bottom: number }): Box => ({
  left: r.left,
  top: r.top,
  right: r.right,
  bottom: r.bottom,
  width: r.right - r.left,
  height: r.bottom - r.top,
});

/** The element's border box. */
const rectOf = (el: Element): Box => boxOf(el.getBoundingClientRect());

/** The intersection of two boxes — its width or height is ≤ 0 when they do not meet. */
const intersect = (a: Box, b: Box): Box =>
  boxOf({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });

/** The element's padding box — its border box less its borders — which is what its own `overflow` clips to. */
const paddingBox = (el: Element): Box => {
  const b = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return boxOf({
    left: b.left + (parseFloat(cs.borderLeftWidth) || 0),
    top: b.top + (parseFloat(cs.borderTopWidth) || 0),
    right: b.right - (parseFloat(cs.borderRightWidth) || 0),
    bottom: b.bottom - (parseFloat(cs.borderBottomWidth) || 0),
  });
};

/** The union of the Range rects of the element's OWN text nodes, or null when it has none drawn. */
function textRect(el: Element): Box | null {
  let r: Box | null = null;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? '').trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const b = range.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    r = r
      ? boxOf({
          left: Math.min(r.left, b.left),
          top: Math.min(r.top, b.top),
          right: Math.max(r.right, b.right),
          bottom: Math.max(r.bottom, b.bottom),
        })
      : boxOf(b);
  }
  return r;
}

/** The element's OWN text — its direct text nodes, whitespace collapsed. */
const ownText = (el: Element): string =>
  Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

/** The alpha of a CSS colour: 0 for `transparent`, the fourth channel of an `rgba()`, 1 otherwise. */
const alpha = (color: string): number => {
  const m = /rgba?\(([^)]+)\)/.exec(color || '');
  if (!m) return color && color !== 'transparent' ? 1 : 0;
  const parts = m[1]!.split(',').map((s) => parseFloat(s));
  return parts.length === 4 ? parts[3]! : 1;
};

/** The nearest `data-*` attribute (or MUI chip / button class) that names where an element sits. */
function dataTag(el: Element, stop: Element): string {
  let e: Element | null = el;
  while (e && e !== stop.parentElement) {
    for (const attr of Array.from(e.attributes)) {
      if (attr.name.startsWith('data-') && attr.name !== 'data-widget' && attr.name !== 'data-emotion') {
        return attr.name.replace('data-', '') + (attr.value ? `=${attr.value}` : '');
      }
    }
    if (e.classList.contains('MuiChip-root')) return 'chip';
    if (e.classList.contains('MuiButton-root')) return 'button';
    e = e.parentElement;
  }
  return '';
}

/** Drawn at all: not `display: none`, not `visibility: hidden`, not transparent, and wider and taller than a pixel. */
function visible(el: Element): boolean {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  const b = el.getBoundingClientRect();
  return b.width > 1 && b.height > 1;
}

/** The style clips its overflow on at least one axis. */
const clips = (cs: CSSStyleDeclaration) => cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
/** …and lets it scroll (`auto` or `scroll`) rather than hiding it. */
const scrolls = (cs: CSSStyleDeclaration) => /auto|scroll/.test(cs.overflowX + cs.overflowY);

/** One ancestor that bounds what an element can show: its padding box, and whether it scrolls — what it cuts is then reachable. */
interface Clipper {
  el: Element;
  box: Box;
  scroller: boolean;
}

/**
 * The ancestors that clip, nearest first, the card last: the card bounds every
 * atom — its own `overflow: hidden` — and is listed whatever its style says.
 */
function clippers(el: Element, card: Element): Clipper[] {
  const found: Clipper[] = [];
  let e = el.parentElement;
  while (e) {
    const cs = getComputedStyle(e);
    if (e === card) {
      found.push({ el: e, box: paddingBox(e), scroller: clips(cs) && scrolls(cs) });
      break;
    }
    if (clips(cs)) found.push({ el: e, box: paddingBox(e), scroller: scrolls(cs) });
    e = e.parentElement;
  }
  if (found[found.length - 1]?.el !== card) {
    found.push({ el: card, box: paddingBox(card), scroller: false });
  }
  return found;
}

type Edge = 'top' | 'right' | 'bottom' | 'left';
const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

/**
 * Where an element can be seen, and WHO bounds each side of it (#11): the
 * card's padding box cut by every clipping ancestor — one intersection — with
 * each edge owned by the ancestor whose box is tightest there, the nearest one
 * when two coincide. `nearest` is the innermost clipping ancestor: what says
 * whether the element sits in a scrolling zone.
 */
function clipFrame(el: Element, card: Element): { box: Box; owner: Record<Edge, Clipper>; nearest: Clipper } {
  const all = clippers(el, card);
  const outer = all[all.length - 1]!;
  const owner: Record<Edge, Clipper> = { top: outer, right: outer, bottom: outer, left: outer };
  // From the card inwards, so the nearest ancestor keeps an edge two share.
  for (let i = all.length - 1; i >= 0; i -= 1) {
    const c = all[i]!;
    if (c.box.top >= owner.top.box.top) owner.top = c;
    if (c.box.left >= owner.left.box.left) owner.left = c;
    if (c.box.bottom <= owner.bottom.box.bottom) owner.bottom = c;
    if (c.box.right <= owner.right.box.right) owner.right = c;
  }
  const box = boxOf({ top: owner.top.box.top, left: owner.left.box.left, bottom: owner.bottom.box.bottom, right: owner.right.box.right });
  return { box, owner, nearest: all[0]! };
}

/** The region an element can be seen in: the card's padding box, cut by EVERY clipping ancestor — and, with `includeSelf`, by its own `overflow`. */
function clipBoxFor(el: Element, card: Element, includeSelf: boolean): Box {
  const box = clipFrame(el, card).box;
  return includeSelf && clips(getComputedStyle(el)) ? intersect(box, paddingBox(el)) : box;
}

interface Occluder {
  el: Element;
  box: Box;
  /** A `top`-stuck header hides what scrolls under it; a `right`-stuck column what scrolls beside it. */
  axis: 'vertical' | 'horizontal';
}

/**
 * The sticky elements of the card — the frozen actions column of the Gardens
 * table (`position: sticky; right: 0`, amendment A4) and the month axis of the
 * calendar (`position: sticky; top: 0`, V27). They are opaque and paint OVER
 * the flow by design: a cell that has scrolled under the column is hidden, not
 * overlapped. What they cover is removed from the visible box of every atom
 * they do not contain.
 */
function occluders(card: Element): Occluder[] {
  const found: Occluder[] = [];
  for (const el of Array.from(card.querySelectorAll('*'))) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky' || !visible(el)) continue;
    found.push({ el, box: rectOf(el), axis: cs.top !== 'auto' ? 'vertical' : 'horizontal' });
  }
  return found;
}

/** The box less what the sticky occluders paint over it — an occluder hides neither its own subtree nor an ancestor. */
function occlude(box: Box, el: Element, list: Occluder[]): Box {
  let out = box;
  for (const occ of list) {
    if (occ.el === el || occ.el.contains(el) || el.contains(occ.el)) continue;
    const meets = intersect(out, occ.box);
    if (meets.width <= 0 || meets.height <= 0) continue;
    if (occ.axis === 'vertical') {
      out = out.top >= occ.box.top ? boxOf({ ...out, top: Math.max(out.top, occ.box.bottom) }) : boxOf({ ...out, bottom: Math.min(out.bottom, occ.box.top) });
    } else {
      out = out.left < occ.box.left ? boxOf({ ...out, right: Math.min(out.right, occ.box.left) }) : boxOf({ ...out, left: Math.max(out.left, occ.box.right) });
    }
  }
  return out;
}

interface Atom {
  el: Element;
  kind: 'text' | 'svg' | 'box' | 'panel';
  rect: Box;
  vis: Box;
  label: string;
  fontSize: number;
  display: string;
}

/**
 * Measures ONE dashboard card — the `[data-widget]` element — in the engine it
 * is mounted in: its atoms, their visible overlaps, what the card or an
 * `overflow: hidden` ancestor clips, the text drawn past its block, the
 * ellipsized lines, the scrolling zones, the smallest font, and the grid's
 * row and column templates. Pure reading: nothing in the DOM is changed.
 */
export function measureCard(card: HTMLElement): CardMeasure {
  const slot = card.parentElement!.parentElement!;
  const grid = slot.parentElement!;
  const cardRect = rectOf(card);
  const clip = paddingBox(card);
  const body = card.lastElementChild as HTMLElement;
  const sticky = occluders(card);

  const atoms: Atom[] = [];
  for (const el of Array.from(card.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'style' || tag === 'script') continue;
    // MUI's outlined field draws its border on a `fieldset` whose `legend`
    // opens a notch UNDER the floating label, and its adornment icon sits
    // inside that border box: the label and the icon are on the frame by
    // design, not over it.
    if (el.classList.contains('MuiOutlinedInput-notchedOutline')) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const txt = ownText(el);
    let kind: Atom['kind'];
    let rect: Box | null;
    let label: string;
    if (tag === 'svg') {
      kind = 'svg';
      rect = rectOf(el);
      label = `svg[${dataTag(el, card)}]`;
    } else if (txt) {
      kind = 'text';
      rect = textRect(el);
      if (!rect) continue;
      label = `"${txt.slice(0, 44)}"`;
    } else {
      const painted =
        alpha(cs.backgroundColor) > 0 ||
        cs.backgroundImage !== 'none' ||
        (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none');
      if (!painted) continue;
      rect = rectOf(el);
      kind = el.children.length === 0 ? 'box' : 'panel';
      label = `${kind}:${tag}[${dataTag(el, card)}]`;
    }
    if (rect.width <= 0.5 || rect.height <= 0.5) continue;
    const vis = occlude(intersect(rect, clipBoxFor(el, card, kind === 'text')), el, sticky);
    atoms.push({ el, kind, rect, vis, label, fontSize: parseFloat(cs.fontSize), display: cs.display });
  }

  const overlaps: OverlapMeasure[] = [];
  for (let a = 0; a < atoms.length; a += 1) {
    for (let b = a + 1; b < atoms.length; b += 1) {
      const A = atoms[a]!;
      const B = atoms[b]!;
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      /** A painted box or panel: two of them may meet by design (a chip on its tinted row), so only text and glyphs count against them. */
      const boxes = (k: Atom['kind']) => k === 'box' || k === 'panel';
      if (boxes(A.kind) && boxes(B.kind)) continue;
      if (A.vis.width <= 0 || A.vis.height <= 0 || B.vis.width <= 0 || B.vis.height <= 0) continue;
      const l = Math.max(A.vis.left, B.vis.left, clip.left);
      const t = Math.max(A.vis.top, B.vis.top, clip.top);
      const r = Math.min(A.vis.right, B.vis.right, clip.right);
      const bo = Math.min(A.vis.bottom, B.vis.bottom, clip.bottom);
      const w = r - l;
      const h = bo - t;
      if (w <= 1 || h <= 1) continue;
      overlaps.push({
        a: A.label,
        b: B.label,
        kinds: `${A.kind}/${B.kind}`,
        w: round(w),
        h: round(h),
        x: round(l - cardRect.left),
        y: round(t - cardRect.top),
      });
    }
  }

  const clipped: ClipMeasure[] = [];
  const spills: SpillMeasure[] = [];
  const smallFonts: { label: string; px: number }[] = [];
  let minFont = 999;
  let maxBottom = -Infinity;
  for (const at of atoms) {
    // Against every clipping ancestor at once (#11): the tightest edge on
    // each side, whoever owns it — the card's bottom inside a zone that runs
    // past the card is the card's cut, not the zone's fold.
    const frame = clipFrame(at.el, card);
    const cut: Record<Edge, number> = {
      top: Math.max(0, frame.box.top - at.rect.top),
      right: Math.max(0, at.rect.right - frame.box.right),
      bottom: Math.max(0, at.rect.bottom - frame.box.bottom),
      left: Math.max(0, frame.box.left - at.rect.left),
    };
    const cutEdges = EDGES.filter((edge) => cut[edge] > 1);
    // A line the design ELLIPSIZES is cut on the right by design — « Thym,
    // Romarin, Courgette +7 », a title before its chip — and reported under
    // `ellipsized`, not as a clip. Every other cut is a clip: through the
    // bottom of a line, on the left, or by a container that draws no ellipsis.
    const ellipsis =
      cutEdges.length === 1 &&
      cutEdges[0] === 'right' &&
      (getComputedStyle(at.el).textOverflow === 'ellipsis' || getComputedStyle(frame.owner.right.el).textOverflow === 'ellipsis');
    if (!ellipsis && cutEdges.length > 0) {
      // Reachable only if EVERY cut edge is a scrolling ancestor's: a zone's
      // fold gives back what a scroll asks for; the card's edge, or an
      // `overflow: hidden` ancestor's, gives nothing back — inside a zone too.
      const hard = cutEdges.filter((edge) => !frame.owner[edge].scroller);
      /** The edge that cuts the most, among the given ones. */
      const worst = (edges: Edge[]): Edge => edges.reduce((a, b) => (cut[b] > cut[a] ? b : a));
      const by = frame.owner[worst(hard.length > 0 ? hard : cutEdges)].el;
      clipped.push({
        label: at.label,
        kind: at.kind,
        by: by === card ? 'card' : `${by.tagName.toLowerCase()}[${dataTag(by, card)}]`,
        scroller: hard.length === 0,
        right: round(cut.right),
        left: round(cut.left),
        bottom: round(cut.bottom),
        top: round(cut.top),
        h: round(at.rect.height),
      });
    }
    if (at.kind === 'text') {
      let container: Element | null = /^inline/.test(at.display) ? at.el.parentElement : at.el;
      while (container && container !== card && /^inline/.test(getComputedStyle(container).display)) {
        container = container.parentElement;
      }
      // Seen past its block: a text its own block clips (an ellipsized title,
      // a name in a 69 px column) is reported by the clip and ellipsis passes.
      if (container && !clips(getComputedStyle(container))) {
        const cb = paddingBox(container);
        const spill = Math.max(0, at.rect.right - cb.right);
        const spillL = Math.max(0, cb.left - at.rect.left);
        if (spill > 1 || spillL > 1) {
          spills.push({
            label: at.label,
            container: `${container.tagName.toLowerCase()}[${dataTag(container, card)}]`,
            containerW: round(cb.width),
            textW: round(at.rect.width),
            spill: round(Math.max(spill, spillL)),
          });
        }
      }
      if (at.fontSize < minFont) minFont = at.fontSize;
      if (at.fontSize < 14) smallFonts.push({ label: at.label, px: at.fontSize });
    }
    // Below the card's edge and NOT in a scrolling zone: lost, where a zone's
    // fold is reachable (rule 5: « défile à l'intérieur de la carte »). A zone
    // that itself runs past the card is caught by the clip pass above.
    if (!frame.nearest.scroller && at.rect.bottom > maxBottom) maxBottom = at.rect.bottom;
  }

  const ellipsized: EllipsisMeasure[] = [];
  const scrollers: ScrollerMeasure[] = [];
  for (const el of Array.from(card.querySelectorAll('*'))) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) {
      ellipsized.push({
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 44),
        lost: el.scrollWidth - el.clientWidth,
        where: dataTag(el, card),
      });
    }
    const sx = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const sy = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    if (sx || sy) {
      const html = el as HTMLElement;
      scrollers.push({
        where: `${el.tagName.toLowerCase()}[${dataTag(el, card)}]`,
        axis: (sx ? 'x' : '') + (sy ? 'y' : ''),
        overflowX: el.scrollWidth - el.clientWidth,
        overflowY: el.scrollHeight - el.clientHeight,
        scrollbar: round(
          html.offsetWidth - el.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0)
        ),
      });
    }
  }

  const gridStyle = getComputedStyle(grid);
  const cardStyle = getComputedStyle(card);
  return {
    card: { w: round(cardRect.width), h: round(cardRect.height), padding: `${cardStyle.paddingTop}/${cardStyle.paddingLeft}` },
    body: {
      h: round(rectOf(body).height),
      scrollH: body.scrollHeight,
      overflow: Math.max(0, body.scrollHeight - body.clientHeight),
      beyondCard: round(Math.max(0, maxBottom - clip.bottom)),
    },
    gridAutoRows: gridStyle.gridAutoRows,
    gridColumns: gridStyle.gridTemplateColumns,
    atoms: atoms.length,
    overlaps,
    visibleOverlaps: overlaps.filter((o) => Math.min(o.w, o.h) >= VISIBLE_OVERLAP_PX).length,
    contacts: overlaps.filter((o) => Math.min(o.w, o.h) < VISIBLE_OVERLAP_PX).length,
    clipped,
    hardClipped: clipped.filter((c) => !c.scroller).length,
    spills,
    ellipsized,
    scrollers,
    minFont,
    smallFonts,
    fontLoaded: typeof document.fonts !== 'undefined' ? document.fonts.check('16px Inter') : false,
  };
}
