// The clock first (#8), then the stored language and colour mode — both read
// the moment the modules below evaluate.
import './freeze';
import './pageSetup';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n/i18n';
import Layout from '../../components/Layout/Layout';
import GardensDashboard from '../../pages/GardensDashboard';
import { AuthProvider } from '../../contexts/AuthContext';
import { ColorModeProvider } from '../../contexts/ColorModeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { capabilitiesFor, presetFor } from '../fixtures/formulas';
import type { DashboardLevel } from '../../types/Dashboard';
import { SCENE_DATA, weatherAll } from './scenes';
import { measureCard, wrappedTexts } from './measure';

/**
 * SMA-437, lot V39, PR B, step B9 — the BROWSER side of the page launcher
 * (`pageChrome.mjs`): the WHOLE page, as the app mounts it on `/gardens` — the
 * real providers, the real `Layout` with its navbar, its toolbar spacer, its
 * `<main>` and « back to top », and `GardensDashboard` — with `fetch` served
 * by the scenes' fixtures: the layout of the formula's preset, the three
 * gardens of `scenes.tsx` (64 plants, 16 varieties), the weather of
 * `weatherAll()`; a visitor for the navbar (401). Nothing reaches a network.
 *
 * The query string drives it: `level` (novice, gardener, expert), `theme`
 * (light, dark), `lang` (fr, en), `prefs=pending` for a layout that never
 * arrives. `window.__page` is what the launcher drives: `ready()`, `measure()`
 * — everything the suite asserts, read in the engine —, `scrollTo(y)` and
 * `settle()`, the focus and the clicks, the marks that tell one node from
 * another, the saves held and released, and the PROBES that break the page on
 * purpose so the suite can prove its checks see a break.
 */

const params = new URLSearchParams(location.search);
const level = (params.get('level') ?? 'expert') as DashboardLevel;
const prefsPending = params.get('prefs') === 'pending';

/** A JSON answer. */
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** The layouts the page wrote, in order — what a gesture in Edit mode sends. */
const saved: unknown[] = [];

/**
 * While the suite holds the saves (`holdSaves()`), a write waits here for
 * `releaseSaves()` (SMA-437, PR #292, fix round 1, R1): « Enregistrement… »
 * is transient, and it cannot end under the measurement that reads it.
 */
let held: Array<() => void> | null = null;

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.startsWith('/api/dashboard/preferences')) {
    if (method === 'PUT') {
      saved.push(JSON.parse(String(init?.body ?? 'null')));
      const answer = () => new Response(null, { status: 204 });
      if (held) {
        const waiting = held;
        return new Promise<Response>((resolve) => waiting.push(() => resolve(answer())));
      }
      return answer();
    }
    if (prefsPending) return new Promise<Response>(() => {});
    // With the formula's capabilities, as the server serves them (SMA-448, S5).
    return json({
      schemaVersion: 1,
      level,
      isPreset: true,
      blocks: presetFor(level),
      updatedAt: null,
      capabilities: capabilitiesFor(level),
    });
  }
  if (url.startsWith('/api/dashboard/weather')) return json(weatherAll());
  if (url.startsWith('/api/dashboard')) return json(SCENE_DATA);
  // A visitor: the navbar of someone not signed in, as the pre-flight measured it.
  if (url.startsWith('/api/auth/')) return new Response(null, { status: 401 });
  return new Response(null, { status: 404 });
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the focus is: the bar, the header, elsewhere on the page, or nowhere (`<body>`). */
export interface ActiveMeasure {
  where: 'bar' | 'header' | 'elsewhere' | 'body';
  /** `data-page-action` of the focused element, when it has one. */
  action: string | null;
  text: string;
  /** The mark `mark()` left on that very node, if any: the same node, not a look-alike. */
  mark: string | null;
}

export interface BarMeasure {
  rect: Rect;
  /** `offsetHeight` — the height, whatever its transform. */
  height: number;
  zIndex: number;
  visibility: string;
  backgroundImage: string;
  ariaHidden: string | null;
  inert: boolean;
  /** `elementFromPoint` at the bar's centre is in the bar: nothing covers it. */
  hitInside: boolean;
  /** The names of its buttons, in order. */
  buttons: string[];
  /** Its texts that are not a button's: the title, « Mode Modifier », the state's copy. */
  label: string;
  copy: string | null;
  /** Its elements that announce: none, the save's region is the header's. */
  statusRoles: number;
  /** The defects `measure.ts` finds in it — the scenes' own instrument. */
  visibleOverlaps: number;
  clipped: string[];
  spills: string[];
  ellipsized: string[];
  wrapped: string[];
}

export interface PageMeasure {
  viewport: { w: number; h: number };
  scrollY: number;
  maxScroll: number;
  navbar: Rect & { zIndex: number };
  /** The header's repeated buttons — their wrapper — in the window, and the bottom of it in the document. */
  headerRow: { rect: Rect; docBottom: number; inert: boolean; ariaHidden: string | null };
  bar: BarMeasure | null;
  /** The regions that carry the save's state (`[data-save-status]`). */
  regions: { count: number; inHeader: boolean; inInert: boolean; text: string; mark: string | null };
  active: ActiveMeasure;
  scrollPaddingTop: string;
  /** The first card of the grid whose bottom is under the line of the two bars, and its top in the window. */
  firstCard: { key: string; top: number } | null;
  fontLoaded: boolean;
}

