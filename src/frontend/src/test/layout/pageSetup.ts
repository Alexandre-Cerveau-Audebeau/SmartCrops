import { LANGUAGE_STORAGE_KEY } from '../../i18n/languageStorage';

/**
 * SMA-437, lot V39, PR B, step B9 — imported FIRST by `pageHarness.tsx`,
 * after the clock: the language and the colour mode of the page scene are
 * read from the query string and STORED, as a returning visitor has them
 * stored, before i18next initializes (`lng: readStoredLanguage()`, at module
 * evaluation) and before `ColorModeProvider` reads its key. Each run of the
 * page has a profile of its own, so nothing leaks from one run to another.
 */
const params = new URLSearchParams(location.search);
localStorage.setItem(LANGUAGE_STORAGE_KEY, params.get('lang') === 'en' ? 'en' : 'fr');
// `ColorModeContext`'s key — private to that module, spelled here once.
localStorage.setItem('smartcrops-color-mode', params.get('theme') === 'dark' ? 'dark' : 'light');
