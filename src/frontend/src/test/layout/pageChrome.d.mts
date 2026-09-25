// The types of `pageChrome.mjs` — see `chrome.mjs` for why the Node side of
// the layout harness is plain JavaScript.

/** How long one session may last before its Chrome is killed. */
export const PAGE_SESSION_TIMEOUT_MS: number;
/** How long one wait on a condition may last. */
export const PAGE_WAIT_MS: number;

/** The keys a scenario presses. */
export type PageKey = 'Enter' | 'Space' | 'Escape' | 'ArrowUp' | 'ArrowDown';

/** One Chrome on the page harness, its viewport emulated. */
export interface PageSession {
  /** Runs an expression in the page — awaited, its value returned. */
  evaluate<T = unknown>(expression: string): Promise<T>;
  /** Polls an expression at the page's frames until it is truthy; rejects past `PAGE_WAIT_MS`, naming `what`. */
  waitFor(expression: string, what: string): Promise<void>;
  /** Loads the page with `query` and waits until it reports ready. */
  navigate(query: string): Promise<void>;
  /** A real key, through the browser's input pipeline, to the focused element. */
  press(key: PageKey): Promise<void>;
  /** Ends the browser and waits for it to exit. */
  close(): Promise<void>;
}

/** Bundles `pageHarness.tsx` into `outDir/page-harness.js`, in production mode. */
export function buildPageHarness(outDir: string): Promise<void>;
/** Writes `outDir/page-harness.html` around the bundle. */
export function writePageHarness(outDir: string): void;
/** Opens one Chrome on the page harness at `width` × `height`, as a device (`mobile`: overlay scrollbars) or a desktop. */
export function openPage(
  binary: string,
  outDir: string,
  options: { label: string; width: number; height: number; mobile: boolean }
): Promise<PageSession>;
