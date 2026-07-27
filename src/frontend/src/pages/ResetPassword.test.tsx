import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import ResetPassword from './ResetPassword';
import { resetPassword } from '../services/authApi';

vi.mock('../services/authApi', () => ({
  resetPassword: vi.fn(),
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
    await i18next.changeLanguage('en');
  });

  it('renders the invalid-link state without calling the API when the token is missing', () => {
    renderAt('?userId=abc');

    expect(
      screen.getByText('This reset link is invalid or incomplete.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByLabelText(/^New Password/)).not.toBeInTheDocument();
    expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
  });

  it('states the actual password rules under the password field', () => {
    renderAt('?userId=abc&token=xyz');

    expect(
      screen.getByText(
        'At least 6 characters, including a digit, a lowercase letter, an uppercase letter and a special character.'
      )
    ).toBeInTheDocument();
  });

  it('rejects mismatched passwords client-side without calling the API', () => {
    renderAt('?userId=abc&token=xyz');

    fillAndSubmit('N3w!Passw0rd', 'Different!1');

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in flight', () => {
    vi.mocked(resetPassword).mockReturnValue(new Promise(() => {}));
    renderAt('?userId=abc&token=xyz');

    fillAndSubmit('N3w!Passw0rd', 'N3w!Passw0rd');

    const button = screen.getByRole('button', { name: 'Reset password' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the success state with a link to login', async () => {
    vi.mocked(resetPassword).mockResolvedValue(undefined);
    renderAt('?userId=abc&token=xyz');

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

    fillAndSubmit('weakpassword', 'weakpassword');

    expect(
      await screen.findByText(
        "Passwords must have at least one uppercase ('A'-'Z')., Passwords must have at least one digit ('0'-'9')."
      )
    ).toBeInTheDocument();
  });

  it('falls back to the generic message when no description is available', async () => {
    vi.mocked(resetPassword).mockRejectedValue(new Error('RESET_FAILED'));
    renderAt('?userId=abc&token=xyz');

    fillAndSubmit('N3w!Passw0rd', 'N3w!Passw0rd');

    expect(
      await screen.findByText(
        'Password reset failed. The link may be invalid or expired.'
      )
    ).toBeInTheDocument();
  });
});
