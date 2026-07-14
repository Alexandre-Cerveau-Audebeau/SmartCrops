import type { ContactReason } from '../constants/contactReasons';
import { fetchJson } from './fetchJson';

const API_BASE = '/api';

export interface ContactPayload {
  name: string;
  email: string;
  reason: ContactReason;
  subject?: string;
  message: string;
}

/**
 * POST the contact-form payload to the SMA-30 backend. Public endpoint —
 * credentials explicitly omitted (fetch's default same-origin would still
 * attach the auth cookie). Non-OK responses throw HttpStatusError so the page
 * can map 429 to its rate-limited state; network rejections (fetch TypeError,
 * AbortError on timeout — both statusless) propagate untouched for the
 * offline state.
 */
export async function sendContactMessage(
  payload: ContactPayload
): Promise<void> {
  return fetchJson<void>(`${API_BASE}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'omit',
    // 15s: sized above the backend's 10s wall-clock SMTP deadline
    // (SmtpEmailService.SendTimeout) so a slow-but-successful relay is never
    // aborted client-side.
    timeoutMs: 15_000,
  });
}
