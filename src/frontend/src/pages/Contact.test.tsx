import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import i18next from '../i18n/i18n';
import Contact, { ContactServerError } from './Contact';

function renderContact() {
  return render(
    <MemoryRouter>
      <Contact />
    </MemoryRouter>
  );
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
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('reaches the success state after a valid submit (simulated send)', () => {
    vi.useFakeTimers();
    renderContact();
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
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // Sending state: button disabled with the "Sending…" label.
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText('Message sent!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('renders the server-error panel with a working retry (SMA-30 harness)', () => {
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
