// The clock first (#8), then the stored language and colour mode — both read
// the moment the modules below evaluate.
import './freeze';
import './pageSetup';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '../../i18n/i18n';
import Layout from '../../components/Layout/Layout';
import GardensDashboard from '../../pages/GardensDashboard';
import GardenPlanner from '../../pages/GardenPlanner';
import { AuthProvider } from '../../contexts/AuthContext';
import { ColorModeProvider } from '../../contexts/ColorModeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { capabilitiesFor, catalogFor, presetFor } from '../fixtures/formulas';
import type { DashboardLevel, DashboardSize } from '../../types/Dashboard';
import {
  CHOICE_SCENES,
  NOVICE_SCENES,
  PLANNER_GARDEN,
  PLANNER_LAYOUT,
  SCENE_DATA,
  WEATHER_CITY_SCENES,
  choiceSceneCatalog,
  noviceSceneData,
  weatherAll,
  weatherCitySceneData,
  type ChoiceScene,
  type NoviceScene,
  type WeatherCityScene,
} from './scenes';
import { measureCard, wrappedTexts, type CardMeasure } from './measure';

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
 *
 * SMA-448, lot F2 — PR #296, fix round 1, S1: the Novice page is measured
 * HERE, on the page the app mounts, and no longer on a tree the scenes'
 * harness rebuilt beside it (the Extension's two comments on `noviceTree`: a
 * harness that could stay green while the real page broke). `scene=<name>`
 * names a Novice scene of `scenes.tsx`, whose gardens and weather `fetch`
 * serves the REAL page; `measureNovice()` reads the page as one card and card
 * by card; `fail=gardens` answers the aggregate with a 500, for the proof
 * that a page showing its load error is never taken for ready.
 */

const params = new URLSearchParams(location.search);
const level = (params.get('level') ?? 'expert') as DashboardLevel;
const prefsPending = params.get('prefs') === 'pending';

const sceneName = params.get('scene');
const scene: NoviceScene | null = sceneName
  ? (NOVICE_SCENES.find((candidate) => candidate.name === sceneName) ?? null)
  : null;
if (sceneName && !scene) throw new Error(`No Novice scene ${sceneName}`);
/** What `fetch` serves the page for the scene: its aggregate and its weather — the same data the scene's expected cards are derived from. */
const served = scene ? noviceSceneData(scene) : null;
/** The gardens' aggregate answered 500: the page shows its load error, and must never be measured as if it were drawn. */
const failGardens = params.get('fail') === 'gardens';

// SMA-448, lot F3, step L7 — the choice screen, the refusals of the creation
// and of the planner's save, on the real pages.
/** The choice screen's scene (`scenes.tsx`): what `/api/formulas` serves, whether the account chose, the formula the page stands at. */
const choiceName = params.get('choice');
const choiceScene: ChoiceScene | null = choiceName
  ? (CHOICE_SCENES.find((candidate) => candidate.name === choiceName) ?? null)
  : null;
if (choiceName && !choiceScene) throw new Error(`No choice scene ${choiceName}`);
/** The creation refused by the formula's limit (403 `formula.gardenLimit`), or by a session that expired (401). */
const createOutcome = params.get('create');
/** The planner's page instead of the dashboard, on the Novice's 20 x 20 garden. */
const plannerPage = params.get('page') === 'planner';
/**
 * The planner's save refused for the plan's size (403 `formula.gardenSize`)
 * or by a session that expired (401). Either makes the catalogue unreadable
 * too: the add buttons then stay live — the server is the judge — and a
 * 21st row can be asked for and refused.
 */
const saveOutcome = params.get('save');
/** The formula the page stands at: the choice scene's, or the query's. */
const pageLevel: DashboardLevel = choiceScene ? choiceScene.level : level;

