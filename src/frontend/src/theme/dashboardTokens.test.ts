import { describe, expect, it } from 'vitest';
import { contrast, hex, over, type Rgb } from '../test/contrast';
import { createAppTheme } from '../theme';
import { getDashboardTokens } from './dashboardTokens';

// ROUND 7 (S40 — Extension #7-25) — the ornamental chip's text reads at AA.
//
// `--orn-tx` `#A34D74` on `--orn-bg` `#F8E3EC` measured 4,44:1: under the
// 4,5:1 floor WCAG 2 (1.4.3) sets for text below 18 pt, which 13 px chip text
// is. The token is the ONE place every ornamental chip reads its colour from,
// so the ratio is asserted on the token, in both modes, with the formula of the
// standard rather than a literal that would pass for the wrong reason. The
// arithmetic lives in `src/test/contrast.ts` since PR 3b/5 round 1 (V20), so
// the weather widget's visibility test reads the same formula.

// SMA-336 PR 3b/5 — the weather palette, transcribed from `A5MeteoTailles.dc.html`.
describe('the weather tokens (PR 3b/5)', () => {
  const WEATHER_TOKENS = [
    'sun',
    'cloud',
    'rain',
    'rainText',
    'tempCold',
    'tempWarm',
    'warnBg',
    'warnText',
    'warnIcon',
    'warnBorder',
    'track',
    'tint',
  ] as const;

  it.each(['light', 'dark'] as const)('are all present by %s, and none is empty', (mode) => {
    const tokens = getDashboardTokens(mode);
    for (const key of WEATHER_TOKENS) {
      expect(tokens[key], key).toMatch(/^(#[0-9A-F]{6}|rgba\()/);
    }
  });

  it('carries the artboard’s day values verbatim (helmet l. 30, 34, 51-52)', () => {
    const tokens = getDashboardTokens('light');
    expect(tokens.sun).toBe('#E8890C');
    expect(tokens.cloud).toBe('#6E7F8E');
    expect(tokens.rain).toBe('#4A7FB5');
    expect(tokens.tempCold).toBe('#6E9CC4');
    expect(tokens.tempWarm).toBe('#E8890C');
    expect(tokens.warnBg).toBe('#FFF4D6');
    expect(tokens.warnText).toBe('#8A6A14');
    expect(tokens.warnIcon).toBe('#E8890C');
    expect(tokens.warnBorder).toBe('#EFD27E');
    expect(tokens.track).toBe('#E9EFE7');
    expect(tokens.tint).toBe('#EAF5EE');
  });

  // SMA-336 PR 4a/5 — the four calendar lanes, `A3Expert.dc.html` helmet.
  it('carries the artboard’s calendar lanes verbatim (helmet l. 50 by day, l. 81 by night)', () => {
    const day = getDashboardTokens('light');
    expect(day.stagePrune).toBe('#2C3E6B');
    expect(day.stageSow).toBe('#8FB996');
    expect(day.stageFlower).toBe('#E0A93B');
    expect(day.stageHarvest).toBe('#A0522D');

    const night = getDashboardTokens('dark');
    // Pruning and harvest lighten at night; sowing and flowering do not.
    expect(night.stagePrune).toBe('#6E8AC8');
    expect(night.stageSow).toBe('#8FB996');
    expect(night.stageFlower).toBe('#E0A93B');
    expect(night.stageHarvest).toBe('#C8744A');
  });

  /**
   * MEASURED, not asserted against a floor. Three of the four lanes clear the
   * 3:1 WCAG 2 § 1.4.11 asks of a graphical object on the light card; the
   * sowing green, which the frozen design takes from the plant detail timeline
   * (`_spec.md` § 5) and which that page already ships, measures 2.20:1.
   *
   * It is not amended here: unlike `ornText` and `rainText` (round 7, S40),
   * which the suite darkened because they are TEXT under the 4.5:1 floor,
   * these four colour 4 px bars and 12 px legend squares, and no surface of
   * this widget prints a word in them (the MonthBlock suite pins that). The
   * meaning never rests on the hue: every lane is named in the legend and
   * again in each row's spoken sentence. The figure is recorded so a future
   * reader can weigh the trade rather than rediscover it.
   */
  it('records what each lane measures over its card — the sowing green is the low one', () => {
    const light = getDashboardTokens('light');
    const white = hex('#FFFFFF');
    expect(contrast(hex(light.stagePrune), white)).toBeGreaterThanOrEqual(3);
    expect(contrast(hex(light.stageHarvest), white)).toBeGreaterThanOrEqual(3);
    expect(contrast(hex(light.stageFlower), white)).toBeGreaterThanOrEqual(1.7);
    expect(contrast(hex(light.stageSow), white)).toBeCloseTo(2.2, 1);
  });

  it('carries the artboard’s night values verbatim (helmet l. 62, 66, 82-83)', () => {
    const tokens = getDashboardTokens('dark');
    expect(tokens.sun).toBe('#FFCB54');
    expect(tokens.cloud).toBe('#9FB0C2');
    expect(tokens.rain).toBe('#90CAF9');
    expect(tokens.tempCold).toBe('#7FB0DC');
    expect(tokens.tempWarm).toBe('#FFCB54');
    expect(tokens.warnBg).toBe('rgba(255,203,84,0.13)');
    expect(tokens.warnText).toBe('#FFD98A');
    expect(tokens.warnIcon).toBe('#FFCB54');
    expect(tokens.warnBorder).toBe('rgba(255,203,84,0.55)');
    expect(tokens.track).toBe('#31456B');
    expect(tokens.tint).toBe('rgba(79,179,124,0.16)');
  });

  it('the alert chip text reads at AA over its fill, by day', () => {
    const { warnText, warnBg } = getDashboardTokens('light');

    expect(contrast(hex(warnText), hex(warnBg))).toBeGreaterThanOrEqual(4.5);
  });

  it('the alert chip text reads at AA over its translucent fill on the night card', () => {
    const card = hex('#16294A');
    const { warnText, warnBg } = getDashboardTokens('dark');

    expect(contrast(hex(warnText), over(warnBg, card))).toBeGreaterThanOrEqual(4.5);
  });

  it('the rain probability TEXT reads at AA on the card in both modes — the graphic hue does not by day', () => {
    // The reason `rainText` exists beside `rain`: `#4A7FB5` on white is 4,20:1,
    // fine for a 24 px glyph or an 8 px bar (3:1), not for 14 px text.
    const light = getDashboardTokens('light');
    expect(contrast(hex(light.rain), hex('#FFFFFF'))).toBeGreaterThanOrEqual(3);
    expect(contrast(hex(light.rain), hex('#FFFFFF'))).toBeLessThan(4.5);
    expect(contrast(hex(light.rainText), hex('#FFFFFF'))).toBeGreaterThanOrEqual(4.5);

    const dark = getDashboardTokens('dark');
    expect(contrast(hex(dark.rainText), hex('#16294A'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the ornamental chip reads at WCAG AA in both modes', () => {
  it('by day — text over the chip fill', () => {
    const { ornText, ornBg } = getDashboardTokens('light');

    expect(contrast(hex(ornText), hex(ornBg))).toBeGreaterThanOrEqual(4.5);
  });

  it('by night — text over the translucent fill composited on the card', () => {
    // `theme.ts` dark `background.paper`, which is what the chip sits on.
    const card = hex('#16294A');
    const { ornText, ornBg } = getDashboardTokens('dark');

    expect(contrast(hex(ornText), over(ornBg, card))).toBeGreaterThanOrEqual(4.5);
  });
});

// SMA-336 PR 4b/5 — the NEUTRAL pill carries 13 px text on every widget header
// (« 3 conseils ») and, since the Tips widget, on its per-garden groups
// (« 2 conseils », « rien à signaler », `A3Expert.dc.html` l. 316-334). No
// token was added for the widget — every colour it draws is one the dashboard
// already declares — so this is the one pair it leans on that had no assertion.
describe('the neutral pill reads at WCAG AA in both modes', () => {
  it('by day — text over the pill fill', () => {
    const { pillText, pillBg } = getDashboardTokens('light');

    expect(contrast(hex(pillText), hex(pillBg))).toBeGreaterThanOrEqual(4.5);
  });

  it('by night — text over the translucent fill composited on the card', () => {
    const card = hex('#16294A');
    const { pillText, pillBg } = getDashboardTokens('dark');

    expect(contrast(hex(pillText), over(pillBg, card))).toBeGreaterThanOrEqual(4.5);
  });
});

// SMA-437, lot V3-06 (contract A-21) — the FOOT stuck at the bottom of a
// scrolling zone (`InviteCard`, `place="foot"`): the invitation tint over the
// card at 92 %, a 7 px blur of what passes beneath. Its three texts — the
// title in `text.primary`, the body in `text.secondary`, the gesture in the
// primary colour of an outlined button — owe 4,5:1 on that ground, in both
// modes. The colours are the theme's own (`createAppTheme`); the page harness
// measures the same texts as the engine draws them, at five widths.
describe('the foot’s ground (SMA-437, lot V3-06, A-21)', () => {
  const colours = (mode: 'light' | 'dark') => {
    const { palette } = createAppTheme(mode);
    return {
      card: hex(palette.background.paper),
      title: palette.text.primary,
      body: palette.text.secondary,
      gesture: palette.primary.main,
    };
  };
  /** A colour as drawn on `ground`: a translucent one composited over it. */
  const drawn = (colour: string, ground: Rgb): Rgb => (colour.startsWith('#') ? hex(colour) : over(colour, ground));
  /** The foot's ground over `beneath`: the card at 92 %, the invitation tint over that. */
  const footGround = (mode: 'light' | 'dark', beneath: Rgb): Rgb =>
    over(getDashboardTokens(mode).invTint, over(`rgba(${colours(mode).card.join(',')},0.92)`, beneath));

  it.each(['light', 'dark'] as const)('%s: the title, the body and the gesture read at AA over the bare card', (mode) => {
    const c = colours(mode);
    const ground = footGround(mode, c.card);
    for (const text of ['title', 'body', 'gesture'] as const) {
      expect(contrast(drawn(c[text], ground), ground), text).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * MEASURED, not asserted against a floor — the lanes' rule above. What 8 %
   * of an UNBLURRED pixel of the zone's strongest ink would leave under the
   * texts: by day the darkest, by night the lightest — `text.primary` in
   * both. The 7 px blur spreads a glyph's ink over some fourteen pixels each
   * way, so a line of tips passing beneath gives a fraction of that; how
   * much, no box says — a filter, not a box (V3-06's own audit says the
   * same). Recorded so the trade can be weighed (contract A-21, its [P] on
   * the contrast corrected on 01/10): the gesture is the low one.
   */
  it('records what 8 % of an unblurred pixel of the strongest ink would leave — the gesture is the low one', () => {
    const day = colours('light');
    const dayGround = footGround('light', drawn(day.title, day.card));
    expect(contrast(drawn(day.gesture, dayGround), dayGround)).toBeCloseTo(4.21, 2);

    const night = colours('dark');
    const nightGround = footGround('dark', drawn(night.title, night.card));
    expect(contrast(drawn(night.body, nightGround), nightGround)).toBeCloseTo(4.39, 2);
    expect(contrast(drawn(night.gesture, nightGround), nightGround)).toBeCloseTo(3.98, 2);
  });
});
