/**
 * SMA-394: the page's Japanese font stack, as a reusable `sx` fragment.
 *
 * `EasterEggDetail` scopes the stack to its own Container with a descendant
 * selector. MUI renders `Dialog` and `Tooltip` through a portal attached to
 * `document.body`, which is OUTSIDE that subtree, so portal content falls back
 * to Inter — whose subsets carry no kana or kanji, and every Japanese glyph
 * renders as tofu. The pest modal and the bar / chart tooltips all display
 * written Japanese, so each applies this fragment to its own portal slot.
 *
 * The `:not(.material-symbols-outlined)` exclusion matches the Container's
 * rule: the icon font's own family must keep winning, or every icon renders as
 * its ligature name.
 */
export const eggFontSx = (fontStack: string) =>
  ({
    fontFamily: fontStack,
    '& :not(.material-symbols-outlined)': { fontFamily: fontStack },
  }) as const;
