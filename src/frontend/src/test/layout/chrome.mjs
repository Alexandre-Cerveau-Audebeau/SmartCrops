// SMA-336 mobile lot, step 7 (pre-flight D7) — the NODE side of the layout
// harness: find Chrome, bundle `harness.tsx` with Vite, write the `file://`
// page, run Chrome headless and read its dump. Plain JavaScript on purpose:
// the app's TypeScript project (`tsconfig.app.json`, `types: ["vite/client"]`)
// carries no Node types, and one `import 'node:fs'` in a `.ts` file under
// `src` would pull `@types/node`'s globals into EVERY file it checks — the
// planner's `setTimeout` mock, typed against the DOM's, stopped compiling the
// moment a test did. The types this module exposes are in `chrome.d.mts`;
// `dashboardLayout.test.tsx` reads them and touches no Node API itself.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The id of the `<pre>` the harness page ends on — `RESULTS_ID` of `measure.ts`, repeated here so this file imports no TypeScript. */
const RESULTS_ID = 'layout-results';

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

/** Chrome releases its profile a beat after it exits: retried, never fatal. */
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
export async function buildHarness(outDir) {
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
          entry: join(process.cwd(), 'src/test/layout/harness.tsx'),
          formats: ['iife'],
          name: 'SmartCropsLayoutHarness',
          fileName: () => 'harness.js',
        },
      },
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
}

/** The faces `main.tsx` loads — 300 to 700 — from the same package, over `file://`. */
function fontFaces() {
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

function chrome(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk.toString()));
    child.stderr.on('data', (chunk) => (err += chunk.toString()));
    child.on('close', (code) => resolve({ out, err, code }));
    child.on('error', reject);
  });
}

/**
 * One run of the page: every scene at `run.vw` px in `run.lang`, measured.
 * Headless Chrome opens no window under 500 px, so a phone width is the
 * `#page` width (still under the 600 px breakpoint); a desktop width is the
 * window's.
 */
export async function measureRun(binary, outDir, run) {
  const phone = run.vw < 600;
  const url = pathToFileURL(join(outDir, 'page.html')).href + `?lang=${run.lang}${phone ? `&vw=${run.vw}` : ''}`;
  const profile = join(outDir, `profile-${run.id.replace('@', '-')}`);
  mkdirSync(profile, { recursive: true });
  const { out, err, code } = await chrome(binary, [
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
    `--user-data-dir=${profile}`,
    `--window-size=${phone ? 500 : run.vw},900`,
    '--virtual-time-budget=600000',
    '--dump-dom',
    url,
  ]);
  const found = new RegExp(`<pre id="${RESULTS_ID}">([A-Za-z0-9+/=]+)</pre>`).exec(out);
  if (!found) {
    const error = new RegExp(`<pre id="${RESULTS_ID}-error">([^<]*)</pre>`).exec(out);
    const progress = new RegExp(`<pre id="${RESULTS_ID}-progress">([^<]*)</pre>`).exec(out);
    throw new Error(
      `The layout harness produced no measurements for ${run.id} (Chrome exit ${code}).\n` +
        `error: ${error?.[1] ?? '(none)'}\nprogress: ${progress?.[1]?.trim().split('\n').slice(-3).join(' | ') ?? '(none)'}\n` +
        `stderr: ${err.slice(-400)}`
    );
  }
  return JSON.parse(Buffer.from(found[1], 'base64').toString('utf8'));
}