// SMA-448, lot F4, step W5 — the Weather widget by formula: the cities the
// aggregate serves (`weather=one|two|five|long`) and the size the stored
// layout gives the widget (`wsize=small|medium|large|wide`). The size goes
// through the page's own read of the layout: one the formula does not permit
// comes back to the preset's, as on the real page.
const weatherKindName = params.get('weather');
const weatherKind: WeatherCityScene | null = weatherKindName
  ? ((WEATHER_CITY_SCENES as readonly string[]).includes(weatherKindName) ? (weatherKindName as WeatherCityScene) : null)
  : null;
if (weatherKindName && !weatherKind) throw new Error(`No weather scene ${weatherKindName}`);
const weatherSize = params.get('wsize') as DashboardSize | null;
/** What `fetch` serves the page for the weather scene: its gardens and its aggregate — one place per city. */
const weatherServed = weatherKind ? weatherCitySceneData(weatherKind) : null;

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

/** An RFC 9457 problem, as the API refuses. */
const problem = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } });

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.startsWith('/api/formulas')) {
    if (plannerPage && saveOutcome) return new Response(null, { status: 500 });
    return json(choiceScene ? choiceSceneCatalog(choiceScene) : catalogFor(plannerPage ? 'novice' : pageLevel, { gardenCount: 3 }));
  }
  if (url.startsWith('/api/gardens/g1/layout')) {
    if (method === 'PUT') {
      if (saveOutcome === 'refused') {
        return problem(403, {
          status: 403,
          code: 'formula.gardenSize',
          formula: 'novice',
          limit: { width: 20, height: 20 },
          current: { width: 20, height: 20 },
          requested: { width: 20, height: 21 },
        });
      }
      if (saveOutcome === 'unauthorized') return new Response(null, { status: 401 });
      return new Response(null, { status: 204 });
    }
    return json(PLANNER_LAYOUT);
  }
  if (url.startsWith('/api/gardens/g1')) return json(PLANNER_GARDEN);
  if (url.startsWith('/api/gardens')) {
    if (method === 'POST') {
      if (createOutcome === 'limit') {
        return problem(403, { status: 403, code: 'formula.gardenLimit', formula: 'novice', limit: 3, current: 3 });
      }
      if (createOutcome === 'unauthorized') return new Response(null, { status: 401 });
      return json({ id: 'g9', name: 'Nouveau', description: null });
    }
    return json([]);
  }
  if (url.startsWith('/api/plants')) return json([]);
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
      level: pageLevel,
      isPreset: true,
      // The choice screen opens by itself on an account that never chose (N18).
      formulaChosen: choiceScene ? choiceScene.chosen : true,
      // A stored layout with the Weather widget at the asked size (lot F4, W5).
      blocks: presetFor(pageLevel).map((block) =>
        weatherSize && block.key === 'weather' ? { ...block, size: weatherSize, hidden: false } : block
      ),
      updatedAt: null,
      capabilities: capabilitiesFor(pageLevel),
    });
  }
  if (url.startsWith('/api/dashboard/weather')) {
    return json(served ? served.weather : weatherServed ? weatherServed.weather : weatherAll());
  }
  if (url.startsWith('/api/dashboard')) {
    if (failGardens) return new Response(null, { status: 500 });
    return json(served ? served.data : weatherServed ? weatherServed.data : SCENE_DATA);
  }
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

/**
 * SMA-448, lot F2 — PR #296, fix round 1, V1 (Alexandre's finding of 27/09):
 * the plan in a card's band. `frame` is the slot the plan must fill — the
 * `data-novice-plan` frame, or the band less its padding —, `drawn` the box
 * the plan is drawn at (before the frame crops it), and `covered` whether
 * the drawing reaches every edge of the frame, to half a pixel.
 */
export interface PlanMeasure {
  frame: Rect;
  drawn: Rect;
  covered: boolean;
}

/**
 * A planting of a plan (PR #296, fix round 2, U2 — GitHub `4115367541`):
 * what it spans, the cell it is drawn from, the area its cells make, and the
 * box it draws — all relative to the preview, to a tenth of a pixel. The
 * suite computes the box it OWES from the rule — a share of ONE cell on each
 * side under cover, `plantInsetPx` contained — and compares; this reads.
 */
