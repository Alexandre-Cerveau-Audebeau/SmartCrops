/**
 * SMA-452 § 12 — a simulated response the test HOLDS, then lets go when it
 * decides: the pattern of R1 (PR #292, fix round 1) and of `holdWeather()`.
 * Let go inside `await act(async () => …)`, the landing and every render it
 * triggers are done before the next line reads the DOM or a hook's answer — no
 * `waitFor`, no bound, no order of the event loop to count on. A wait whose
 * condition is also true BEFORE the landing (« the request left », « nothing
 * is drawn yet ») proves nothing: holding the response is what makes the read
 * that follows a proof.
 *
 * `deferred` is `useGardenOrder.test.ts`'s own, copied as it is. A module under
 * `src/test/` rather than a helper exported from a test file: importing from a
 * `*.test.ts` would run that file's suite as a side effect — the rule of
 * `dashboardDom.ts` and `contrast.ts` beside it.
 */

/** A promise the test resolves or rejects when it decides. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
