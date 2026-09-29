import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_CI, findChrome, makeOutDir, removeOutDir, terminateChildren } from './chrome.mjs';
import { buildPageHarness, openPage, writePageHarness, type PageSession } from './pageChrome.mjs';
import type { ChoiceMeasure, DialogMeasure, GardensMeasure, NoviceMeasure, PageGridMeasure, PageMeasure, PlannerLimitMeasure, PlantingMeasure, WeatherMeasure } from './pageHarness';
import { CHOICE_SCENES, GARDENS_LIST_KINDS, NOVICE_LONG_NAMES, NOVICE_SCENES, WEATHER_CITY_NAMES, WEATHER_CITY_SCENES, gardensSceneData, weatherCitySceneData, type GardensListKind, type WeatherCityScene } from './scenes';
import { VISIBLE_OVERLAP_PX, type CardMeasure } from './measure';
import { COVER_PLANT_INSET, plantInsetPx } from '../../utils/gardenPreview';
import { capabilitiesFor, presetFor } from '../fixtures/formulas';
import { sizesFor } from '../../constants/dashboardCapabilities';
import type { DashboardLevel, DashboardSize } from '../../types/Dashboard';

/**
 * SMA-437, lot V39, PR B, step B9 — the compact action bar ON THE WHOLE PAGE,
 * in a real engine (pre-flight, § C.6 n° 2 and 3; technical decision 12).
 *
 * What jsdom cannot prove, proven here: the bar's place under the real site
 * navbar, its stacking, its height; the relay at the scroll position the
 * header's buttons cross the line « navbar + bar », both ways; the real focus
 * moving between the twins through `inert`; `scroll-padding-top` bringing a
 * focused control out from under the two bars; the content that stays still
 * when Edit mode is toggled from the bar; no bar at the Novice formula nor
 * while the layout loads. At five viewports — two phones, a portrait tablet,
 * a desktop, a phone in landscape — at the Gardener and the Expert formulas,
 * out of and in Edit mode; at night and in English at 360 and 1 280 px.
 *
 * SMA-448, lot F2 — PR #296, fix round 1, S1: THE NOVICE PAGE too, as the app
 * mounts it — six scenes at 360, 390, 600, 768, 1 024 and 1 280 px, measured
 * as one card and card by card, where the scenes' harness measured a tree
 * rebuilt beside the page (the last describe).
 *
 * And the PROBES (the rule of SMA-446): the page broken on purpose — the bar
 * over the navbar, a label wider than its half, a save region born filled, a
 * toggle unmounted at the key — each of which the SAME checks must report.
 *
 * Chrome as the scenes' suite finds it: without it the suite is SKIPPED on a
 * workstation and FAILS on CI.
 */

const CHROME = findChrome();

if (!CHROME && IS_CI) {
  throw new Error(
    'No Chrome for the page harness on CI: set CHROME_BIN or install google-chrome — the suite must run there, never skip.'
  );
}

interface PageView {
  id: string;
  width: number;
  height: number;
  /** A device: its scrollbar drawn over the page, as on a phone or a tablet. */
  mobile: boolean;
}

/** The pre-flight's five viewports (§ C.6 n° 2): two phones, a portrait tablet, a desktop, a phone in landscape. */
const VIEWS: PageView[] = [
  { id: '360x780', width: 360, height: 780, mobile: true },
  { id: '390x844', width: 390, height: 844, mobile: true },
  { id: '768x1024', width: 768, height: 1024, mobile: true },
  { id: '1280x800', width: 1280, height: 800, mobile: false },
  { id: '568x320', width: 568, height: 320, mobile: true },
];

const LEVELS = ['gardener', 'expert'] as const;
type Level = (typeof LEVELS)[number];

/** The bar at rest, and in Edit mode from 600 px: 53 px and its 1 px rule (V3-05, `.cb-in`). */
const BAR_HEIGHT = 54;
/** The bar in Edit mode on a phone: two lines (A-10.4), 72.7 px drawn — its `offsetHeight` rounds it. */
const BAR_HEIGHT_PHONE_EDIT = 73;
/** The relay is proven at the computed scroll position, give or take the pre-flight's 2 px step. */
const RELAY_STEP = 2;

/** One scenario of a formula at one viewport: the measurements its steps took. */
interface LevelRun {
  /** The top of the page, before anything. */
  top: PageMeasure;
  /** The plantings of the Gardens widget's thumbnails at the top — contained, their inset in px (U2's control). */
  plantings: PlantingMeasure[];
  /** Out of Edit mode: the scroll position the header's buttons cross the line, and the page just before it, just after it, and back before it. */
  relay: { expected: number; before: PageMeasure; after: PageMeasure; back: PageMeasure };
  /** Mid-page, the header's toggle focused before the scroll. */
  mid: PageMeasure;
  /** Enter on the bar's toggle, mid-page: Edit mode; and where the first card visible under the bars stood before and after. */
  enter: { after: PageMeasure; card: string; before: number; now: number };
  /** In Edit mode: the relay again — the bar two lines tall on a phone —, then back mid-page. */
  editRelay: { expected: number; before: PageMeasure; after: PageMeasure };
  /** A control put under the two bars, then focused: where it ends, and the line it must clear. */
  padding: { top: number; line: number };
  /** A gesture in Edit mode: the save's region while it saves, and once saved. */
  save: { idle: PageMeasure; pending: PageMeasure; saved: PageMeasure };
  /** Enter on the bar's toggle again: out of Edit mode, the content still. */
  leave: { after: PageMeasure; card: string; before: number; now: number };
}

/** What one viewport's session measured, or why it could not. */
interface ViewResult {
  levels: Partial<Record<Level, LevelRun>>;
  novice: { top: PageMeasure; mid: PageMeasure } | null;
  loading: PageMeasure | null;
  night: { rest: PageMeasure; edit: PageMeasure } | null;
  english: { rest: PageMeasure; edit: PageMeasure } | null;
  probes: Record<string, PageMeasure>;
}

const results = new Map<string, ViewResult>();
const failures = new Map<string, unknown>();
let outDir = '';

const selectors = {
  headerToggle: '[data-dashboard-header] [data-page-action="edit"]',
  barToggle: '[data-compact-bar] [data-page-action="edit"]',
  region: '[data-save-status]',
  hide: 'button[aria-label^="Masquer "]',
  drag: 'button[aria-label^="Déplacer "]',
  bar: '[data-compact-bar]',
};

/** A phone: under 600 px wide, the bar in two lines in Edit mode. */
const isPhone = (view: PageView) => view.width < 600;

/** The line the bar relays at, in the window: the navbar's bottom plus the bar's height. */
const lineOf = (m: PageMeasure) => m.navbar.y + m.navbar.h + (m.bar?.height ?? 0);

/** The scroll position the header's repeated buttons cross that line. */
const relayOf = (m: PageMeasure) => m.headerRow.docBottom - lineOf(m);

// ── The Novice page (SMA-448, lot F2 — PR #296, fix round 1, S1) ────────────

/**
 * One run of the Novice page: the language, the theme and the wall clock the
 * page is told; grouped by viewport below, one Chrome per viewport. The
 * scenes' harness measured the page on a tree rebuilt beside it; the page is
 * measured here, as the app mounts it — the Extension's finding.
 */
interface NoviceRun {
  /** `fr@360`… */
  id: string;
  lang: 'fr' | 'en';
  theme: 'light' | 'dark';
  /** The wall clock the page is told the machine has; inert while `freeze.ts` freezes the harness's instant over it (#8). */
  clockMs?: number;
}

interface NoviceView extends PageView {
  runs: NoviceRun[];
}

/** A day in another month and another year: the wall clock one run is told (#8). */
const ANOTHER_DAY = Date.UTC(2027, 1, 3, 15, 30, 0);

const french = (id: string): NoviceRun => ({ id, lang: 'fr', theme: 'light' });

/**
 * The five widths of the brief — 360, 390, 600, 1 024, 1 280 — and 768, the
 * portrait tablet the bar's scenarios use: the phones, the tablet's lower
 * edge, the portrait and the landscape tablets, the desktop. At 360: the twin
 * run (determinism, #4), English (language parity), the night, and the page
 * told another day (#8); at 1 280: the night.
 */
const NOVICE_VIEWS: NoviceView[] = [
  {
    id: '360x780',
    width: 360,
    height: 780,
    mobile: true,
    runs: [
      french('fr@360'),
      french('fr@360-twin'),
      { id: 'en@360', lang: 'en', theme: 'light' },
      { id: 'dark@360', lang: 'fr', theme: 'dark' },
      { id: 'fr@360-clock', lang: 'fr', theme: 'light', clockMs: ANOTHER_DAY },
    ],
  },
  { id: '390x844', width: 390, height: 844, mobile: true, runs: [french('fr@390')] },
  { id: '600x1024', width: 600, height: 1024, mobile: true, runs: [french('fr@600')] },
  { id: '768x1024', width: 768, height: 1024, mobile: true, runs: [french('fr@768')] },
  { id: '1024x768', width: 1024, height: 768, mobile: true, runs: [french('fr@1024')] },
  { id: '1280x800', width: 1280, height: 800, mobile: false, runs: [french('fr@1280'), { id: 'dark@1280', lang: 'fr', theme: 'dark' }] },
];

/** Every run, with the width of its viewport. */
const NOVICE_RUNS: Array<NoviceRun & { vw: number }> = NOVICE_VIEWS.flatMap((view) =>
  view.runs.map((run) => ({ ...run, vw: view.width }))
);

/** The Novice page, by run then by scene name. */
const noviceCases = new Map<string, Map<string, NoviceMeasure>>();

/**
 * The readiness probe: what `navigate` rejected with when the gardens'
 * aggregate answered 500 — the page shows its load error, and the launcher
 * must say so rather than measure it (the Extension's second draw,
 * `11595896…`). Null when it resolved: the defect the probe exists to see.
 */
let noviceLoadFailure: string | null = null;

/** A run by its id — never by its position. */
const noviceRunOf = (id: string): NoviceRun & { vw: number } => {
  const run = NOVICE_RUNS.find((candidate) => candidate.id === id);
  if (!run) throw new Error(`No Novice run ${id}`);
  return run;
};

/** The query of one scene in one run. */
const noviceQuery = (run: NoviceRun, sceneName: string) =>
  `level=novice&theme=${run.theme}&lang=${run.lang}&scene=${sceneName}${run.clockMs ? `&clock=${run.clockMs}` : ''}`;

/** Every scene of every run of one viewport, in one Chrome — and, at 360 px, the readiness probe. */
async function runNoviceView(view: NoviceView): Promise<Map<string, Map<string, NoviceMeasure>>> {
  const session = await openPage(CHROME!, outDir, { label: `novice-${view.id}`, width: view.width, height: view.height, mobile: view.mobile });
  try {
    const byRun = new Map<string, Map<string, NoviceMeasure>>();
    for (const run of view.runs) {
      const byScene = new Map<string, NoviceMeasure>();
      for (const scene of NOVICE_SCENES) {
        await session.navigate(noviceQuery(run, scene.name));
        byScene.set(scene.name, await session.evaluate<NoviceMeasure>('window.__page.measureNovice()'));
      }
      byRun.set(run.id, byScene);
    }
    if (view.width === 360) {
      noviceLoadFailure = await session.navigate(`${noviceQuery(french('probe'), 'novice-3')}&fail=gardens`).then(
        () => null,
        (error: unknown) => String(error)
      );
    }
    return byRun;
  } finally {
    await session.close();
  }
}

// ── The choice screen and the refusals (SMA-448, lot F3, L7) ───────────────

interface ChoiceRun {
  id: string;
  lang: 'fr' | 'en';
  theme: 'light' | 'dark';
}

interface ChoiceView extends PageView {
  runs: ChoiceRun[];
}

/**
 * The five widths of the brief — 360, 390, 600, 1 024, 1 280 — for the choice
 * screen (V5: a new form of the v3 enters the harness); the night at 360 and
 * 1 280 (the veil), English at 1 280 (language parity).
 */
