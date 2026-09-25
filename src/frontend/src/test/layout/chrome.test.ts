import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeResults,
  exited,
  isAlive,
  liveChildren,
  nodeBinary,
  runProcess,
  spawnChild,
  terminateChildren,
  type TimedOutError,
  trackChild,
  windowFrame,
} from './chrome.mjs';
import { encodeResults } from './encode';

// SMA-336 mobile lot, fix round 1 (S1, ledger `f9a6460a` / `9a446478`) — the
// Chrome of the layout harness is BOUNDED. `--virtual-time-budget` bounds
// the page's clock, not the process: a browser that wedged — a locked
// profile, a crash before exit — used to leave the promise pending for the
// 180 s of the hook and four orphans behind it. Every process `chrome.mjs`
// spawns is now killed past its delay, and the test below proves it on a
// binary every machine has: `node` itself, told never to return.

/** A process that never exits on its own. */
const NEVER = ['-e', 'setInterval(() => {}, 1000)'];

afterEach(async () => {
  await terminateChildren();
});

describe('runProcess — a process past its delay is killed and the promise rejects (S1)', () => {
  it('rejects within the delay when the process never exits — named, and with no child left behind', async () => {
    const started = performance.now();
    let caught: TimedOutError | null = null;
    try {
      await runProcess(nodeBinary(), NEVER, { timeoutMs: 500, label: 'A fake Chrome that never returns' });
    } catch (error) {
      caught = error as TimedOutError;
    }
    const elapsed = performance.now() - started;

    expect(caught?.timedOut).toBe(true);
    expect(caught?.message).toBe('A fake Chrome that never returns did not exit within 500 ms and was killed.');
    // 500 ms of delay, then the kill: settled long before the hook timeout.
    expect(elapsed).toBeLessThan(5_000);
    // The child is gone from the OS and from the harness's own list.
    expect(caught?.pid).toEqual(expect.any(Number));
    expect(isAlive(caught!.pid!)).toBe(false);
    expect(liveChildren()).toEqual([]);
  }, 20_000);

  it('resolves with the output and the exit code of a process that ends on its own', async () => {
    const result = await runProcess(nodeBinary(), ['-e', 'process.stdout.write("measured"); process.exit(3)'], {
      timeoutMs: 20_000,
      label: 'a short-lived node',
    });
    expect(result).toEqual({ out: 'measured', err: '', code: 3 });
    expect(liveChildren()).toEqual([]);
  });

  it('terminateChildren kills what is still running and waits for it to exit — the profiles can then be removed', async () => {
    const pending = runProcess(nodeBinary(), NEVER, { timeoutMs: 60_000, label: 'a run the suite abandons' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [pid] = liveChildren();
    expect(pid).toEqual(expect.any(Number));
    expect(isAlive(pid!)).toBe(true);

    const killed = await terminateChildren();

    expect(killed).toEqual([pid]);
    expect(isAlive(pid!)).toBe(false);
    expect(liveChildren()).toEqual([]);
    // The abandoned run settles too: no exit code, since it was killed.
    await expect(pending).resolves.toMatchObject({ code: null });
  });
});

// SMA-437, PR #292, fix round 2, G1 (CodeRabbit, Major) — a Chrome that never
// started. Node reports a failed spawn with `error` then `close`, never `exit`,
// and sets the child's exit code only as it reports it, a turn later. An
// `exited()` asked in the SAME turn as the spawn waited for an `exit` that
// never came, and `trackChild` kept the child in its list until the suite's
// `terminateChildren`.
describe('exited and trackChild — a child that never started is let go (G1)', () => {
  /** A binary no machine has: the spawn fails with `ENOENT`. */
  const MISSING = 'smartcrops-no-such-browser';

  /** `settled` once `promise` settles, or the time waited — never a pending test. */
  const within = (promise: Promise<unknown>, ms: number) =>
    Promise.race([
      promise.then(() => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve(`still waiting after ${ms} ms`), ms)),
    ]);

  it('resolves exited() asked in the same turn as a spawn that fails, and terminateChildren then ends — nothing left in the list', async () => {
    const errors: Array<string | undefined> = [];
    const child = trackChild(spawnChild(MISSING));
    // The page launcher listens to `error` too, as it must: an `error` nobody listens to throws.
    child.once('error', (error) => errors.push(error.code));
    // The same turn as the spawn: Node has not reported the failure yet.
    const gone = exited(child);

    expect(await within(gone, 3_000)).toBe('settled');
    expect(errors).toEqual(['ENOENT']);
    expect(await within(terminateChildren(), 3_000)).toBe('settled');
    expect(liveChildren()).toEqual([]);
  }, 20_000);
});

describe('decodeResults — what measureRun reads back is what the page encoded (#5)', () => {
  it('round-trips a payload of more than 200 KB through the same base64 the page writes', () => {
    const results = Array.from({ length: 29 }, (_, s) => ({
      scene: `scene-${s}`,
      clipped: Array.from({ length: 120 }, (_, i) => ({ label: `"Auj. 0 % 16–29 · Mar. 0 % 15–28 ${i}"`, by: 'card', top: 0, right: 0, bottom: 12.5, left: 0, h: 44 })),
    }));
    expect(JSON.stringify(results).length).toBeGreaterThan(200_000);
    expect(decodeResults(encodeResults(results))).toEqual(results);
  });
});

// SMA-437 lot 1, PR B, S4 — the window-frame calibration is cached per folder,
// but a REJECTED one was cached too: one Chrome that failed to start, and every
// later run of the folder rejected on the same promise without calibrating
// again. The calibration is injected so no Chrome is needed; the folder names
// are this test's own, never a folder the harness measures in.
describe('windowFrame — a rejected calibration is not kept (S4)', () => {
  it('calibrates again after a rejection, and keeps the first calibration that succeeds', async () => {
    const folder = 'window-frame-test/rejected-then-calibrated';
    const calls: string[] = [];
    const failing = (_binary: string, outDir: string) => {
      calls.push(`failing ${outDir}`);
      return Promise.reject(new Error('Chrome for the window-frame calibration did not start'));
    };
    const calibrated = (frame: number) => (_binary: string, outDir: string) => {
      calls.push(`${frame} ${outDir}`);
      return Promise.resolve(frame);
    };

    await expect(windowFrame('chrome', folder, failing)).rejects.toThrow('did not start');
    await expect(windowFrame('chrome', folder, calibrated(16))).resolves.toBe(16);
    // Cached from here on: a third run of the folder reads 16 without calibrating.
    await expect(windowFrame('chrome', folder, calibrated(99))).resolves.toBe(16);
    expect(calls).toEqual([`failing ${folder}`, `16 ${folder}`]);
  });
});