export interface PlantingMeasure {
  /** `${rows}x${cols}`. */
  span: string;
  /** The cell at its top-left corner: the unit its inset is a share of. */
  cell: { w: number; h: number };
  /** The union of the cells it spans. */
  area: Rect;
  /** The box it draws. */
  drawn: Rect;
}

/**
 * SMA-448, lot F4, step W5 — THE WEATHER WIDGET BY FORMULA as the app mounts
 * it: the card measured as the scenes' harness measures one, and the form it
 * took — the place line, the Gardener's honest line, the Expert's compact
 * navigator, its named tabs, its Full width in columns — with what each form
 * draws, so the suite can say the right form stands at the right size.
 */
export interface WeatherMeasure extends CardMeasure {
  viewport: number;
  /** The widget's accessible name: its city, or « Météo » in the Full width of several cities. */
  region: string | null;
  /** How many place lines the card writes — one, or none under the tabs and in the Full width. */
  placeLines: number;
  /** The Gardener's honest line, and its link. */
  honest: string | null;
  honestLink: boolean;
  /** The Expert's compact navigator: present, its rank « 1 / 6 », its dots. */
  nav: boolean;
  rank: string | null;
  dots: number;
  /** The Expert's named tabs, their labels. */
  tabs: string[];
  /** The Full width: its summary pill, its columns (none for one city, read in full), and the rows they take. */
  summary: string | null;
  columns: number;
  columnRows: number;
  columnsPerRow: number;
  /** The garden names of the columns, and whether one of them is ellipsized — none may be. */
  columnGardens: string[];
  /** The weather warning under the grid, drawn or not (V1). */
  warning: boolean;
  /** The height and the content height of the card's parts, by their data tag — what a card that hides its own content says. */
  parts: Record<string, { h: number; scrollH: number }>;
}

/**
 * SMA-448, lot F2 (N5; PR #296, fix round 1, S1) — the Novice page measured
 * as one card — the `Container` of `GardensDashboard`, every atom against
 * every other — and card by card (each card as a card, its box relative to
 * the page). `body` is the gardens' own zone (`data-novice-page`: the cards,
 * or the empty state, and the foot message), not the container's last child
 * — the warning, when it shows (the Extension's second draw, `04a18a9d…`).
 */
export interface NoviceMeasure extends CardMeasure {
  scene: string;
  viewport: number;
  /** The gardens' zone, relative to the page: what `body` measures. */
  content: Rect;
  /** Each card: its measure, its box relative to the page, its plan band (V1), the plantings the plan draws (U2) and its foot (S3). */
  cards: Array<CardMeasure & { id: string; box: Rect; plan: PlanMeasure | null; plantings: PlantingMeasure[]; foot: Rect }>;
  /** Every pair of cards whose boxes intersect by more than a pixel (S3 — as `measureGrid` reads the grid's). */
  cardOverlaps: string[];
  /** The header's zone texts drawn over more than one line — none belongs on two. */
  wrapped: string[];
  /** The weather warning under the cards, drawn or not (V1). */
  warning: boolean;
  /** The chip is the button of N3 — the provisional door to another formula. */
  chipButton: boolean;
  /** How many columns the cards take: their distinct left edges. */
  columns: number;
}

/**
 * SMA-448, lot F3, step L7 — a dialog or a toast measured as one card: its
 * paper, every atom against every other, plus what it says and offers.
 */
export interface DialogMeasure extends CardMeasure {
  rect: Rect;
  text: string;
  buttons: Array<{ text: string; disabled: boolean }>;
}

