import { alpha } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { contrast, hex, over, type Rgb } from './test/contrast';
import { createAppTheme } from './theme';
import { getPlannerTokens } from './theme/plannerTokens';

// SMA-449 — the day primary green reads at WCAG AA wherever it is text, or the
// ground under text.
//
// `#2E8B57` measured 4,25:1 on white and 4,14:1 on the canvas, and fell to
// 3,70:1 on the planner's chip tint: under the 4,5:1 WCAG 2 (1.4.3) sets for
// text below 18 pt, which every green label of the site is (11 to 16 px). The
// palette is the ONE place ~130 buttons, links, chips and labels read it from,
// so the ratios are asserted on the tokens, over every surface the audit found
// green text on — hover and selection tints included, composited the way MUI
// derives them — with the formula of the standard, not a literal.
//
// Proof by failure: written red on `7e64b79` (production), then green on
// `#297B4D` — the same hue and saturation, darker (decision of 24/09, option C).
// The night palette is out of scope (SMA-450); its two guards only pin that
// this fix leaves it where it was.

const AA = 4.5;

describe('the day primary green reads at AA (SMA-449)', () => {
  const theme = createAppTheme('light');
  const { primary, background, brandTintBg, action } = theme.palette;
  const green = hex(primary.main);
  const paper = hex(background.paper);
  const canvas = hex(background.default);

  /** A text button's hover and a menu item's selection: the green at MUI's opacity, over the surface. */
  const tint = (opacity: number, surface: Rgb) => over(alpha(primary.main, opacity), surface);

  it.each([
    ['the paper (cards, dialogs, menus)', paper],
    ['the canvas (page headers)', canvas],
    ['a text button’s hover over the paper', tint(action.hoverOpacity, paper)],
    ['a text button’s hover over the canvas', tint(action.hoverOpacity, canvas)],
    ['a selection over the paper', tint(action.selectedOpacity, paper)],
    ['a selection over the canvas', tint(action.selectedOpacity, canvas)],
    ['the brand tint (chips, table of contents)', hex(brandTintBg)],
  ] as const)('as text, over %s', (_surface, ground) => {
    expect(contrast(green, ground)).toBeGreaterThanOrEqual(AA);
  });

  it('as the ground under its contrast text (contained buttons, filled chips)', () => {
    expect(contrast(hex(primary.contrastText), green)).toBeGreaterThanOrEqual(AA);
  });
});

describe('the planner’s day green reads at AA (SMA-449)', () => {
  const tk = getPlannerTokens('light');
  const prim = hex(tk.prim);

  it.each([
    ['the card (tabs, title, « Ajouter une plage »)', tk.card],
    ['the duration chip', tk.cntChipBg],
    ['the selected garden type', tk.typeSelBg],
  ] as const)('as text, over %s', (_surface, ground) => {
    expect(contrast(prim, hex(ground))).toBeGreaterThanOrEqual(AA);
  });

  it('as the ground under white (« Enregistrer », the active grid mode)', () => {
    expect(contrast(hex('#FFFFFF'), prim)).toBeGreaterThanOrEqual(AA);
  });
});

describe('the night green is left as it was (SMA-450 owns it)', () => {
  const { primary, background } = createAppTheme('dark').palette;

  it('keeps its contrast text on the green', () => {
    expect(contrast(hex(primary.contrastText), hex(primary.main))).toBeGreaterThanOrEqual(AA);
  });

  it('keeps the green readable on the paper', () => {
    expect(contrast(hex(primary.main), hex(background.paper))).toBeGreaterThanOrEqual(AA);
  });
});
