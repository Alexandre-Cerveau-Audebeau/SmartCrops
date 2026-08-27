import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout, register, RESET_RATE_LIMITED, resetPassword } from './authApi';

// contactApi.test.ts pattern: stub global fetch, restore after each test.
// First service-level coverage of authApi (SMA-323 R4): the page tests mock
// resetPassword wholesale, so the status-mapping branch — the backend/frontend
// contract itself — would otherwise never execute in any test.
function mockFetch(response: {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logout (SMA-341 R4)', () => {
  // The non-throwing contract IS the fix for the handleChangePassword
  // conflation: a component test mocking logout to reject would exercise the
  // mock, not this guarantee — the right level to pin it is the source.
  it('resolves and warns when the fetch itself rejects (network failure, timeout)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    try {
      await expect(logout()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('resolves and warns on a non-OK response', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch({ ok: false, status: 500 });
    try {
      await expect(logout()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith('Logout request failed:', 500);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('resetPassword (SMA-323)', () => {
  it('rejects with the RESET_RATE_LIMITED sentinel on a 429, before any body parsing', async () => {
    // No json() on the mock on purpose: the 429 branch must answer from the
    // status alone — reading the body here would throw and fail the test.
    mockFetch({ ok: false, status: 429 });

    await expect(
      resetPassword('user-1', 'token-1', 'N3w!Passw0rd')
    ).rejects.toMatchObject({ message: RESET_RATE_LIMITED });
  });

  it('joins the IdentityError[] descriptions of a 400 into the rejection message', async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => [
        {
          code: 'PasswordRequiresUpper',
          description: "Passwords must have at least one uppercase ('A'-'Z').",
        },
        {
          code: 'PasswordRequiresDigit',
          description: "Passwords must have at least one digit ('0'-'9').",
        },
      ],
    });

    await expect(
      resetPassword('user-1', 'token-1', 'weakpassword')
    ).rejects.toMatchObject({
      message:
        "Passwords must have at least one uppercase ('A'-'Z')., Passwords must have at least one digit ('0'-'9').",
    });
  });
});

describe('register (SMA-350)', () => {
  // The API has always answered a failed CreateAsync with the IdentityError[]
  // — code AND description — but the client read only the descriptions, so
  // the page could never say WHICH rule was missing. The codes are the
  // machine-readable half and the only thing translatable client-side (the
  // backend has no localization), so they are what the rejection must carry.
  it('rejects with an error exposing the CODES of a 400 IdentityError array', async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => [
        {
          code: 'PasswordRequiresUpper',
          description: "Passwords must have at least one uppercase ('A'-'Z').",
        },
        {
          code: 'PasswordRequiresDigit',
          description: "Passwords must have at least one digit ('0'-'9').",
        },
      ],
    });

    await expect(register('alex@example.com', 'weakpassword')).rejects.toMatchObject({
      name: 'RegisterFailedError',
      codes: ['PasswordRequiresUpper', 'PasswordRequiresDigit'],
      message:
        "Passwords must have at least one uppercase ('A'-'Z')., Passwords must have at least one digit ('0'-'9').",
    });
  });

  // The [MinLength(6)] DTO guard fires BEFORE CreateAsync and answers
  // ValidationProblemDetails — an object, not an array. No Identity code
  // exists to translate, so the caller must get an empty list and fall back
  // to the generic message rather than an undefined it would have to guard.
  it('rejects with an empty code list when the 400 body is not an array', async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({ errors: { Password: ['The field is too short.'] } }),
    });

    await expect(register('alex@example.com', 'ab')).rejects.toMatchObject({
      name: 'RegisterFailedError',
      codes: [],
      message: 'Registration failed',
    });
  });
});