/** The choice screen (V3-01) measured on the real page: the panel as one card, and the situation it draws. */
export interface ChoiceMeasure extends DialogMeasure {
  scene: string;
  viewport: number;
  /** The window's height (SMA-448, PR #297, fix round 1, A2): what is seen without scrolling. */
  viewportHeight: number;
  /** No way out: the account never chose. */
  mandatory: boolean;
  closeButton: boolean;
  /**
   * Each offer, in the catalogue's order: its tags, its button — and where
   * the button stands in the window (A2: seen entirely, or not, without
   * scrolling) —, the reason it is unavailable, what a kept formula says.
   */
  offers: Array<{ key: string; tags: string[]; button: { text: string; disabled: boolean; rect: Rect }; why: string | null; kept: string | null }>;
  /** Which form of the comparison is DRAWN: the table from 900 px, the lists under it. */
  compare: 'table' | 'lists' | 'none';
  /** The veil: its computed colour, and its blur. */
  backdrop: { color: string; filter: string };
  /** The page's title in the window, and whether the panel starts under it — the header seen above the veil (V3-01). */
  title: Rect | null;
  titleClear: boolean;
  /** V1: no weather warning on the screen, ever. */
  warning: boolean;
  /**
   * The comparison's cells as DRAWN — the table's from 900 px, the lists'
   * under it —, each with its computed colour and weight and the tone it
   * declares (SMA-448, PR #297, fix round 1, S3: the tone by meaning).
   */
  compareCells: Array<{ text: string; color: string; weight: string; tone: string | null }>;
}

/** The planner's shape mode at the formula's limit: the note that says why, the four add buttons inert, the four remove buttons live. */
export interface PlannerLimitMeasure {
  /** The note: its box, its words, and what it cannot show — the text past its box, in px, each way. */
  note: { rect: Rect; text: string; overflowX: number; overflowY: number; whiteSpace: string } | null;
  /** The top +/- row's box, and the gap between the note's bottom and its top: never negative. */
  topRow: Rect | null;
  gap: number | null;
  adds: Array<{ label: string; disabled: boolean }>;
  removes: Array<{ label: string; disabled: boolean }>;
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

/** A box to a tenth of a pixel, relative to `origin`. */
const rectWithin = (element: Element, origin: DOMRect): Rect => {
  const box = element.getBoundingClientRect();
  return { x: round(box.left - origin.left), y: round(box.top - origin.top), w: round(box.width), h: round(box.height) };
};

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The plan of a Novice card and its slot (V1): the `data-novice-plan` frame
 * — or, before it existed, the band's content box, the slot the mock-up's
 * `.thumb { width: 100%; height: 100% }` fills — and the preview drawn in it.
 * Null when the card draws no plan (the garden has none).
 */
function planOf(card: HTMLElement, origin: DOMRect): PlanMeasure | null {
  const slot = card.querySelector<HTMLElement>('[data-novice-plan]') ?? card.querySelector<HTMLElement>('[data-novice-band]');
  const preview = slot?.querySelector<HTMLElement>('[data-testid="template-preview"]');
  if (!slot || !preview) return null;
  const style = getComputedStyle(slot);
  const box = slot.getBoundingClientRect();
  const inner = {
    left: box.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0),
    top: box.top + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0),
    right: box.right - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(style.paddingRight) || 0),
    bottom: box.bottom - (parseFloat(style.borderBottomWidth) || 0) - (parseFloat(style.paddingBottom) || 0),
  };
  const drawn = preview.getBoundingClientRect();
  return {
    frame: {
      x: round(inner.left - origin.left),
      y: round(inner.top - origin.top),
      w: round(inner.right - inner.left),
      h: round(inner.bottom - inner.top),
    },
    drawn: rectWithin(preview, origin),
    covered:
      drawn.left <= inner.left + 0.5 &&
      drawn.top <= inner.top + 0.5 &&
      drawn.right >= inner.right - 0.5 &&
      drawn.bottom >= inner.bottom - 0.5,
  };
}

/**
 * The plantings a preview draws (U2 — GitHub `4115367541`): for each, the
 * cells it spans — read from its grid lines —, the area those cells make,
 * the box it draws, and the cell at its corner, the unit its inset is a
 * share of. Relative to the preview's own box, so a transform on the preview
 * (the cover's centring) cancels out. Nothing of the rule lives here: the
 * suite says what the box must be, this reads what it is.
 */
