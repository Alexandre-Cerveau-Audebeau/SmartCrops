import { LAYOUT_NOW_MS, freezeClock } from './clock';

/**
 * SMA-336 mobile lot, fix round 1 (#8) — imported FIRST by `harness.tsx`,
 * before the scenes module evaluates its fixtures and before React mounts
 * anything, so that everything in the page reads `LAYOUT_NOW_MS`.
 *
 * Two query parameters serve the proofs of `dashboardLayout.test.tsx`:
 * `clock=<ms>` first pretends the machine's clock says so — the wall clock a
 * run is « mocked » at, `Date.now()` of the Node process by default — and
 * `freeze=0` leaves that clock in place instead of freezing the harness's
 * instant over it: the control that shows the pretence is live.
 */
const params = new URLSearchParams(location.search);
const clock = Number(params.get('clock'));
if (Number.isFinite(clock) && clock > 0) freezeClock(clock);
if (params.get('freeze') !== '0') freezeClock(LAYOUT_NOW_MS);
