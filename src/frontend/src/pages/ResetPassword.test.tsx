import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import ResetPassword from './ResetPassword';
import {
  RESET_FAILED,
  RESET_RATE_LIMITED,
  resetPassword,
  validateResetToken,
} from '../services/authApi';

// Only the functions are stubbed; the sentinel constants stay the REAL exported
// values (R2), so these tests break if the module and the page ever drift.
vi.mock('../services/authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/authApi')>()),
  resetPassword: vi.fn(),
  validateResetToken: vi.fn(),
}));

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </MemoryRouter>
  );
}

// The form only appears once the on-mount validation settles (R1-bis).
async function awaitForm() {
  await screen.findByLabelText(/^New Password/);
}

function fillAndSubmit(newPassword: string, confirm: string) {
  // Anchored: an unanchored /New Password/ also matches "Confirm New Password".
  fireEvent.change(screen.getByLabelText(/^New Password/), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText(/^Confirm New Password/), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

describe('ResetPassword (SMA-323)', () => {
  beforeEach(async () => {
    vi.mocked(resetPassword).mockReset();
    vi.mocked(validateResetToken).mockReset();
    // Default: a live link — individual tests override for dead/undecided links.
    vi.mocked(validateResetToken).mockResolvedValue('valid');
    await i18next.changeLanguage('en');
  });

  it('renders the invalid-link state without calling any API when the token is missing', () => {
    renderAt('?userId=abc');

    expect(
      screen.getByText('This reset link is invalid or incomplete.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByLabelText(/^New Password/)).not.toBeInTheDocument();
    expect(vi.mocked(validateResetToken)).not.toHaveBeenCalled();
    expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
  });

  it('shows the validating state with no password fields while the check is in flight', () => {
    vi.mocked(validateResetToken).mockReturnValue(new Promise(() => {}));

    renderAt('?userId=abc&token=xyz');

    expect(
      screen.getByText('Checking your reset link...')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^New Password/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset password' })
    ).not.toBeInTheDocument();
  });

  it('renders the form when the link validates', async () => {
    renderAt('?userId=abc&token=xyz');

    await awaitForm();

    expect(vi.mocked(validateResetToken)).toHaveBeenCalledWith('abc', 'xyz');
    expect(screen.getByLabelText(/^Confirm New Password/)).toBeInTheDocument();
  });

  it('renders the invalid-link state with no fields when validation answers 400', async () => {
    vi.mocked(validateResetToken).mockResolvedValue('invalid');

    renderAt('?userId=abc&token=xyz');

    expect(
      await screen.findByText('This reset link is invalid or incomplete.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^New Password/)).not.toBeInTheDocument();
    expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
  });

  it('falls through to the form when validation fails on network or timeout', async () => {
    // A connectivity blip is NOT a dead link: only a positive 400 may hide the
    // fields — the submit path stays the authority.
    vi.mocked(validateResetToken).mockRejectedValue(new Error('Network down'));

    renderAt('?userId=abc&token=xyz');

    await awaitForm();

    expect(
      screen.queryByText('This reset link is invalid or incomplete.')
    ).not.toBeInTheDocument();
  });

  it('handles a consumed link end to end: validating, then invalid, never a field', async () => {
    let settle!: (verdict: 'valid' | 'invalid') => void;
    vi.mocked(validateResetToken).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );

    renderAt('?userId=abc&token=consumed-token');

    expect(
      screen.getByText('Checking your reset link...')
    ).toBeInTheDocument();

    settle('invalid');

    expect(
      await screen.findByText('This reset link is invalid or incomplete.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByLabelText(/^New Password/)).not.toBeInTheDocument();
    expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
  });

  it('states the actual password rules under the password field', async () => {
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    expect(
      screen.getByText(
        'At least 6 characters, including a digit, a lowercase letter, an uppercase letter and a special character.'
      )
    ).toBeInTheDocument();
  });

  it('rejects mismatched passwords client-side without calling the API', async () => {
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    fillAndSubmit('N3w!Passw0rd', 'Different!1');

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in flight', async () => {
    vi.mocked(resetPassword).mockReturnValue(new Promise(() => {}));
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    fillAndSubmit('N3w!Passw0rd', 'N3w!Passw0rd');

    const button = screen.getByRole('button', { name: 'Reset password' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the success state with a link to login', async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    fillAndSubmit('N3w!Passw0rd', 'N3w!Passw0rd');

    expect(
      await screen.findByText(
        'Your password has been reset. You can now sign in.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(vi.mocked(resetPassword)).toHaveBeenCalledWith(
      'abc',
      'xyz',
      'N3w!Passw0rd'
    );
  });

  it("surfaces the server's own error descriptions on a refused password", async () => {
    // authApi joins Identity's descriptions into the Error message; the page
    // must show that text, not a generic string.
    vi.mocked(resetPassword).mockRejectedValue(
      new Error(
        "Passwords must have at least one uppercase ('A'-'Z')., Passwords must have at least one digit ('0'-'9')."
      )
    );
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    fillAndSubmit('weakpassword', 'weakpassword');

    expect(
      await screen.findByText(
        "Passwords must have at least one uppercase ('A'-'Z')., Passwords must have at least one digit ('0'-'9')."
      )
    ).toBeInTheDocument();
  });

  it('falls back to the generic message when no description is available', async () => {
    vi.mocked(resetPassword).mockRejectedValue(new Error(RESET_FAILED));
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    fillAndSubmit('N3w!Passw0rd', 'N3w!Passw0rd');

    expect(
      await screen.findByText(
        'Password reset failed. The link may be invalid or expired.'
      )
    ).toBeInTheDocument();
  });

  it('falls back to the generic message when the request times out (non-Error rejection)', async () => {
    // FIX F (R2): the component special-cases non-plain-Error rejections in its
    // classification comment — a DOMException named TimeoutError must land on
    // the generic message, never be shown verbatim.
    vi.mocked(resetPassword).mockRejectedValue(
      new DOMException('The operation timed out', 'TimeoutError')
    );
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    fillAndSubmit('N3w!Passw0rd', 'N3w!Passw0rd');

    expect(
      await screen.findByText(
        'Password reset failed. The link may be invalid or expired.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('The operation timed out')
    ).not.toBeInTheDocument();
  });

  it('shows the rate-limit message when the reset is throttled, not the invalid-link one', async () => {
    // FIX B (R2): a 429 — reachable now that reset-password sits behind the
    // passwordReset policy — must read as "try again later", never as a dead
    // link and never as the generic failure.
    vi.mocked(resetPassword).mockRejectedValue(new Error(RESET_RATE_LIMITED));
    renderAt('?userId=abc&token=xyz');
    await awaitForm();

    fillAndSubmit('N3w!Passw0rd', 'N3w!Passw0rd');

    expect(
      await screen.findByText(
        'Too many attempts. Please wait a moment and try again.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This reset link is invalid or incomplete.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Password reset failed. The link may be invalid or expired.'
      )
    ).not.toBeInTheDocument();
    // The form stays: a throttled user retries in place.
    expect(screen.getByLabelText(/^New Password/)).toBeInTheDocument();
  });
});