const CHOICE_VIEWS: ChoiceView[] = [
  { id: '360x780', width: 360, height: 780, mobile: true, runs: [{ id: 'fr@360', lang: 'fr', theme: 'light' }, { id: 'dark@360', lang: 'fr', theme: 'dark' }] },
  { id: '390x844', width: 390, height: 844, mobile: true, runs: [{ id: 'fr@390', lang: 'fr', theme: 'light' }] },
  { id: '600x1024', width: 600, height: 1024, mobile: true, runs: [{ id: 'fr@600', lang: 'fr', theme: 'light' }] },
  { id: '1024x768', width: 1024, height: 768, mobile: true, runs: [{ id: 'fr@1024', lang: 'fr', theme: 'light' }] },
  {
    id: '1280x800',
    width: 1280,
    height: 800,
    mobile: false,
    runs: [
      { id: 'fr@1280', lang: 'fr', theme: 'light' },
      { id: 'dark@1280', lang: 'fr', theme: 'dark' },
      { id: 'en@1280', lang: 'en', theme: 'light' },
    ],
  },
  // SMA-448, PR #297, fix round 1 (A2, Alexandre 27/09): the desktop windows
  // where the three « Choisir » must be seen without scrolling — a common
  // laptop's, the browser's bar deducted, and a larger one.
  { id: '1280x720', width: 1280, height: 720, mobile: false, runs: [{ id: 'fr@1280x720', lang: 'fr', theme: 'light' }] },
  { id: '1440x900', width: 1440, height: 900, mobile: false, runs: [{ id: 'fr@1440x900', lang: 'fr', theme: 'light' }] },
];
/** The windows of A2: where the buttons are measured against the fold. */
const FOLD_RUNS = ['fr@1280x720', 'fr@1440x900'];
/** Every run with its viewport's width and its view's id — the key a failed view is recorded under (S4). */
const CHOICE_RUNS: Array<ChoiceRun & { vw: number; viewId: string }> = CHOICE_VIEWS.flatMap((view) =>
  view.runs.map((run) => ({ ...run, vw: view.width, viewId: view.id }))
);
/** The choice screen, by run then by scene name. */
const choiceCases = new Map<string, Map<string, ChoiceMeasure>>();
/** The creation's refusals at the five widths. */
const REFUSAL_VIEWS: PageView[] = CHOICE_VIEWS.map(({ id, width, height, mobile }) => ({ id, width, height, mobile }));
const refusalCases = new Map<string, { limit: DialogMeasure; unauthorized: DialogMeasure }>();
/** The planner's, at the desktop widths: its sidebar — where the shape mode is switched — beside the grid. */
const PLANNER_VIEWS: PageView[] = [
  { id: '1024x768', width: 1024, height: 768, mobile: true },
  { id: '1280x800', width: 1280, height: 800, mobile: false },
];
const plannerCases = new Map<string, { limit: PlannerLimitMeasure; refused: DialogMeasure; unauthorized: DialogMeasure }>();

const choiceRunOf = (id: string): ChoiceRun & { vw: number; viewId: string } => {
  const run = CHOICE_RUNS.find((candidate) => candidate.id === id);
  if (!run) throw new Error(`No choice run ${id}`);
  return run;
};

const OFFERS_DRAWN = 'document.querySelectorAll("[data-formula-offer]").length === 3';

/** Every scene of every run of one viewport, in one Chrome: the screen by itself on an account that never chose, from the chip otherwise. */
async function runChoiceView(view: ChoiceView): Promise<Map<string, Map<string, ChoiceMeasure>>> {
  const session = await openPage(CHROME!, outDir, { label: `choice-${view.id}`, width: view.width, height: view.height, mobile: view.mobile });
  try {
    const byRun = new Map<string, Map<string, ChoiceMeasure>>();
    for (const run of view.runs) {
      const byScene = new Map<string, ChoiceMeasure>();
      for (const scene of CHOICE_SCENES) {
        await session.navigate(`choice=${scene.name}&theme=${run.theme}&lang=${run.lang}`);
        if (scene.opened === 'chip') await session.evaluate('window.__page.click("[data-level-chip]")');
        await session.waitFor(OFFERS_DRAWN, `the three offers of ${scene.name}`);
        await settle(session);
        byScene.set(scene.name, await session.evaluate<ChoiceMeasure>('window.__page.measureChoice()'));
      }
      byRun.set(run.id, byScene);
    }
    return byRun;
  } finally {
    await session.close();
  }
}

/** The creation refused by the formula's limit, then by a session that expired, in one Chrome. */
async function runRefusalView(view: PageView): Promise<{ limit: DialogMeasure; unauthorized: DialogMeasure }> {
  const session = await openPage(CHROME!, outDir, { label: `refusal-${view.id}`, width: view.width, height: view.height, mobile: view.mobile });
  try {
    const create = async (outcome: 'limit' | 'unauthorized') => {
      await session.navigate(`level=gardener&theme=light&lang=fr&create=${outcome}`);
      await session.evaluate('window.__page.click("[data-create-garden]")');
      await session.waitFor('document.querySelector("[data-create-name] input")', 'the creation dialog');
      await session.evaluate('window.__page.fill("[data-create-name] input", "Quatrième jardin")');
      await session.waitFor('!document.querySelector("[data-create-submit]").disabled', 'the submit button live');
      await session.evaluate('window.__page.click("[data-create-submit]")');
      await session.waitFor('document.querySelector("[data-create-refusal]")', 'the refusal said');
      await settle(session);
      return session.evaluate<DialogMeasure>('window.__page.measureDialog("[data-create-refusal]")');
    };
    return { limit: await create('limit'), unauthorized: await create('unauthorized') };
  } finally {
    await session.close();
  }
}

const ADD_ROW_TOP = "button[aria-label='Ajouter une ligne en haut']";

/** The planner at the Novice's limit, then its save refused for the plan's size, then by a session that expired. */
async function runPlannerView(view: PageView): Promise<{ limit: PlannerLimitMeasure; refused: DialogMeasure; unauthorized: DialogMeasure }> {
  const session = await openPage(CHROME!, outDir, { label: `planner-${view.id}`, width: view.width, height: view.height, mobile: view.mobile });
  try {
    // Under 1 200 px the sidebar — where the shape mode is switched — is a
    // bottom sheet behind its trigger: opened first, when there is one.
    const shapeMode = async () => {
      await session.evaluate(`(() => { const trigger = document.querySelector("button[aria-controls='planner-sheet']"); if (trigger) trigger.click(); return true; })()`);
      await session.waitFor('document.querySelector("[data-shape-toggle] input")', 'the shape toggle');
      await session.evaluate('window.__page.click("[data-shape-toggle] input")');
    };
    await session.navigate('page=planner&theme=light&lang=fr');
    await shapeMode();
    await session.waitFor('document.querySelector("[data-planner-limit]")', 'the limit note');
    await settle(session);
    const limit = await session.evaluate<PlannerLimitMeasure>('window.__page.measurePlannerLimit()');
    const save = async (outcome: 'refused' | 'unauthorized') => {
      await session.navigate(`page=planner&save=${outcome}&theme=light&lang=fr`);
      await shapeMode();
      await session.waitFor(`document.querySelector("${ADD_ROW_TOP}")`, 'the shape mode');
      await session.evaluate(`window.__page.click("${ADD_ROW_TOP}")`);
      await session.waitFor('!document.querySelector("[data-planner-save]").disabled', 'the save button live');
      await session.evaluate('window.__page.click("[data-planner-save]")');
      await session.waitFor('document.querySelector("[data-planner-toast]")', 'the toast');
      await settle(session);
      return session.evaluate<DialogMeasure>('window.__page.measureDialog("[data-planner-toast]")');
    };
    return { limit, refused: await save('refused'), unauthorized: await save('unauthorized') };
  } finally {
    await session.close();
  }
}

/** What a page or a card must be free of, at every width — named so a failure says which. */
/**
 * The plantings whose drawn box is not the box they owe — their area inset
 * by `inset(cell)` on each side, to `tolerance` —, each with its drawn sizes
 * against the expected ones (PR #296, fix round 2, U2).
 */
function plantingFaults(
  plantings: PlantingMeasure[],
  inset: (cell: { w: number; h: number }) => { x: number; y: number },
  tolerance = 0.5
): string[] {
  const tenth = (value: number) => Math.round(value * 10) / 10;
  const share = (drawn: number, expected: number) => `${Math.round((drawn / expected) * 100)} %`;
  const faults: string[] = [];
  for (const { span, cell, area, drawn } of plantings) {
    const by = inset(cell);
    const expected = { x: area.x + by.x, y: area.y + by.y, w: area.w - 2 * by.x, h: area.h - 2 * by.y };
    if ((['x', 'y', 'w', 'h'] as const).every((key) => Math.abs(drawn[key] - expected[key]) <= tolerance)) continue;
    faults.push(
      `${span}: drawn ${drawn.w}×${drawn.h} at (${drawn.x}, ${drawn.y}) for ${tenth(expected.w)}×${tenth(expected.h)} at (${tenth(expected.x)}, ${tenth(expected.y)}) expected — w ${share(drawn.w, expected.w)}, h ${share(drawn.h, expected.h)}`
    );
  }
  return faults;
}

function defects(scene: CardMeasure) {
  return {
    overlaps: scene.overlaps
      .filter((o) => Math.min(o.w, o.h) >= VISIBLE_OVERLAP_PX)
      .map((o) => `${o.a} ∩ ${o.b} = ${o.w}×${o.h} @(${o.x},${o.y})`),
    clipped: scene.clipped
      .filter((c) => !c.scroller)
      .map((c) => `${c.label} by ${c.by}: top ${c.top} right ${c.right} bottom ${c.bottom} left ${c.left}`),
    spills: scene.spills.map((s) => `${s.label}: ${s.textW} px in ${s.container} of ${s.containerW}`),
    beyondCard: scene.body.beyondCard,
  };
}

// ── The checks — the SAME for the scenes and for the probes ────────────────

/** The bar hidden: invisible, inert and silent; the header's buttons live. */
function hiddenFaults(m: PageMeasure): string[] {
  const faults: string[] = [];
  if (!m.bar) return faults;
  if (m.bar.visibility !== 'hidden') faults.push(`the bar is ${m.bar.visibility}`);
  if (m.bar.ariaHidden !== 'true') faults.push('the bar is not aria-hidden');
  if (!m.bar.inert) faults.push('the bar is not inert');
  if (m.headerRow.inert || m.headerRow.ariaHidden !== null) faults.push('the header’s buttons are not live');
  return faults;
}

/**
 * The bar shown where it belongs: visible, live, the header's two buttons
 * inert; right under the navbar and below it in the stacking; over nothing
 * else — what is at its centre is itself —; the window's width; its height.
 */
function placedFaults(m: PageMeasure, height: number): string[] {
  if (!m.bar) return ['no bar on the page'];
  const bar = m.bar;
  const faults: string[] = [];
  const navBottom = m.navbar.y + m.navbar.h;
  if (bar.visibility !== 'visible') faults.push(`the bar is ${bar.visibility}`);
  if (bar.ariaHidden !== null || bar.inert) faults.push('the bar is not live');
  if (!m.headerRow.inert || m.headerRow.ariaHidden !== 'true') faults.push('the header’s buttons are still live');
  if (Math.abs(bar.rect.y - navBottom) > 0.5) faults.push(`the bar’s top at ${bar.rect.y}, the navbar’s bottom at ${navBottom}`);
  if (bar.rect.y < navBottom - 0.5) faults.push(`the bar overlaps the navbar by ${Math.round((navBottom - bar.rect.y) * 10) / 10} px`);
  if (!(bar.zIndex < m.navbar.zIndex)) faults.push(`the bar’s z-index ${bar.zIndex}, the navbar’s ${m.navbar.zIndex}`);
  if (!bar.hitInside) faults.push('something covers the bar’s centre');
  if (Math.abs(bar.rect.w - m.navbar.w) > 0.5) faults.push(`the bar is ${bar.rect.w} px wide, the navbar ${m.navbar.w}`);
  if (Math.abs(bar.height - height) > 0.5) faults.push(`the bar is ${bar.height} px high, not ${height}`);
  return faults;
}

/** Every text of the bar whole, on one line, clear of every other — the scenes' own instrument. */
function textFaults(m: PageMeasure): string[] {
  if (!m.bar) return ['no bar on the page'];
  // A hidden bar is not measured: never a silent pass on nothing.
  if (m.bar.visibility !== 'visible') return [`the bar is ${m.bar.visibility}: nothing measured`];
  const { visibleOverlaps, clipped, spills, ellipsized, wrapped } = m.bar;
  return [
    ...(visibleOverlaps > 0 ? [`${visibleOverlaps} overlap(s)`] : []),
    ...clipped.map((what) => `clipped: ${what}`),
    ...spills.map((what) => `spills: ${what}`),
    ...ellipsized.map((what) => `ellipsized: ${what}`),
    ...wrapped.map((what) => `wrapped: ${what}`),
  ];
}

