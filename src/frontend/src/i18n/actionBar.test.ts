import { describe, expect, it } from 'vitest';
import i18next from './i18n';

/**
 * SMA-437, lot V39, step A5 (A-10.9) — the two texts the compact action bar
 * adds to the page, in both languages (V17): the label it carries in Edit
 * mode, and the accessible name of its group of buttons. Everything else it
 * draws is already in the catalogs — the header's own buttons and states.
 */
describe('the compact action bar’s two texts (SMA-437, A-10.9)', () => {
  it.each([
    ['fr', 'dashboard.editMode.label', 'Mode Modifier'],
    ['en', 'dashboard.editMode.label', 'Edit mode'],
    ['fr', 'dashboard.pageActions', 'Actions de la page'],
    ['en', 'dashboard.pageActions', 'Page actions'],
  ])('%s: %s reads « %s »', (language, key, text) => {
    expect(i18next.getFixedT(language)(key)).toBe(text);
  });
});
