// SMA-437, lot V39, PR B, step B9 (pre-flight, technical decision 12) — the
// NODE side of the PAGE launcher: the whole page — the real `Layout`, its
// navbar, and `GardensDashboard` — in Chrome, driven through the DevTools
// protocol, in REAL time.
//
// Why a launcher of its own (pre-flight, § C.6, measured): the scenes'
// launcher (`chrome.mjs`) runs Chrome under virtual time with `--dump-dom`,
// where an `IntersectionObserver` or a `ResizeObserver` reports once, at the
// first frame, and never again — and its window cannot be narrower than
// 500 px. The compact bar is made of observers, and of a phone's width. Here
// the viewport is EMULATED exactly (`Emulation.setDeviceMetricsOverride`, 360
// px included), time runs, and every wait is on a CONDITION polled at the
// page's frames, bounded — never a bare duration.
//
// The protocol travels over `--remote-debugging-pipe` — fds 3 and 4, JSON
// messages ended by a NUL byte — and not over a WebSocket: the CI runs Node
// 20, which has no global `WebSocket`, and no dependency is added for one.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHROME_FLAGS, buildBundle, fontFaces, trackChild } from './chrome.mjs';

/**
 * How long one session — one Chrome, every scenario of one viewport — may
 * last before its Chrome is killed: a scenario takes a few seconds; a session
 * past two minutes is a wedged browser, not a slow one.
 */
export const PAGE_SESSION_TIMEOUT_MS = 120_000;

/** How long one wait on a condition may last — a page that never becomes ready, a bar that never shows. */
export const PAGE_WAIT_MS = 15_000;

/** After a kill, how long the browser has to exit before the kill is forced. */
const KILL_GRACE_MS = 2_000;

/** The keys the scenarios press, as the protocol wants them. */
const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
};

/** Bundles `pageHarness.tsx` into `outDir/page-harness.js`, in production mode. */
export function buildPageHarness(outDir) {
  return buildBundle(outDir, {
    entry: 'src/test/layout/pageHarness.tsx',
    fileName: 'page-harness.js',
    name: 'SmartCropsPageHarness',
  });
}

/**
 * The page around the bundle: the app's `index.html` in substance — Inter
 * from the package over `file://`, the base rules of `index.css` — and one
 * `#root`. The query string drives the page (see `pageHarness.tsx`).
 */
export function writePageHarness(outDir) {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SmartCrops page harness</title>
<style>
${fontFaces()}
*,*::before,*::after{box-sizing:border-box}
body{margin:0}
</style>
</head><body><div id="root"></div><script src="./page-harness.js"></script></body></html>`;
  writeFileSync(join(outDir, 'page-harness.html'), html, 'utf8');
}

/** Resolves once the child has exited; forces the kill after the grace. */
function exited(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const force = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, KILL_GRACE_MS);
    child.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
  });
}

/**
 * Opens one Chrome on `outDir/page-harness.html`, its viewport emulated at
 * `width` × `height` — as a device's (`mobile`) or a desktop's —, and answers
 * a session: `navigate(query)` loads the page
 * with that query and waits until it says it is ready; `evaluate(expression)`
 * runs an expression in it — awaited, returned by value; `press(key)` sends a
 * real key through the input pipeline; `close()` ends the browser. Past
 * {@link PAGE_SESSION_TIMEOUT_MS} the browser is killed and every call
 * rejects, naming `label`.
 */
export async function openPage(binary, outDir, { label, width, height, mobile }) {
  const profile = join(outDir, `profile-page-${label.replace(/[^\w-]/g, '-')}`);
  mkdirSync(profile, { recursive: true });
  const child = trackChild(
    spawn(
      binary,
      [...CHROME_FLAGS, '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] }
    )
  );
  let stderr = '';
  child.stdio[2].on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });

  let failure = null;
  const pending = new Map();
  /** Rejects every call in flight and every later one. */
  const fail = (error) => {
    if (failure) return;
    failure = error;
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  const timer = setTimeout(() => {
    fail(new Error(`The page session ${label} did not finish within ${PAGE_SESSION_TIMEOUT_MS} ms and its Chrome was killed.\nstderr: ${stderr.slice(-400)}`));
    child.kill();
  }, PAGE_SESSION_TIMEOUT_MS);
  child.once('exit', (code) => {
    clearTimeout(timer);
    fail(new Error(`The Chrome of the page session ${label} exited (code ${code}).\nstderr: ${stderr.slice(-400)}`));
  });
  child.once('error', (error) => fail(error));

  // The protocol: one JSON message per NUL-terminated frame, both ways.
  let buffered = Buffer.alloc(0);
  child.stdio[4].on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    let end;
    while ((end = buffered.indexOf(0)) >= 0) {
      const message = JSON.parse(buffered.subarray(0, end).toString('utf8'));
      buffered = buffered.subarray(end + 1);
      // Events are not listened to: every wait polls a condition instead.
      if (message.id === undefined || !pending.has(message.id)) continue;
      const { resolve, reject, method } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${label}: ${method} failed — ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    }
  });

  let nextId = 1;
  const send = (method, params = {}, sessionId) => {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, method });
      child.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  };

  const { targetInfos } = await send('Target.getTargets');
  const target = targetInfos.find((info) => info.type === 'page');
  if (!target) throw new Error(`${label}: Chrome opened no page.`);
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');
  // The page believes it has the focus, as a window in front would: `:focus`
  // and the keyboard behave as on a device.
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    // A phone or a tablet draws its scrollbar OVER the page; a desktop keeps
    // a gutter for it (`scrollbar-gutter: stable`, theme.ts) — the widths the
    // pre-flight measured: 360 px of navbar at 360, 1 270 at 1 280.
    mobile,
    screenWidth: width,
    screenHeight: height,
  });

  /** Runs `expression` in the page — awaited, its value returned; an exception in the page rejects with its text. */
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      const text = exceptionDetails.exception?.description ?? exceptionDetails.text;
      throw new Error(`${label}: the page threw evaluating ${expression.slice(0, 80)} — ${text}`);
    }
    return result.value;
  };

  /** Polls `expression` at the page's frames until it is truthy; rejects past {@link PAGE_WAIT_MS}. */
  const waitFor = async (expression, what) => {
    const started = Date.now();
    for (;;) {
      const value = await evaluate(`(async () => { try { return !!(${expression}); } catch { return false; } })()`).catch(() => false);
      if (value) return;
      if (Date.now() - started > PAGE_WAIT_MS) {
        throw new Error(`${label}: ${what} did not happen within ${PAGE_WAIT_MS} ms.`);
      }
      await evaluate('new Promise((resolve) => requestAnimationFrame(() => resolve(true)))').catch(() => undefined);
    }
  };

  return {
    evaluate,
    waitFor,
    /** Loads the page with `query` and waits until it reports ready. */
    async navigate(query) {
      const url = `${pathToFileURL(join(outDir, 'page-harness.html')).href}?${query}`;
      await call('Page.navigate', { url });
      await waitFor('window.__page && window.__page.ready()', `the page ${query} becoming ready`);
    },
    /** A real key, through the browser's input pipeline, to the focused element. */
    async press(name) {
      const key = KEYS[name];
      if (!key) throw new Error(`${label}: no key ${name}`);
      const base = { ...key, nativeVirtualKeyCode: key.windowsVirtualKeyCode, unmodifiedText: key.text };
      await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base, text: undefined, unmodifiedText: undefined });
    },
    /** Ends the browser and waits for it to exit. */
    async close() {
      clearTimeout(timer);
      if (!failure) await send('Browser.close').catch(() => undefined);
      child.kill();
      await exited(child);
    },
  };
}
