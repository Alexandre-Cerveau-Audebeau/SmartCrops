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
