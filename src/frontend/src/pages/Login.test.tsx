import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

/** Mounts the sign-in page at the given address, as the router does after a redirect. */
function renderPageAt(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <Login />
    </MemoryRouter>
  );
}

/** The text of every alert on the page, in document order. */
function alertTexts() {
  return screen.queryAllByRole('alert').map((alert) => alert.textContent);
}

/** Types an address and a password into the form, without sending it. */
function typeCredentials(email: string) {
  fireEvent.change(screen.getByLabelText(/Email/), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: 'Str0ng!Pass' },
  });
}

/** Sends the form, as a click on its button does. */
function sendForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

/** The tag name of every element rendered under the given root, in document order. */
function elementNames(root: Element) {
  return Array.from(root.querySelectorAll('*'), (element) => element.tagName);
}

/** Shows the query string the router holds: what the address still carries. */
function AddressProbe() {
  const { search } = useLocation();
  return <output data-testid="address-query">{search}</output>;
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

  it('translates the generic error again when the language changes', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid email or password'));
    renderPage();

    fillAndSubmit('alex@example.com');
    expect(
      await screen.findByText('Invalid email or password.')
    ).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('fr');
    });

    expect(alertTexts()).toEqual(['E-mail ou mot de passe invalide.']);
  });

  it('clears the generic error as soon as the form is sent again', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));
    renderPage();

    fillAndSubmit('alex@example.com');
    expect(
      await screen.findByText('Invalid email or password.')
    ).toBeInTheDocument();

    // The second attempt is sent and never answered: what is read is the submit.
    mockLogin.mockReturnValue(new Promise<void>(() => {}));
    sendForm();

    expect(alertTexts()).toEqual([]);
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

// A failed Google sign-in comes back as /login?error=<code>: the server sends
// google-failed, no-email, create-failed and link-failed; AuthCallback sends
// no-code, invalid-code, or the code it received, as is.
describe('Login — a failed Google sign-in says so (SMA-371)', () => {
  /**
   * The English text of auth.callbackError: what any code without a text of
   * its own gets.
   */
  const GENERIC_MESSAGE = 'Authentication failed. Please try again.';

  beforeEach(async () => {
    mockLogin.mockReset();
    await i18next.changeLanguage('en');
  });

  it('shows one alert that says the Google sign-in failed', () => {
    renderPageAt('/login?error=google-failed');

    expect(alertTexts()).toEqual(['Google sign-in failed.']);
  });

  it.each([
    ['no-email', 'No email received from Google.'],
    ['create-failed', 'Account creation failed.'],
    ['link-failed', 'Failed to link Google account.'],
  ])('gives the code %s its own message', (code, message) => {
    renderPageAt(`/login?error=${code}`);

    expect(alertTexts()).toEqual([message]);
  });

  it.each(['no-code', 'invalid-code', 'not-a-known-code'])(
    'answers the code %s with the generic message',
    (code) => {
      renderPageAt(`/login?error=${code}`);

      expect(alertTexts()).toEqual([GENERIC_MESSAGE]);
    }
  );

  // The value is typed by whoever writes the address: it selects a message, is
  // never shown, and is never used as an i18n key. The three words are keys
  // every plain object inherits; the last two rows name another text of the
  // catalogue, by its whole key and by its last part.
  it.each([
    ['an image tag', '<img src=x onerror=alert(1)>'],
    ['an inherited key', 'constructor'],
    ['the prototype key', '__proto__'],
    ['an inherited method', 'toString'],
    ['the key of another text', 'auth.registerSuccessNotice'],
    ['the name of another text', 'registerSuccessNotice'],
  ])(
    'answers %s with the generic message and renders the value nowhere',
    (_what, value) => {
      // The page as it stands for a code it does not know: the reference.
      const reference = renderPageAt('/login?error=not-a-known-code');
      const elementsOfThePage = elementNames(reference.container);
      reference.unmount();

      const { container } = renderPageAt(
        `/login?error=${encodeURIComponent(value)}`
      );

      expect(alertTexts()).toEqual([GENERIC_MESSAGE]);
      // Nowhere as text, nowhere in an attribute, and no element born from
      // it: the page has the very elements it has for any unknown code.
      expect(document.documentElement.textContent).not.toContain(value);
      expect(
        Array.from(document.querySelectorAll('*'))
          .flatMap((element) =>
            Array.from(element.attributes, (attribute) => attribute.value)
          )
          .filter((attributeValue) => attributeValue.includes(value))
      ).toEqual([]);
      expect(elementNames(container)).toEqual(elementsOfThePage);
    }
  );

  it.each([
    ['no error parameter', '/login'],
    ['an empty error parameter', '/login?error='],
  ])('shows no alert with %s', (_what, address) => {
    renderPageAt(address);

    expect(alertTexts()).toEqual([]);
  });

  it('says it in French', async () => {
    await i18next.changeLanguage('fr');
    renderPageAt('/login?error=google-failed');

    expect(alertTexts()).toEqual(['La connexion Google a échoué.']);
  });

  it('follows a change of language while it is shown', async () => {
    renderPageAt('/login?error=google-failed');
    expect(alertTexts()).toEqual(['Google sign-in failed.']);

    await act(async () => {
      await i18next.changeLanguage('fr');
    });

    expect(alertTexts()).toEqual(['La connexion Google a échoué.']);
  });

  it('leaves when the form is sent, and the ordinary error takes its place when the sign-in fails', async () => {
    let rejectLogin: (reason: Error) => void = () => {};
    mockLogin.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectLogin = reject;
      })
    );
    renderPageAt('/login?error=google-failed');
    expect(alertTexts()).toEqual(['Google sign-in failed.']);

    typeCredentials('alex@example.com');
    // Typing does not dismiss it: only sending the form does.
    expect(alertTexts()).toEqual(['Google sign-in failed.']);

    sendForm();
    // Sent, not answered yet: the message left with the submit.
    expect(alertTexts()).toEqual([]);

    rejectLogin(new Error('Invalid email or password'));

    expect(
      await screen.findByText('Invalid email or password.')
    ).toBeInTheDocument();
    expect(alertTexts()).toEqual(['Invalid email or password.']);
  });

  it('gives way to the unconfirmed-account warning on the gate sentinel', async () => {
    mockLogin.mockRejectedValue(new Error(EMAIL_NOT_CONFIRMED));
    renderPageAt('/login?error=google-failed');
    expect(alertTexts()).toEqual(['Google sign-in failed.']);

    typeCredentials('alex@example.com');
    expect(alertTexts()).toEqual(['Google sign-in failed.']);

    sendForm();

    expect(
      await screen.findByText(
        'Your email address has not been confirmed yet. Check your inbox for the confirmation link.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Google sign-in failed.')
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  // The address is not rewritten (a choice of SMA-371): the parameter stays,
  // so reloading the page shows the message again.
  it('leaves the address as it came, before and after the form is sent', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid email or password'));
    render(
      <MemoryRouter initialEntries={['/login?error=google-failed']}>
        <Login />
        <AddressProbe />
      </MemoryRouter>
    );
    expect(screen.getByTestId('address-query').textContent).toBe(
      '?error=google-failed'
    );

    typeCredentials('alex@example.com');
    sendForm();

    expect(
      await screen.findByText('Invalid email or password.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('address-query').textContent).toBe(
      '?error=google-failed'
    );
  });
});
