import { describe, expect, it } from 'vitest';
import { HttpStatusError } from './httpStatusError';
import { problemOf, requestFailureKind } from './requestFailure';

// SMA-448, lot F3, step L4 (R3-E1): a refusal and a failure, each its own
// word — and the action each calls for.

describe('requestFailureKind', () => {
  it('a 401 is a session that expired', () => {
    expect(requestFailureKind(new HttpStatusError('Request failed (401)', 401))).toBe('unauthorized');
  });

  it('a 403 is a right the account lacks — whether or not the server explained it', () => {
    expect(requestFailureKind(new HttpStatusError('Request failed (403)', 403))).toBe('forbidden');
    expect(
      requestFailureKind(new HttpStatusError('Request failed (403)', 403, { status: 403, code: 'formula.gardenLimit' }))
    ).toBe('forbidden');
  });

  it('anything else is a failure a retry may cure: a 5xx, a 409 without a problem, no server, a timeout', () => {
    expect(requestFailureKind(new HttpStatusError('Request failed (500)', 500))).toBe('failed');
    expect(requestFailureKind(new HttpStatusError('Request failed (409)', 409))).toBe('failed');
    expect(requestFailureKind(new TypeError('Failed to fetch'))).toBe('failed');
    expect(requestFailureKind(new DOMException('Timed out', 'TimeoutError'))).toBe('failed');
    expect(requestFailureKind(undefined)).toBe('failed');
  });
});

describe('problemOf', () => {
  it('hands back the problem a refusal carries, and nothing for any other error', () => {
    const problem = { status: 403, code: 'formula.gardenLimit', formula: 'novice', limit: 3, current: 3 };
    expect(problemOf(new HttpStatusError('Request failed (403)', 403, problem))).toEqual(problem);
    expect(problemOf(new HttpStatusError('Request failed (403)', 403))).toBeUndefined();
    expect(problemOf(new Error('boom'))).toBeUndefined();
  });
});
