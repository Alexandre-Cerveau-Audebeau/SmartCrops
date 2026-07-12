import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import i18next from '../i18n/i18n';
import en from '../i18n/en.json';
import fr from '../i18n/fr.json';
import { sendContactMessage } from '../services/contactApi';
import { HttpStatusError } from '../services/httpStatusError';
import Contact, { CONTACT_EMAIL, ContactServerError } from './Contact';

// House convention: page tests mock the service module, never fetch itself
// (the fetch layer has its own contactApi.test.ts).
vi.mock('../services/contactApi', () => ({
  sendContactMessage: vi.fn(),
}));

function renderContact() {
  return render(
    <MemoryRouter>
      <Contact />
    </MemoryRouter>
  );
}

/** Fills the four required fields (reason via the intent-card CTA). */
function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Alex' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'alex@example.com' },
  });
  // Card CTA pre-selects the Reason enum.
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }));
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Hello there' },
  });
}

// jsdom doesn't implement scrollIntoView; the card CTA scrolls to the form.
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe('Contact (SMA-36)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
    vi.mocked(sendContactMessage).mockReset();
  });

  it('renders the six intent cards (EN)', () => {
    renderContact();
    [
      'Plant data',
      'Technical support',
      'Partnerships',
      'SmartCrops API',
      'Personal data',
      'Other question',
    ].forEach((title) => {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });
    // SMA-157 R2: the contact card renders the address as a mailto link.
    const emailLink = screen.getByRole('link', {
      name: 'contact@smartcrops.fr',
    });
    expect(emailLink).toHaveAttribute('href', 'mailto:contact@smartcrops.fr');
  });

  it('renders in French', async () => {
    await i18next.changeLanguage('fr');
    renderContact();
    // findBy* retries until React flushes the language change (de-flakes R19).
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nous contacter' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Données botaniques' })
    ).toBeInTheDocument();
  });

  it('pre-selects the stable Reason enum when an intent card CTA is clicked', () => {
    renderContact();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }));
    expect(document.querySelector('input[name="reason"]')).toHaveValue(
      'plant-data'
    );
  });

  it('shows inline validation errors and does not reach success on invalid submit', () => {
    renderContact();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
    // Empty email is "required", not "invalid" (E5).
    expect(
      screen.getByText('Please enter your email address.')
    ).toBeInTheDocument();
    expect(screen.getByText('Please choose a reason.')).toBeInTheDocument();
    expect(screen.getByText('Please write a message.')).toBeInTheDocument();
    expect(screen.queryByText('Message sent!')).not.toBeInTheDocument();
    expect(vi.mocked(sendContactMessage)).not.toHaveBeenCalled();
  });

  it('distinguishes a malformed email as "invalid" (E5)', () => {
    renderContact();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(
      screen.getByText('Please enter a valid email address.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Please enter your email address.')
    ).not.toBeInTheDocument();
  });

  it('reaches the success state after a valid submit (POST mocked)', async () => {
    // Controllable promise: assert the in-flight state before resolving.
    let resolveSend!: () => void;
    vi.mocked(sendContactMessage).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        })
    );
    renderContact();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // Sending state: button disabled with the "Sending…" label.
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();

    await act(async () => {
      resolveSend();
    });

    expect(screen.getByText('Message sent!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(vi.mocked(sendContactMessage)).toHaveBeenCalledWith({
      name: 'Alex',
      email: 'alex@example.com',
      reason: 'plant-data',
      subject: undefined,
      message: 'Hello there',
    });
  });

  it('maps a 5xx failure to the server-error panel, and retry leads back to success', async () => {
    vi.mocked(sendContactMessage).mockRejectedValueOnce(
      new HttpStatusError('boom', 500)
    );
    renderContact();
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    expect(
      screen.getByText('Something went wrong on our side.')
    ).toBeInTheDocument();

    // Retry resets to idle; the next submit succeeds.
    vi.mocked(sendContactMessage).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      screen.queryByText('Something went wrong on our side.')
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });
    expect(screen.getByText('Message sent!')).toBeInTheDocument();
  });

  it('maps a 429 rejection to the rate-limited message (SMA-30)', async () => {
    vi.mocked(sendContactMessage).mockRejectedValueOnce(
      new HttpStatusError('too many', 429)
    );
    renderContact();
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    expect(
      screen.getByText(
        'Too many messages in a short time. Please try again in a few minutes.'
      )
    ).toBeInTheDocument();
  });

  it('maps a network rejection (no status) to the network-error message (SMA-30)', async () => {
    vi.mocked(sendContactMessage).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );
    renderContact();
    fillValidForm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    expect(
      screen.getByText(
        'The message could not be sent. Check your internet connection and try again.'
      )
    ).toBeInTheDocument();
  });

  it('renders the server-error panel with a working retry (direct render)', () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <ContactServerError onRetry={onRetry} />
      </MemoryRouter>
    );
    expect(
      screen.getByText('Something went wrong on our side.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('CONTACT_EMAIL parity (SMA-157)', () => {
  // Drift lock replacing the rejected i18n interpolation (SMA-278): the legal
  // and contact copy hard-code the published address, so any future edit that
  // introduces a different email in either locale must fail this test.
  it('every email in the legal + contact i18n copy equals CONTACT_EMAIL (FR + EN)', () => {
    const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const flatten = (node: unknown): string[] =>
      typeof node === 'string'
        ? [node]
        : node && typeof node === 'object'
          ? Object.values(node).flatMap(flatten)
          : [];
    for (const locale of [en, fr]) {
      const emails = [locale.legal, locale.contact]
        .flatMap(flatten)
        .flatMap((s) => s.match(EMAIL_RE) ?? []);
      expect(new Set(emails)).toEqual(new Set([CONTACT_EMAIL]));
    }
  });
});
