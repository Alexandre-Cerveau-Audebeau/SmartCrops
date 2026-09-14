/**
 * WCAG 2 § 1.4.3 contrast arithmetic, shared by the tests that hold a colour to
 * the AA floor (SMA-336 round 7, S40 — `dashboardTokens.test.ts`; PR 3b/5
 * round 1, V20 — `WeatherBlock.visibility.test.tsx`).
 *
 * A module under `src/test/` rather than helpers exported from a test file:
 * importing from a `*.test.ts` would run that file's suite as a side effect —
 * the same rule as `dashboardDom.ts` beside it.
 */

export type Rgb = [number, number, number];

/** Relative luminance, WCAG 2 § 1.4.3 — sRGB, linearised. */
export function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** `#RRGGBB` → channels. */
export function hex(value: string): Rgb {
  const digits = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as Rgb;
}

/** `rgba(r,g,b,a)` composited over an opaque background. */
export function over(rgba: string, background: Rgb): Rgb {
  const [r, g, b, a] = rgba
    .replace(/^rgba?\(|\)$/g, '')
    .split(',')
    .map(Number) as [number, number, number, number];
  return [r, g, b].map((channel, i) =>
    Math.round(channel * a + background[i]! * (1 - a))
  ) as Rgb;
}

export function contrast(foreground: Rgb, background: Rgb): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/**
 * A CSS colour as Emotion writes it — `#RRGGBB`, `rgb(r, g, b)` or
 * `rgba(r, g, b, a)` — composited over `background` when it carries an alpha.
 * Returns null for anything else (`inherit`, `transparent`, a keyword).
 */
export function resolveColor(value: string, background: Rgb): Rgb | null {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return hex(text);
  if (/^rgba?\(/i.test(text)) {
    const parts = text
      .replace(/^rgba?\(|\)$/gi, '')
      .split(',')
      .map((part) => Number(part.trim()));
    if (parts.length === 3) return parts as Rgb;
    if (parts.length === 4) return over(`rgba(${parts.join(',')})`, background);
  }
  return null;
}
