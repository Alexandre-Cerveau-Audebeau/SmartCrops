// The clock first (#8): the fixtures below are dated on the harness's instant
// the moment their module evaluates, and so is everything React draws.
import './freeze';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import i18next from '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { createAppTheme } from '../../theme';
import DashboardActions from '../../components/Dashboard/DashboardActions';
import DashboardGrid from '../../components/Dashboard/DashboardGrid';
import {
  ACTIONS_SCENES,
  GRID_SCENES,
  LAYOUT_SCENES,
  gridCardScene,
  sceneWidget,
  type ActionsScene,
  type GridScene,
  type LayoutScene,
} from './scenes';
import { PROBE_SCENES, probeWidget, type ProbeScene } from './probes';
import { measureFocus, type FocusMeasure } from './focusProbe';
import { encodeResults } from './encode';
import { RESULTS_ID, measureCard, measureControls, type CardMeasure, type ControlMeasure } from './measure';

/**
 * SMA-336 mobile lot, step 7 (pre-flight D7) — the BROWSER side of the layout
 * harness. `dashboardLayout.test.tsx` bundles this file with Vite (one IIFE,
 * no server), writes it into a `file://` page and opens that page in Chrome
 * headless; this script then mounts every scene of `scenes.tsx` in turn —
 * the REAL React tree, `DashboardGrid` included, under the app's providers and
 * theme — waits for the fonts and for React to settle, measures the card with
 * `measure.ts`, unmounts, and finally replaces the document with one `<pre>`
 * carrying the measurements, which `--dump-dom` prints. After the scenes, the
 * PROBES of `probes.tsx` (fix round 2, #11; fix round 3, #12): synthetic cards
 * with a known cut, mounted and measured the same way, so the suite can check
 * the instrument — each one also reporting the computed `overflow` of its
 * zone, read here in the engine.
 *
 * The query string drives the run: `vw` is the page width to emulate (Chrome
 * headless opens no window under 500 px, so the phone is the `#page` width
 * under the 600 px breakpoint, as the pre-flight did), `theme` is `light` or
 * `dark`, `lang` the language — set on i18next itself, which is what the
 * widgets read; no widget reads the language context, and nothing is written
 * to the browser's storage — `scene` an optional single scene; `clock` and
 * `freeze` are read by `freeze.ts` before anything else (#8).
 *
 * `fetch` is disabled before anything mounts: no widget of the scene calls
 * the network at render, and none may (never a real provider call).
 *
 * Every line of progress is also written to the console (`console.log`):
 * Chrome forwards it to its stderr (`--enable-logging=stderr`), which is how a
 * run that is killed for taking too long still names the scene it was on.
 */

export interface SceneMeasure extends CardMeasure {
  scene: string;
  key: LayoutScene['key'];
  size: LayoutScene['size'];
  /** A probe of the harness's own — a synthetic card built to hold a known cut (#11) — or null for a widget scene. */
  probe: ProbeScene['probe'] | null;
  /** The COMPUTED `overflow-x` / `overflow-y` of a probe's zone, read in the engine (#12) — the CSS rule measured, not assumed; null for a widget scene. */
  zoneOverflow: { x: string; y: string } | null;
  /** The COMPUTED `overflow-x` / `overflow-y` of the CARD itself, read in the engine (#13): what the card-scrolls probe claims to declare, measured. */
  cardOverflow: { x: string; y: string };
  /** Rows a measured cap hid whole (`useRowBudget`): the days of the weather card, the tasks of the To-do card, the tips of the Tips card. */
  hiddenRows: number;
  /** The width each garden NAME can take on a Medium Gardens row — its group's — (arbitrage 5: 130 px at least on a phone); empty elsewhere. */
  gardenNameWidths: number[];
  /** The page's viewport width (`innerWidth`), measured: the width a tablet or desktop run claims to be at (SMA-437). */
  viewport: number;
  /**
   * The Key figures band's tiles (SMA-437 lot 1, PR B, step B7), relative to
   * the card: each tile's box and the top of its value — how many rows the four
   * make, and whether the values of a row start at one height (the subgrid,
   * D13). Empty on every other card.
   */
  keyFigureTiles: Array<{
    figure: string;
    x: number;
    y: number;
    w: number;
    h: number;
    valueTop: number | null;
    /**
     * How far, in px, the furthest of the tile's texts runs past the tile's
     * padding box, left or right — 0 when all stay inside. The value is a
     * flex item, so the harness's `spills` pass compares it to its OWN box and
     * cannot see it leave its tile; this reads it against the tile.
     */
    overflow: number;
  }>;
}