/** ONE region for the save — the header's, never in an inert row — and none in the bar. */
function regionFaults(m: PageMeasure): string[] {
  const faults: string[] = [];
  if (m.regions.count !== 1) faults.push(`${m.regions.count} save regions`);
  if (!m.regions.inHeader) faults.push('the save region is not in the header');
  if (m.regions.inInert) faults.push('the save region is in an inert row');
  if (m.bar && m.bar.statusRoles > 0) faults.push(`${m.bar.statusRoles} live region(s) in the bar`);
  return faults;
}

/** The focus is on the node marked `mark` — the same node, not a look-alike, and never the body. */
function focusFaults(m: PageMeasure, mark: string): string[] {
  if (m.active.where === 'body') return ['the focus fell to the body'];
  return m.active.mark === mark ? [] : [`the focus is on ${m.active.where} « ${m.active.text} » (${m.active.mark ?? 'unmarked'}), not on ${mark}`];
}

/** The region carrying a state is the node marked before any gesture: born empty, the same node since. */
function sameRegionFaults(m: PageMeasure, text: string): string[] {
  const faults: string[] = [];
  if (m.regions.mark !== 'region') faults.push('the region is not the node that was there before any gesture');
  if (m.regions.text !== text) faults.push(`the region says « ${m.regions.text} », not « ${text} »`);
  return faults;
}

// ── The scenarios ───────────────────────────────────────────────────────────

const measure = (session: PageSession) => session.evaluate<PageMeasure>('window.__page.measure()');
const scroll = (session: PageSession, y: number) => session.evaluate(`window.__page.scrollTo(${Math.max(0, Math.round(y))})`);
const settle = (session: PageSession, frames = 4) => session.evaluate(`window.__page.settle(${frames})`);
const call = (session: PageSession, expression: string) => session.evaluate(`window.__page.${expression}`);

/** The whole scenario of one formula at one viewport. */
async function runLevel(session: PageSession, level: Level): Promise<LevelRun> {
  await session.navigate(`level=${level}&theme=light&lang=fr`);
  await call(session, `mark('header-toggle', ${JSON.stringify(selectors.headerToggle)})`);
  await call(session, `mark('bar-toggle', ${JSON.stringify(selectors.barToggle)})`);
  await call(session, `mark('region', ${JSON.stringify(selectors.region)})`);
  const top = await measure(session);
  const plantings = await session.evaluate<PlantingMeasure[]>('window.__page.measurePlantings()');

  // The relay, out of Edit mode.
  const expected = relayOf(top);
  await scroll(session, expected - RELAY_STEP);
  const before = await measure(session);
  await scroll(session, expected + RELAY_STEP);
  const after = await measure(session);
  await scroll(session, expected - RELAY_STEP);
  const back = await measure(session);

  // The header's toggle focused at the top; mid-page, the focus has followed it into the bar.
  await scroll(session, 0);
  await call(session, `focus(${JSON.stringify(selectors.headerToggle)})`);
  await scroll(session, Math.min(top.maxScroll, top.headerRow.docBottom + 300));
  const mid = await measure(session);

  // Enter, at the keyboard, on the bar's toggle: Edit mode, the content still.
  const anchor = mid.firstCard?.key ?? '';
  const cardSelector = JSON.stringify(`[data-widget="${anchor}"]`);
  const anchorBefore = await session.evaluate<number>(`window.__page.top(${cardSelector})`);
  await session.press('Enter');
  await settle(session);
  const enterAfter = await measure(session);
  const anchorNow = await session.evaluate<number>(`window.__page.top(${cardSelector})`);
  const enter = { after: enterAfter, card: anchor, before: anchorBefore, now: anchorNow };

  // The relay in Edit mode — the phone's bar is two lines tall — and the focus back in the header at the top.
  const editExpected = relayOf(enterAfter);
  await scroll(session, editExpected - RELAY_STEP);
  const editBefore = await measure(session);
  await scroll(session, editExpected + RELAY_STEP);
  const editAfter = await measure(session);

  // scroll-padding-top: a drag handle put 70 px from the top — under the two bars — then focused.
  await scroll(session, Math.min(enterAfter.maxScroll, enterAfter.headerRow.docBottom + 300));
  const handles = await session.evaluate<number>(`window.__page.count(${JSON.stringify(selectors.drag)})`);
  const handle = Math.min(3, handles - 1);
  const handleTop = await session.evaluate<number>(`window.__page.docTop(${JSON.stringify(selectors.drag)}, ${handle})`);
  await scroll(session, handleTop - 70);
  const underBars = await measure(session);
  await call(session, `focus(${JSON.stringify(selectors.drag)}, true, ${handle})`);
  await settle(session);
  const padding = {
    top: await session.evaluate<number>(`window.__page.top(${JSON.stringify(selectors.drag)}, ${handle})`),
    line: lineOf(underBars),
  };

  // A gesture: a widget hidden. The header's region says it, the same node, and the bar's copy with it.
  // The save is HELD (fix round 1, R1): « Enregistrement… » cannot end under the measurement that reads it.
  const idle = await measure(session);
  const writes = await session.evaluate<number>('window.__page.saves()');
  await call(session, 'holdSaves()');
  await call(session, `click(${JSON.stringify(selectors.hide)})`);
  await session.waitFor(`document.querySelector('[data-save-status]').textContent === 'Enregistrement…'`, 'the save starting');
  const pending = await measure(session);
  await session.waitFor(`window.__page.saves() > ${writes}`, 'the save leaving');
  await call(session, 'releaseSaves()');
  await session.waitFor(`document.querySelector('[data-save-status]').textContent === 'Enregistré'`, 'the save ending');
  const saved = await measure(session);

  // Enter on the bar's toggle again: out of Edit mode, the content still.
  await scroll(session, Math.min(saved.maxScroll, saved.headerRow.docBottom + 300));
  await call(session, `focus(${JSON.stringify(selectors.barToggle)})`);
  const leaveMeasure = await measure(session);
  const leaveAnchor = leaveMeasure.firstCard?.key ?? '';
  const leaveSelector = JSON.stringify(`[data-widget="${leaveAnchor}"]`);
  const leaveBefore = await session.evaluate<number>(`window.__page.top(${leaveSelector})`);
  await session.press('Enter');
  await settle(session);
  const leaveAfter = await measure(session);
  const leaveNow = await session.evaluate<number>(`window.__page.top(${leaveSelector})`);

  return {
    top,
    plantings,
    relay: { expected, before, after, back },
    mid,
    enter,
    editRelay: { expected: editExpected, before: editBefore, after: editAfter },
    padding,
    save: { idle, pending, saved },
    leave: { after: leaveAfter, card: leaveAnchor, before: leaveBefore, now: leaveNow },
  };
}

/** Mid-page out of Edit mode, then in it — for the night and for English. */
async function restAndEdit(session: PageSession, query: string) {
  await session.navigate(query);
  const top = await measure(session);
  await scroll(session, Math.min(top.maxScroll, top.headerRow.docBottom + 300));
  const rest = await measure(session);
  await call(session, `focus(${JSON.stringify(selectors.barToggle)})`);
  await session.press('Enter');
  await settle(session);
  return { rest, edit: await measure(session) };
}

/** One probe: the page broken as `probe` breaks it, then measured by the same means. */
async function runProbe(session: PageSession, probe: string): Promise<PageMeasure> {
  await session.navigate('level=expert&theme=light&lang=fr');
  await call(session, `mark('region', ${JSON.stringify(selectors.region)})`);
  await call(session, `mark('bar-toggle', ${JSON.stringify(selectors.barToggle)})`);
  const top = await measure(session);
  await scroll(session, Math.min(top.maxScroll, top.headerRow.docBottom + 300));
  if (probe === 'unmount-toggle') {
    await call(session, `focus(${JSON.stringify(selectors.barToggle)})`);
    await call(session, `probe('unmount-toggle')`);
    await session.press('Enter');
    await settle(session);
    return measure(session);
  }
  if (probe === 'filled-region') {
    // Into Edit mode from the header, at the top — the gesture that follows needs it, not the bar.
    await scroll(session, 0);
    await call(session, `click(${JSON.stringify(selectors.headerToggle)})`);
    await settle(session);
    await call(session, `probe('filled-region')`);
    await call(session, `click(${JSON.stringify(selectors.hide)})`);
    await settle(session, 6);
    return measure(session);
  }
  await call(session, `probe(${JSON.stringify(probe)})`);
  await settle(session);
  return measure(session);
}

/** Every scenario of one viewport, in one Chrome. */
async function runView(view: PageView): Promise<ViewResult> {
  const session = await openPage(CHROME!, outDir, { label: view.id, width: view.width, height: view.height, mobile: view.mobile });
  try {
    const result: ViewResult = { levels: {}, novice: null, loading: null, night: null, english: null, probes: {} };
    for (const level of LEVELS) result.levels[level] = await runLevel(session, level);

    // The Novice formula: no bar at any position (A-9).
    await session.navigate('level=novice&theme=light&lang=fr');
    const noviceTop = await measure(session);
    await scroll(session, Math.min(noviceTop.maxScroll, noviceTop.headerRow.docBottom + 300));
    result.novice = { top: noviceTop, mid: await measure(session) };

    // The layout never arrives: the page scrolled over its skeletons, no bar (A-10.2).
    await session.navigate('level=expert&theme=light&lang=fr&prefs=pending');
    const loadingTop = await measure(session);
    await scroll(session, loadingTop.maxScroll);
    result.loading = await measure(session);

    if (view.width === 360 || view.width === 1280) {
      result.night = await restAndEdit(session, 'level=expert&theme=dark&lang=fr');
    }
    if (view.width === 360) {
      result.english = await restAndEdit(session, 'level=expert&theme=light&lang=en');
      for (const probe of ['bar-top-40', 'wide-label', 'filled-region', 'unmount-toggle']) {
        result.probes[probe] = await runProbe(session, probe);
      }
    }
    return result;
  } finally {
    await session.close();
  }
}

/** The result of a viewport, or a throw that says why it has none. */
const viewOf = (id: string): ViewResult => {
  const result = results.get(id);
  if (!result) throw new Error(`No measurement for ${id}: ${String(failures.get(id) ?? 'not run')}`);
  return result;
};
const levelOf = (id: string, level: Level): LevelRun => {
  const run = viewOf(id).levels[level];
  if (!run) throw new Error(`No scenario ${level} at ${id}`);
  return run;
};

const CASES = VIEWS.flatMap((view) => LEVELS.map((level) => ({ id: view.id, level, view })));

