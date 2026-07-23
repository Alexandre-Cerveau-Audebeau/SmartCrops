import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import ConfirmEmail from './ConfirmEmail';
import { confirmEmail } from '../services/authApi';

vi.mock('../services/authApi', () => ({
  confirmEmail: vi.fn(),
}));

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/confirm-email${search}`]}>
      <Routes>
        <Route path="/confirm-email" element={<ConfirmEmail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConfirmEmail (SMA-31)', () => {
  beforeEach(async () => {
    vi.mocked(confirmEmail).mockReset();
    await i18next.changeLanguage('en');
  });

  it('shows the processing state while the request is in flight', () => {
    // Never resolves — pins the component in its initial state.
    vi.mocked(confirmEmail).mockReturnValue(new Promise(() => {}));

    renderAt('?userId=abc&token=xyz');

    expect(
      screen.getByText('Confirming your email address...')
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows the success state and an onward link to the library', async () => {
    vi.mocked(confirmEmail).mockResolvedValue(undefined);

    renderAt('?userId=abc&token=xyz');

    expect(
      await screen.findByText('Your email address is confirmed. Thank you!')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse the Library' })
    ).toHaveAttribute('href', '/library');
    expect(vi.mocked(confirmEmail)).toHaveBeenCalledWith('abc', 'xyz');
  });

  it('shows the failure state and a link back to login when the API rejects', async () => {
    vi.mocked(confirmEmail).mockRejectedValue(new Error('nope'));

    renderAt('?userId=abc&token=xyz');

    expect(
      await screen.findByText(
        'This confirmation link is invalid or has expired.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute(
      'href',
      '/login'
    );
  });

  it('fails without calling the API when the query string is incomplete', async () => {
    renderAt('?userId=abc');

    expect(
      await screen.findByText(
        'This confirmation link is invalid or has expired.'
      )
    ).toBeInTheDocument();
    expect(vi.mocked(confirmEmail)).not.toHaveBeenCalled();
  });

  it('renders the localized failure copy in French', async () => {
    await i18next.changeLanguage('fr');
    vi.mocked(confirmEmail).mockRejectedValue(new Error('nope'));

    renderAt('?userId=abc&token=xyz');

    expect(
      await screen.findByText(
        'Ce lien de confirmation est invalide ou a expiré.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Retour à la connexion' })
    ).toHaveAttribute('href', '/login');
  });

  it('exchanges the token only once even if the component re-renders', async () => {
    vi.mocked(confirmEmail).mockResolvedValue(undefined);

    const { rerender } = renderAt('?userId=abc&token=xyz');
    rerender(
      <MemoryRouter initialEntries={['/confirm-email?userId=abc&token=xyz']}>
        <Routes>
          <Route path="/confirm-email" element={<ConfirmEmail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(vi.mocked(confirmEmail)).toHaveBeenCalledTimes(1));
  });
});
