// The types of `chrome.mjs` — see that file for why the Node side of the
// layout harness is plain JavaScript.
import type { LayoutResults } from './harness';

export interface LayoutRun {
  /** `fr@360`… */
  id: string;
  lang: 'fr' | 'en';
  vw: number;
  /** The wall clock the page is told the machine has — `Date.now()` of this process when absent; inert while the harness freezes its own instant over it (#8). */
  clockMs?: number;
  /** `false` leaves the machine's (or `clockMs`) clock in place instead of freezing the harness's instant: the control of the date-independence proof. */
  freeze?: boolean;
}

/** What the harness uses of a spawned child: `node:child_process`'s `ChildProcess`, described without Node's types. */
export interface HarnessChild {
  readonly pid: number | undefined;
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  kill(signal?: string): boolean;
  on(event: 'error', listener: (error: Error & { code?: string }) => void): unknown;
  once(event: 'error', listener: (error: Error & { code?: string }) => void): unknown;
  once(event: 'exit' | 'close', listener: (code: number | null, signal: string | null) => void): unknown;
}

/** What `runProcess` resolves with when the process ends on its own. */
export interface ProcessResult {
  out: string;
  err: string;
  code: number | null;
}

/** What `runProcess` rejects with once a process past its delay has been killed. */
export interface TimedOutError extends Error {
  timedOut: true;
  pid: number | undefined;
  stderr: string;
}

/** How long one run of the page may take before its Chrome is killed. */
export const CHROME_RUN_TIMEOUT_MS: number;
/** `CHROME_BIN`, then the usual names and places; null when none exists. */
export function findChrome(): string | null;
/** GitHub Actions and the other runners set `CI`: there the suite must run, never skip. */
export const IS_CI: boolean;
/** A fresh temp folder for the bundle, the page and the Chrome profiles. */
export function makeOutDir(): string;
/** Removes it, retried; never throws. Call `terminateChildren()` first, and this in its `finally`. */
export function removeOutDir(outDir: string): void;
/** Bundles `harness.tsx` into `outDir/harness.js`, in production mode. */
export function buildHarness(outDir: string): Promise<void>;
/** Bundles `entry` into `outDir/fileName`, one IIFE named `name`, in production mode. */
export function buildBundle(outDir: string, bundle: { entry: string; fileName: string; name: string }): Promise<void>;
/** The `@font-face` rules of the faces `main.tsx` loads, over `file://`. */
export function fontFaces(): string;
/** The flags every Chrome of the harness is started with. */
export const CHROME_FLAGS: readonly string[];
/** Tracks a child spawned elsewhere until it exits or fails to start — a refused kill does not untrack it —, so `terminateChildren` ends it too. */
export function trackChild<T extends HarnessChild>(child: T): T;
/** Resolves once the child has exited — or never started; forces the kill (`SIGKILL`) after the grace when a plain kill was not enough, and gives up one grace later on a child whose kills were refused: it still runs, still tracked. */
export function exited(child: HarnessChild): Promise<void>;
/** Writes `outDir/page.html` around the bundle. */
export function writePage(outDir: string): void;
/** Runs Chrome headless on the page for one run — bounded, killed past the delay — and returns its measurements. */
export function measureRun(binary: string, outDir: string, run: LayoutRun): Promise<LayoutResults>;
/** The px Chrome's window keeps for itself, calibrated once per folder: `--window-size` is the viewport plus this. */
export function windowFrame(
  binary: string,
  outDir: string,
  calibrate?: (binary: string, outDir: string) => Promise<number>
): Promise<number>;
/** Spawns a process and settles once it has exited: the result, or a `TimedOutError` past `timeoutMs`. */
export function runProcess(binary: string, args: string[], options: { timeoutMs: number; label: string }): Promise<ProcessResult>;
/** Kills every child still running, waits for each to exit, and returns their pids. A child the system no longer has is let go, even before Node tells its exit; one the system still has after its kill and the forced `SIGKILL` stays in the list, and the call rejects naming its pid, Node's state and the system's. */
export function terminateChildren(): Promise<Array<number | undefined>>;
/** The pids of the children still running. */
export function liveChildren(): Array<number | undefined>;
/** Whether a process with this pid still exists. */
export function isAlive(pid: number): boolean;
/** The `node` running this process, for a test that needs a binary. */
export function nodeBinary(): string;
/** Spawns `binary`, no pipes, and hands the child back untouched: for the tests of `trackChild` and `exited`. */
export function spawnChild(binary: string, args?: string[]): HarnessChild;
/** For the tests of K1: the kills of the tracked child `pid` are refused with `EPERM` — the first `count`, every one by default. Returns what lifts the refusal and kills the child for real, resolved once it has exited. */
export function refuseKills(pid: number, count?: number): () => Promise<void>;
/** For the tests of K1: the end of the tracked child `pid` is kept from Node — no `exit`, no `close`, its `exitCode` null — while the system ends it. Returns what delivers it (or kills the child for real), resolved once Node has seen the child exit. */
export function withholdExit(pid: number): () => Promise<void>;
/** The measurements, back from the base64 text of the results `<pre>`. */
export function decodeResults(base64: string): unknown;