/** One card of a grid scene: its measure, and its border box relative to the grid. */
export interface GridCardMeasure extends SceneMeasure {
  box: { x: number; y: number; w: number; h: number };
}

/**
 * SMA-437 lot 1, PR A, step A7 (pre-flight D19) — a grid scene, measured as a
 * grid: every card by `measureCard`, each card's box, the row tracks the
 * engine RESOLVED (`grid-template-rows` in px — not the `grid-auto-rows` the
 * CSS declares), the cards that meet, and in Edit mode each card's controls.
 */
export interface GridMeasure {
  scene: string;
  editing: boolean;
  viewport: number;
  /** The resolved row tracks, `273px 273px …`. */
  rows: string;
  columns: string;
  cards: GridCardMeasure[];
  /** Every pair of cards whose border boxes intersect by more than a pixel. */
  cardOverlaps: string[];
  /** In Edit mode, each card's controls; empty at rest. */
  controls: Array<{ key: string; controls: ControlMeasure[] }>;
}

/** A box relative to an origin, to a tenth of a pixel. */
export interface RelativeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * SMA-437, lot V39, step A4 (pre-flight C.6, n° 1) — the header's actions
 * zone, measured: the zone read as a CARD by `measureCard` — its box the
 * boundary nothing may cross, its texts, glyphs and painted boxes the atoms
 * that may not meet — and the box of each of its parts relative to the zone,
 * null where the scene draws none.
 */
export interface ActionsMeasure extends CardMeasure {
  scene: string;
  viewport: number;
  zone: { w: number; h: number };
  parts: Record<'chip' | 'status' | 'toggle' | 'customize' | 'create', RelativeBox | null>;
  /** What the save indicator's region says — empty before any change. */
  statusText: string;
}

/** What one run of the page returns: the one-card scenes and probes, the grid scenes, and where the focus goes in the reorderable list. */
export interface LayoutResults {
  scenes: SceneMeasure[];
  grids: GridMeasure[];
  /** SMA-437 lot 1, PR B, round 1, S1 — the reorderable list's gestures, and where each leaves the focus (`focusProbe.tsx`). */
  focus: FocusMeasure[];
  /** SMA-437, lot V39 — the header's actions zone, scene by scene. */
  actions: ActionsMeasure[];
}

declare global {
  interface Window {
    __layoutResults?: LayoutResults;
    __layoutError?: string;
  }
}

/** A promise that settles after `ms` of the page's (virtual) time. */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A line of progress in the document AND on the console, so a run that stalls or is killed says where. */
function progress(text: string) {
  console.log(`[layout] ${text}`);
  let pre = document.getElementById(`${RESULTS_ID}-progress`);
  if (!pre) {
    pre = document.createElement('pre');
    pre.id = `${RESULTS_ID}-progress`;
    document.body.appendChild(pre);
  }
  pre.textContent += `${text}
`;
}

/**
 * React has committed, the fonts the scene uses are in, ResizeObserver has
 * fired and the measured caps have re-rendered. Timers rather than animation
 * frames: under `--virtual-time-budget` Chrome advances its clock by whatever
 * the next timer asks and a frame can cost it seconds of budget, so twenty-nine
 * scenes on frames ran the budget out before the last one was measured.
 */
async function settle() {
  await wait(20);
  await document.fonts.ready;
  await wait(20);
  await wait(20);
}

/** A probe of the harness's own (`probes.tsx`), not a widget scene. */
const isProbe = (scene: LayoutScene | ProbeScene): scene is ProbeScene => 'probe' in scene;

