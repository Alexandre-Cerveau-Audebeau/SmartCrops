/**
 * Error carrying the HTTP status of a non-OK response (SMA-30). Shared so
 * callers narrow with `instanceof` instead of duck-typing a `status` field.
 * gardenApi's local throwWithStatus migrates here in a follow-up (deferred,
 * logged on SMA-30).
 */
export class HttpStatusError extends Error {
  // Explicit declaration + assignment (not a constructor parameter property):
  // the frontend tsconfig enables `erasableSyntaxOnly`, which rejects
  // non-erasable TS syntax at `tsc -b` time (TS1294 — broke the CI build).
  readonly status: number;

  /**
   * SMA-448, lot F1 — the body of a refusal the server EXPLAINS, an
   * `application/problem+json` document (RFC 9457): its stable `code` to
   * branch on, and whatever the refusal carries (the reasons a formula is too
   * small, …). Undefined for any other response.
   */
  readonly problem?: ProblemDetails;

  constructor(message: string, status: number, problem?: ProblemDetails) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
    this.problem = problem;
  }
}

/**
 * An RFC 9457 problem document as the API sends it: the standard members,
 * a stable `code` (SMA-448: `formula.tooSmall`, …), and the extensions of the
 * refusal.
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  [extension: string]: unknown;
}
