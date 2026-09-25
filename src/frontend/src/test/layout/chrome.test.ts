import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeResults,
  exited,
  isAlive,
  liveChildren,
  nodeBinary,
  refuseKills,
  runProcess,
  spawnChild,
  terminateChildren,
  type TimedOutError,
  trackChild,
  windowFrame,
  withholdExit,
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

// SMA-437, PR #292, fix round 3, K1 (CodeRabbit, both surfaces, Major) — a
// kill the system refuses. Node reports it with `error`, and the child runs
// on; since G1, `exited()` and `trackChild()` took every `error` for an end,
// so `terminateChildren()` settled on a LIVE Chrome and dropped it from its
// list. The refusal is injected under Node's own `kill()` (`refuseKills`: the
// child's handle answers `EPERM`), on a real `node` that never exits, and each
// test kills its child for real at the end — verified.
describe('a kill the system refuses — the child is not let go while it runs (K1)', () => {
  /** What `promise` came to, or the time waited — never a pending test. */
  const outcome = (promise: Promise<unknown>, ms: number) =>
    Promise.race([
      promise.then(
        () => 'resolved',
        (error: Error) => `rejected: ${error.message}`
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve(`still waiting after ${ms} ms`), ms)),
    ]);

  /** `terminateChildren()` with every kill of `pid` refused: what it came to, and the child meanwhile. The child is killed for real before this returns. */
  const terminateRefused = async (pid: number) => {
    const release = refuseKills(pid);
    try {
      const started = performance.now();
      const settled = await outcome(terminateChildren(), 10_000);
      return { settled, alive: isAlive(pid), live: liveChildren(), elapsed: performance.now() - started };
    } finally {
      await release();
    }
  };

  /** What `terminateChildren()` rejects with when `pid` outlives its kill and the forced SIGKILL. */
  const survivor = (pid: number) =>
    `rejected: The layout harness could not end every child — still running after its kill and the forced SIGKILL: pid ${pid} (Node: exitCode null, signalCode null, kill refused with EPERM; system: running).`;

  it('terminateChildren rejects, naming its pid, on a run of the scenes launcher it could not end — and keeps it in the list', async () => {
    const ran = runProcess(nodeBinary(), NEVER, { timeoutMs: 60_000, label: 'a run whose kills are refused' }).then(
      ({ code }) => `exited, code ${code}`,
      (error: Error) => `rejected: ${error.message}`
    );
    const [pid] = liveChildren();

    const { elapsed, ...refused } = await terminateRefused(pid!);

    expect(refused).toEqual({ settled: survivor(pid!), alive: true, live: [pid] });
    // Bounded — the kill, then the forced SIGKILL, a grace each: no suite waits on a child it cannot end.
    expect(elapsed).toBeLessThan(10_000);
    // Killed for real once the refusal is lifted: gone from the system and from the list, and the run settles as a killed one.
    expect(isAlive(pid!)).toBe(false);
    expect(liveChildren()).toEqual([]);
    expect(await ran).toBe('exited, code null');
  }, 20_000);

  it('terminateChildren rejects, naming its pid, on a Chrome of the page launcher it could not end — and keeps it in the list', async () => {
    const pid = trackChild(spawnChild(nodeBinary(), NEVER)).pid!;

    const { elapsed, ...refused } = await terminateRefused(pid);

    expect(refused).toEqual({ settled: survivor(pid), alive: true, live: [pid] });
    expect(elapsed).toBeLessThan(10_000);
    expect(isAlive(pid)).toBe(false);
    expect(liveChildren()).toEqual([]);
  }, 20_000);

  it('exited() waits on through a kill refused while it waits — the child still runs, still listed — and ends with the forced SIGKILL', async () => {
    const child = trackChild(spawnChild(nodeBinary(), NEVER));
    const pid = child.pid!;
    const errors: Array<string | undefined> = [];
    child.once('error', (error) => errors.push(error.code));
    const release = refuseKills(pid, 1);
    try {
      const gone = exited(child);
      // Refused: Node emits `error`, and the child runs on.
      child.kill();

      expect({ settled: await outcome(gone, 1_000), alive: isAlive(pid), live: liveChildren() }).toEqual({
        settled: 'still waiting after 1000 ms',
        alive: true,
        live: [pid],
      });
      expect(errors).toEqual(['EPERM']);
      // The forced SIGKILL, past the grace, is not refused: it ends the child, and the wait.
      expect(await outcome(gone, 5_000)).toBe('resolved');
      expect(isAlive(pid)).toBe(false);
      expect(liveChildren()).toEqual([]);
    } finally {
      await release();
    }
  }, 20_000);

  // Fix round 3, reprise (disposition of 25/09, 21:55) — the verdict is the
  // SYSTEM's: Node's state is a reflection, sometimes late. Under the whole
  // suite's load, a page Chrome whose `exit` Node had not delivered failed the
  // page suite as a survivor (pid 31004), no kill refused. The delivery is held
  // back here (`withholdExit`) on a real `node` that terminateChildren really
  // kills: the system no longer has it, Node still believes it runs.
  it('terminateChildren lets go, without error, a child the system no longer has — even while Node has not told its exit', async () => {
    const child = trackChild(spawnChild(nodeBinary(), NEVER));
    const pid = child.pid!;
    const deliver = withholdExit(pid);
    try {
      const settled = await outcome(terminateChildren(), 10_000);

      expect({ settled, node: [child.exitCode, child.signalCode], system: isAlive(pid), live: liveChildren() }).toEqual({
        settled: 'resolved',
        node: [null, null],
        system: false,
        live: [],
      });
    } finally {
      await deliver();
    }
    // Node told at last: the child is gone for both.
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(isAlive(pid)).toBe(false);
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
