// The clock first (#8), then the stored language and colour mode — both read
// the moment the modules below evaluate.
import './freeze';
import './pageSetup';
import { flushSync } from 'react-dom';
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
import { createAppTheme } from '../../theme';
import { contrast, hex, type Rgb } from '../contrast';
import { capabilitiesFor, catalogFor, presetFor } from '../fixtures/formulas';
import type { DashboardLevel, DashboardSize } from '../../types/Dashboard';
import {
  CHOICE_SCENES,
  GARDENS_LIST_KINDS,
  NOVICE_SCENES,
  PLANNER_GARDEN,
  PLANNER_LAYOUT,
  SCENE_DATA,
  WEATHER_CITY_SCENES,
  choiceSceneCatalog,
  gardensSceneData,
  noviceSceneData,
  weatherAll,
  weatherCitySceneData,
  type ChoiceScene,
  type GardensListKind,
  type NoviceScene,
  type WeatherCityScene,
} from './scenes';
import { gridCellsOf, measureCard, ownText, visible, wrappedTexts, type CardMeasure, type GridCellsMeasure } from './measure';

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
 *
 * SMA-437, lot V3-07, P5: THE CUSTOMIZE DRAWER, opened from the header on
 * the same page. `measurePanel()` reads its content as one card, its paper,
 * its rows, its region and every text's contrast on what is painted behind
 * it; `focusPanel()` / `clickPanel()` reach a row's handle, ▲, ▼, switch or
 * size pill, `panelFocus()` says where the focus stands, and
 * `watchPanelRegion()` / `panelRegionWrites()` count the sentences its region
 * is handed.
 *
 * SMA-437, PR #303, fix round 1, R1: THE PAGE'S TIMERS, SIMULATED on demand
 * — `fakeTimers()` once the page is loaded, `advanceTimers(ms)` to move them
 * on —, so the suite can read the drawer six seconds after a gesture without
 * waiting six seconds.
 *
 * SMA-437, lot V3-06, step E1: THE PAGE'S TITLE — `measureTitle()` reads its
 * computed size, line height and weight, and the lines its words take.
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

// SMA-448, lot F5-b, step W4 — the Gardens widget in the Full width, as the
// app mounts it: the gardens the aggregate serves (`gardens=one|five|twelve|
// sixty|long`, every one located in Écully) and the size the stored layout
// gives the widget (`gsize=small|medium|large|wide`), through the page's own
// read of the layout, as `wsize` above.
const gardensKindName = params.get('gardens');
const gardensKind: GardensListKind | null = gardensKindName
  ? ((GARDENS_LIST_KINDS as readonly string[]).includes(gardensKindName) ? (gardensKindName as GardensListKind) : null)
  : null;
if (gardensKindName && !gardensKind) throw new Error(`No gardens scene ${gardensKindName}`);
const gardensSize = params.get('gsize') as DashboardSize | null;
/** What `fetch` serves the page for the Gardens scene: its gardens and their weather. */
const gardensServed = gardensKind ? gardensSceneData(gardensKind) : null;

/**
 * The theme the page draws with — the colour mode `pageSetup.ts` stored —:
 * the Customize drawer's secondary texts are told apart by its
 * `text.secondary` (SMA-437, lot V3-07, P5).
 */
