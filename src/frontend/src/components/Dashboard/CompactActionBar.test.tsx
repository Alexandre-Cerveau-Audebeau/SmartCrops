import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import CompactActionBar, { type CompactActionBarProps } from './CompactActionBar';
import { declaredAtBreakpoint, rulesFor } from '../../test/dashboardDom';
import { getDashboardTokens } from '../../theme/dashboardTokens';

// SMA-437, lot V39, PR B — what the compact action bar DECLARES, read from the
// rules Emotion emits: jsdom lays nothing out, so the heights these rules make
// (54 px, 73 px on a phone in Edit mode) are measured in the real engine, in
// the page scenes of `src/test/layout/` (B9).

const props = (over: Partial<CompactActionBarProps> = {}): CompactActionBarProps => ({
  shown: true,
  top: 56,
  editing: false,
  unavailable: false,
  saveState: 'idle',
  onEditingChange: vi.fn(),
  onCustomize: vi.fn(),
  ...over,
});

function renderBar(over: Partial<CompactActionBarProps> = {}, mode: 'light' | 'dark' = 'light') {
  const theme = createTheme({ palette: { mode } });
  render(
    <ThemeProvider theme={theme}>
      <CompactActionBar {...props(over)} />
    </ThemeProvider>
  );
  const bar = document.querySelector<HTMLElement>('[data-compact-bar]')!;
  return { theme, bar, inner: bar.firstElementChild as HTMLElement };
}

describe('the compact action bar in Edit mode, as it is declared (SMA-437, lot V39, B5)', () => {
  it('is tinted — `tint` by day — with a green rule under it (A-10.4)', () => {
    const { theme, bar } = renderBar({ editing: true });
    const tint = getDashboardTokens('light').tint;
    const css = rulesFor(bar);
    expect(css).toContain(`background-image:linear-gradient(${tint}, ${tint})`);
    expect(css).toContain(`border-color:${theme.palette.primary.main}`);
    expect(css).toContain(`box-shadow:inset 0 -1px 0 ${theme.palette.primary.main},0 2px 8px rgba(0,0,0,0.08)`);
  });

  it('is tinted with `invBg` at night — `tint` would bring « Personnaliser » down to 4.26:1 (A-10.4)', () => {
    const { bar } = renderBar({ editing: true }, 'dark');
    const invBg = getDashboardTokens('dark').invBg;
    expect(rulesFor(bar)).toContain(`background-image:linear-gradient(${invBg}, ${invBg})`);
  });

  it('is the plain card out of Edit mode: no tint, the divider under it', () => {
    const { bar } = renderBar({ editing: false });
    const css = rulesFor(bar);
    expect(css).not.toContain('linear-gradient');
    expect(css).toContain('box-shadow:0 2px 8px rgba(0,0,0,0.08)');
  });

  it('on a phone, stacks two lines in Edit mode — « Edit mode » and the state, then the two buttons — and one row from 600 px', () => {
    const { inner } = renderBar({ editing: true });
    expect(declaredAtBreakpoint(inner, '0px', 'flex-direction')).toBe('column');
    expect(declaredAtBreakpoint(inner, '600px', 'flex-direction')).toBe('row');
    expect(declaredAtBreakpoint(inner, '0px', 'height')).toBe('auto');
    expect(declaredAtBreakpoint(inner, '600px', 'height')).toBe('53px');
  });

  it('writes « Edit mode » without its glyph under 600 px, with it from 600 px (A-10.4)', () => {
    renderBar({ editing: true });
    const glyph = document.querySelector('[data-compact-bar-mode] [data-testid="EditOutlinedIcon"]')!;
    expect(declaredAtBreakpoint(glyph, '0px', 'display')).toBe('none');
    expect(declaredAtBreakpoint(glyph, '600px', 'display')).toBe('inline-block');
  });

  it('keeps the place of the state before the first change — an empty, aria-hidden copy', () => {
    renderBar({ editing: true, saveState: 'idle' });
    const copy = document.querySelector('[data-compact-bar-status]')!;
    expect(copy).toBeEmptyDOMElement();
    expect(copy).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('the compact action bar’s motion (SMA-437, lot V39, B7)', () => {
  it('uses the theme’s shortest duration, 150 ms (A-10.2)', () => {
    expect(createTheme().transitions.duration.shortest).toBe(150);
  });

  it('slides in from behind the site navbar: a 150 ms transform, easeOut, visible at once', () => {
    const { theme, bar } = renderBar({ shown: true });
    const css = rulesFor(bar);
    expect(css).toContain('transform:none');
    expect(css).toContain(
      `transition:transform 150ms ${theme.transitions.easing.easeOut},visibility 0s linear 0s`
    );
  });

  it('slides out: a 150 ms transform, sharp, and hidden only once it is out', () => {
    const { theme, bar } = renderBar({ shown: false });
    const css = rulesFor(bar);
    expect(css).toContain('transform:translateY(-100%)');
    expect(css).toContain('visibility:hidden');
    expect(css).toContain(
      `transition:transform 150ms ${theme.transitions.easing.sharp},visibility 0s linear 150ms`
    );
  });

  it('animates nothing but its transform — never its top nor its height', () => {
    for (const shown of [true, false]) {
      const { bar } = renderBar({ shown });
      const transitions = [...rulesFor(bar).matchAll(/transition:([^;}]+)/g)].map((found) => found[1]);
      expect(transitions.join(' '), String(shown)).not.toMatch(/\b(top|height|all)\b/);
    }
  });

  it('draws no frame in between under prefers-reduced-motion — a state, not a slower animation (V15)', () => {
    const { bar } = renderBar({ shown: true });
    // Emotion writes the prefixed declaration first: `-webkit-transition:none;transition:none;`.
    const block = /@media \(prefers-reduced-motion: ?reduce\)\{[^{}]*\{([^}]*)\}/.exec(rulesFor(bar));
    expect(block?.[1]).toMatch(/(^|;)transition:none(;|$)/);
  });
});
