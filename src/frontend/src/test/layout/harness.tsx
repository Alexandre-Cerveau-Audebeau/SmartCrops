// The clock first (#8): the fixtures below are dated on the harness's instant
// the moment their module evaluates, and so is everything React draws.
import './freeze';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import i18next from '../../i18n/i18n';
import { UnitSystemProvider } from '../../contexts/UnitSystemContext';
import { createAppTheme } from '../../theme';
import DashboardGrid from '../../components/Dashboard/DashboardGrid';
import { LAYOUT_SCENES, sceneWidget, type LayoutScene } from './scenes';
import { PROBE_SCENES, probeWidget, type ProbeScene } from './probes';
import { encodeResults } from './encode';
import { RESULTS_ID, measureCard, type CardMeasure } from './measure';

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
}

declare global {
  interface Window {
    __layoutResults?: SceneMeasure[];
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

/** One scene under the app's providers and theme — a tree, not a component: this file is a script, not a module Fast Refresh could reload. */
function sceneTree(scene: LayoutScene | ProbeScene, mode: 'light' | 'dark') {
  /** The grid's edit callbacks — never fired: the harness measures, it never edits. */
  const noop = () => {};
  return (
    <MemoryRouter>
      <ThemeProvider theme={createAppTheme(mode)}>
        <UnitSystemProvider>
          <DashboardGrid
            blocks={[{ key: scene.key, size: scene.size, hidden: false }]}
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

  const results: SceneMeasure[] = [];
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
    results.push({
      scene: scene.name,
      key: scene.key,
      size: scene.size,
      probe: isProbe(scene) ? scene.probe : null,
      zoneOverflow: zoneOverflowOf(card),
      cardOverflow: overflowOf(card),
      hiddenRows: card.querySelectorAll('[data-weather-day-hidden], [data-todo-hidden], [data-tips-hidden]').length,
      gardenNameWidths: Array.from(card.querySelectorAll('[data-garden-row-group]')).map(
        (group) => Math.round(group.getBoundingClientRect().width * 10) / 10
      ),
      ...measureCard(card),
    });
    if (hold) break;
    root.unmount();
    host.remove();
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