const theme = createAppTheme(params.get('theme') === 'dark' ? 'dark' : 'light');

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
    return json(choiceScene ? choiceSceneCatalog(choiceScene) : catalogFor(plannerPage ? 'novice' : pageLevel, { gardenCount: gardensServed ? gardensServed.gardens.length : 3 }));
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
      // A stored layout with the Weather widget at the asked size (lot F4, W5),
      // the Gardens widget at its (lot F5-b, W4).
      blocks: presetFor(pageLevel).map((block) =>
        weatherSize && block.key === 'weather'
          ? { ...block, size: weatherSize, hidden: false }
          : gardensSize && block.key === 'gardens'
            ? { ...block, size: gardensSize, hidden: false }
            : block
      ),
      updatedAt: null,
      capabilities: capabilitiesFor(pageLevel),
    });
  }
  if (url.startsWith('/api/dashboard/weather')) {
    return json(served ? served.weather : weatherServed ? weatherServed.weather : gardensServed ? gardensServed.weather : weatherAll());
  }
  if (url.startsWith('/api/dashboard')) {
    if (failGardens) return new Response(null, { status: 500 });
    return json(served ? served.data : weatherServed ? weatherServed.data : gardensServed ? gardensServed.data : SCENE_DATA);
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
 * SMA-448, lot F5-b, step W4 — the Gardens widget in the Full width, as the
 * app mounts it: the card measured as the scenes' harness measures one, and
 * the form it took — the seven-column table from 600 px, the rows of the A9
 * form on a phone —, the rows the count leaves, the fold and the rule of the
 * unfolding, the search, the actions against the card, the warning (V1).
 */
export interface GardensMeasure extends CardMeasure {
  viewport: number;
  /** A table (from 600 px), or the rows of the A9 form (a phone). */
  table: boolean;
  /** The column headers of the table, in order — the visually hidden « Actions » included; none on a phone. */
  headers: string[];
  /** The garden rows drawn — the table's, or the form's; never the rule's row. */
  rows: number;
  /** The rule « Au-delà des N affichés » under the unfolded list. */
  cut: boolean;
  /** The search bar — drawn while a garden is hidden by the count (A-N3). */
  search: boolean;
  /** The foot's « + N autres jardins » / « Afficher N jardins » button, its label — null when every garden is shown. */
  fold: string | null;
  /** How far, in px, the furthest actions cell runs past the card's padding box — 0 when all stay inside. */
  actionsOutside: number;
  /** The weather warning under the grid, drawn or not (V1). */
  warning: boolean;
}

/**
 * SMA-437, lot V3-08, step S5 — the dashboard grid as the app lays it out at
 * the formula's preset: the cards in the order they are drawn, each card's
 * cells, and the empty ones (`gridCellsOf`) — between two cards, a hole;
 * after the last, the page's open end.
 */
export interface PageGridMeasure extends GridCellsMeasure {
  viewport: number;
  /** The widgets of the grid, in the order they are drawn. */
  keys: string[];
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

/**
 * One text of the Customize drawer and the contrast it is read at (WCAG
 * 1.4.3): its computed colour over what is painted behind it — the first
 * opaque background up its ancestors, with the translucent ones and a
 * one-colour image (MUI's night veil is a gradient of one colour) composited
 * back down over it.
 */
export interface PanelText {
  label: string;
  px: number;
  weight: number;
  color: string;
  /** What is painted behind the text, `rgb(r, g, b)` — or `unreadable`: an image no colour stands for. */
  background: string;
  ratio: number;
  /** Large text — 24 px, or 18.66 px bold —, whose floor is 3:1, not 4.5. */
  large: boolean;
  /** Drawn in the theme's `text.secondary`. */
  secondary: boolean;
}

/**
 * SMA-437, lot V3-07, P5 — THE CUSTOMIZE DRAWER as the app opens it: its
 * content measured as one card — every text and glyph against every other —,
 * the paper it lies on, the rows it lists, what its region says, and every
 * text's contrast on what is painted behind it.
 */
export interface PanelMeasure extends CardMeasure {
  viewport: number;
  /** The drawer's paper: its box, what its content runs past it sideways, what it paints. */
  paper: { rect: Rect; overflowX: number; backgroundColor: string; backgroundImage: string };
  /** Each row, in the list's order: its widget, its switch — and whether the widget is shown — or its lock, its size pills and the one pressed (-1: none). */
  rows: Array<{ key: string; control: 'switch' | 'lock' | 'none'; shown: boolean; pills: number; pressed: number }>;
  /** What the panel's one region says. */
  said: string;
  texts: PanelText[];
}

/** Where the focus stands in the drawer: the widget of its row, and which control — `handle`, `up`, `down`, `switch`, `pill:<n>` —; or, off the rows, the element. */
export interface PanelFocus {
  key: string | null;
  control: string;
}

/**
 * SMA-437, lot V3-06, step E1 (contract A-24) — the page's title, « Mes
 * Jardins », as the engine draws it: its computed size, line height and
 * weight, the box of its words, and how many lines they take.
 */
export interface TitleMeasure {
  viewport: number;
  text: string;
  px: number;
  line: number;
  weight: number;
  /** The box of its words — their Range, not the h1's box, which the header's flex row stretches. */
  box: Rect;
  /** The lines its words take: one, or more when they wrap. */
  lines: number;
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

// ── The Customize drawer (SMA-437, lot V3-07, P5) ───────────────────────────

/** The drawer's paper and its content, found from its list of widgets — null while it is not open. */
function panelParts(): { paper: HTMLElement; content: HTMLElement } | null {
  const widgets = document.querySelector<HTMLElement>('[data-panel-widgets]');
  const paper = widgets?.closest<HTMLElement>('.MuiDrawer-paper');
  const content = widgets?.closest<HTMLElement>('.MuiDrawer-paper > *');
  return paper && content ? { paper, content } : null;
}

/**
 * One control of a widget's row: its handle, ▲ and ▼ — the three buttons of
 * the row's first line, in that order —, its switch, or its `n`-th size pill
 * (`pill:<n>`). Throws, naming it, when the row or the control is missing.
 */
function panelControl(key: string, control: string): HTMLElement {
  const row = document.querySelector(`[data-panel-widget="${key}"]`)?.closest('li');
  if (!row) throw new Error(`No row ${key} in the Customize drawer.`);
  if (control === 'switch') {
    const input = row.querySelector<HTMLElement>('input[role="switch"]');
    if (!input) throw new Error(`The row ${key} has no switch.`);
    return input;
  }
  if (control.startsWith('pill:')) {
    const pill = row.querySelectorAll<HTMLElement>('[data-pill]')[Number(control.slice('pill:'.length))];
    if (!pill) throw new Error(`The row ${key} has no ${control}.`);
    return pill;
  }
  const buttons = [...(row.firstElementChild?.querySelectorAll<HTMLElement>('button') ?? [])];
  const index = ['handle', 'up', 'down'].indexOf(control);
  if (index < 0) throw new Error(`No control ${control}.`);
  if (buttons.length !== 3) throw new Error(`The first line of the row ${key} has ${buttons.length} buttons, not its handle, ▲ and ▼.`);
  return buttons[index]!;
}

/** A colour as the engine computes it — `rgb()`, `rgba()` — or as the theme writes it (`#RRGGBB`): its channels and its alpha; null for a keyword. */
function channels(value: string): { rgb: Rgb; a: number } | null {
  if (/^#[0-9a-f]{6}$/i.test(value)) return { rgb: hex(value), a: 1 };
  const found = /rgba?\(([^)]+)\)/.exec(value);
  if (!found) return null;
  const parts = found[1]!.split(',').map((part) => parseFloat(part));
  return { rgb: [parts[0]!, parts[1]!, parts[2]!], a: parts.length === 4 ? parts[3]! : 1 };
}

/** `colour` at alpha `a`, painted over `below`. */
const mix = (colour: Rgb, a: number, below: Rgb): Rgb => [0, 1, 2].map((i) => colour[i]! * a + below[i]! * (1 - a)) as Rgb;

/**
 * A background image as ONE colour — a gradient whose stops are all that
 * colour, as MUI's night veil is —; `null` for none; `undefined` for any
 * other image, which no single colour stands for.
 */
function uniformImage(value: string): { rgb: Rgb; a: number } | null | undefined {
  if (value === 'none') return null;
  const stops = value.match(/rgba?\([^)]*\)/g) ?? [];
  if (!value.startsWith('linear-gradient(') || stops.length === 0 || new Set(stops).size !== 1) return undefined;
  return channels(stops[0]!);
}

/**
 * What is painted behind `el`: up its ancestors to the first opaque
 * background colour — its own image over it —, then back down, each
 * translucent background composited over what lies under it and its image
 * over that. Null when an image no single colour stands for is in the way.
 */
function paintedBehind(el: Element): Rgb | null {
  type Layer = { rgb: Rgb; a: number } | null;
  const layers: Array<{ colour: Layer; image: Layer }> = [];
  // The canvas, should no ancestor paint an opaque ground.
  let ground: Rgb = [255, 255, 255];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const colour = channels(style.backgroundColor);
    const image = uniformImage(style.backgroundImage);
    if (image === undefined) return null;
    if (colour && colour.a >= 1) {
      ground = image ? mix(image.rgb, image.a, colour.rgb) : colour.rgb;
      break;
    }
    layers.push({ colour, image });
  }
  for (const { colour, image } of layers.reverse()) {
    if (colour) ground = mix(colour.rgb, colour.a, ground);
    if (image) ground = mix(image.rgb, image.a, ground);
  }
  return ground;
}

/** The theme's `text.secondary`, as channels. */
const SECONDARY = channels(theme.palette.text.secondary);

/** Every text of `root` — as `measureCard` reads its text atoms —, its colour, what is painted behind it, and the ratio it is read at. */
function textContrasts(root: Element): PanelText[] {
  const texts: PanelText[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (!visible(el)) continue;
    const text = ownText(el);
    if (!text) continue;
    const style = getComputedStyle(el);
    const colour = channels(style.color);
    const behind = paintedBehind(el);
    // A text under an ancestor's opacity is drawn that much fainter.
    let opacity = 1;
    for (let node: Element | null = el; node && node !== root.parentElement; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    const drawn = colour && behind ? mix(colour.rgb, colour.a * opacity, behind) : null;
    const px = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    texts.push({
      label: `"${text.slice(0, 44)}"`,
      px,
      weight,
      color: style.color,
      background: behind ? `rgb(${behind.map((channel) => Math.round(channel)).join(', ')})` : 'unreadable',
      // Cut, never rounded, to the hundredth: a 4.497 is never read as 4.5.
      ratio: drawn && behind ? Math.floor(contrast(drawn, behind) * 100) / 100 : 0,
      large: px >= 24 || (px >= 18.66 && weight >= 700),
      secondary:
        colour !== null &&
        SECONDARY !== null &&
        colour.rgb.every((channel, index) => Math.abs(channel - SECONDARY.rgb[index]!) < 0.5) &&
        Math.abs(colour.a - SECONDARY.a) < 0.01,
    });
  }
  return texts;
}

/** What the drawer's region was handed since `watchPanelRegion()` — and since the last count. */
let regionRecords: MutationRecord[] = [];
let regionObserver: MutationObserver | null = null;

/**
 * A timer set while the page's timers are simulated: the instant it is due
 * on the simulated clock, the order it was set in — two due at the same
 * instant run in that order, as the engine runs them —, and what it runs.
 */
interface SimulatedTimer {
  at: number;
  order: number;
  run: () => void;
}

/** The simulated clock once `fakeTimers()` has installed it: its instant, and the timers it holds, by id. */
let simulated: { now: number; order: number; nextId: number; timers: Map<number, SimulatedTimer> } | null = null;

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
        lowest: measured.body.lowest,
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

  /**
   * SMA-448, lot F5-b, step W4 — the Gardens widget as the app mounts it, at
   * the size and with the gardens the query asked (`gsize`, `gardens`): the
   * card as the scenes' harness measures one, and the form it took.
   */
  measureGardens(): GardensMeasure {
    const card = document.querySelector<HTMLElement>('[data-widget="gardens"]');
    if (!card) throw new Error('The page drew no Gardens widget to measure.');
    const box = card.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    const inner = { left: box.left + parseFloat(cardStyle.paddingLeft), right: box.right - parseFloat(cardStyle.paddingRight) };
    const actions = [...card.querySelectorAll('tbody tr:not([data-gardens-cut]) > td:last-child, [data-garden-row] [data-row-actions]')];
    return {
      ...measureCard(card),
      viewport: innerWidth,
      table: card.querySelector('table') !== null,
      headers: [...card.querySelectorAll('thead th')].map((th) => th.textContent ?? ''),
      rows: card.querySelectorAll('tbody tr:not([data-gardens-cut]), [data-garden-row]').length,
      cut: card.querySelector('[data-gardens-cut]') !== null,
      search: card.querySelector('[data-gardens-search]') !== null,
      fold: card.querySelector('[data-gardens-foot] button[aria-expanded]')?.textContent ?? null,
      actionsOutside: round(
        Math.max(
          0,
          ...actions.map((cell) => {
            const r = cell.getBoundingClientRect();
            return Math.max(r.right - inner.right, inner.left - r.left);
          })
        )
      ),
      warning: document.querySelector('[data-weather-disclaimer]') !== null,
    };
  },

  /** SMA-437, lot V3-06, step E1 (A-24) — the page's title, as the engine draws it. */
  measureTitle(): TitleMeasure {
    const title = document.querySelector<HTMLElement>('[data-dashboard-header] h1');
    if (!title) throw new Error('The page drew no title.');
    const style = getComputedStyle(title);
    const words = document.createRange();
    words.selectNodeContents(title);
    const box = words.getBoundingClientRect();
    const tops = new Set(
      [...words.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top))
    );
    return {
      viewport: innerWidth,
      text: title.textContent ?? '',
      px: parseFloat(style.fontSize),
      line: round(parseFloat(style.lineHeight)),
      weight: Number(style.fontWeight),
      box: { x: round(box.left), y: round(box.top), w: round(box.width), h: round(box.height) },
      lines: tops.size,
      fontLoaded: document.fonts.check('16px Inter'),
    };
  },

  /** SMA-437, lot V3-08, step S5 — the grid's cards, their cells and the empty ones, as laid out. */
  measureGrid(): PageGridMeasure {
    const cards = gridCards();
    return {
      ...gridCellsOf(cards),
      viewport: innerWidth,
      keys: cards.map((card) => card.getAttribute('data-widget') ?? ''),
    };
  },

  /** Clicks « + N autres jardins » in the Gardens widget's foot and settles — true when there was one to click. */
  async unfoldGardens(): Promise<boolean> {
    const button = document.querySelector<HTMLElement>('[data-widget="gardens"] [data-gardens-foot] button[aria-expanded="false"]');
    if (!button) return false;
    button.click();
    await page.settle();
    return true;
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

  /**
   * SMA-437, lot V3-07, P5 — THE CUSTOMIZE DRAWER as the app opens it: its
   * content as one card, its paper, its rows, what its region says, and
   * every text's contrast on what is painted behind it.
   */
  measurePanel(): PanelMeasure {
    const parts = panelParts();
    if (!parts) throw new Error('The Customize drawer is not open.');
    const { paper, content } = parts;
    // MUI's ripple is clipped by its control BY DESIGN — a decoration, not a
    // text nor a glyph (as `measureBar` has it): out of the measure.
    const ripples = [...content.querySelectorAll<HTMLElement>('.MuiTouchRipple-root')];
    for (const ripple of ripples) ripple.style.visibility = 'hidden';
    const card = measureCard(content);
    const texts = textContrasts(content);
    for (const ripple of ripples) ripple.style.visibility = '';
    const style = getComputedStyle(paper);
    return {
      ...card,
      viewport: innerWidth,
      paper: {
        rect: rectOf(paper),
        overflowX: paper.scrollWidth - paper.clientWidth,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
      },
      rows: [...content.querySelectorAll<HTMLElement>('[data-panel-widget]')].map((name): PanelMeasure['rows'][number] => {
        const row = name.closest('li');
        const input = row?.querySelector<HTMLInputElement>('input[role="switch"]') ?? null;
        const pills = [...(row?.querySelectorAll('[data-pill]') ?? [])];
        return {
          key: name.getAttribute('data-panel-widget') ?? '',
          control: input ? 'switch' : row?.querySelector('[role="img"]') ? 'lock' : 'none',
          shown: input ? input.checked : true,
          pills: pills.length,
          pressed: pills.findIndex((pill) => pill.getAttribute('aria-pressed') === 'true'),
        };
      }),
      said: content.querySelector('[data-customize-said]')?.textContent ?? '',
      texts,
    };
  },

  /** Focuses a control of a widget's row in the drawer (`handle`, `up`, `down`, `switch`, `pill:<n>`): true when it holds the focus. */
  focusPanel(key: string, control: string): boolean {
    const element = panelControl(key, control);
    element.focus();
    return document.activeElement === element;
  },

  /** A click, as the pointer gives it, on a control of a widget's row in the drawer. */
  clickPanel(key: string, control: string): true {
    panelControl(key, control).click();
    return true;
  },

  /** Where the focus stands in the drawer: a row's control, or the element off the rows. */
  panelFocus(): PanelFocus {
    const active = document.activeElement as HTMLElement | null;
    const key = active?.closest('li')?.querySelector('[data-panel-widget]')?.getAttribute('data-panel-widget') ?? null;
    if (!active || !key) {
      return { key: null, control: active ? `${active.tagName.toLowerCase()} « ${active.getAttribute('aria-label') ?? ''} »` : 'none' };
    }
    const pills = [...(active.closest('li')?.querySelectorAll('[data-pill]') ?? [])];
    // Gardens has no switch: a control the row lacks is simply not the one.
    const holds = (candidate: string) => {
      try {
        return panelControl(key, candidate) === active;
      } catch {
        return false;
      }
    };
    const control =
      ['handle', 'up', 'down', 'switch'].find(holds) ??
      (pills.includes(active) ? `pill:${pills.indexOf(active)}` : active.tagName.toLowerCase());
    return { key, control };
  },

  /** From now on, what the drawer's region is handed is counted. False when the drawer is not open. */
  watchPanelRegion(): boolean {
    regionObserver?.disconnect();
    regionRecords = [];
    const region = document.querySelector('[data-customize-said]');
    if (!region) return false;
    regionObserver = new MutationObserver((records) => {
      regionRecords.push(...records);
    });
    regionObserver.observe(region, { childList: true, characterData: true, subtree: true });
    return true;
  },

  /** The sentences the region was handed since the last count: the records that put a text in — an emptying puts none. */
  panelRegionWrites(): number {
    if (regionObserver) regionRecords.push(...regionObserver.takeRecords());
    const writes = regionRecords.filter((record) => record.type === 'characterData' || record.addedNodes.length > 0).length;
    regionRecords = [];
    return writes;
  },

  /**
   * SMA-437, PR #303, fix round 1, R1 — from now on the page's `setTimeout`
   * and `clearTimeout` are SIMULATED, those two alone, as the unit tests
   * fake them: a timer set runs only when `advanceTimers` reaches it.
   * Installed once the page is loaded and the drawer open, so nothing the
   * page needed to be drawn waits on it; what took the engine's own
   * functions before — React's scheduler — keeps them, and every wait of the
   * launcher is on a frame, never on a timer. The next `navigate` loads a
   * new page, on the engine's timers again.
   */
  fakeTimers(): true {
    if (simulated) return true;
    const clock = { now: 0, order: 0, nextId: 1, timers: new Map<number, SimulatedTimer>() };
    const setSimulated = (handler: TimerHandler, delay?: number, ...args: unknown[]): number => {
      if (typeof handler !== 'function') throw new Error('A simulated timer runs a function, not a string.');
      const id = clock.nextId++;
      const run = () => (handler as (...values: unknown[]) => void)(...args);
      clock.timers.set(id, { at: clock.now + Math.max(0, Number(delay) || 0), order: clock.order++, run });
      return id;
    };
    const clearSimulated = (id?: number) => {
      if (id !== undefined) clock.timers.delete(id);
    };
    window.setTimeout = setSimulated as unknown as typeof window.setTimeout;
    window.clearTimeout = clearSimulated as unknown as typeof window.clearTimeout;
    simulated = clock;
    return true;
  },

  /**
   * Moves the simulated clock `ms` on: every timer due by then runs, in the
   * order it falls due — those it sets too, when they fall due in time —,
   * inside `flushSync`, so what they change is committed before this
   * returns. `flushSync` stands for `act` here: this bundle is the app's,
   * built in production mode, and React exports `act` from its development
   * build alone. What the page then does on its own — a request answered —
   * is left to `settle()`. Answers how many timers still wait.
   */
  advanceTimers(ms: number): number {
    const clock = simulated;
    if (!clock) throw new Error('The page’s timers are not simulated: call fakeTimers() first.');
    const target = clock.now + ms;
    flushSync(() => {
      for (;;) {
        let due: [number, SimulatedTimer] | null = null;
        for (const entry of clock.timers) {
          const timer = entry[1];
          if (timer.at > target) continue;
          if (!due || timer.at < due[1].at || (timer.at === due[1].at && timer.order < due[1].order)) due = entry;
        }
        if (!due) break;
        clock.timers.delete(due[0]);
        clock.now = due[1].at;
        due[1].run();
      }
    });
    clock.now = target;
    return clock.timers.size;
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
   *   two buttons were before #291;
   * - `panel-veil` (SMA-437, lot V3-07, P5): the elevation's veil put back on
   *   the Customize drawer's paper — MUI still writes `--Paper-overlay`
   *   inline at night;
   * - `panel-long-word`: a widget's name no row can hold, one word with no
   *   break in it.
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
    if (name === 'panel-veil' || name === 'panel-long-word') {
      const parts = panelParts();
      if (!parts) return false;
      if (name === 'panel-veil') {
        parts.paper.style.backgroundImage = 'var(--Paper-overlay)';
        return true;
      }
      const widgetName = parts.content.querySelector('[data-panel-widget="counters"] > span');
      if (!widgetName) return false;
      widgetName.textContent = 'Compteursparvariétédanstouslesjardinsdupotager';
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
