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
 * `deferred` is `useGardenOrder.test.ts`'s own, copied as it is; `hold` is
 * the pattern in one call, for a service the suite already serves. A module under
 * `src/test/` rather than a helper exported from a test file: importing from a
 * `*.test.ts` would run that file's suite as a side effect — the rule of
 * `dashboardDom.ts` and `contrast.ts` beside it.
 */

import { act } from '@testing-library/react';
import { onTestFinished, type MockInstance } from 'vitest';

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

/** A simulated service: an asynchronous function a suite replaced by `vi.fn()`. */
type Service = (...args: never[]) => Promise<unknown>;
/** The same, as the hold calls it: whatever it was given, passed through. */
type Served = (...args: unknown[]) => Promise<unknown>;

/** The services whose held answer still waits for its request. */
const waiting = new WeakSet<object>();

/**
 * The NEXT answer of a simulated service, held: the request leaves, and waits.
 * What `hold` returns lets it go inside `await act(async () => …)` — the
 * service then answers what the suite was serving when it was held, a refusal
 * as well as an answer, and that landing, every other answer already on its
 * way and every render they trigger are done before the next line reads the
 * DOM, synchronously: no `findBy`, no `waitFor`, no bound.
 *
 * A request that has still not left once `act` is done throws: the read that
 * follows would prove nothing. Serve first, hold after: the hold stands in
 * front of what the service serves until ONE request has left, then steps
 * aside — and a test that ends, or fails, before that request left leaves
 * nothing held for the next one. One answer of a service is held at a time:
 * hold the next once the request of the first has left.
 */
export function hold(service: Service): () => Promise<void> {
  const mock = service as unknown as MockInstance<Served>;
  const served = mock.getMockImplementation();
  if (!served) {
    throw new Error('hold(): this service serves nothing yet — serve its answer before holding it.');
  }
  if (waiting.has(mock)) {
    throw new Error('hold(): an answer of this service is already held and its request has not left.');
  }
  const gate = deferred<void>();
  let left = false;
  const stepAside = () => {
    if (!waiting.delete(mock)) return;
    if (mock.getMockImplementation() === holding) mock.mockImplementation(served);
  };
  const holding: Served = (...args) => {
    left = true;
    stepAside();
    return gate.promise.then(() => served(...args));
  };
  mock.mockImplementation(holding);
  waiting.add(mock);
  onTestFinished(stepAside);
  return async () => {
    // A request the page sends one step after the gesture (a write that goes
    // first) leaves inside this same `act`, and is answered in it.
    await act(async () => {
      gate.resolve();
    });
    if (!left) throw new Error('hold(): the request never left — no answer was let go.');
  };
}
