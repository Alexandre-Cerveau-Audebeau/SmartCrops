import { describe, expect, it } from 'vitest';
import i18next from './i18n';

/**
 * SMA-336 PR 2/5, round 1 (E15 / E16 / G7) — every dashboard count agrees with
 * its own number.
 *
 * Two separate defects lived in these strings. The first is plain: labels with a
 * fixed plural noun for a value that can be one, so a garden with a single free
 * cell read « 1 cases libres ». The second is why fixing it needed more than an
 * `_one` key — i18next selects a plural form from ONE variable, `count`, and two
 * of these sentences carry TWO numbers with independent cardinalities. Each
 * count now has its own plural-aware fragment and the sentence only joins them.
 */

/** Both catalogs, so a form added on one side and forgotten on the other fails. */
const LANGUAGES = ['en', 'fr'] as const;

function tr(language: string, key: string, options: Record<string, unknown>) {
  return i18next.getFixedT(language)(key, options) as string;
}

describe('the four pluralized dashboard sites', () => {
  describe.each(LANGUAGES)('%s', (language) => {
    it('« N varieties of M in the catalog » — singular and plural', () => {
      const one = tr(language, 'dashboard.blocks.counters.ofCatalog', {
        count: 1,
        catalog: 536,
      });
      const many = tr(language, 'dashboard.blocks.counters.ofCatalog', {
        count: 12,
        catalog: 536,
      });

      expect(one).not.toBe(many);
      expect(one).not.toMatch(/1 (varieties|variétés)/);
      expect(many).toMatch(/12 (varieties|variétés)/);
    });

    it('active cells and planted cells agree independently', () => {
      // « 1 case active · 4 plantées » — one of each cardinality in the same
      // sentence, which a single `count` could never have produced.
      const mixed = tr(language, 'dashboard.blocks.stats.activeCells', {
        active: tr(language, 'dashboard.blocks.stats.activeCellsCount', {
          count: 1,
        }),
        occupied: tr(language, 'dashboard.blocks.stats.occupiedCount', {
          count: 4,
        }),
      });

      expect(mixed).not.toMatch(/1 (active cells|cases actives)/);
      expect(mixed).toContain('4');
    });

    it('free cells and sunny cells agree independently', () => {
      const mixed = tr(language, 'dashboard.blocks.stats.freeCells', {
        free: tr(language, 'dashboard.blocks.stats.freeCellsCount', {
          count: 1,
        }),
        sunny: tr(language, 'dashboard.blocks.stats.sunnyCount', { count: 7 }),
      });

      expect(mixed).not.toMatch(/1 (free cells|cases libres)/);
      expect(mixed).toContain('7');
    });

    it('the sunny fragment carries no pronoun of its own (round 3, E″6 / G″5)', () => {
      // The case the finding names: MANY free cells, ONE of them sunny. The
      // English singular read « 2 free cells, 1 of it in full sun » — « it »
      // agreeing with the sunny count while standing for the free ones, which
      // no combination of the two numbers can make right. French was already
      // clear (« dont ... »), so only the English catalog moved; this asserts
      // both, so the two stay in agreement.
      const mixed = tr(language, 'dashboard.blocks.stats.freeCells', {
        free: tr(language, 'dashboard.blocks.stats.freeCellsCount', {
          count: 2,
        }),
        sunny: tr(language, 'dashboard.blocks.stats.sunnyCount', { count: 1 }),
      });

      expect(mixed).not.toMatch(/of (it|them)/);
      expect(mixed).toContain('2');
      expect(mixed).toContain('1');
    });

    it('every count of the three widgets has a singular form', () => {
      // The general rule rather than the four sites: not one label of these
      // widgets renders « 1 » in front of a fixed plural.
      //
      // REWRITTEN by round 3 (E″5). The assertion used to be
      // `tr(key, {count: 1}) !== tr(key, {count: 2})`, which could not fail:
      // the interpolated numbers differ, so the two strings differ even when
      // `_one` is missing and i18next falls back to `_other` for both. Worse,
      // it also asserted the wrong thing for the keys whose two forms are the
      // same by design — « 1 var. » and « 2 var. ».
      //
      // What is checked instead: the `_one` RESOURCE is really there, and the
      // plural selector really picks it at 1. Deleting an `_one` key fails the
      // first; a plural rule that stopped selecting it fails the second. The
      // wording is not copied into the test — a second copy of these strings
      // would be a second thing to keep in agreement.
      const singulars = [
        'dashboard.blocks.gardens.count',
        'dashboard.blocks.gardens.varieties',
        'dashboard.blocks.gardens.freeCells',
        'dashboard.blocks.gardens.more',
        'dashboard.blocks.counters.varieties',
        'dashboard.blocks.counters.plants',
        'dashboard.blocks.counters.more',
        'dashboard.blocks.stats.activeCellsCount',
        'dashboard.blocks.stats.occupiedCount',
        'dashboard.blocks.stats.freeCellsCount',
        'gardens.plantsCount',
      ] as const;

      for (const key of singulars) {
        expect(
          i18next.getResource(language, 'translation', `${key}_one`),
          `${key}_one is missing from the ${language} catalog`
        ).toBeDefined();
        expect(
          tr(language, key, { count: 1 }),
          `${key} does not select its singular at 1`
        ).toBe(tr(language, `${key}_one`, { count: 1 }));
      }
    });

    it('and the plural form is what a count of two selects', () => {
      // The mirror, so « every form resolves to the same template » cannot pass
      // this file.
      for (const key of [
        'dashboard.blocks.gardens.count',
        'dashboard.blocks.counters.varieties',
        'dashboard.blocks.stats.freeCellsCount',
      ] as const) {
        expect(
          i18next.getResource(language, 'translation', `${key}_other`)
        ).toBeDefined();
        expect(tr(language, key, { count: 2 })).toBe(
          tr(language, `${key}_other`, { count: 2 })
        );
      }
    });
  });
});

describe('the figures are written in the reader’s language', () => {
  it('groups thousands the French way', () => {
    // `{{count, number}}` hands the value to Intl.NumberFormat with the active
    // language, so a four-digit cell count stops being written the way
    // JavaScript writes it.
    const fr = tr('fr', 'dashboard.blocks.stats.freeCellsCount', {
      count: 1440,
    });
    const en = tr('en', 'dashboard.blocks.stats.freeCellsCount', {
      count: 1440,
    });

    expect(fr).not.toContain('1440');
    expect(en).toContain('1,440');
  });
});