describe.skipIf(!CHROME)('the compact action bar on the whole page, in a real engine (SMA-437, lot V39, B9)', () => {
  beforeAll(async () => {
    outDir = makeOutDir();
    try {
      await buildPageHarness(outDir);
      writePageHarness(outDir);
      const settled = await Promise.allSettled(VIEWS.map((view) => runView(view)));
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') results.set(VIEWS[index]!.id, outcome.value);
        else failures.set(VIEWS[index]!.id, outcome.reason);
      });
      // The Novice page's viewports after the bar's: one Chrome per viewport, six at once at most.
      const noviceSettled = await Promise.allSettled(NOVICE_VIEWS.map((view) => runNoviceView(view)));
      noviceSettled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') for (const [id, byScene] of outcome.value) noviceCases.set(id, byScene);
        else failures.set(`novice-${NOVICE_VIEWS[index]!.id}`, outcome.reason);
      });
      // The choice screen (SMA-448, lot F3, L7): one Chrome per viewport, five at once.
      const choiceSettled = await Promise.allSettled(CHOICE_VIEWS.map((view) => runChoiceView(view)));
      choiceSettled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') for (const [id, byScene] of outcome.value) choiceCases.set(id, byScene);
        else failures.set(`choice-${CHOICE_VIEWS[index]!.id}`, outcome.reason);
      });
      // The refusals of the creation and of the planner's save.
      const refusalSettled = await Promise.allSettled([
        ...REFUSAL_VIEWS.map((view) => runRefusalView(view).then((measured) => refusalCases.set(view.id, measured))),
        ...PLANNER_VIEWS.map((view) => runPlannerView(view).then((measured) => plannerCases.set(view.id, measured))),
      ]);
      refusalSettled.forEach((outcome, index) => {
        if (outcome.status === 'rejected') {
          const label = index < REFUSAL_VIEWS.length ? `refusal-${REFUSAL_VIEWS[index]!.id}` : `planner-${PLANNER_VIEWS[index - REFUSAL_VIEWS.length]!.id}`;
          failures.set(label, outcome.reason);
        }
      });
    } finally {
      await terminateChildren();
    }
  }, 240_000);

  afterAll(async () => {
    // Still tried when a browser outlived its kills; `removeOutDir` never throws.
    try {
      await terminateChildren();
    } finally {
      if (outDir) removeOutDir(outDir);
    }
  });

  it('ran every viewport to its end, in Inter, at the viewport it claims', () => {
    expect([...failures.entries()].map(([id, reason]) => `${id}: ${String(reason)}`)).toEqual([]);
    for (const view of VIEWS) {
      const top = levelOf(view.id, 'expert').top;
      expect(top.viewport, view.id).toEqual({ w: view.width, h: view.height });
      expect(top.fontLoaded, view.id).toBe(true);
    }
  });

  describe('at the top of the page', () => {
    it.each(CASES)('$id $level: no bar — hidden, inert, aria-hidden — and the header’s buttons live', ({ id, level }) => {
      expect(hiddenFaults(levelOf(id, level).top)).toEqual([]);
    });

    it.each(CASES)('$id $level: the Gardens widget’s thumbnails, contained — every planting inset by `plantInsetPx` of its cell, in whole px, exactly: nothing of the cover’s share reaches them (U2, control)', ({ id, level }) => {
      // The other use of `TemplatePreview` on a page: the 48 × 40 and 40 × 34
      // thumbnails of the Gardens widget, drawn unscaled at 2 and 3 px a cell
      // — a cell too small to keep an inset (`TINY_CELL_PX`), so the box is
      // the area itself. Read at a tenth of a pixel: a share of a cell leaking
      // in here would show.
      const { plantings } = levelOf(id, level);
      expect(plantings.length, 'no planting drawn in the Gardens widget').toBeGreaterThan(0);
      expect(
        plantingFaults(
          plantings,
          (cell) => {
            const px = plantInsetPx(cell.w);
            return { x: px, y: px };
          },
          0.1
        )
      ).toEqual([]);
    });
  });

  describe('the relay at the same place (A-10.1)', () => {
    it.each(CASES)('$id $level: shows as the header’s buttons pass under the navbar plus the bar, and leaves as they come back — out of Edit mode', ({ id, level }) => {
      const { relay } = levelOf(id, level);
      expect({
        before: hiddenFaults(relay.before),
        after: placedFaults(relay.after, BAR_HEIGHT),
        back: hiddenFaults(relay.back),
      }).toEqual({ before: [], after: [], back: [] });
    });

    it.each(CASES)('$id $level: does the same in Edit mode, at the line of its own Edit-mode height', ({ id, level, view }) => {
      const { editRelay } = levelOf(id, level);
      expect({
        before: hiddenFaults(editRelay.before),
        after: placedFaults(editRelay.after, isPhone(view) ? BAR_HEIGHT_PHONE_EDIT : BAR_HEIGHT),
      }).toEqual({ before: [], after: [] });
    });
  });

  describe('mid-page (A-10.2, A-10.3, A-10.7, A-10.8)', () => {
    it.each(CASES)('$id $level: sits right under the navbar, below it, over nothing, the window’s width, 54 px — « Modifier » and « Personnaliser », nothing else', ({ id, level }) => {
      const { mid } = levelOf(id, level);
      expect(placedFaults(mid, BAR_HEIGHT)).toEqual([]);
      expect(mid.bar?.buttons).toEqual(['Modifier', 'Personnaliser']);
    });

    it.each(CASES)('$id $level: in Edit mode, « Mode Modifier », « Terminé » and « Personnaliser », tinted, 73 px on a phone and 54 above', ({ id, level, view }) => {
      const { after } = levelOf(id, level).enter;
      expect(placedFaults(after, isPhone(view) ? BAR_HEIGHT_PHONE_EDIT : BAR_HEIGHT)).toEqual([]);
      expect(after.bar?.buttons).toEqual(['Terminé', 'Personnaliser']);
      expect(after.bar?.label).toBe('Mode Modifier');
      expect(after.bar?.backgroundImage).toContain('linear-gradient');
    });

    it.each(CASES)('$id $level: clips, wraps, overlaps nothing — out of and in Edit mode, while it saves', ({ id, level }) => {
      const run = levelOf(id, level);
      expect({
        rest: textFaults(run.mid),
        edit: textFaults(run.enter.after),
        pending: textFaults(run.save.pending),
      }).toEqual({ rest: [], edit: [], pending: [] });
    });

    it.each(CASES)('$id $level: the bar does not grow at the first gesture — the state’s place is kept', ({ id, level }) => {
      const { save } = levelOf(id, level);
      // The bar is there in each state measured (fix round 1, G10): without it,
      // the two heights below were `undefined` and `undefined`, and passed.
      expect(save.idle.bar, 'idle').not.toBeNull();
      expect(save.pending.bar, 'pending').not.toBeNull();
      expect(save.saved.bar, 'saved').not.toBeNull();
      expect(save.pending.bar?.height).toBe(save.idle.bar?.height);
      expect(save.saved.bar?.height).toBe(save.idle.bar?.height);
    });
  });

  describe('one announcement (A-10.6)', () => {
    it.each(CASES)('$id $level: one region for the save, the header’s — empty before any gesture, the same node carrying « Enregistrement… » then « Enregistré », copied in the bar', ({ id, level }) => {
      const run = levelOf(id, level);
      expect({
        top: [...regionFaults(run.top), ...sameRegionFaults(run.top, '')],
        mid: regionFaults(run.mid),
        idle: sameRegionFaults(run.save.idle, ''),
        pending: [...regionFaults(run.save.pending), ...sameRegionFaults(run.save.pending, 'Enregistrement…')],
        saved: [...regionFaults(run.save.saved), ...sameRegionFaults(run.save.saved, 'Enregistré')],
      }).toEqual({ top: [], mid: [], idle: [], pending: [], saved: [] });
      expect([run.save.pending.bar?.copy, run.save.saved.bar?.copy]).toEqual(['Enregistrement…', 'Enregistré']);
    });
  });

  describe('the focus (A-10.5, A-10.6)', () => {
    it.each(CASES)('$id $level: follows its twin into the bar as the header’s buttons go, stays on the same node through Enter, and comes back to the header at the top', ({ id, level }) => {
      const run = levelOf(id, level);
      expect({
        mid: focusFaults(run.mid, 'bar-toggle'),
        enter: focusFaults(run.enter.after, 'bar-toggle'),
        top: focusFaults(run.editRelay.before, 'header-toggle'),
        leave: focusFaults(run.leave.after, 'bar-toggle'),
      }).toEqual({ mid: [], enter: [], top: [], leave: [] });
      expect([run.enter.after.active.text, run.leave.after.active.text]).toEqual(['Terminé', 'Modifier']);
    });

    it.each(CASES)('$id $level: brings a control focused under the two bars out from under them — scroll-padding-top (WCAG 2.4.11)', ({ id, level }) => {
      const { padding, mid } = levelOf(id, level);
      expect(mid.scrollPaddingTop).toBe(`${lineOf(mid) + 8}px`);
      expect(padding.top).toBeGreaterThanOrEqual(padding.line - 0.5);
    });
  });

  describe('the content stays still (technical decision 11)', () => {
    it.each(CASES)('$id $level: toggling Edit mode from the bar mid-page moves the first card visible under the bars by less than a pixel — in and out', ({ id, level }) => {
      const { enter, leave } = levelOf(id, level);
      expect({
        enter: `${enter.card} ${Math.round((enter.now - enter.before) * 10) / 10} px`,
        leave: `${leave.card} ${Math.round((leave.now - leave.before) * 10) / 10} px`,
      }).toEqual({ enter: `${enter.card} 0 px`, leave: `${leave.card} 0 px` });
      expect(Math.abs(enter.now - enter.before)).toBeLessThan(1);
      expect(Math.abs(leave.now - leave.before)).toBeLessThan(1);
    });
  });

  describe('where there is no bar', () => {
    it.each(VIEWS.map((view) => view.id))('%s: none at the Novice formula, at the top nor mid-page (A-9)', (id) => {
      const { novice } = viewOf(id);
      expect([novice?.top.bar, novice?.mid.bar]).toEqual([null, null]);
      // Scrolled past the header — or to the page's end where the Novice
      // page, its three cards and their warning, stops before that (SMA-448,
      // lot F2: the page of cards is shorter than the grid was).
      expect(novice!.mid.scrollY).toBeGreaterThanOrEqual(
        Math.min(novice!.top.headerRow.docBottom, novice!.top.maxScroll) - 1
      );
    });

    it.each(VIEWS.map((view) => view.id))('%s: none while the layout loads, the page scrolled as far as it goes (A-10.2)', (id) => {
      const { loading } = viewOf(id);
      expect(hiddenFaults(loading!)).toEqual([]);
      expect(loading!.bar).not.toBeNull();
    });
  });

  describe('at night and in English, at 360 and 1 280 px', () => {
    it.each(['360x780', '1280x800'])('%s at night: in place and clean, out of and in Edit mode — the Edit-mode ground `invBg`', (id) => {
      const { night } = viewOf(id);
      const phone = id === '360x780';
      expect({
        rest: [...placedFaults(night!.rest, BAR_HEIGHT), ...textFaults(night!.rest)],
        edit: [...placedFaults(night!.edit, phone ? BAR_HEIGHT_PHONE_EDIT : BAR_HEIGHT), ...textFaults(night!.edit)],
      }).toEqual({ rest: [], edit: [] });
      expect(night!.edit.bar?.backgroundImage).toContain('rgba(76, 180, 124, 0.07)');
    });

    it('360x780 in English: « Edit » and « Customize », then « Edit mode », « Done » and « Customize », in place and clean', () => {
      const { english } = viewOf('360x780');
      expect({
        rest: [...placedFaults(english!.rest, BAR_HEIGHT), ...textFaults(english!.rest)],
        edit: [...placedFaults(english!.edit, BAR_HEIGHT_PHONE_EDIT), ...textFaults(english!.edit)],
      }).toEqual({ rest: [], edit: [] });
      expect([english!.rest.bar?.buttons, english!.edit.bar?.buttons, english!.edit.bar?.label]).toEqual([
        ['Edit', 'Customize'],
        ['Done', 'Customize'],
        'Edit mode',
      ]);
    });
  });

  // SMA-448, lot F2, step N5 (V5: « toute forme nouvelle de la v3 entre dans
  // le harnais comme une scène ») — THE NOVICE PAGE, as the app mounts it
  // (PR #296, fix round 1, S1): the header in its cards form, one card per
  // garden, the foot message and the warning, with 0, 1, 3 and 5 gardens,
  // very long names and a garden without a city — at 360 and 390 (the
  // phones), 600, 768 and 1 024 (the tablets), 1 280 (the desktop), in French
  // and in English, by day and by night. The page is measured as one card —
  // every atom against every other — and card by card: zero overlap, zero
  // clipped text, zero spill, nothing beyond; the one ellipsis a source
  // allows is the garden name (SMA-436), the task and the plants wrap.
  describe('the Novice page, as the app mounts it (SMA-448, lot F2, N5 — PR #296, fix round 1, S1)', () => {
    const pageOf = (run: NoviceRun, name: string): NoviceMeasure => {
      const measure = noviceCases.get(run.id)?.get(name);
      if (!measure) throw new Error(`No measurement for the Novice scene ${name} in ${run.id}`);
      return measure;
    };
    const SCENE_NAMES = NOVICE_SCENES.map((scene) => scene.name);
    const clean = { overlaps: [], clipped: [], spills: [], beyondCard: 0 };

    it('draws the six scenes: 0, 1, 3 and 5 gardens, the long names, the garden without a city — in every run, at the viewport it claims, in Inter', () => {
      expect(SCENE_NAMES).toEqual(['novice-0', 'novice-1', 'novice-3', 'novice-5', 'novice-3-long', 'novice-3-partial']);
      for (const run of NOVICE_RUNS) {
        expect(noviceCases.get(run.id)?.size, run.id).toBe(NOVICE_SCENES.length);
        for (const scene of NOVICE_SCENES) {
          const page = pageOf(run, scene.name);
          expect(page.cards, `${run.id} ${scene.name}`).toHaveLength(scene.count);
          expect(page.viewport, `${run.id} ${scene.name}`).toBe(run.vw);
          expect(page.fontLoaded, `${run.id} ${scene.name}: Inter not loaded`).toBe(true);
        }
      }
    });

    it.each(NOVICE_RUNS.map((run) => run.id))('%s: every scene is clean — the page as one card, and each card: no overlap, nothing clipped, nothing spilled, nothing beyond; the header’s texts on one line', (id) => {
      const run = noviceRunOf(id);
      for (const name of SCENE_NAMES) {
        const page = pageOf(run, name);
        expect({ ...defects(page), wrapped: page.wrapped }, `${id} ${name}`).toEqual({ ...clean, wrapped: [] });
        for (const card of page.cards) {
          expect(defects(card), `${id} ${name} ${card.id}`).toEqual(clean);
        }
      }
    });

    it.each(NOVICE_RUNS.map((run) => run.id))('%s: measures the gardens’ zone as the page’s body — every card inside it, the warning outside it', (id) => {
      // The Extension's second draw (`04a18a9d…`): measured as one card, the
      // page's `body` was its LAST child — the warning, when it showed. It is
      // the gardens' zone now, whatever follows it.
      const run = noviceRunOf(id);
      for (const scene of NOVICE_SCENES) {
        const page = pageOf(run, scene.name);
        expect(page.body.h, `${id} ${scene.name}`).toBe(page.content.h);
        for (const card of page.cards) {
          expect(card.box.y, `${id} ${scene.name} ${card.id}`).toBeGreaterThanOrEqual(page.content.y - 0.5);
          expect(card.box.y + card.box.h, `${id} ${scene.name} ${card.id}`).toBeLessThanOrEqual(page.content.y + page.content.h + 0.5);
        }
      }
    });

    it.each(NOVICE_RUNS.map((run) => run.id))('%s: ellipsizes nothing but a garden name — none on the short names, the long names alone on the long scene (V5, SMA-436)', (id) => {
      const run = noviceRunOf(id);
      for (const scene of NOVICE_SCENES) {
        const cut = pageOf(run, scene.name).ellipsized.map((ellipsis) => ellipsis.text);
        if (!scene.long) {
          expect(cut, `${id} ${scene.name}`).toEqual([]);
          continue;
        }
        expect(cut.length, `${id} ${scene.name}`).toBeGreaterThan(0);
        for (const text of cut) {
          expect(
            NOVICE_LONG_NAMES.some((name) => name.startsWith(text.replace(/^"|"$/g, '').slice(0, 12))),
            `${id} ${scene.name}: ${text}`
          ).toBe(true);
        }
      }
    });

    it('lays the cards in one column on a phone, as wide as the page (328 / 358 px), two from 600 to 1 199 px, three from 1 200 px — the five gardens on two rows', () => {
      for (const run of NOVICE_RUNS) {
        const expected = run.vw < 600 ? 1 : run.vw < 1200 ? 2 : 3;
        for (const scene of NOVICE_SCENES.filter((candidate) => candidate.count > 0)) {
          const page = pageOf(run, scene.name);
          expect(page.columns, `${run.id} ${scene.name}`).toBe(Math.min(expected, scene.count));
          if (run.vw < 600) {
            for (const card of page.cards) expect(card.card.w, `${run.id} ${scene.name} ${card.id}`).toBe(run.vw - 32);
          }
        }
        const five = pageOf(run, 'novice-5');
        expect(five.cards[expected]!.box.y, `${run.id} novice-5`).toBeGreaterThan(five.cards[0]!.box.y);
      }
    });

    it.each(NOVICE_RUNS.map((run) => run.id))('%s: the plan fills its band from edge to edge, cropped — every card, at every width (V1, Alexandre 27/09, V3-00 B)', (id) => {
      // Alexandre's finding on 8a9b1b9: the plan « en tout petit et centrée
      // au milieu », where the mock-up's touches every edge of its slot.
      const run = noviceRunOf(id);
      for (const scene of NOVICE_SCENES) {
        for (const card of pageOf(run, scene.name).cards) {
          expect(card.plan, `${id} ${scene.name} ${card.id}: no plan drawn in the band`).not.toBeNull();
          expect(
            { covered: card.plan!.covered, frame: card.plan!.frame, drawn: card.plan!.drawn },
            `${id} ${scene.name} ${card.id}`
          ).toEqual({ covered: true, frame: card.plan!.frame, drawn: card.plan!.drawn });
        }
      }
    });

    it.each(NOVICE_RUNS.map((run) => run.id))('%s: every planting keeps its shape under the crop — its box is its cells’ area inset by 7 % of ONE cell on each side, whatever it spans: 1 × 3, 1 × 7, 7 × 1, 4 × 4 and the 1 × 1 (U2, GitHub 4115367541)', (id) => {
      // GitHub `4115367541`: a percentage margin resolves on the grid AREA's
      // inline size — a planting wider than tall lost its height with its
      // span, to nothing from 1 × 7. The greenhouse of `novice-5` carries the
      // four elongated shapes; every card's 1 × 1 are the control.
      const run = noviceRunOf(id);
      const spans = new Set<string>();
      for (const scene of NOVICE_SCENES) {
        for (const card of pageOf(run, scene.name).cards) {
          for (const planting of card.plantings) spans.add(planting.span);
          expect(
            plantingFaults(card.plantings, (cell) => ({ x: COVER_PLANT_INSET * cell.w, y: COVER_PLANT_INSET * cell.h })),
            `${id} ${scene.name} ${card.id}`
          ).toEqual([]);
        }
      }
      expect([...spans].sort()).toEqual(expect.arrayContaining(['1x1', '1x3', '1x7', '4x4', '7x1']));
    });

    it('aligns the feet of the cards of one row: the cards of a row share one height, and their feet one top and one bottom (V3-00, `flex: 1` — S3)', () => {
      // GitHub `4112917722`: the heights alone let a foot sit lower than its
      // row's while the cards still stretched to one height.
      for (const run of NOVICE_RUNS) {
        for (const scene of NOVICE_SCENES.filter((candidate) => candidate.count > 1)) {
          const rows = new Map<number, Array<{ id: string; h: number; footTop: number; footBottom: number }>>();
          for (const card of pageOf(run, scene.name).cards) {
            rows.set(card.box.y, [
              ...(rows.get(card.box.y) ?? []),
              { id: card.id, h: card.box.h, footTop: card.foot.y, footBottom: card.foot.y + card.foot.h },
            ]);
          }
          for (const [y, row] of rows) {
            const label = `${run.id} ${scene.name} row at ${y}: ${row.map((card) => `${card.id} h ${card.h} foot ${card.footTop}–${card.footBottom}`).join(', ')}`;
            expect(new Set(row.map((card) => card.h)).size, label).toBe(1);
            expect(new Set(row.map((card) => card.footTop)).size, label).toBe(1);
            expect(new Set(row.map((card) => card.footBottom)).size, label).toBe(1);
          }
        }
      }
    });

    it.each(NOVICE_RUNS.map((run) => run.id))('%s: no two cards meet — their boxes compared two by two, as the grid’s are (S3)', (id) => {
      // GitHub `4112917722`: `measureCard` skips a pair of painted boxes
      // — two cards could overlap without a text of theirs meeting.
      const run = noviceRunOf(id);
      for (const scene of NOVICE_SCENES) {
        expect(pageOf(run, scene.name).cardOverlaps, `${id} ${scene.name}`).toEqual([]);
      }
    });

    it('draws the warning under the cards when a card shows a temperature — every scene but the empty one (V1) — and the chip as the button of N3 on all', () => {
      for (const run of NOVICE_RUNS) {
        for (const scene of NOVICE_SCENES) {
          const page = pageOf(run, scene.name);
          expect(page.warning, `${run.id} ${scene.name}`).toBe(scene.count > 0);
          expect(page.chipButton, `${run.id} ${scene.name}`).toBe(true);
        }
      }
    });

    it('keeps every text at 14 px or more — the chips, the pills and the missing-data marks alone at 13 (V11): a 13 px text outside them is refused (S2)', () => {
      for (const run of NOVICE_RUNS) {
        for (const scene of NOVICE_SCENES) {
          const page = pageOf(run, scene.name);
          const under = page.smallFonts.filter((font) => font.px < (font.chip ? 13 : 14));
          expect(under, `${run.id} ${scene.name}`).toEqual([]);
        }
      }
    });

    it('reads the same measurements twice: two identical runs agree on every scene, box for box (#4)', () => {
      const twin = noviceCases.get('fr@360-twin');
      for (const [name, page] of noviceCases.get('fr@360') ?? []) {
        expect(twin?.get(name), name).toEqual(page);
      }
    });

    it('does not follow the machine’s date: told another day, the same run measures the same, box for box (#8)', () => {
      const other = noviceCases.get('fr@360-clock');
      for (const [name, page] of noviceCases.get('fr@360') ?? []) {
        expect(other?.get(name), name).toEqual(page);
      }
    });

    it('draws the same card frame in both languages and at night: fr@360, en@360 and dark@360 share the card columns and widths — the heights follow the texts (language parity)', () => {
      for (const id of ['en@360', 'dark@360']) {
        const other = noviceCases.get(id);
        for (const [name, page] of noviceCases.get('fr@360') ?? []) {
          expect(other?.get(name)?.cards.map((card) => [card.box.x, card.box.w]), `${id} ${name}`).toEqual(page.cards.map((card) => [card.box.x, card.box.w]));
        }
      }
    });

    it('never takes a page showing its load error for ready: the gardens answered 500, and `navigate` says so at once (the Extension’s second draw, `11595896…`)', () => {
      expect(noviceLoadFailure).toContain('failed before it was ready');
      expect(noviceLoadFailure).toContain('data-novice-error');
    });
  });

  // SMA-448, lot F3, step L7 (V5) — THE CHOICE SCREEN as the app opens it,
  // in its five situations (V3-01, and the kept formula it left undrawn), at
  // 360, 390, 600, 1 024 and 1 280 px, by day and by night, in French and in
  // English: the panel measured as one card — zero overlap, zero clipped
  // text, zero spill, nothing beyond, no ellipsis, every text at 14 px or
  // more (the tags at 13, as chips) —, and what each situation draws.
  describe('the choice screen, as the app opens it (SMA-448, lot F3, L7 — V3-01)', () => {
    const choiceOf = (runId: string, name: string): ChoiceMeasure => {
      const measure = choiceCases.get(runId)?.get(name);
      // The failure of a view is recorded under `choice-${view.id}` (SMA-448, PR #297, fix round 1, S4 — Extension E3): looked up by that id, so the message says the real cause, not the list of keys.
      if (!measure) throw new Error(`No measurement for the choice scene ${name} in ${runId}: ${String(failures.get(`choice-${choiceRunOf(runId).viewId}`) ?? [...failures.keys()].join(', '))}`);
      return measure;
    };
    const SCENE_NAMES = CHOICE_SCENES.map((scene) => scene.name);
    const clean = { overlaps: [], clipped: [], spills: [], beyondCard: 0 };
    const tagsOf = (measure: ChoiceMeasure, key: string) => measure.offers.find((offer) => offer.key === key)?.tags ?? ['no such offer'];
    const buttonOf = (measure: ChoiceMeasure, key: string) => measure.offers.find((offer) => offer.key === key)?.button ?? { text: '', disabled: true };

    it('draws the five situations in every run, at the viewport it claims, in Inter — three offers each, in the catalogue’s order', () => {
      expect(SCENE_NAMES).toEqual(['choice-first', 'choice-change', 'choice-five', 'choice-twelve', 'choice-kept']);
      for (const run of CHOICE_RUNS) {
        expect(choiceCases.get(run.id)?.size, run.id).toBe(CHOICE_SCENES.length);
        for (const name of SCENE_NAMES) {
          const screen = choiceOf(run.id, name);
          expect(screen.viewport, `${run.id} ${name}`).toBe(run.vw);
          expect(screen.fontLoaded, `${run.id} ${name}: Inter not loaded`).toBe(true);
          expect(screen.offers.map((offer) => offer.key), `${run.id} ${name}`).toEqual(['novice', 'gardener', 'expert']);
        }
      }
    });

    it.each(CHOICE_RUNS.map((run) => run.id))('%s: every situation is clean — no overlap, nothing clipped, nothing spilled, nothing beyond, no ellipsis; every text at 14 px or more, the tags alone at 13 (V5, V11)', (id) => {
      for (const name of SCENE_NAMES) {
        const screen = choiceOf(id, name);
        expect(defects(screen), `${id} ${name}`).toEqual(clean);
        expect(screen.ellipsized.map((cut) => cut.text), `${id} ${name}`).toEqual([]);
        expect(screen.smallFonts.filter((font) => font.px < (font.chip ? 13 : 14)), `${id} ${name}`).toEqual([]);
      }
    });

    it('a first visit: mandatory — no close button —, three « Choisir » live, Novice recommended, no formula of its own yet', () => {
      for (const run of CHOICE_RUNS) {
        const screen = choiceOf(run.id, 'choice-first');
        expect({ mandatory: screen.mandatory, closeButton: screen.closeButton }, run.id).toEqual({ mandatory: true, closeButton: false });
        expect(screen.offers.map((offer) => offer.tags), run.id).toEqual([['recommended'], [], []]);
        expect(screen.offers.map((offer) => offer.button.disabled), run.id).toEqual([false, false, false]);
        expect(screen.offers.every((offer) => !offer.kept && !offer.why), run.id).toBe(true);
      }
    });

    it('a change from the chip: closable, the dashboard veiled behind — the scrim token and its blur —, the title seen above the panel, « Garder » on the current formula, no recommendation (decision 3)', () => {
      for (const run of CHOICE_RUNS) {
        const screen = choiceOf(run.id, 'choice-change');
        expect({ mandatory: screen.mandatory, closeButton: screen.closeButton }, run.id).toEqual({ mandatory: false, closeButton: true });
        expect(screen.offers.map((offer) => offer.tags), run.id).toEqual([[], ['current'], []]);
        expect(buttonOf(screen, 'gardener').text, run.id).toMatch(run.lang === 'en' ? /^Keep Gardener$/ : /^Garder Jardinier$/);
        expect(screen.backdrop.color, run.id).toBe(run.theme === 'dark' ? 'rgba(3, 10, 20, 0.58)' : 'rgba(24, 46, 34, 0.42)');
        expect(screen.backdrop.filter, run.id).toContain('blur(2.5px)');
        expect({ title: screen.title, clear: screen.titleClear }, `${run.id}: the panel at ${screen.rect.y}, the title at ${JSON.stringify(screen.title)}`).toMatchObject({ clear: true });
      }
    });

    it('a mandatory screen veils the page with its own ground — nothing of the dashboard to see behind', () => {
      for (const run of CHOICE_RUNS) {
        const screen = choiceOf(run.id, 'choice-first');
        expect(screen.backdrop.color, run.id).toBe(run.theme === 'dark' ? 'rgb(13, 30, 52)' : 'rgb(250, 253, 247)');
      }
    });

    it('five gardens: Novice unavailable, its reason in words, its button inert; Gardener current and recommended, « Garder » live', () => {
      for (const run of CHOICE_RUNS) {
        const screen = choiceOf(run.id, 'choice-five');
        expect(tagsOf(screen, 'novice'), run.id).toEqual(['unavailable']);
        expect(buttonOf(screen, 'novice').disabled, run.id).toBe(true);
        expect(screen.offers[0]!.why, run.id).toMatch(/5/);
        expect(screen.offers[0]!.why, run.id).toMatch(/3/);
        expect(tagsOf(screen, 'gardener'), run.id).toEqual(['current', 'recommended']);
        expect(buttonOf(screen, 'gardener').disabled, run.id).toBe(false);
        expect(tagsOf(screen, 'expert'), run.id).toEqual([]);
      }
    });

    it('twelve gardens on Expert: Novice and Gardener unavailable, each with its count; Expert current and recommended', () => {
      for (const run of CHOICE_RUNS) {
        const screen = choiceOf(run.id, 'choice-twelve');
        expect(screen.offers.map((offer) => offer.tags), run.id).toEqual([['unavailable'], ['unavailable'], ['current', 'recommended']]);
        expect(screen.offers.map((offer) => offer.button.disabled), run.id).toEqual([true, true, false]);
        expect(screen.offers[0]!.why, run.id).toMatch(/12/);
        expect(screen.offers[1]!.why, run.id).toMatch(/10/);
      }
    });

    it('twelve gardens still on Gardener: « Votre formule — conservée », what it keeps said, « Garder » live; Novice unavailable; Expert recommended', () => {
      for (const run of CHOICE_RUNS) {
        const screen = choiceOf(run.id, 'choice-kept');
        expect(screen.offers.map((offer) => offer.tags), run.id).toEqual([['unavailable'], ['currentKept'], ['recommended']]);
        expect(screen.offers.map((offer) => offer.button.disabled), run.id).toEqual([true, false, false]);
        expect(screen.offers[1]!.kept, run.id).toMatch(/12/);
        expect(screen.offers[1]!.why, run.id).toBeNull();
      }
    });

    it('the comparison is a table from 900 px and one list per formula under it — never a horizontal scroll', () => {
      for (const run of CHOICE_RUNS) {
        for (const name of SCENE_NAMES) {
          const screen = choiceOf(run.id, name);
          expect(screen.compare, `${run.id} ${name}`).toBe(run.vw >= 900 ? 'table' : 'lists');
          expect(screen.scrollers.filter((scroller) => scroller.overflowX > 0), `${run.id} ${name}`).toEqual([]);
        }
      }
    });

    it('never a weather warning on the screen (V1), never a price above 0 (V2), never Récolte promised (R7)', () => {
      for (const run of CHOICE_RUNS) {
        for (const name of SCENE_NAMES) {
          const screen = choiceOf(run.id, name);
          expect(screen.warning, `${run.id} ${name}`).toBe(false);
          expect(screen.text, `${run.id} ${name}`).not.toMatch(/[1-9]\d*\s?€|€\s?[1-9]|\$/);
          expect(screen.text, `${run.id} ${name}`).not.toMatch(/\bRécolte\b|\bHarvest\b/);
        }
      }
    });

    // SMA-448, PR #297, fix round 1 (A2, Alexandre 27/09): « un poil plus haut
    // d'un cran, histoire que les boutons "Choisir Novice / Jardinier / Expert"
    // soient visibles dès le début dans la vue desktop » — measured against
    // the fold of a common laptop's window (1 280 × 720, the browser's bar
    // deducted) and of a larger one (1 440 × 900), in every situation.
    it.each(FOLD_RUNS)('%s: the three « Choisir » / « Garder » buttons are seen entirely without scrolling, in every situation (A2)', (id) => {
      for (const name of SCENE_NAMES) {
        const screen = choiceOf(id, name);
        const fold = screen.viewportHeight;
        const below = screen.offers
          .map((offer) => ({ key: offer.key, top: offer.button.rect.y, bottom: offer.button.rect.y + offer.button.rect.h }))
          .filter((button) => button.top < 0 || button.bottom > fold);
        expect(below, `${id} ${name}: the fold at ${fold} px, the panel at ${screen.rect.y}, the buttons at ${JSON.stringify(screen.offers.map((offer) => offer.button.rect))}`).toEqual([]);
      }
    });

    // SMA-448, PR #297, fix round 1 (S3 — GitHub G2): the tone of a cell of
    // the comparison comes from its MEANING, never from its text. Read from
    // the text, « No limit » — the best value of its row — was drawn in the
    // muted tone of a « No », and the two languages looked different.
    it('colours the comparison by meaning, not by text: « No limit » / « Sans limite » in the tone of a yes, unlike a « No » / « Non »; a figure in neither (S3)', () => {
      const WORDS = {
        'en@1280': { yes: 'Yes', no: 'No', unlimited: 'No limit', figure: 'Up to 3' },
        'fr@1280': { yes: 'Oui', no: 'Non', unlimited: 'Sans limite', figure: 'Jusqu’à 3' },
      } as const;
      for (const [id, words] of Object.entries(WORDS)) {
        const screen = choiceOf(id, 'choice-change');
        const cell = (text: string) => screen.compareCells.find((candidate) => candidate.text === text) ?? { text, color: 'no such cell', weight: 'no such cell', tone: null };
        const [yes, no, unlimited, figure] = [cell(words.yes), cell(words.no), cell(words.unlimited), cell(words.figure)];
        expect({ color: unlimited.color, weight: unlimited.weight }, `${id}: ${JSON.stringify({ yes, no, unlimited })}`).toEqual({ color: yes.color, weight: yes.weight });
        expect(unlimited.color, `${id}: ${JSON.stringify({ no, unlimited })}`).not.toBe(no.color);
        expect(yes.color, `${id}: a yes and a no alike — ${JSON.stringify({ yes, no })}`).not.toBe(no.color);
        expect(figure.color, `${id}: ${JSON.stringify({ figure, yes })}`).not.toBe(yes.color);
        expect(figure.color, `${id}: ${JSON.stringify({ figure, no })}`).not.toBe(no.color);
      }
    });

    it('reads the same screen in French and in English at 1 280 px: the same tags, the same buttons live, box widths alike (language parity)', () => {
      for (const name of SCENE_NAMES) {
        const fr = choiceOf('fr@1280', name);
        const en = choiceOf('en@1280', name);
        expect(en.offers.map((offer) => [offer.tags, offer.button.disabled]), name).toEqual(fr.offers.map((offer) => [offer.tags, offer.button.disabled]));
        expect(en.rect.w, name).toBe(fr.rect.w);
      }
    });
  });

  // SMA-448, lot F3, step L7 — THE REFUSALS said on the real pages (R3-E1):
  // the creation's dialog, at the five widths; the planner's shape mode at
  // the Novice's limit and its save refused, at the desktop widths.
  describe('the refusals said on the real pages (SMA-448, lot F3, L7 — R3-E1)', () => {
    const refusalOf = (id: string) => {
      const measured = refusalCases.get(id);
      if (!measured) throw new Error(`No measurement for the creation refusals at ${id}: ${String(failures.get(`refusal-${id}`) ?? 'not run')}`);
      return measured;
    };
    const plannerOf = (id: string) => {
      const measured = plannerCases.get(id);
      if (!measured) throw new Error(`No measurement for the planner at ${id}: ${String(failures.get(`planner-${id}`) ?? 'not run')}`);
      return measured;
    };
    const clean = { overlaps: [], clipped: [], spills: [], beyondCard: 0 };
    const names = (dialog: DialogMeasure) => dialog.buttons.map((button) => button.text);

    it.each(REFUSAL_VIEWS.map((view) => view.id))('%s: a fourth garden refused — the creation dialog says the limit with its numbers and offers « Voir les formules », clean', (id) => {
      const { limit } = refusalOf(id);
      expect(defects(limit), id).toEqual(clean);
      expect(limit.ellipsized, id).toEqual([]);
      expect(limit.text, id).toMatch(/Novice/);
      expect(limit.text, id).toMatch(/3 jardins au plus/);
      expect(names(limit), id).toContain('Voir les formules');
      expect(limit.text, id).not.toMatch(/réessayer/i);
    });

    it.each(REFUSAL_VIEWS.map((view) => view.id))('%s: a session that expired on the creation — « Se reconnecter », never « réessayer », clean', (id) => {
      const { unauthorized } = refusalOf(id);
      expect(defects(unauthorized), id).toEqual(clean);
      expect(unauthorized.text, id).toMatch(/Votre session a expiré/);
      expect(names(unauthorized), id).toContain('Se reconnecter');
      expect(names(unauthorized), id).not.toContain('Voir les formules');
      expect(unauthorized.text, id).not.toMatch(/réessayer/i);
    });

    it.each(PLANNER_VIEWS.map((view) => view.id))('%s: the planner at the Novice’s 20 × 20 — the four add buttons inert, the four remove buttons live, the note says the limit, whole and clear of the row', (id) => {
      const { limit } = plannerOf(id);
      expect(limit.fontLoaded, id).toBe(true);
      expect(limit.adds.map((button) => button.disabled), id).toEqual([true, true, true, true]);
      expect(limit.removes.map((button) => button.disabled), id).toEqual([false, false, false, false]);
      expect(limit.note, id).not.toBeNull();
      expect(limit.note!.text, id).toMatch(/Novice/);
      expect(limit.note!.text, id).toMatch(/20 × 20/);
      expect({ x: limit.note!.overflowX, y: limit.note!.overflowY }, id).toEqual({ x: 0, y: 0 });
      expect(limit.gap, id).toBeGreaterThanOrEqual(0);
    });

    it.each(PLANNER_VIEWS.map((view) => view.id))('%s: a plan the server refuses for its size — the toast says the formula, its limit and the size asked, with « Voir les formules », clean', (id) => {
      const { refused } = plannerOf(id);
      expect(defects(refused), id).toEqual(clean);
      expect(refused.ellipsized, id).toEqual([]);
      expect(refused.text, id).toMatch(/Novice/);
      expect(refused.text, id).toMatch(/20 × 20/);
      expect(refused.text, id).toMatch(/20 × 21/);
      expect(names(refused), id).toContain('Voir les formules');
    });

    it.each(PLANNER_VIEWS.map((view) => view.id))('%s: a session that expired on the save — « Se reconnecter », clean', (id) => {
      const { unauthorized } = plannerOf(id);
      expect(defects(unauthorized), id).toEqual(clean);
      expect(unauthorized.text, id).toMatch(/Votre session a expiré/);
      expect(names(unauthorized), id).toContain('Se reconnecter');
    });
  });

  describe('the probes — the same checks see a page broken on purpose (SMA-446)', () => {
    const probe = (name: string) => {
      const measured = viewOf('360x780').probes[name];
      if (!measured) throw new Error(`No measurement for the probe ${name}`);
      return measured;
    };

    it('a bar pinned at 40 px, over the navbar: reported', () => {
      expect(placedFaults(probe('bar-top-40'), BAR_HEIGHT)).toEqual([
        'the bar’s top at 40, the navbar’s bottom at 56',
        'the bar overlaps the navbar by 16 px',
      ]);
    });

    it('« Personnaliser » wider than its half: reported', () => {
      expect(textFaults(probe('wide-label'))).not.toEqual([]);
    });

    it('a save region born filled, in place of the one that was there: reported', () => {
      expect(sameRegionFaults(probe('filled-region'), 'Enregistrement…')).toEqual([
        'the region is not the node that was there before any gesture',
      ]);
    });

    it('a toggle unmounted at the key: reported — the focus falls to the body', () => {
      expect(focusFaults(probe('unmount-toggle'), 'bar-toggle')).toEqual(['the focus fell to the body']);
    });
  });
});