declare global {
  interface Window {
    __page?: typeof page;
  }
}

/** One decimal: what the suite compares. */
const round = (value: number) => Math.round(value * 10) / 10;

const rectOf = (element: Element): Rect => {
  const box = element.getBoundingClientRect();
  return { x: round(box.left), y: round(box.top), w: round(box.width), h: round(box.height) };
};

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** The `n`-th element `selector` finds, or a throw that names it. */
function nth<T extends Element = Element>(selector: string, n: number): T {
  const element = document.querySelectorAll<T>(selector)[n];
  if (!element) throw new Error(`No element ${selector} #${n}`);
  return element;
}

/** The mark `mark()` left on a node. */
const markOf = (element: Element | null) => (element as (Element & { __mark?: string }) | null)?.__mark ?? null;

const barOf = () => document.querySelector<HTMLElement>('[data-compact-bar]');
const headerRowOf = () => document.querySelector<HTMLElement>('[data-dashboard-header] [data-page-actions]');
const gridCards = () =>
  [...document.querySelectorAll<HTMLElement>('[data-widget]')].filter((card) => !card.closest('[data-drag-overlay]'));

/** The line the bar relays at: the bottom of the navbar plus the bar's own height. */
function line(): number {
  const navbar = document.querySelector('[data-site-navbar]')!.getBoundingClientRect();
  return navbar.bottom + (barOf()?.offsetHeight ?? 0);
}

function measureBar(bar: HTMLElement): BarMeasure {
  const style = getComputedStyle(bar);
  const box = bar.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  const shown = style.visibility !== 'hidden';
  // MUI's ripple — the pulsing circle a button focused at the keyboard draws —
  // is clipped by its button BY DESIGN (`TouchRipple`'s `overflow: hidden`):
  // a decoration, not a text nor a glyph. Out of the measure, for the measure.
  const ripples = [...bar.querySelectorAll<HTMLElement>('.MuiTouchRipple-root')];
  for (const ripple of ripples) ripple.style.visibility = 'hidden';
  const card = shown ? measureCard(bar) : null;
  for (const ripple of ripples) ripple.style.visibility = '';
  const label = [...bar.querySelectorAll('[data-compact-bar-title], [data-compact-bar-mode], [data-compact-bar-status]')]
    .map((node) => node.textContent ?? '')
    .filter(Boolean)
    .join(' | ');
  return {
    rect: rectOf(bar),
    height: bar.offsetHeight,
    zIndex: Number(style.zIndex),
    visibility: style.visibility,
    backgroundImage: style.backgroundImage,
    ariaHidden: bar.getAttribute('aria-hidden'),
    inert: bar.hasAttribute('inert'),
    hitInside: hit !== null && bar.contains(hit),
    buttons: [...bar.querySelectorAll('button')].map((button) => button.textContent ?? ''),
    label,
    copy: bar.querySelector('[data-compact-bar-status]')?.textContent ?? null,
    statusRoles: bar.querySelectorAll('[role="status"], [aria-live]').length,
    visibleOverlaps: card?.visibleOverlaps ?? 0,
    clipped: card?.clipped.map((clip) => `${clip.label} by ${clip.by}`) ?? [],
    spills: card?.spills.map((spill) => `${spill.label} (${spill.spill} px)`) ?? [],
    ellipsized: card?.ellipsized.map((cut) => cut.text) ?? [],
    wrapped: shown ? wrappedTexts(bar) : [],
  };
}

function describeActive(): ActiveMeasure {
  const active = document.activeElement;
  if (!active || active === document.body) return { where: 'body', action: null, text: '', mark: null };
  const where = active.closest('[data-compact-bar]')
    ? 'bar'
    : active.closest('[data-dashboard-header]')
      ? 'header'
      : 'elsewhere';
  return { where, action: active.getAttribute('data-page-action'), text: active.textContent ?? '', mark: markOf(active) };
}

