// SMA-336 mobile lot, step 7 (pre-flight D7) — the NODE side of the layout
// harness: find Chrome, bundle `harness.tsx` with Vite, write the `file://`
// page, run Chrome headless — bounded, killed past its delay (fix round 1,
// S1) — and read its dump. Plain JavaScript on purpose: the app's TypeScript
// project (`tsconfig.app.json`, `types: ["vite/client"]`) carries no Node
// types, and one `import 'node:fs'` in a `.ts` file under `src` would pull
// `@types/node`'s globals into EVERY file it checks — the planner's
// `setTimeout` mock, typed against the DOM's, stopped compiling the moment a
// test did. The types this module exposes are in `chrome.d.mts`;
// `dashboardLayout.test.tsx` and `chrome.test.ts` read them and touch no Node
// API themselves.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getSystemErrorMap } from 'node:util';

/** The id of the `<pre>` the harness page ends on — `RESULTS_ID` of `measure.ts`, repeated here so this file imports no TypeScript. */
const RESULTS_ID = 'layout-results';

/**
 * How long one run of the page may take, wall clock, before its Chrome is
 * killed: the twenty-nine scenes take about two seconds here and about seven
 * on the CI runner, six runs in parallel. A run past a minute is a wedged
 * browser — a locked profile, a crash before exit — not a slow one.
 */
export const CHROME_RUN_TIMEOUT_MS = 60_000;

/** After a kill, how long a child has to exit on its own before the kill is forced (`SIGKILL`) — and, once forced, before a child still running is given up on (K1). */
const KILL_GRACE_MS = 2_000;

