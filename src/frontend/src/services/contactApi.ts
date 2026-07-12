import type { ContactReason } from '../constants/contactReasons';
import { HttpStatusError } from './httpStatusError';

const API_BASE = '/api';

// must exceed the backend SMTP cap (10s): never abort a request whose email already left the relay
const REQUEST_TIMEOUT_MS = 15_000;

export interface ContactPayload {
  name: string;
  email: string;
  reason: ContactReason;
  subject?: string;
  message: string;
}

/**
 * POST the contact-form payload to the SMA-30 backend. Public endpoint — no
 * credentials, matching the plantApi pattern. Non-OK responses throw
 * HttpStatusError so the page can map 429 to its rate-limited state; network
 * rejections (fetch TypeError, AbortError on timeout — both statusless)
 * propagate untouched for the offline state.
 */
export async function sendContactMessage(
  payload: ContactPayload
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new HttpStatusError('Contact message failed', res.status);
    }
  } finally {
    clearTimeout(timeout);
  }
}
