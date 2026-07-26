import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../i18n/i18n';
import ConfirmEmail from './ConfirmEmail';

// Deliberately NO vi.mock of ../services/authApi here (unlike ConfirmEmail.test.tsx):
// this file exercises the REAL confirmEmail through a stubbed global fetch, so the
// 10 s AbortController in authApi.ts is what turns a dead request into a rejection.

describe('ConfirmEmail timeout (SMA-31 R2)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
    // A fetch that never settles on its own but honours the abort signal —
    // mirroring a hung backend behind a working socket.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reaches the error state when the request never settles', async () => {
    render(
      <MemoryRouter initialEntries={['/confirm-email?userId=abc&token=xyz']}>
        <Routes>
          <Route path="/confirm-email" element={<ConfirmEmail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByText('Confirming your email address...')
    ).toBeInTheDocument();

    // Advance past authApi's 10 s abort: the spinner has no button, so this
    // rejection is the user's ONLY route to the error state and its login link.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(
      screen.getByText('This confirmation link is invalid or has expired.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute(
      'href',
      '/login'
    );
  });
});
