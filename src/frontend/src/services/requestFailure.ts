import { HttpStatusError, type ProblemDetails } from './httpStatusError';

/**
 * SMA-448, lot F3, step L4 (R3-E1) — what a request that did not go through
 * means for the user, when the server did not EXPLAIN it with a problem the
 * caller reads first: a session that expired (401 — sign in again), a right
 * the account lacks (403 without a formula's problem — nothing to retry), or
 * a failure — no server, a timeout, a 5xx, anything else — that a retry may
 * cure. Three words, so no surface says « try again » to a user whose
 * session is gone.
 */
export type RequestFailureKind = 'unauthorized' | 'forbidden' | 'failed';

/** The problem document a refusal carries, when the server explained it. */
export function problemOf(error: unknown): ProblemDetails | undefined {
  return error instanceof HttpStatusError ? error.problem : undefined;
}

export function requestFailureKind(error: unknown): RequestFailureKind {
  if (error instanceof HttpStatusError) {
    if (error.status === 401) return 'unauthorized';
    if (error.status === 403) return 'forbidden';
  }
  return 'failed';
}

/**
 * SMA-437, review of the v3, M11 — whether a layout write was refused because
 * THIS TAB IS STALE: its level is a formula the account no longer has (400
 * `formula.stale`, `DashboardController` — the formula changed on another
 * device since the tab read its layout, and only `PUT /api/formulas/current`
 * changes it). Not a failure a retry may cure: the layout on screen visited
 * the formula it left, and only a re-read of the formula and its layout
 * brings the tab back. Here, beside `problemOf`, and not in `dashboardApi`:
 * the page suites mock that module whole, and a predicate the hook reads
 * from it would be missing from every one of them.
 */
export function isStaleFormulaRefusal(error: unknown): boolean {
  return problemOf(error)?.code === 'formula.stale';
}
