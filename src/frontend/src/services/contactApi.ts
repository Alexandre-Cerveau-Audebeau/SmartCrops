import type { ContactReason } from '../constants/contactReasons';

const API_BASE = '/api';

export interface ContactPayload {
  name: string;
  email: string;
  reason: ContactReason;
  subject?: string;
  message: string;
}

function throwWithStatus(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

/**
 * POST the contact-form payload to the SMA-30 backend. Public endpoint — no
 * credentials, matching the plantApi pattern. Non-OK responses throw an Error
 * carrying the HTTP status (gardenApi throwWithStatus pattern) so the page
 * can map 429 to its rate-limited state; network rejections (fetch TypeError,
 * no status) propagate untouched for the offline state.
 */
export async function sendContactMessage(
  payload: ContactPayload
): Promise<void> {
  const res = await fetch(`${API_BASE}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throwWithStatus('Contact message failed', res.status);
  }
}
