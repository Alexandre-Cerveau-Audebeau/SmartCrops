import { describe, expect, it } from 'vitest';
// Vite reads the SOURCE file from disk, resolved relative to this test file —
// robust regardless of the runner's cwd (jsdom rewrites import.meta.url to an
// http URL, so node:fs + fileURLToPath cannot be used here).
import indexHtml from '../index.html?raw';

// GDPR lock — fonts self-hosted via @fontsource / material-symbols (Wave-1 T3);
// any external font CDN reintroduction must fail here.
describe('index.html (Wave-1 T3 GDPR lock)', () => {
  it('references no external font CDN', () => {
    expect(indexHtml).not.toMatch(/googleapis/);
    expect(indexHtml).not.toMatch(/gstatic/);
  });
});

// SMA-393 lock — the static document declares French, matching what
// LanguageContext applies for a visitor with no stored choice, so the
// pre-hydration paint and the app agree from the first frame.
describe('index.html (SMA-393 French default)', () => {
  it('declares French as the document language', () => {
    expect(indexHtml).toMatch(/<html lang="fr">/);
  });
});
