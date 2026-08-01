import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout, RESET_RATE_LIMITED, resetPassword } from './authApi';

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