function plantingsOf(preview: HTMLElement | null): PlantingMeasure[] {
  if (!preview) return [];
  const origin = preview.getBoundingClientRect();
  const cells = new Map<string, DOMRect>();
  for (const cell of preview.querySelectorAll<HTMLElement>('[data-testid="template-preview-cell"]')) {
    const style = getComputedStyle(cell);
    cells.set(`${style.gridRowStart}:${style.gridColumnStart}`, cell.getBoundingClientRect());
  }
  const spanOf = (end: string) => (end.startsWith('span ') ? Number(end.slice('span '.length)) : 1);
  return [...preview.querySelectorAll<HTMLElement>('[data-testid="template-preview-plant"]')].map((plant) => {
    const style = getComputedStyle(plant);
    const row = Number(style.gridRowStart);
    const col = Number(style.gridColumnStart);
    const rows = spanOf(style.gridRowEnd);
    const cols = spanOf(style.gridColumnEnd);
    const first = cells.get(`${row}:${col}`);
    const last = cells.get(`${row + rows - 1}:${col + cols - 1}`);
    if (!first || !last) throw new Error(`No cell under the planting at row ${row}, column ${col}, spanning ${rows} × ${cols}.`);
    const drawn = plant.getBoundingClientRect();
    return {
      span: `${rows}x${cols}`,
      cell: { w: round(first.width), h: round(first.height) },
      area: {
        x: round(first.left - origin.left),
        y: round(first.top - origin.top),
        w: round(last.right - first.left),
        h: round(last.bottom - first.top),
      },
      drawn: { x: round(drawn.left - origin.left), y: round(drawn.top - origin.top), w: round(drawn.width), h: round(drawn.height) },
    };
  });
}

/** The `n`-th element `selector` finds, or a throw that names it. */
function nth<T extends Element = Element>(selector: string, n: number): T {
  const element = document.querySelectorAll<T>(selector)[n];
  if (!element) throw new Error(`No element ${selector} #${n}`);
  return element;
}

/** The mark `mark()` left on a node. */
const markOf = (element: Element | null) => (element as (Element & { __mark?: string }) | null)?.__mark ?? null;

const barOf = () => document.querySelector<HTMLElement>('[data-compact-bar]');
/**
 * The header's repeated buttons — their wrapper — or, on the Novice page,
 * which repeats none (SMA-448, lot F2: no « Modifier », no « Personnaliser »),
 * the header's whole actions zone: the row the scenarios scroll past.
 */