/** `CHROME_BIN`, then the usual names and places; null when none exists. */
export function findChrome() {
  const fromEnv = process.env.CHROME_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
          join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
          join(process.env.LOCALAPPDATA ?? join(home, 'AppData/Local'), 'Google/Chrome/Application/chrome.exe'),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** GitHub Actions and the other runners set `CI`: there the suite must run, never skip. */
export const IS_CI = Boolean(process.env.CI);

/** A fresh temp folder for the bundle, the page and the Chrome profiles. */
export function makeOutDir() {
  return mkdtempSync(join(tmpdir(), 'smartcrops-layout-'));
}

/**
 * Removes the folder, retried; never throws. After `terminateChildren()`, in
 * a `finally`: tried even when a browser outlived its kills (K1) — the files
 * that browser holds then stay behind, and the error that named it stands.
 */
export function removeOutDir(outDir) {
  try {
    rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A leftover temp folder is not a test failure.
  }
}

/**
 * The bundle, as the APP is built: production mode. Under vitest `NODE_ENV`
 * is `test`, and the React plugin then emits the development JSX runtime,
 * whose `jsxDEV` the production `react` this bundle defines does not export —
 * so the environment is set for the build and restored after it.
 */
export function buildHarness(outDir) {
  return buildBundle(outDir, {
    entry: 'src/test/layout/harness.tsx',
    fileName: 'harness.js',
    name: 'SmartCropsLayoutHarness',
  });
}

/**
 * One IIFE bundle of `entry` into `outDir/fileName`, built as `buildHarness`
 * builds the scenes' — shared with the page launcher (`pageChrome.mjs`,
 * SMA-437, lot V39, PR B, B9), whose entry mounts the whole page.
 */
export async function buildBundle(outDir, { entry, fileName, name }) {
  const { build } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({
      configFile: false,
      mode: 'production',
      root: process.cwd(),
      logLevel: 'error',
      clearScreen: false,
      publicDir: false,
      plugins: [react()],
      define: { 'process.env.NODE_ENV': '"production"' },
      build: {
        outDir,
        emptyOutDir: false,
        minify: false,
        sourcemap: false,
        cssCodeSplit: false,
        target: 'chrome120',
        lib: {
          entry: join(process.cwd(), entry),
          formats: ['iife'],
          name,
          fileName: () => fileName,
        },
      },
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
}

/** The faces `main.tsx` loads — 300 to 700 — from the same package, over `file://`. */
export function fontFaces() {
  const dir = pathToFileURL(join(process.cwd(), 'node_modules/@fontsource/inter/files')).href;
  return [300, 400, 500, 600, 700]
    .map(
      (weight) =>
        `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:block;src:url(${dir}/inter-latin-${weight}-normal.woff2) format('woff2')}`
    )
    .join('\n');
}

/**
 * The page around the grid: `MuiContainer maxWidth="lg"` as `GardensDashboard`
 * draws it — 1200 px, 16 px of side padding under 600 px and 24 above. The
 * language travels in the query string and is set on i18next by the bundle.
 */
export function writePage(outDir) {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SmartCrops layout harness</title>
<style>
${fontFaces()}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fafcf8;color:#1b2a22;font-family:Inter,system-ui,sans-serif;font-size:1rem;line-height:1.5}
#page{max-width:1200px;margin:0 auto;padding:32px 16px}
@media (min-width:600px){#page{padding:32px 24px}}
</style>
</head><body><div id="page"></div><script src="./harness.js"></script></body></html>`;
  writeFileSync(join(outDir, 'page.html'), html, 'utf8');
}

/**
 * The flags every Chrome of the harness is started with. Fix round 1 set them;
 * SMA-437 (pre-flight D19) adds `--force-prefers-reduced-motion`: the Edit
 * mode rocks every card by half a degree (`SortableWidget`'s wobble), and a
 * card measured mid-rock is a card measured at an angle — the product's own
 * reduced-motion rendering stills it, and nothing else of the dashboard reads
 * that preference.
 */
export const CHROME_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-extensions',
  '--disable-component-update',
  '--disable-features=Translate,OptimizationHints,MediaRouter',
  '--no-sandbox',
  '--allow-file-access-from-files',
  '--force-prefers-reduced-motion',
];

/** The width the calibration opens its window at. */
const FRAME_PROBE_WIDTH = 1000;

/** The calibration of each folder's runs, started once. */
const frames = new Map();

/**
 * SMA-437 (pre-flight D19) — the width Chrome's window keeps for itself, in
 * px. `--window-size=W` does not give a W px viewport everywhere: measured
 * here on Windows, the headless window keeps a 16 px frame — `--window-size=600`
 * is a 584 px viewport, UNDER the 600 px breakpoint, so a « tablet » run would
 * have measured the phone's one-column grid. Calibrated ONCE per folder, on a
 * page that reports its `innerWidth`, and added to the window of every run from
 * 600 px up: a run's `vw` is then the viewport it measures, whatever the
 * platform — which the harness reports (`viewport`) and the suite asserts.
 */
export function windowFrame(binary, outDir, calibrate = calibrateFrame) {
  if (!frames.has(outDir)) {
    const frame = calibrate(binary, outDir);
    frames.set(outDir, frame);
    // A rejected calibration is not kept (SMA-437 lot 1, PR B, S4): the caller
    // still sees the rejection, and the next run of the folder calibrates again.
    frame.catch(() => {
      if (frames.get(outDir) === frame) frames.delete(outDir);
    });
  }
  return frames.get(outDir);
}

async function calibrateFrame(binary, outDir) {
  const page = join(outDir, 'frame.html');
  writeFileSync(
    page,
    '<!doctype html><html><body><pre id="frame"></pre><script>document.getElementById("frame").textContent = String(innerWidth);</script></body></html>',
    'utf8'
  );
  const profile = join(outDir, 'profile-frame');
  mkdirSync(profile, { recursive: true });
  const { out } = await runProcess(
    binary,
    [...CHROME_FLAGS, `--user-data-dir=${profile}`, `--window-size=${FRAME_PROBE_WIDTH},900`, '--dump-dom', pathToFileURL(page).href],
    { timeoutMs: CHROME_RUN_TIMEOUT_MS, label: 'Chrome for the window-frame calibration' }
  );
  const found = /<pre id="frame">(\d+)<\/pre>/.exec(out);
  if (!found) throw new Error(`The window-frame calibration read no width: ${out.slice(0, 200)}`);
  return FRAME_PROBE_WIDTH - Number(found[1]);
}

/** The children `runProcess` spawned or `trackChild` was handed that have not exited yet. */
const running = new Set();

/** The last kill the system refused, per child — what `terminateChildren` reports of a child it could not end (K1). */
const refusals = new WeakMap();

/** The pids of the children still running — empty once every run has ended or been killed. */
export function liveChildren() {
  return [...running].map((child) => child.pid);
}

/** Whether a process with this pid still exists (signal 0 sends nothing; `EPERM` means it exists but is not ours). */
export function isAlive(pid) {
  return systemState(pid) !== 'gone';
}

/**
 * What the SYSTEM says of `pid`, signal 0 sending nothing: `running`; `gone`
 * (`ESRCH`); or `exists, not ours (EPERM)` — a process holds the pid but may
 * not be signalled by us, which the harness cannot tell from its own child
 * and so counts as there.
 */
function systemState(pid) {
  try {
    process.kill(pid, 0);
    return 'running';
  } catch (error) {
    return error.code === 'EPERM' ? 'exists, not ours (EPERM)' : 'gone';
  }
}

/** The `node` running this process — a binary every workstation and runner has, for the tests of `runProcess`. */
export function nodeBinary() {
  return process.execPath;
}

/**
 * Spawns `binary`, no pipes, and hands the child back untouched — for the
 * tests of `trackChild` and `exited`, which touch no Node API themselves.
 */
export function spawnChild(binary, args = []) {
  return spawn(binary, args, { stdio: 'ignore' });
}

/**
 * For the tests of K1 only: the kills of the tracked child `pid` are refused —
 * the first `count`, every one by default — as the system refuses to kill a
 * process that is not ours: its handle answers `EPERM`, and Node's own
 * `kill()` emits `error` while the child runs on. Returns what lifts the
 * refusal and kills the child for real, resolved once it has exited.
 */
export function refuseKills(pid, count = Infinity) {
  const child = trackedChild(pid);
  const [eperm] = [...getSystemErrorMap()].find(([, [name]]) => name === 'EPERM');
  const handle = child._handle;
  const kill = handle.kill;
  let refused = 0;
  handle.kill = (signal) => (refused++ < count ? eperm : kill.call(handle, signal));
  return async () => {
    handle.kill = kill;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited(child);
    }
  };
}

/**
 * For the tests of K1 only: the end of the tracked child `pid` is kept from
 * Node — its handle's `onexit` is held back, so its `exitCode` stays null and
 * no `exit` or `close` is emitted — while the system ends it as it would.
 * Returns what delivers the held end (or, if none came, kills the child for
 * real), resolved once Node has seen the child exit.
 */
export function withholdExit(pid) {
  const child = trackedChild(pid);
  const handle = child._handle;
  const onexit = handle.onexit;
  let held = null;
  handle.onexit = (...end) => {
    held = end;
  };
  return async () => {
    handle.onexit = onexit;
    if (held) onexit.apply(handle, held);
    else if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited(child);
  };
}

/** The tracked child with this pid, for the two test seams above. */
function trackedChild(pid) {
  const child = [...running].find((candidate) => candidate.pid === pid);
  if (!child) throw new Error(`No child with pid ${pid} is tracked.`);
  return child;
}

/**
 * The events that end a child for the harness, the first one that comes: its
 * `exit`, or the `close` of its streams — and its `error` only when it has no
 * `pid`, a spawn that failed: Node never sends `exit` for it (fix round 2,
 * G1). The `error` of a child that did start is a kill the system refused, and
 * that child runs on (fix round 3, K1).
 */
function endsOf(child) {
  return child.pid === undefined ? ['exit', 'error', 'close'] : ['exit', 'close'];
}

/**
 * Resolves once the child has exited — or never started; forces the kill
 * (`SIGKILL`) after the grace when a plain kill was not enough, and gives up
 * one grace later: a child whose kills the system refused still runs when
 * this resolves, still tracked, and `terminateChildren` reports it (K1). The
 * page launcher's `close()` waits on it too, so both launchers end a Chrome
 * the same way.
 */
export function exited(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    let giveUp;
    const force = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      // Armed before the SIGKILL: the wait is bounded whatever the kill does.
      giveUp = setTimeout(end, KILL_GRACE_MS);
      child.kill('SIGKILL');
    }, KILL_GRACE_MS);
    const end = () => {
      clearTimeout(force);
      clearTimeout(giveUp);
      resolve();
    };
    for (const event of endsOf(child)) child.once(event, end);
  });
}

/**
 * Spawns `binary` and settles when the process has EXITED — never before,
 * and never never: it resolves with the output and the exit code of a process
 * that ends on its own, and past `timeoutMs` it kills the process (`kill`,
 * then `SIGKILL` after {@link KILL_GRACE_MS}) and rejects, once the process
 * is gone — or given up on, its kills refused —, with an error that names
 * `label` and carries `timedOut`, the child's `pid` and its `stderr`. Every
 * child is tracked by {@link trackChild} until it exits, so
 * `terminateChildren` can end what a failed test left running, and reports
 * what it could not.
 */
export function runProcess(binary, args, { timeoutMs, label }) {
  return new Promise((resolve, reject) => {
    const child = trackChild(spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] }));
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => (out += chunk.toString()));
    child.stderr.on('data', (chunk) => (err += chunk.toString()));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      exited(child).then(() => {
        const error = new Error(`${label} did not exit within ${timeoutMs} ms and was killed.`);
        error.timedOut = true;
        error.pid = child.pid;
        error.stderr = err;
        reject(error);
      });
    }, timeoutMs);
    child.on('error', (error) => {
      // A spawn that failed ends the run; a kill the system refused does not — the child runs on, tracked (K1).
      if (child.pid !== undefined) return;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve({ out, err, code });
    });
  });
}

/**
 * Tracks a child spawned elsewhere — the page launcher's Chrome, whose pipes
 * `runProcess` does not open — until it exits or fails to start, so
 * `terminateChildren` ends it too when a suite fails half-way. A child already
 * gone is not tracked. A kill the system refuses does not untrack it (K1): its
 * `error` is heard here — Node throws one no one hears — and kept for the
 * report of `terminateChildren`.
 */
export function trackChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return child;
  running.add(child);
  const forget = () => running.delete(child);
  for (const event of endsOf(child)) child.once(event, forget);
  if (child.pid !== undefined) child.on('error', (error) => refusals.set(child, error));
  return child;
}

/**
 * Kills every child still running and resolves, with their pids, once each
 * has exited: the suite's `finally`, and what precedes `removeOutDir`. The
 * verdict on a child Node has not heard end is the SYSTEM's: gone — its `exit`
 * not delivered yet, Node's state lagging — it is let go without error; still
 * there after its kill and the forced `SIGKILL` — kills the system refused —,
 * it is not let go (K1): it stays in the list, and the call REJECTS with an
 * error that names its pid and both states, Node's and the system's.
 */
export async function terminateChildren() {
  const children = [...running];
  for (const child of children) child.kill();
  await Promise.all(children.map((child) => exited(child)));
  const survivors = children
    .filter((child) => child.exitCode === null && child.signalCode === null)
    .map((child) => ({ child, system: systemState(child.pid) }))
    .filter(({ system }) => system !== 'gone');
  for (const child of children) if (!survivors.some((survivor) => survivor.child === child)) running.delete(child);
  if (survivors.length > 0) {
    const named = survivors.map(({ child, system }) => {
      const refusal = refusals.has(child) ? `kill refused with ${refusals.get(child).code}` : 'no kill refused';
      return `pid ${child.pid} (Node: exitCode ${child.exitCode}, signalCode ${child.signalCode}, ${refusal}; system: ${system})`;
    });
    throw new Error(`The layout harness could not end every child — still running after its kill and the forced SIGKILL: ${named.join(', ')}.`);
  }
  return children.map((child) => child.pid);
}

/** The last line of progress the page logged — Chrome forwards `console.log` to its stderr under `--enable-logging=stderr`. */
function lastProgress(stderr) {
  const lines = [...stderr.matchAll(/INFO:CONSOLE[^"]*"\[layout\] ([^"]*)"/g)].map((match) => match[1]);
  return lines.at(-1) ?? null;
}

/** The measurements, back from the text of the results `<pre>` (base64 of the JSON's UTF-8 bytes — `encode.ts`). */
export function decodeResults(base64) {
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

/**
 * One run of the page: every scene at `run.vw` px in `run.lang`, measured.
 * Headless Chrome opens no window under 500 px, so a phone width is the
 * `#page` width (still under the 600 px breakpoint); a tablet or desktop
 * width is the window's viewport — the window is opened wider by the frame
 * {@link windowFrame} calibrated (SMA-437). The page is told the wall clock —
 * `run.clockMs`, else this process's `Date.now()` — and freezes its own
 * instant over it unless `run.freeze` is false (#8). Bounded by
 * {@link CHROME_RUN_TIMEOUT_MS}: past it the browser is killed and the error
 * names the run and the last scene it reached.
 */
export async function measureRun(binary, outDir, run) {
  const phone = run.vw < 600;
  const frame = phone ? 0 : await windowFrame(binary, outDir);
  const clock = run.clockMs ?? Date.now();
  const query = `?lang=${run.lang}${phone ? `&vw=${run.vw}` : ''}&clock=${clock}${run.freeze === false ? '&freeze=0' : ''}`;
  const url = pathToFileURL(join(outDir, 'page.html')).href + query;
  const profile = join(outDir, `profile-${run.id.replace('@', '-')}`);
  mkdirSync(profile, { recursive: true });
  let result;
  try {
    result = await runProcess(
      binary,
      [
        ...CHROME_FLAGS,
        '--enable-logging=stderr',
        `--user-data-dir=${profile}`,
        `--window-size=${phone ? 500 : run.vw + frame},900`,
        '--virtual-time-budget=600000',
        '--dump-dom',
        url,
      ],
      { timeoutMs: CHROME_RUN_TIMEOUT_MS, label: `Chrome for the layout run ${run.id}` }
    );
  } catch (error) {
    if (error.timedOut) {
      throw new Error(
        `The layout harness run ${run.id} (${run.lang} at ${run.vw} px) did not finish within ${CHROME_RUN_TIMEOUT_MS} ms and its Chrome was killed — ` +
          `last scene reached: ${lastProgress(error.stderr) ?? '(none reported)'}.\nstderr: ${error.stderr.slice(-400)}`
      );
    }
    throw error;
  }
  const { out, err, code } = result;
  const found = new RegExp(`<pre id="${RESULTS_ID}">([A-Za-z0-9+/=]+)</pre>`).exec(out);
  if (!found) {
    const error = new RegExp(`<pre id="${RESULTS_ID}-error">([^<]*)</pre>`).exec(out);
    const progress = new RegExp(`<pre id="${RESULTS_ID}-progress">([^<]*)</pre>`).exec(out);
    throw new Error(
      `The layout harness produced no measurements for ${run.id} (Chrome exit ${code}).\n` +
        `error: ${error?.[1] ?? '(none)'}\nprogress: ${progress?.[1]?.trim().split('\n').slice(-3).join(' | ') ?? lastProgress(err) ?? '(none)'}\n` +
        `stderr: ${err.slice(-400)}`
    );
  }
  return decodeResults(found[1]);
}
