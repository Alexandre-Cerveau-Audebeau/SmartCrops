import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeResults,
  isAlive,
  liveChildren,
  nodeBinary,
  runProcess,
  terminateChildren,
  type TimedOutError,
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
