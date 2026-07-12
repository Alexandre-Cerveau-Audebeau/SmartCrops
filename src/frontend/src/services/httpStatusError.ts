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

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}