/** The computed `overflow` of an element, axis by axis. */
function overflowOf(el: Element): { x: string; y: string } {
  const cs = getComputedStyle(el);
  return { x: cs.overflowX, y: cs.overflowY };
}

/** The computed `overflow` of a probe's zone — its `[data-probe-zone]` — axis by axis, or null where the card has none. */
function zoneOverflowOf(card: HTMLElement): { x: string; y: string } | null {
  const zone = card.querySelector('[data-probe-zone]');
  return zone ? overflowOf(zone) : null;
}

/** The grid's edit callbacks — never fired: the harness measures, it never edits. */
const noop = () => {};

/** One scene under the app's providers and theme — a tree, not a component: this file is a script, not a module Fast Refresh could reload. */
function sceneTree(scene: LayoutScene | ProbeScene, mode: 'light' | 'dark') {
  return (
    <MemoryRouter>
      <ThemeProvider theme={createAppTheme(mode)}>
        <UnitSystemProvider>
          <DashboardGrid
            blocks={[{ key: scene.key, size: scene.size, hidden: false }]}
            // The formula with every widget and every size (SMA-437): the
            // scenes measure the widgets, and the level only decides the grip.
            level="expert"
            editing={false}
            onReorder={noop}
            onHide={noop}
            onResize={noop}
            renderBlock={() => (isProbe(scene) ? probeWidget(scene) : sceneWidget(scene))}
          />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

/** A grid scene (SMA-437, D19): the whole preset, through the same grid, at its formula, at rest or in Edit mode. */
function gridTree(grid: GridScene, mode: 'light' | 'dark') {
  return (
    <MemoryRouter>
      <ThemeProvider theme={createAppTheme(mode)}>
        <UnitSystemProvider>
          <DashboardGrid
            blocks={grid.blocks.map((block) => ({ ...block, hidden: false }))}
            level={grid.level}
            editing={grid.editing}
            onReorder={noop}
            onHide={noop}
            onResize={noop}
            renderBlock={(block) => sceneWidget(gridCardScene(grid, block))}
          />
        </UnitSystemProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

/**
 * An actions scene (SMA-437, lot V39): the real `DashboardActions` under the
 * app's theme, as wide as the page's column — the header gives it the whole
 * line on a phone. Two plain wrappers above it, because `measureCard` walks a
 * card's slot and grid two levels up.
 */
function actionsTree(scene: ActionsScene, mode: 'light' | 'dark') {
  return (
    <ThemeProvider theme={createAppTheme(mode)}>
      <div>
        <div>
          <DashboardActions
            level={scene.level}
            adjusted={scene.adjusted}
            unavailable={scene.unavailable}
            saveState={scene.saveState}
            editing={scene.editing}
            onEditingChange={noop}
            onCustomize={noop}
            onCreate={noop}
          />
        </div>
      </div>
    </ThemeProvider>
  );
}

/** The parts of the zone, by the attributes `DashboardActions` puts on them. */
const ZONE_PARTS = {
  chip: '[data-level-chip]',
  status: '[data-save-status]',
  toggle: '[data-page-action="edit"]',
  customize: '[data-page-action="customize"]',
  create: '[data-create-garden]',
} as const;

/** Measures a mounted actions scene: the zone as a card, and each part's box relative to it. */
function measureActions(scene: ActionsScene, host: HTMLElement): ActionsMeasure {
  const zone = host.querySelector<HTMLElement>('[data-dashboard-actions]');
  if (!zone) throw new Error(`The actions scene ${scene.name} drew no zone.`);
  const origin = zone.getBoundingClientRect();
  const parts = Object.fromEntries(
    Object.entries(ZONE_PARTS).map(([part, selector]) => {
      const el = zone.querySelector(selector);
      return [part, el ? boxWithin(el, origin) : null];
    })
  ) as ActionsMeasure['parts'];
  return {
    scene: scene.name,
    viewport: window.innerWidth,
    zone: { w: Math.round(origin.width * 10) / 10, h: Math.round(origin.height * 10) / 10 },
    parts,
    statusText: zone.querySelector(ZONE_PARTS.status)?.textContent ?? '',
    ...measureCard(zone),
  };
}

/** What the harness reads of a card beyond `measureCard`, the same for a one-card scene and a card of a grid. */
function cardExtras(card: HTMLElement) {
  const origin = card.getBoundingClientRect();
  return {
    keyFigureTiles: Array.from(card.querySelectorAll('[data-key-figure]')).map((tile) => {
      const value = tile.querySelector('[data-key-figure-value]');
      const box = tile.getBoundingClientRect();
      const cs = getComputedStyle(tile);
      const inner = { left: box.left + parseFloat(cs.paddingLeft), right: box.right - parseFloat(cs.paddingRight) };
      // The drawn texts of the tile — its label, value, unit and sub-line;
      // the visually-hidden sentence is not drawn.
      const texts = Array.from(tile.querySelectorAll('[data-key-figure-label], [data-key-figure-value], [data-key-figure-unit], [data-key-figure-sub]'));
      const overflow = Math.max(
        0,
        ...texts.map((text) => {
          const r = text.getBoundingClientRect();
          return Math.max(r.right - inner.right, inner.left - r.left);
        })
      );
      return {
        figure: tile.getAttribute('data-key-figure') ?? '',
        ...boxWithin(tile, origin),
        valueTop: value ? Math.round((value.getBoundingClientRect().top - origin.top) * 10) / 10 : null,
        overflow: Math.round(overflow * 10) / 10,
      };
    }),
    cardOverflow: overflowOf(card),
    hiddenRows: card.querySelectorAll('[data-weather-day-hidden], [data-todo-hidden], [data-tips-hidden]').length,
    gardenNameWidths: Array.from(card.querySelectorAll('[data-garden-row-group]')).map(
      (group) => Math.round(group.getBoundingClientRect().width * 10) / 10
    ),
    viewport: window.innerWidth,
  };
}

/** A box to a tenth of a pixel, relative to `origin`. */
function boxWithin(el: Element, origin: DOMRect) {
  const r = el.getBoundingClientRect();
  const round = (v: number) => Math.round(v * 10) / 10;
  return { x: round(r.left - origin.left), y: round(r.top - origin.top), w: round(r.width), h: round(r.height) };
}

/** Measures a mounted grid scene: every card, the resolved tracks, the cards that meet, the Edit-mode controls. */
function measureGrid(grid: GridScene, host: HTMLElement): GridMeasure {
  const cards = Array.from(host.querySelectorAll<HTMLElement>('[data-widget]'));
  if (cards.length !== grid.blocks.length) {
    throw new Error(`The grid scene ${grid.name} drew ${cards.length} cards for ${grid.blocks.length} blocks.`);
  }
  // card → the wobble wrapper → the grid item → the grid (`measureCard` walks the same way).
  const gridEl = cards[0]!.parentElement!.parentElement!.parentElement!;
  const origin = gridEl.getBoundingClientRect();
  const measured: GridCardMeasure[] = cards.map((card) => {
    const key = card.getAttribute('data-widget') as LayoutScene['key'];
    const block = grid.blocks.find((candidate) => candidate.key === key)!;
    return {
      scene: `${grid.name}/${key}`,
      key,
      size: block.size,
      probe: null,
      zoneOverflow: null,
      ...cardExtras(card),
      ...measureCard(card),
      box: boxWithin(card, origin),
    };
  });
  const cardOverlaps: string[] = [];
  measured.forEach((a, i) => {
    for (const b of measured.slice(i + 1)) {
      const w = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
      const h = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
      if (w > 1 && h > 1) cardOverlaps.push(`${a.key} ∩ ${b.key} = ${Math.round(w)}×${Math.round(h)}`);
    }
  });
  const style = getComputedStyle(gridEl);
  return {
    scene: grid.name,
    editing: grid.editing,
    viewport: window.innerWidth,
    rows: style.gridTemplateRows,
    columns: style.gridTemplateColumns,
    cards: measured,
    cardOverlaps,
    controls: grid.editing
      ? cards.map((card) => ({ key: card.getAttribute('data-widget')!, controls: measureControls(card) }))
      : [],
  };
}

/**
 * The run: reads the query string, loads the fonts, mounts and measures each
 * scene in turn, and ends the document on the results `<pre>` — or, with
 * `hold=1`, leaves the one scene on the page.
 */
async function main() {
  progress('start');
  window.fetch = () => Promise.reject(new Error('The layout harness never calls the network.'));

  const params = new URLSearchParams(location.search);
  const mode = params.get('theme') === 'dark' ? 'dark' : 'light';
  await i18next.changeLanguage(params.get('lang') === 'en' ? 'en' : 'fr');
  const only = params.get('scene');
  // `hold=1` with one `scene`: the scene STAYS on the page and the document is
  // not replaced — for a screenshot, or for a pair of eyes on the same
  // rendering the numbers came from (`--screenshot` in place of `--dump-dom`).
  const hold = params.get('hold') === '1' && only !== null;
  const vw = params.get('vw');
  const page = document.getElementById('page');
  if (!page) throw new Error('The harness page has no #page element.');
  if (vw) {
    page.style.width = `${vw}px`;
    page.style.maxWidth = `${vw}px`;
  }

  // The weights `main.tsx` loads, ready before the first scene so no scene is
  // measured in a fallback font.
  progress('fonts…');
  await Promise.all([300, 400, 500, 600, 700].map((weight) => document.fonts.load(`${weight} 16px Inter`)));
  progress('fonts ready');

  const results: LayoutResults = { scenes: [], grids: [], focus: [], actions: [] };
  for (const scene of [...LAYOUT_SCENES, ...PROBE_SCENES].filter((s) => !only || s.name === only)) {
    const host = document.createElement('div');
    page.appendChild(host);
    const root = createRoot(host);
    root.render(sceneTree(scene, mode));
    progress(`rendered ${scene.name}`);
    await settle();
    progress(`settled ${scene.name}`);
    const card = host.querySelector<HTMLElement>('[data-widget]');
    if (!card) throw new Error(`The scene ${scene.name} drew no card.`);
    results.scenes.push({
      scene: scene.name,
      key: scene.key,
      size: scene.size,
      probe: isProbe(scene) ? scene.probe : null,
      zoneOverflow: zoneOverflowOf(card),
      ...cardExtras(card),
      ...measureCard(card),
    });
    if (hold) break;
    root.unmount();
    host.remove();
  }

  // The grid scenes (SMA-437, D19), after the one-card scenes, the same way.
  for (const grid of GRID_SCENES.filter((g) => !hold && (!only || g.name === only))) {
    const host = document.createElement('div');
    page.appendChild(host);
    const root = createRoot(host);
    root.render(gridTree(grid, mode));
    progress(`rendered ${grid.name}`);
    await settle();
    progress(`settled ${grid.name}`);
    results.grids.push(measureGrid(grid, host));
    root.unmount();
    host.remove();
  }

  // The header's actions zone (SMA-437, lot V39), after the grids, the same way.
  for (const scene of ACTIONS_SCENES.filter((s) => !hold && (!only || s.name === only))) {
    const host = document.createElement('div');
    page.appendChild(host);
    const root = createRoot(host);
    root.render(actionsTree(scene, mode));
    progress(`rendered ${scene.name}`);
    await settle();
    progress(`settled ${scene.name}`);
    results.actions.push(measureActions(scene, host));
    root.unmount();
    host.remove();
  }

  // Where the focus goes in the reorderable list (S1), after the scenes: a
  // run asked for one scene measures that scene alone.
  if (!only) {
    progress('focus…');
    results.focus = await measureFocus(page, mode);
    progress('focus measured');
  }

  window.__layoutResults = results;
  if (hold) return;
  // The results as TEXT — set on a node, never parsed as markup: base64 of
  // the UTF-8 bytes (`encode.ts`), so `--dump-dom`'s HTML serialisation
  // hands them back untouched.
  const pre = document.createElement('pre');
  pre.id = RESULTS_ID;
  pre.textContent = encodeResults(results);
  document.body.replaceChildren(pre);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  window.__layoutError = message;
  const pre = document.createElement('pre');
  pre.id = `${RESULTS_ID}-error`;
  pre.textContent = message;
  document.body.appendChild(pre);
});