// ── The Weather widget by formula, on the real page (SMA-448, lot F4, W5) ──

/** The five widths of the brief — 360, 390, 600, 1 024, 1 280 — for the Weather widget by formula. */
const WEATHER_VIEWS: PageView[] = [
  { id: '360x780', width: 360, height: 780, mobile: true },
  { id: '390x844', width: 390, height: 844, mobile: true },
  { id: '600x1024', width: 600, height: 1024, mobile: true },
  { id: '1024x768', width: 1024, height: 768, mobile: true },
  { id: '1280x800', width: 1280, height: 800, mobile: false },
];

interface WeatherCase {
  id: string;
  level: DashboardLevel;
  size: DashboardSize;
  kind: WeatherCityScene;
}

/** Each formula that has the widget, at each size its served capabilities permit, with each set of cities. */
const WEATHER_CASES: WeatherCase[] = (['gardener', 'expert'] as const).flatMap((level) =>
  (sizesFor('weather', capabilitiesFor(level)) ?? []).flatMap((size) =>
    WEATHER_CITY_SCENES.map((kind) => ({ id: `${level}/${size}/${kind}`, level, size, kind }))
  )
);

/** The Weather widget, by viewport then by case. */
const weatherCases = new Map<string, Map<string, WeatherMeasure>>();
const weatherFailures = new Map<string, unknown>();
let weatherOutDir = '';

