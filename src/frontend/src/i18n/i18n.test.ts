import { afterEach, describe, expect, it } from 'vitest';
import i18n from './i18n';

// SMA-354 lot 1: <html lang> must follow the active i18next language so the
// static lang="fr" shipped in index.html stays truthful after a switch.
describe('<html lang> synchronization', () => {
  afterEach(async () => {
    await i18n.changeLanguage('fr');
  });

  // Covers the init-time sync call: importing the module must already have
  // stamped the resolved language (French on a virgin env, SMA-393) on <html>.
  it("sets document.documentElement.lang to 'fr' at module initialization", () => {
    expect(document.documentElement.lang).toBe('fr');
  });

  it("sets document.documentElement.lang to 'en' after switching to English", async () => {
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it("sets document.documentElement.lang back to 'fr' after switching back", async () => {
    await i18n.changeLanguage('en');
    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it("normalizes a regioned code ('fr-FR') to its 2-letter base", async () => {
    await i18n.changeLanguage('fr-FR');
    expect(document.documentElement.lang).toBe('fr');
  });
});
