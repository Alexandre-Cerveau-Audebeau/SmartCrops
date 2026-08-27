import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import { RegisterFailedError } from '../services/authApi';
import Register from './Register';

const { mockRegister } = vi.hoisted(() => ({ mockRegister: vi.fn() }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ register: mockRegister }),
}));

describe('Register — no session after registration (SMA-320 R1)', () => {
  beforeEach(async () => {
    mockRegister.mockReset();
    await i18next.changeLanguage('en');
  });

  it('shows the confirmation notice on success instead of navigating into the app', async () => {
    mockRegister.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'Str0ng!Pass' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password/), {
      target: { value: 'Str0ng!Pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(
      await screen.findByText(
        'Your account has been created. Check your inbox to confirm your email address, then sign in.'
      )
    ).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledWith('alex@example.com', 'Str0ng!Pass');
    // The form is gone and the page routes the user toward Login — no
    // authenticated navigation happened (the notice replaced the form).
    expect(
      screen.queryByRole('button', { name: 'Create Account' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute(
      'href',
      '/login'
    );
  });
});

describe('Register — says WHICH rule failed (SMA-350)', () => {
  beforeEach(async () => {
    mockRegister.mockReset();
    // French is the default for new visitors since SMA-393, and these
    // messages are the whole point of the lot — they are asserted in the
    // language the owner's users actually read.
    await i18next.changeLanguage('fr');
  });

  /** Renders the page and submits a filled, self-consistent form so the server answer is what fails. */
  async function submitRegistration() {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^E-mail/), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), {
      target: { value: 'weakpassword' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe/), {
      target: { value: 'weakpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }));
  }

  it('lists the missing criteria when the 400 carries password rule codes', async () => {
    mockRegister.mockRejectedValue(
      new RegisterFailedError('Passwords must have at least one digit.', [
        'PasswordRequiresDigit',
        'PasswordRequiresUpper',
      ])
    );

    await submitRegistration();

    expect(
      await screen.findByText('Votre mot de passe doit contenir :')
    ).toBeInTheDocument();
    expect(screen.getByText('au moins un chiffre')).toBeInTheDocument();
    expect(screen.getByText('au moins une majuscule')).toBeInTheDocument();
    // The server's English prose never reaches the user.
    expect(
      screen.queryByText(/Passwords must have at least one digit/)
    ).not.toBeInTheDocument();
  });

  it('shows the already-registered message on DuplicateUserName', async () => {
    mockRegister.mockRejectedValue(
      new RegisterFailedError("Username 'alex@example.com' is already taken.", [
        'DuplicateUserName',
      ])
    );

    await submitRegistration();

    expect(
      await screen.findByText(
        'Cette adresse e-mail est déjà utilisée. Connectez-vous, ou réinitialisez votre mot de passe.'
      )
    ).toBeInTheDocument();
  });

  it('falls back to the generic message when no code is recognised', async () => {
    mockRegister.mockRejectedValue(
      new RegisterFailedError('Something else went wrong.', ['SomeFutureCode'])
    );

    await submitRegistration();

    expect(
      await screen.findByText("L'inscription a échoué. Veuillez réessayer.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Votre mot de passe doit contenir :')
    ).not.toBeInTheDocument();
  });
});