/** Every case of one viewport, in one Chrome. */
async function runWeatherView(view: PageView): Promise<Map<string, WeatherMeasure>> {
  const session = await openPage(CHROME!, weatherOutDir, { label: `weather-${view.id}`, width: view.width, height: view.height, mobile: view.mobile });
  try {
    const byCase = new Map<string, WeatherMeasure>();
    for (const weatherCase of WEATHER_CASES) {
      await session.navigate(`level=${weatherCase.level}&theme=light&lang=fr&weather=${weatherCase.kind}&wsize=${weatherCase.size}`);
      byCase.set(weatherCase.id, await session.evaluate<WeatherMeasure>('window.__page.measureWeather()'));
    }
    return byCase;
  } finally {
    await session.close();
  }
}

/** The Gardens widget in the Full width, by viewport then by case — `<kind>/rest`, and `<kind>/unfolded` where the foot offered it (SMA-448, lot F5-b, W4). */
const gardensCases = new Map<string, Map<string, GardensMeasure>>();

/** The page at the Expert preset, as served — its grid's cells, by viewport (SMA-437, lot V3-08, S5). */
const presetGrids = new Map<string, PageGridMeasure>();

/**
 * Every Gardens case of one viewport, in one Chrome: each list at rest, then
 * unfolded where « + N autres jardins » stands — and, in the same Chrome, the
 * page at the Expert preset as served, its grid read cell by cell (SMA-437,
 * lot V3-08, S5).
 */
