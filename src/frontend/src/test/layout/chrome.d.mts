// The types of `chrome.mjs` — see that file for why the Node side of the
// layout harness is plain JavaScript.
import type { SceneMeasure } from './harness';

export interface LayoutRun {
  /** `fr@360`… */
  id: string;
  lang: 'fr' | 'en';
  vw: number;
}

/** `CHROME_BIN`, then the usual names and places; null when none exists. */
export function findChrome(): string | null;
/** GitHub Actions and the other runners set `CI`: there the suite must run, never skip. */
export const IS_CI: boolean;
/** A fresh temp folder for the bundle, the page and the Chrome profiles. */
export function makeOutDir(): string;
/** Removes it, retried; never throws. */
export function removeOutDir(outDir: string): void;
/** Bundles `harness.tsx` into `outDir/harness.js`, in production mode. */
export function buildHarness(outDir: string): Promise<void>;
/** Writes `outDir/page.html` around the bundle. */
export function writePage(outDir: string): void;
/** Runs Chrome headless on the page for one run and returns its measurements. */
export function measureRun(binary: string, outDir: string, run: LayoutRun): Promise<SceneMeasure[]>;
