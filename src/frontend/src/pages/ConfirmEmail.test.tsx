import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
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
    // The outcome must land inside the polite live region so assistive tech
    // announces the processing → success transition (SMA-31 R2).
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your email address is confirmed. Thank you!'
    );
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

  it('re-arms and exchanges again when a new link pair arrives (resend)', async () => {
    vi.mocked(confirmEmail)
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(new Promise<void>(() => {}));

    // Real navigation to a second link: the guard is keyed on the pair, so a
    // NEW token in the same SPA session must trigger a second exchange.
    function GoSecond() {
      const navigate = useNavigate();
      return (
        <button
          onClick={() =>
            navigate('/confirm-email?userId=abc&token=second-token')
          }
        >
          go-second
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={['/confirm-email?userId=abc&token=first-token']}>
        <GoSecond />
        <Routes>
          <Route path="/confirm-email" element={<ConfirmEmail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Your email address is confirmed. Thank you!')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-second' }));

    expect(
      await screen.findByText('Confirming your email address...')
    ).toBeInTheDocument();
    expect(vi.mocked(confirmEmail)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(confirmEmail)).toHaveBeenNthCalledWith(
      1,
      'abc',
      'first-token'
    );
    expect(vi.mocked(confirmEmail)).toHaveBeenNthCalledWith(
      2,
      'abc',
      'second-token'
    );
  });

  it('a late completion cannot overwrite a truncated link’s error state', async () => {
    // R3 regression (GitHub d3e31fc9): the first exchange is still in flight
    // when the user navigates to a TRUNCATED link. Settling it afterwards must
    // not flip the error screen to success.
    let resolveFirst!: () => void;
    vi.mocked(confirmEmail).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      })
    );

    function GoTruncated() {
      const navigate = useNavigate();
      return (
        <button onClick={() => navigate('/confirm-email?userId=abc')}>
          go-truncated
        </button>
      );
    }
    render(
      <MemoryRouter
        initialEntries={['/confirm-email?userId=abc&token=first-token']}
      >
        <GoTruncated />
        <Routes>
          <Route path="/confirm-email" element={<ConfirmEmail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByText('Confirming your email address...')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-truncated' }));
    expect(
      await screen.findByText(
        'This confirmation link is invalid or has expired.'
      )
    ).toBeInTheDocument();

    await act(async () => {
      resolveFirst();
    });

    expect(
      screen.getByText('This confirmation link is invalid or has expired.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Your email address is confirmed. Thank you!')
    ).not.toBeInTheDocument();
    expect(vi.mocked(confirmEmail)).toHaveBeenCalledTimes(1);
  });
});