async function runGardensView(view: PageView): Promise<Map<string, GardensMeasure>> {
  const session = await openPage(CHROME!, weatherOutDir, { label: `gardens-${view.id}`, width: view.width, height: view.height, mobile: view.mobile });
  try {
    const byCase = new Map<string, GardensMeasure>();
    for (const kind of GARDENS_LIST_KINDS) {
      await session.navigate(`level=expert&theme=light&lang=fr&gsize=wide&gardens=${kind}`);
      byCase.set(`${kind}/rest`, await session.evaluate<GardensMeasure>('window.__page.measureGardens()'));
      if (await session.evaluate<boolean>('window.__page.unfoldGardens()')) {
        byCase.set(`${kind}/unfolded`, await session.evaluate<GardensMeasure>('window.__page.measureGardens()'));
      }
    }
    await session.navigate('level=expert&theme=light&lang=fr');
    presetGrids.set(view.id, await session.evaluate<PageGridMeasure>('window.__page.measureGrid()'));
    return byCase;
  } finally {
    await session.close();
  }
}

const gardensOf = (viewId: string, caseId: string): GardensMeasure => {
  const measured = gardensCases.get(viewId)?.get(caseId);
  if (!measured) throw new Error(`No measurement for the Gardens case ${caseId} at ${viewId}`);
  return measured;
};

const weatherOf = (viewId: string, caseId: string): WeatherMeasure => {
  const measured = weatherCases.get(viewId)?.get(caseId);
  if (!measured) throw new Error(`No measurement for the Weather case ${caseId} at ${viewId}`);
  return measured;
};

/** The grid's width at a viewport: the page's 1 200 px cap less its 24 px sides, or the viewport less its 16 px sides on a phone. */
const weatherGridWidth = (vw: number) => (vw < 600 ? vw - 32 : Math.min(vw, 1200) - 48);

/** The width a size takes at a viewport: a phone's one column; two columns from 600, four from 1 200 (a Small takes one, the others all). */
const widthOfSize = (vw: number, size: DashboardSize) => {
  const grid = weatherGridWidth(vw);
  if (vw < 600) return grid;
  const columns = vw >= 1200 ? 4 : 2;
  const column = (grid - 20 * (columns - 1)) / columns;
  if (size === 'small') return column;
  if (size === 'wide') return grid;
  return columns === 4 ? column * 2 + 20 : grid;
};

/** The pinned height of a size from 600 px up (A-N10): 273 px a row, 566 on two; none for the Full width. */
const WEATHER_PINNED: Partial<Record<DashboardSize, number>> = { small: 273, medium: 273, large: 566 };

