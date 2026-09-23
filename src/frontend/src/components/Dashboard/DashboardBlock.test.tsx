import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { createAppTheme } from '../../theme';
import { rulesFor } from '../../test/dashboardDom';
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
});
