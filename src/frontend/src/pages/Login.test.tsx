import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import Login from './Login';
import { EMAIL_NOT_CONFIRMED, resendConfirmation } from '../services/authApi';

const { mockLogin } = vi.hoisted(() => ({ mockLogin: vi.fn() }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// The sentinel must stay the REAL exported value: Login compares err.message
// against it, so a drifted mock would green-light a broken comparison.
vi.mock('../services/authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/authApi')>()),
  resendConfirmation: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByLabelText(/Email/), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: 'Str0ng!Pass' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

describe('Login — unconfirmed-account branch (SMA-320)', () => {
  beforeEach(async () => {
    mockLogin.mockReset();
    vi.mocked(resendConfirmation).mockReset();
    await i18next.changeLanguage('en');
  });

  it('shows the generic error on ordinary failures', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid email or password'));
    renderPage();

    fillAndSubmit('alex@example.com');

    expect(
      await screen.findByText('Invalid email or password.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Resend the confirmation email' })
    ).not.toBeInTheDocument();
  });

  it('shows the dedicated message and the resend action on the gate sentinel', async () => {
    mockLogin.mockRejectedValue(new Error(EMAIL_NOT_CONFIRMED));
    renderPage();

    fillAndSubmit('alex@example.com');

    expect(
      await screen.findByText(
        'Your email address has not been confirmed yet. Check your inbox for the confirmation link.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resend the confirmation email' })
    ).toBeInTheDocument();
    // The generic error must NOT double up under the dedicated branch.
    expect(
      screen.queryByText('Invalid email or password.')
    ).not.toBeInTheDocument();
  });

  it('fires the resend with the typed email and shows the generic success notice', async () => {
    mockLogin.mockRejectedValue(new Error(EMAIL_NOT_CONFIRMED));
    vi.mocked(resendConfirmation).mockResolvedValue(undefined);
    renderPage();

    fillAndSubmit('alex@example.com');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resend the confirmation email' })
    );

    expect(
      await screen.findByText(
        'If an account exists and is unconfirmed, a confirmation email has been sent. Check your inbox.'
      )
    ).toBeInTheDocument();
    expect(vi.mocked(resendConfirmation)).toHaveBeenCalledWith('alex@example.com');
    // The action is gone — one resend per login attempt.
    expect(
      screen.queryByRole('button', { name: 'Resend the confirmation email' })
    ).not.toBeInTheDocument();
  });

  it('shows the SAME neutral notice when the resend fails', async () => {
    // The endpoint never discloses whether the address exists; neither may the
    // UI — an error outcome must be indistinguishable from success.
    mockLogin.mockRejectedValue(new Error(EMAIL_NOT_CONFIRMED));
    vi.mocked(resendConfirmation).mockRejectedValue(new Error('boom'));
    renderPage();

    fillAndSubmit('alex@example.com');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resend the confirmation email' })
    );

    expect(
      await screen.findByText(
        'If an account exists and is unconfirmed, a confirmation email has been sent. Check your inbox.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('renders the dedicated branch in French', async () => {
    await i18next.changeLanguage('fr');
    mockLogin.mockRejectedValue(new Error(EMAIL_NOT_CONFIRMED));
    renderPage();

    fireEvent.change(screen.getByLabelText(/E-mail/), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Mot de passe/), {
      target: { value: 'Str0ng!Pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(
      await screen.findByText(
        'Votre adresse e-mail n\'a pas encore été confirmée. Consultez votre boîte de réception pour retrouver le lien de confirmation.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Renvoyer l\'e-mail de confirmation' })
    ).toBeInTheDocument();
  });
});

describe('Login — official Google mark on the OAuth button (SMA-57)', () => {
  beforeEach(async () => {
    mockLogin.mockReset();
    await i18next.changeLanguage('en');
  });

  // The mark is decorative (empty alt), so it is invisible to role and name
  // queries by design — it is reached through the button that owns it.
  it('leads the Google button with the official G asset', () => {
    renderPage();

    const googleButton = screen.getByRole('button', {
      name: 'Sign in with Google',
    });

    expect(googleButton.querySelector('img')).toHaveAttribute(
      'src',
      '/google-g.svg'
    );
  });
});
