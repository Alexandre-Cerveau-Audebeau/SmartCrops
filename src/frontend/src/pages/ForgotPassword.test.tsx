import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import ForgotPassword from './ForgotPassword';
import { forgotPassword } from '../services/authApi';

vi.mock('../services/authApi', () => ({
  forgotPassword: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  );
}

function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByLabelText(/Email/), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
}

describe('ForgotPassword (SMA-323)', () => {
  beforeEach(async () => {
    vi.mocked(forgotPassword).mockReset();
    await i18next.changeLanguage('en');
  });

  it('renders the request form', () => {
    renderPage();

    expect(
      screen.getByRole('form', { name: 'Reset your password' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter your email address and we will send you a reset link.')
    ).toBeInTheDocument();
  });

  it('disables the submit button while the request is in flight', () => {
    vi.mocked(forgotPassword).mockReturnValue(new Promise(() => {}));
    renderPage();

    fillAndSubmit('alex@example.com');

    const button = screen.getByRole('button', { name: 'Send reset link' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the neutral confirmation on success', async () => {
    vi.mocked(forgotPassword).mockResolvedValue(undefined);
    renderPage();

    fillAndSubmit('alex@example.com');

    expect(
      await screen.findByText(
        'If an account exists for this address, a reset link has been sent. Check your inbox.'
      )
    ).toBeInTheDocument();
    expect(vi.mocked(forgotPassword)).toHaveBeenCalledWith('alex@example.com');
    // The form is gone — nothing left to probe with.
    expect(
      screen.queryByRole('button', { name: 'Send reset link' })
    ).not.toBeInTheDocument();
  });

  it('shows the SAME neutral confirmation when the request fails', async () => {
    // The endpoint never discloses whether the address exists; neither may the
    // UI — an error outcome must be indistinguishable from success.
    vi.mocked(forgotPassword).mockRejectedValue(new Error('boom'));
    renderPage();

    fillAndSubmit('alex@example.com');

    expect(
      await screen.findByText(
        'If an account exists for this address, a reset link has been sent. Check your inbox.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('renders the localized confirmation in French', async () => {
    await i18next.changeLanguage('fr');
    vi.mocked(forgotPassword).mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText(/E-mail/), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    expect(
      await screen.findByText(
        'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé. Consultez votre boîte de réception.'
      )
    ).toBeInTheDocument();
  });
});