const page = {
  /** The page has drawn what the scenario needs: the fonts in, the grid laid out — or, while the layout never arrives, the header. */
  ready(): boolean {
    if (document.fonts.status !== 'loaded') return false;
    if (!document.querySelector('[data-site-navbar]') || !headerRowOf()) return false;
    if (prefsPending) return true;
    return gridCards().length > 0 && document.querySelectorAll('.MuiSkeleton-root').length === 0;
  },

  /** Waits `frames` frames: the observers report at a frame, React commits, the effects run. */
  async settle(frames = 3): Promise<true> {
    for (let index = 0; index < frames; index += 1) await frame();
    return true;
  },

  /** Scrolls the window, at once, and settles. */
  async scrollTo(y: number): Promise<true> {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    return page.settle();
  },

  measure(): PageMeasure {
    const navbar = document.querySelector('[data-site-navbar]')!;
    const row = headerRowOf()!;
    const bar = barOf();
    const regions = [...document.querySelectorAll('[data-save-status]')];
    const region = regions[0] ?? null;
    const edge = line();
    const card = gridCards().find((candidate) => candidate.getBoundingClientRect().bottom > edge) ?? null;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      scrollY: round(scrollY),
      maxScroll: document.documentElement.scrollHeight - innerHeight,
      navbar: { ...rectOf(navbar), zIndex: Number(getComputedStyle(navbar).zIndex) },
      headerRow: {
        rect: rectOf(row),
        docBottom: round(row.getBoundingClientRect().bottom + scrollY),
        inert: row.hasAttribute('inert'),
        ariaHidden: row.getAttribute('aria-hidden'),
      },
      bar: bar ? measureBar(bar) : null,
      regions: {
        count: regions.length,
        inHeader: region?.closest('[data-dashboard-header]') !== null && region !== null,
        inInert: region?.closest('[inert]') != null,
        text: region?.textContent ?? '',
        mark: markOf(region),
      },
      active: describeActive(),
      scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
      firstCard: card ? { key: card.getAttribute('data-widget') ?? '', top: round(card.getBoundingClientRect().top) } : null,
      fontLoaded: document.fonts.check('16px Inter'),
    };
  },

  /**
   * Focuses the `n`-th element `selector` finds — without scrolling unless
   * `scroll`. False when there is none: a page without the bar goes on being
   * measured, and the checks say what is missing.
   */
  focus(selector: string, scroll = false, n = 0): boolean {
    const element = document.querySelectorAll<HTMLElement>(selector)[n];
    if (!element) return false;
    element.focus({ preventScroll: !scroll });
    return document.activeElement === element;
  },

  /** A click as the pointer gives it, on the `n`-th element `selector` finds. */
  click(selector: string, n = 0): true {
    nth<HTMLElement>(selector, n).click();
    return true;
  },

  /** Leaves `name` on the `n`-th element `selector` finds: `measure()` reads it back — the same node, not a look-alike. False when there is none. */
  mark(name: string, selector: string, n = 0): boolean {
    const element = document.querySelectorAll(selector)[n];
    if (!element) return false;
    (element as Element & { __mark?: string }).__mark = name;
    return true;
  },

  /** The top of the `n`-th element `selector` finds, in the document. */
  docTop(selector: string, n = 0): number {
    return round(nth(selector, n).getBoundingClientRect().top + scrollY);
  },

  /** The top of the `n`-th element `selector` finds, in the window. */
  top(selector: string, n = 0): number {
    return round(nth(selector, n).getBoundingClientRect().top);
  },

  /** How many elements `selector` finds. */
  count(selector: string): number {
    return document.querySelectorAll(selector).length;
  },

  /** The layouts the page has written. */
  saves(): number {
    return saved.length;
  },

  /** From now on, a write of the layout waits for `releaseSaves()`. */
  holdSaves(): true {
    held = [];
    return true;
  },

  /** Answers every write held, and holds no more: how many were waiting. */
  releaseSaves(): number {
    const waiting = held ?? [];
    held = null;
    for (const answer of waiting) answer();
    return waiting.length;
  },

  /**
   * The PROBES — the page broken on purpose, each in the one way a check of
   * the suite exists to see (the rule of SMA-446: an instrument that is never
   * shown a defect proves nothing):
   * - `bar-top-40`: the bar pinned at 40 px, over the navbar;
   * - `wide-label`: « Personnaliser » made wider than its half;
   * - `filled-region`: the save's region replaced by one born FILLED;
   * - `unmount-toggle`: the bar's toggle unmounted at the key, as the header's
   *   two buttons were before #291.
   */
  probe(name: string): boolean {
    const bar = barOf();
    if (name === 'filled-region') {
      const region = document.querySelector('[data-save-status]');
      if (!region) return false;
      const filled = region.cloneNode(false) as HTMLElement;
      filled.textContent = 'Enregistrement…';
      region.replaceWith(filled);
      return true;
    }
    if (!bar) return false;
    if (name === 'bar-top-40') {
      bar.style.top = '40px';
    } else if (name === 'wide-label') {
      const button = bar.querySelector('[data-page-action="customize"]')!;
      button.lastChild!.textContent = 'Personnaliser toute la page, widget par widget';
    } else if (name === 'unmount-toggle') {
      const toggle = bar.querySelector('[data-page-action="edit"]')!;
      toggle.addEventListener(
        'keydown',
        (event) => {
          if ((event as KeyboardEvent).key !== 'Enter') return;
          event.preventDefault();
          event.stopPropagation();
          toggle.replaceWith(toggle.cloneNode(true));
        },
        { capture: true, once: true }
      );
    } else {
      throw new Error(`No probe ${name}`);
    }
    return true;
  },
};

window.__page = page;

createRoot(document.getElementById('root')!).render(
  <ColorModeProvider>
    <LanguageProvider>
      <AuthProvider>
        <UnitSystemProvider>
          <MemoryRouter initialEntries={['/gardens']}>
            <Layout>
              <GardensDashboard />
            </Layout>
          </MemoryRouter>
        </UnitSystemProvider>
      </AuthProvider>
    </LanguageProvider>
  </ColorModeProvider>
);
