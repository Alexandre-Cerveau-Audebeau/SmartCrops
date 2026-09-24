import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { createAppTheme } from '../../theme';
import { declaredAtBreakpoint, rulesFor } from '../../test/dashboardDom';
import DashboardBlock from './DashboardBlock';
import type { DashboardSize } from '../../types/Dashboard';

// SMA-437 lot 1, PR A, step A3 (pre-flight D7) — the frame's padding: 20 px,
// « 24 en Grand et en Pleine largeur » (contract § 5.4); in Edit mode the top
// padding the controls sit in, 34 px, 38 in Large and in Full width.

/** The card a widget of this size draws, in or out of Edit mode. */
function cardOf(size: DashboardSize, editing: boolean): HTMLElement {
  const { container } = render(
    <ThemeProvider theme={createAppTheme('light')}>
      <DashboardBlock blockKey="stats" title="Statistics" size={size} editing={editing}>
        <p>body</p>
      </DashboardBlock>
    </ThemeProvider>
  );
  return container.querySelector('[data-widget="stats"]') as HTMLElement;
}

describe('DashboardBlock — the padding of each size (SMA-437, D7)', () => {
  it.each<[DashboardSize, string, string]>([
    ['small', '20px', '34px'],
    ['medium', '20px', '34px'],
    ['large', '24px', '38px'],
    ['wide', '24px', '38px'],
  ])('a %s card: %s around its content, %s above it in Edit mode', (size, padding, editTop) => {
    expect(rulesFor(cardOf(size, false))).toContain(`padding:${padding}`);
    expect(rulesFor(cardOf(size, false))).toContain(`padding-top:${padding}`);
    expect(rulesFor(cardOf(size, true))).toContain(`padding-top:${editTop}`);
  });

  // SMA-437 lot 1, PR B, step B7 — the Full width on a phone: 20 px, the
  // phone's one air (V32; V3-04, `.ph .w.xl { padding: 20px }`). At 24 px a
  // tile of the Key figures band has a content width of 110 px at 360 px (a
  // 134 px box), and seven English digits at 22 px (111.4 px) ran past it —
  // the harness's extreme scene; the content width of 114 px (a 138 px box)
  // arbitrage 1 was measured on is the 20 px one.
  it('gives the Full width 20 px on a phone, and 24 px from 600 px up', () => {
    const card = cardOf('wide', false);
    expect(declaredAtBreakpoint(card, '0px', 'padding')).toBe('20px');
    expect(declaredAtBreakpoint(card, '600px', 'padding')).toBe('24px');
    expect(declaredAtBreakpoint(card, '0px', 'padding-top')).toBe('20px');
    expect(declaredAtBreakpoint(card, '600px', 'padding-top')).toBe('24px');
  });

  // The responsive padding is written in media queries, which come AFTER a
  // plain `padding-top` and override it: the Edit-mode 38 px must be declared
  // at the same breakpoints, or the drag pill lands on the title (the harness,
  // `grid-expert-edit` at 360 and 390 px).
  it('keeps the 38 px the Edit controls sit in on a phone as from 600 px up', () => {
    const card = cardOf('wide', true);
    expect(declaredAtBreakpoint(card, '0px', 'padding-top')).toBe('38px');
    expect(declaredAtBreakpoint(card, '600px', 'padding-top')).toBe('38px');
  });
});