describe.skipIf(!CHROME)('the Weather widget by formula, as the app mounts it (SMA-448, lot F4, W5 — V3-02)', () => {
  beforeAll(async () => {
    weatherOutDir = makeOutDir();
    try {
      await buildPageHarness(weatherOutDir);
      writePageHarness(weatherOutDir);
      // One Chrome per viewport, five at once.
      const settled = await Promise.allSettled(WEATHER_VIEWS.map((view) => runWeatherView(view)));
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') weatherCases.set(WEATHER_VIEWS[index]!.id, outcome.value);
        else weatherFailures.set(`weather-${WEATHER_VIEWS[index]!.id}`, outcome.reason);
      });
      // SMA-448, lot F5-b, W4 — the Gardens widget in the Full width, in this
      // same hook: five more Chromes, one per viewport, once the Weather's
      // have closed.
      const gardensSettled = await Promise.allSettled(WEATHER_VIEWS.map((view) => runGardensView(view)));
      gardensSettled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') gardensCases.set(WEATHER_VIEWS[index]!.id, outcome.value);
        else weatherFailures.set(`gardens-${WEATHER_VIEWS[index]!.id}`, outcome.reason);
      });
    } finally {
      await terminateChildren();
    }
  }, 240_000);

  afterAll(async () => {
    try {
      await terminateChildren();
    } finally {
      if (weatherOutDir) removeOutDir(weatherOutDir);
    }
  });

  const clean = { overlaps: [], clipped: [], spills: [], beyondCard: 0 };
  const CASE_IDS = WEATHER_CASES.map((weatherCase) => weatherCase.id);
  const caseOf = (id: string) => WEATHER_CASES.find((candidate) => candidate.id === id)!;

  it('ran every viewport to its end: twenty-eight cases each — the Gardener at three sizes, the Expert at four, with one, two, five and long-named cities — in Inter, at the viewport it claims', () => {
    expect([...weatherFailures.entries()].map(([id, reason]) => `${id}: ${String(reason)}`)).toEqual([]);
    expect(WEATHER_CASES).toHaveLength(28);
    for (const view of WEATHER_VIEWS) {
      expect(weatherCases.get(view.id)?.size, view.id).toBe(WEATHER_CASES.length);
      for (const id of CASE_IDS) {
        const measured = weatherOf(view.id, id);
        expect(measured.viewport, `${view.id} ${id}`).toBe(view.width);
        expect(measured.fontLoaded, `${view.id} ${id}: Inter not loaded`).toBe(true);
      }
    }
  });

  it.each(WEATHER_VIEWS.map((view) => view.id))('%s: every case is clean — no overlap, nothing clipped, nothing spilled, nothing beyond the card, no scrolling zone', (viewId) => {
    for (const id of CASE_IDS) {
      const measured = weatherOf(viewId, id);
      expect(defects(measured), `${viewId} ${id}`).toEqual(clean);
      expect(measured.scrollers, `${viewId} ${id}`).toEqual([]);
    }
  });

  it.each(WEATHER_VIEWS.map((view) => view.id))('%s: the card takes its size’s width, its pinned height from 600 px — and the Full width the height of its content', (viewId) => {
    const view = WEATHER_VIEWS.find((candidate) => candidate.id === viewId)!;
    for (const id of CASE_IDS) {
      const { size } = caseOf(id);
      const measured = weatherOf(viewId, id);
      expect(measured.card.w, `${viewId} ${id}`).toBeCloseTo(widthOfSize(view.width, size), 0);
      const pinned = WEATHER_PINNED[size];
      if (view.width >= 600 && pinned) expect(measured.card.h, `${viewId} ${id}`).toBe(pinned);
      if (size === 'wide') {
        expect(
          measured.body.scrollH,
          `${viewId} ${id}: card ${measured.card.h} px, parts ${JSON.stringify(measured.parts)}`
        ).toBeLessThanOrEqual(measured.body.h + 1);
      }
    }
  });

  it.each(WEATHER_VIEWS.map((view) => view.id))('%s: the Gardener shows ONE city at every size — no navigator, no tab, no column — with its honest line on Medium and Large when a city is left out, its link on Large alone', (viewId) => {
    for (const weatherCase of WEATHER_CASES.filter((candidate) => candidate.level === 'gardener')) {
      const measured = weatherOf(viewId, weatherCase.id);
      const label = `${viewId} ${weatherCase.id}`;
      expect(measured.nav, label).toBe(false);
      expect(measured.tabs, label).toEqual([]);
      expect(measured.summary, label).toBeNull();
      expect(measured.columns, label).toBe(0);
      expect(measured.placeLines, label).toBe(1);
      expect(measured.region, label).toBe(WEATHER_CITY_NAMES[weatherCase.kind][0]);
      const leftOut = weatherCase.kind !== 'one' && weatherCase.size !== 'small';
      expect(measured.honest !== null, label).toBe(leftOut);
      expect(measured.honestLink, label).toBe(leftOut && weatherCase.size === 'large');
      if (leftOut) {
        for (const name of WEATHER_CITY_NAMES[weatherCase.kind].slice(1)) expect(measured.honest, label).toContain(name);
      }
    }
  });

  it.each(WEATHER_VIEWS.map((view) => view.id))('%s: the Expert with several cities — the navigator on Small and Medium (the dots on Medium alone), the tabs on Large, the columns in the Full width; one city — the place line, or the full reading', (viewId) => {
    const view = WEATHER_VIEWS.find((candidate) => candidate.id === viewId)!;
    for (const weatherCase of WEATHER_CASES.filter((candidate) => candidate.level === 'expert')) {
      const measured = weatherOf(viewId, weatherCase.id);
      const label = `${viewId} ${weatherCase.id}`;
      const names = WEATHER_CITY_NAMES[weatherCase.kind];
      const several = names.length > 1;
      expect(measured.honest, label).toBeNull();
      if (weatherCase.size === 'small' || weatherCase.size === 'medium') {
        expect(measured.nav, label).toBe(several);
        expect(measured.tabs, label).toEqual([]);
        expect(measured.placeLines, label).toBe(1);
        expect(measured.rank, label).toBe(several ? `1 / ${names.length}` : null);
        expect(measured.dots, label).toBe(several && weatherCase.size === 'medium' ? names.length : 0);
        expect(measured.region, label).toBe(names[0]);
      } else if (weatherCase.size === 'large') {
        expect(measured.nav, label).toBe(false);
        expect(measured.tabs.length, label).toBe(several ? names.length : 0);
        expect(measured.placeLines, label).toBe(several ? 0 : 1);
        expect(measured.region, label).toBe(names[0]);
      } else {
        expect(measured.nav, label).toBe(false);
        expect(measured.tabs, label).toEqual([]);
        expect(measured.placeLines, label).toBe(0);
        expect(measured.summary, label).not.toBeNull();
        expect(measured.columns, label).toBe(several ? names.length : 0);
        if (several) {
          const perRow = view.width >= 900 ? 4 : view.width >= 600 ? 2 : 1;
          expect(measured.columnsPerRow, label).toBe(Math.min(perRow, names.length));
          expect(measured.columnRows, label).toBe(Math.ceil(names.length / perRow));
          expect(measured.region, label).toBe('Météo');
        } else {
          expect(measured.region, label).toBe(names[0]);
        }
      }
    }
  });

  it('writes the summary of the Full width as the aggregate counts: « 5 villes · 5 jardins », « 2 villes · 3 jardins », « 1 ville · 3 jardins » — the garden names in full in every column, never an ellipsis', () => {
    for (const view of WEATHER_VIEWS) {
      for (const kind of WEATHER_CITY_SCENES) {
        const served = weatherCitySceneData(kind);
        const measured = weatherOf(view.id, `expert/wide/${kind}`);
        const label = `${view.id} ${kind}`;
        expect(measured.summary, label).toBe(`${served.cities} ville${served.cities > 1 ? 's' : ''} · ${served.gardens} jardins`);
        if (served.cities > 1) {
          expect(measured.columnGardens.filter((names) => names.length > 0), label).toHaveLength(served.cities);
          const gardenNames = served.data.gardens.map((garden) => garden.name);
          for (const cut of measured.ellipsized) {
            expect(gardenNames.includes(cut.text.replace(/^"|"$/g, '')), `${label}: garden name ellipsized — ${cut.text}`).toBe(false);
          }
        }
      }
    }
  });

  it('ellipsizes nothing but a city’s name — in a navigator, a tab, a column head — and only where the name is long or the tabs many; the honest line and the garden lists wrap instead', () => {
    for (const view of WEATHER_VIEWS) {
      for (const weatherCase of WEATHER_CASES) {
        const measured = weatherOf(view.id, weatherCase.id);
        const names = WEATHER_CITY_NAMES[weatherCase.kind];
        // The Medium honest line ellipsizes its TAIL — the names, after the statement — wherever the names outrun the card.
        const isHonestTail = (text: string) => weatherCase.size === 'medium' && text.startsWith('Non affichés ici :');
        const cityNameCuts: string[] = [];
        for (const cut of measured.ellipsized) {
          const text = cut.text.replace(/^"|"$/g, '');
          const isCityName = names.some((name) => text.startsWith(name.slice(0, 8)));
          expect(isCityName || isHonestTail(text), `${view.id} ${weatherCase.id}: ellipsized — ${cut.text} at ${cut.where}`).toBe(true);
          if (isCityName) cityNameCuts.push(cut.text);
        }
        // A short city name is cut nowhere — but in the five tabs of a phone's Large card.
        if (weatherCase.kind !== 'long' && (weatherCase.size !== 'large' || weatherCase.kind !== 'five' || view.width >= 600)) {
          expect(cityNameCuts, `${view.id} ${weatherCase.id}`).toEqual([]);
        }
      }
    }
  });

  it('draws the weather warning under every case — the widget shows a figure in each', () => {
    for (const view of WEATHER_VIEWS) {
      for (const id of CASE_IDS) expect(weatherOf(view.id, id).warning, `${view.id} ${id}`).toBe(true);
    }
  });

  /** The six hour labels of the head — « 14 h », « 2 PM » — are 13 px by the frozen artboard (SMA-336, `DASHBOARD_WEATHER.hourLabel`): before lot F4, and not its to change. */
  const isHourLabel = (label: string) => /^"\d{1,2} (h|AM|PM)"$/.test(label);

  it('keeps every text at 14 px or more — the chips and the pills alone at 13 (V11), and the head’s six hour labels, 13 px since SMA-336', () => {
    for (const view of WEATHER_VIEWS) {
      for (const id of CASE_IDS) {
        const under = weatherOf(view.id, id).smallFonts.filter((font) => font.px < (font.chip || isHourLabel(font.label) ? 13 : 14));
        expect(under, `${view.id} ${id}`).toEqual([]);
      }
    }
  });

  // SMA-448, lot F5-b, step W4 — THE GARDENS WIDGET IN THE FULL WIDTH, as the
  // app mounts it (V3-03, V3-04): the Expert's stored layout with Gardens at
  // `wide`; one, five, twelve, sixty and very-long-named gardens served, every
  // one located; at the five viewports; at rest and, where the foot offers
  // « + N autres jardins », unfolded in place. Measured in this group's own
  // hook, once the Weather's Chromes have closed — no bound of its own.
  describe('the Gardens widget in the Full width, as the app mounts it (SMA-448, lot F5-b, W4 — V3-03, V3-04)', () => {
    const CASES = [...GARDENS_LIST_KINDS.map((kind) => `${kind}/rest`), 'twelve/unfolded', 'sixty/unfolded'];
    const kindOf = (id: string) => id.split('/')[0] as GardensListKind;
    /** The rows a list leaves at rest: every garden up to the count — eight on a desktop, five on a phone. */
    const rowsAtRest = (kind: GardensListKind, phone: boolean) => Math.min(gardensSceneData(kind).gardens.length, phone ? 5 : 8);
    const FR_HEADERS = ['Jardin', 'Type', 'Plantes', 'Occupation', 'Exposition', 'Météo', 'Actions'];

    it('ran every viewport to its end: five lists at rest, the twelve and the sixty unfolded — seven cases —, in Inter, at the viewport it claims', () => {
      expect([...weatherFailures.entries()].filter(([id]) => id.startsWith('gardens-')).map(([id, reason]) => `${id}: ${String(reason)}`)).toEqual([]);
      for (const view of WEATHER_VIEWS) {
        expect([...(gardensCases.get(view.id)?.keys() ?? [])].sort(), view.id).toEqual([...CASES].sort());
        for (const id of CASES) {
          const measured = gardensOf(view.id, id);
          expect(measured.viewport, `${view.id} ${id}`).toBe(view.width);
          expect(measured.fontLoaded, `${view.id} ${id}: Inter not loaded`).toBe(true);
        }
      }
    });

    it.each(WEATHER_VIEWS.map((view) => view.id))('%s: every case is clean — no overlap, nothing cut for good, nothing spilled, nothing beyond the card — and the actions inside the card', (viewId) => {
      for (const id of CASES) {
        const measured = gardensOf(viewId, id);
        expect(defects(measured), `${viewId} ${id}`).toEqual(clean);
        expect(measured.hardClipped, `${viewId} ${id}`).toBe(0);
        expect(measured.actionsOutside, `${viewId} ${id}`).toBe(0);
      }
    });

    it.each(WEATHER_VIEWS.map((view) => view.id))('%s: the card takes the whole grid and the height of its content — no vertical scroll, and no sideways scroll at 1 280 px', (viewId) => {
      const view = WEATHER_VIEWS.find((candidate) => candidate.id === viewId)!;
      for (const id of CASES) {
        const measured = gardensOf(viewId, id);
        const label = `${viewId} ${id}`;
        expect(measured.card.w, label).toBeCloseTo(widthOfSize(view.width, 'wide'), 0);
        expect(measured.body.scrollH, label).toBeLessThanOrEqual(measured.body.h + 1);
        expect(measured.scrollers.filter((scroller) => scroller.axis.includes('y')), label).toEqual([]);
        if (view.width >= 1200) expect(measured.scrollers, label).toEqual([]);
      }
    });

    it.each(WEATHER_VIEWS.map((view) => view.id))('%s: the seven columns from 600 px and the rows of the form on a phone; the rows the count leaves, « + N autres jardins » and the search while a garden is hidden, the rule once unfolded', (viewId) => {
      const view = WEATHER_VIEWS.find((candidate) => candidate.id === viewId)!;
      const phone = view.width < 600;
      for (const id of CASES) {
        const measured = gardensOf(viewId, id);
        const label = `${viewId} ${id}`;
        const kind = kindOf(id);
        const served = gardensSceneData(kind).gardens.length;
        expect(measured.table, label).toBe(!phone);
        expect(measured.headers, label).toEqual(phone ? [] : FR_HEADERS);
        if (id.endsWith('/rest')) {
          const shown = rowsAtRest(kind, phone);
          expect(measured.rows, label).toBe(shown);
          expect(measured.cut, label).toBe(false);
          expect(measured.fold !== null, label).toBe(served > shown);
          expect(measured.search, label).toBe(served > shown);
        } else {
          expect(measured.rows, label).toBe(served);
          expect(measured.cut, label).toBe(true);
          expect(measured.fold, label).not.toBeNull();
          expect(measured.search, label).toBe(true);
        }
      }
    });

    it('ellipsizes nothing but a garden’s description (V33) — the names and the sub-lines wrap (V5) — and draws the weather warning under every case', () => {
      for (const view of WEATHER_VIEWS) {
        for (const id of CASES) {
          const measured = gardensOf(view.id, id);
          expect(measured.ellipsized.filter((cut) => !cut.where.startsWith('garden-description')), `${view.id} ${id}`).toEqual([]);
          expect(measured.warning, `${view.id} ${id}`).toBe(true);
        }
      }
    });
  });

  // SMA-437, lot V3-08, step S5 (A-15) — THE PAGE AT THE EXPERT PRESET, as the
  // app mounts it: no cell of its grid left empty, between two cards or after
  // the last, at the five widths. PR #300's preset left 566 × 566 px empty
  // right of the Weather at 1 280 px. Measured in the Gardens' Chrome, in this
  // group's own hook — no bound of its own.
  describe('the page at the Expert preset, without a hole (SMA-437, lot V3-08, S5 — A-15)', () => {
    it.each(WEATHER_VIEWS.map((view) => view.id))('%s: the preset as served — its nine widgets in its order — leaves no cell empty, none between two cards, none after the last', (viewId) => {
      const measured = presetGrids.get(viewId);
      if (!measured) throw new Error(`No measurement of the page at the Expert preset at ${viewId}`);
      expect(measured.viewport).toBe(WEATHER_VIEWS.find((view) => view.id === viewId)!.width);
      expect(measured.keys).toEqual(presetFor('expert').filter((block) => !block.hidden).map((block) => block.key));
      expect({ between: measured.between, trailing: measured.trailing }, JSON.stringify(measured.placed)).toEqual({
        between: [],
        trailing: [],
      });
    });
  });
});
