import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n/i18n';
import type { RequestFailureKind } from '../services/requestFailure';
import RequestFailureAlert from './RequestFailureAlert';

// SMA-457, PR #319, fix round 1 — S3: the one Alert the rename and the
// deletion of a garden share, pinned on its own — the two sentences every
// surface shares, the caller's own fallback, and the way back on a 401 alone.
// The dialogs' suites pin the same contract through the dialogs
// (RenameGardenDialog.test.tsx, DeleteGardenDialog.test.tsx — M3), unchanged
// by the extraction.

const FALLBACK = 'Nothing happened. Please try again.';

/** The Alert under a router: « Sign in again » navigates (`useReconnect`). */
function renderAlert(kind: RequestFailureKind) {
  render(
    <MemoryRouter initialEntries={['/gardens']}>
      <Routes>
        <Route path="/gardens" element={<RequestFailureAlert kind={kind} fallback={FALLBACK} />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByRole('alert');
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): the rule of every suite.
  cleanup();
});

describe('RequestFailureAlert — a request that did not go through, said for what it is (SMA-457, PR #319, fix round 1, S3)', () => {
  it('a session that expired — unauthorized — says so, « Sign in again » beside the words, never the fallback', () => {
    const alert = renderAlert('unauthorized');

    expect(alert).toHaveTextContent('Your session has expired. Sign in again to continue.');
    expect(alert).not.toHaveTextContent(FALLBACK);
    expect(within(alert).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('a right the account lacks — forbidden — says the right, and offers no button', () => {
    const alert = renderAlert('forbidden');

    expect(alert).toHaveTextContent('Your account is not allowed to do this.');
    expect(alert).not.toHaveTextContent(FALLBACK);
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('a failure a retry may cure — failed — says the caller’s own sentence, and offers no button', () => {
    const alert = renderAlert('failed');

    expect(alert).toHaveTextContent(FALLBACK);
    expect(alert).not.toHaveTextContent(/session|allowed/);
    expect(within(alert).queryByRole('button')).toBeNull();
  });
});