const headerRowOf = () =>
  document.querySelector<HTMLElement>('[data-dashboard-header] [data-page-actions]') ??
  document.querySelector<HTMLElement>('[data-dashboard-header] [data-dashboard-actions]');
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
  /**
   * The page has drawn what the scenario needs: the fonts in, the grid laid
   * out — or the Novice page DRAWN, its cards or its empty state (SMA-448,
   * lot F2), never its load error (PR #296, fix round 1: the Extension's
   * second draw, `11595896…` — the error screen rendered the page's root
   * without a card nor a skeleton, and passed for ready) — or, while the
   * layout never arrives, the header.
   */
  ready(): boolean {
    if (document.fonts.status !== 'loaded') return false;
    if (!document.querySelector('[data-site-navbar]')) return false;
    // The planner (SMA-448, lot F3, L7): its grid drawn, no skeleton.
    if (plannerPage) {
      return document.querySelector('[role="grid"]') !== null && document.querySelectorAll('.MuiSkeleton-root').length === 0;
    }
    if (!headerRowOf()) return false;
    if (prefsPending) return true;
    if (page.failed()) return false;
    const drawn =
      gridCards().length > 0 || document.querySelector('[data-novice-cards], [data-novice-empty]') !== null;
    return drawn && document.querySelectorAll('.MuiSkeleton-root').length === 0;
  },

  /**
   * Why the page will never be ready — its Novice load error on screen —, or
   * null. The launcher's `navigate` rejects on it at once, naming it, rather
   * than waiting out its delay on a page that shows an error.
   */
  failed(): string | null {
    return document.querySelector('[data-novice-error]') ? 'the Novice page shows its load error (data-novice-error)' : null;
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
   * SMA-448, lot F2 — PR #296, fix round 1, S1: the Novice page AS THE APP
   * MOUNTS IT, measured as one card and card by card. The page is the
   * `Container` of `GardensDashboard` — its two plain ancestors, `<main>` and
   * the layout's column, are what `measureCard` walks. `body` is the gardens'
   * zone, not the container's last child.
   */
  measureNovice(): NoviceMeasure {
    const header = document.querySelector<HTMLElement>('[data-dashboard-header]');
    const container = header?.parentElement;
    const zone = document.querySelector<HTMLElement>('[data-dashboard-actions]');
    const content = document.querySelector<HTMLElement>('[data-novice-page]');
    if (!header || !container || !zone || !content) {
      throw new Error('The Novice page drew no header, no actions zone or no gardens zone to measure.');
    }
    const origin = container.getBoundingClientRect();
    const cards = [...container.querySelectorAll<HTMLElement>('[data-novice-card]')].map((card) => ({
      id: card.getAttribute('data-novice-card') ?? '',
      box: rectWithin(card, origin),
      plan: planOf(card, origin),
      plantings: plantingsOf(card.querySelector<HTMLElement>('[data-novice-plan] [data-testid="template-preview"]')),
      foot: rectWithin(card.querySelector('[data-novice-foot]') ?? card, origin),
      ...measureCard(card),
    }));
    const cardOverlaps: string[] = [];
    cards.forEach((a, index) => {
      for (const b of cards.slice(index + 1)) {
        const w = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
        const h = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
        if (w > 1 && h > 1) cardOverlaps.push(`${a.id} ∩ ${b.id} = ${Math.round(w)}×${Math.round(h)}`);
      }
    });
    const measured = measureCard(container);
    return {
      ...measured,
      body: {
        h: round(content.getBoundingClientRect().height),
        scrollH: content.scrollHeight,
        overflow: Math.max(0, content.scrollHeight - content.clientHeight),
        beyondCard: measured.body.beyondCard,
      },
      scene: sceneName ?? '',
      viewport: innerWidth,
      content: rectWithin(content, origin),
      cards,
      cardOverlaps,
      wrapped: wrappedTexts(zone),
      warning: document.querySelector('[data-weather-disclaimer]') !== null,
      chipButton: document.querySelector('[data-level-chip]')?.getAttribute('role') === 'button',
      columns: new Set(cards.map((card) => card.box.x)).size,
    };
  },

  /**
   * SMA-448, lot F4, step W5 — the Weather widget as the app mounts it, at
   * the size and with the cities the query asked (`wsize`, `weather`): the
   * card as the scenes' harness measures one, and the form it took.
   */
  measureWeather(): WeatherMeasure {
    const card = document.querySelector<HTMLElement>('[data-widget="weather"]');
    if (!card) throw new Error('The page drew no Weather widget to measure.');
    const text = (selector: string) => card.querySelector(selector)?.textContent ?? null;
    const columns = [...card.querySelectorAll<HTMLElement>('[data-weather-cities] > [data-weather-city]')];
    const tops = new Set(columns.map((column) => round(column.getBoundingClientRect().top)));
    const lefts = new Set(columns.map((column) => round(column.getBoundingClientRect().left)));
    return {
      ...measureCard(card),
      viewport: innerWidth,
      region: card.getAttribute('aria-label'),
      placeLines: card.querySelectorAll('[data-weather-place]').length,
      honest: text('[data-weather-honest]'),
      honestLink: card.querySelector('[data-weather-honest-link]') !== null,
      nav: card.querySelector('[data-weather-nav]') !== null,
      rank: card.querySelector('[data-weather-rank] [aria-hidden]')?.textContent ?? null,
      dots: card.querySelectorAll('[data-weather-dot]').length,
      tabs: [...card.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent ?? ''),
      summary: text('[data-weather-summary]'),
      columns: columns.length,
      columnRows: tops.size,
      columnsPerRow: lefts.size,
      columnGardens: columns.map((column) => column.querySelector('[data-weather-city-gardens]')?.textContent ?? ''),
      warning: document.querySelector('[data-weather-disclaimer]') !== null,
      parts: Object.fromEntries(
        ['data-weather-city', 'data-weather-head', 'data-weather-hero', 'data-weather-hours', 'data-weather-days', 'data-weather-band', 'data-weather-alerts']
          .map((tag) => [tag, card.querySelector<HTMLElement>(`[${tag}]`)])
          .filter((entry): entry is [string, HTMLElement] => entry[1] !== null)
          .map(([tag, element]) => [tag, { h: round(element.getBoundingClientRect().height), scrollH: element.scrollHeight }])
      ),
    };
  },

  /** A dialog's paper — or a toast — as one card, from any element inside it (SMA-448, lot F3, L7). */
  measureDialog(anchor: string): DialogMeasure {
    const inside = document.querySelector<HTMLElement>(anchor);
    const card = inside?.closest<HTMLElement>('.MuiDialog-paper, .MuiAlert-root');
    if (!inside || !card) throw new Error(`No dialog nor toast around ${anchor}.`);
    return {
      ...measureCard(card),
      rect: rectOf(card),
      text: card.textContent ?? '',
      buttons: [...card.querySelectorAll<HTMLButtonElement>('button')].map((button) => ({
        text: button.textContent ?? '',
        disabled: button.disabled,
      })),
    };
  },

  /**
   * SMA-448, lot F3, step L7 — THE CHOICE SCREEN as the app opens it (V3-01):
   * the panel measured as one card — every text and glyph against every
   * other —, and the situation it draws: each offer's tags and button, the
   * reason of an unavailable one, the form of the comparison, the veil, the
   * title seen above it.
   */
  measureChoice(): ChoiceMeasure {
    const root = document.querySelector<HTMLElement>('[data-formula-choice-dialog]');
    const paper = root?.querySelector<HTMLElement>('.MuiDialog-paper');
    if (!root || !paper) throw new Error('The choice screen is not open.');
    const backdrop = root.querySelector<HTMLElement>('.MuiBackdrop-root');
    const backdropStyle = backdrop ? getComputedStyle(backdrop) : null;
    const table = paper.querySelector<HTMLElement>('[data-formula-compare]');
    const list = paper.querySelector<HTMLElement>('[data-formula-compare-list]');
    const drawn = (element: HTMLElement | null) => element !== null && getComputedStyle(element).display !== 'none';
    const title = document.querySelector<HTMLElement>('[data-dashboard-header] h1');
    const paperBox = paper.getBoundingClientRect();
    const titleBox = title?.getBoundingClientRect() ?? null;
    return {
      ...page.measureDialog('[data-formula-choice]'),
      scene: choiceName ?? '',
      viewport: innerWidth,
      viewportHeight: innerHeight,
      mandatory: root.getAttribute('data-mandatory') === 'true',
      closeButton: paper.querySelector('[data-formula-choice-close]') !== null,
      offers: [...paper.querySelectorAll<HTMLElement>('[data-formula-offer]')].map((offer) => {
        const button = offer.querySelector<HTMLButtonElement>(':scope > button');
        const buttonBox = button?.getBoundingClientRect();
        return {
          key: offer.getAttribute('data-formula-offer') ?? '',
          tags: [...offer.querySelectorAll('[data-offer-tag]')].map((tag) => tag.getAttribute('data-offer-tag') ?? ''),
          button: {
            text: button?.textContent ?? '',
            disabled: button?.disabled ?? true,
            rect: buttonBox ? { x: round(buttonBox.left), y: round(buttonBox.top), w: round(buttonBox.width), h: round(buttonBox.height) } : { x: 0, y: 0, w: 0, h: 0 },
          },
          why: offer.querySelector('[data-offer-why]')?.textContent ?? null,
          kept: offer.querySelector('[data-offer-kept]')?.textContent ?? null,
        };
      }),
      compare: drawn(table) ? 'table' : drawn(list) ? 'lists' : 'none',
      backdrop: { color: backdropStyle?.backgroundColor ?? '', filter: backdropStyle?.backdropFilter ?? '' },
      title: titleBox ? { x: round(titleBox.left), y: round(titleBox.top), w: round(titleBox.width), h: round(titleBox.height) } : null,
      titleClear: titleBox !== null && paperBox.top >= titleBox.bottom - 0.5,
      warning: paper.querySelector('[data-weather-disclaimer]') !== null,
      compareCells: (drawn(table) ? [...table!.querySelectorAll<HTMLElement>('tbody td')] : [...paper.querySelectorAll<HTMLElement>('[data-formula-compare-list] dd')]).map((cell) => {
        const style = getComputedStyle(cell);
        return { text: cell.textContent ?? '', color: style.color, weight: style.fontWeight, tone: cell.getAttribute('data-compare-tone') };
      }),
    };
  },

  /** The planner's shape mode at the formula's limit (SMA-448, lot F3, L7): the note, the row under it, the eight buttons. */
  measurePlannerLimit(): PlannerLimitMeasure {
    const note = document.querySelector<HTMLElement>('[data-planner-limit]');
    const topRow = note?.nextElementSibling as HTMLElement | null;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label]')];
    const named = (prefix: string) =>
      buttons
        .filter((button) => (button.getAttribute('aria-label') ?? '').startsWith(prefix))
        .map((button) => ({ label: button.getAttribute('aria-label') ?? '', disabled: button.disabled }));
    const noteBox = note?.getBoundingClientRect() ?? null;
    const rowBox = topRow?.getBoundingClientRect() ?? null;
    return {
      note: note
        ? {
            rect: rectOf(note),
            text: note.textContent ?? '',
            overflowX: Math.max(0, note.scrollWidth - note.clientWidth),
            overflowY: Math.max(0, note.scrollHeight - note.clientHeight),
            whiteSpace: getComputedStyle(note).whiteSpace,
          }
        : null,
      topRow: topRow ? rectOf(topRow) : null,
      gap: noteBox && rowBox ? round(rowBox.top - noteBox.bottom) : null,
      adds: named('Ajouter'),
      removes: named('Retirer'),
      fontLoaded: document.fonts.check('16px Inter'),
    };
  },

  /** Types `value` into the `n`-th element `selector` finds, as React reads it: the native setter, then an input event. False when there is none. */
  fill(selector: string, value: string, n = 0): boolean {
    const input = document.querySelectorAll<HTMLInputElement>(selector)[n];
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value === value;
  },

  /**
   * Every planting of every preview on the page (U2's control): on the grid
   * page, the Gardens widget's thumbnails — CONTAINED, their inset in px.
   */
  measurePlantings(): PlantingMeasure[] {
    return [...document.querySelectorAll<HTMLElement>('[data-testid="template-preview"]')].flatMap((preview) => plantingsOf(preview));
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
          <MemoryRouter initialEntries={[plannerPage ? '/gardens/g1/planner' : '/gardens']}>
            <Layout>
              {plannerPage ? (
                <Routes>
                  <Route path="/gardens/:id/planner" element={<GardenPlanner />} />
                  <Route path="/gardens" element={<GardensDashboard />} />
                </Routes>
              ) : (
                <GardensDashboard />
              )}
            </Layout>
          </MemoryRouter>
        </UnitSystemProvider>
      </AuthProvider>
    </LanguageProvider>
  </ColorModeProvider>
);
