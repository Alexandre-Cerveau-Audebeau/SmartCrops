import { describe, expect, it } from 'vitest';
import { getDashboardTokens } from './dashboardTokens';

// ROUND 7 (S40 — Extension #7-25) — the ornamental chip's text reads at AA.
//
// `--orn-tx` `#A34D74` on `--orn-bg` `#F8E3EC` measured 4,44:1: under the
// 4,5:1 floor WCAG 2 (1.4.3) sets for text below 18 pt, which 13 px chip text
// is. The token is the ONE place every ornamental chip reads its colour from,
// so the ratio is asserted on the token, in both modes, with the formula of the
// standard rather than a literal that would pass for the wrong reason.

/** Relative luminance, WCAG 2 § 1.4.3 — sRGB, linearised. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function hex(value: string): [number, number, number] {
  const digits = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** `rgba(r,g,b,a)` composited over an opaque background. */
function over(rgba: string, background: [number, number, number]) {
  const [r, g, b, a] = rgba
    .replace(/^rgba?\(|\)$/g, '')
    .split(',')
    .map(Number) as [number, number, number, number];
  return [r, g, b].map((channel, i) =>
    Math.round(channel * a + background[i]! * (1 - a))
  ) as [number, number, number];
}

function contrast(
  foreground: [number, number, number],
  background: [number, number, number]
): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a
  );
  return (light! + 0.05) / (dark! + 0.05);
}

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
