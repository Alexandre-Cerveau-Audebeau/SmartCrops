/**
 * Error carrying the HTTP status of a non-OK response (SMA-30). Shared so
 * callers narrow with `instanceof` instead of duck-typing a `status` field.
 * gardenApi's local throwWithStatus migrates here in a follow-up (deferred,
 * logged on SMA-30).
 */
export class HttpStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}
