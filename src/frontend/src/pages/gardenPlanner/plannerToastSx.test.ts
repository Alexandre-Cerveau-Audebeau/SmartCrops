import { describe, expect, it } from 'vitest';
import { createAppTheme } from '../../theme';
import { plannerToastSx } from './plannerToastSx';

// SMA-477 — a guard of FORM, not the proof. jsdom's `getComputedStyle` applies
// no `@media` rule that carries a feature, so no test here can say which
// `bottom` a browser draws from 600 px: that is measured in Chrome, on the
// real page, by `src/test/layout/pageLayout.test.tsx`. What this suite pins is
// what the function RETURNS: the lift as a plain declaration AND again under
// MUI's `sm` breakpoint, the same value — the plain one is what a phone and
// jsdom read, the one under `sm` is what beats MUI's own rule from 600 px —,
// and the E9 tier under the veil alone.

const theme = createAppTheme('light');
/** The media query MUI's Snackbar re-sets its own `bottom` under. */
const sm = theme.breakpoints.up('sm');

describe('plannerToastSx — the form of the planner’s toast sx (a guard; the proof is the page-layout suite)', () => {
  it('a modified plan: the lift as a plain declaration and again under sm, the same value — the bar’s measured height + 32 px', () => {
    expect(
      plannerToastSx({
        dirtyBarHeight: 48,
        isDirty: true,
        underVeil: false,
        theme,
      })
    ).toEqual({ bottom: '80px', [sm]: { bottom: '80px' } });
    // The bar not measured yet (jsdom: its height stays 0): the 32 px alone.
    expect(
      plannerToastSx({
        dirtyBarHeight: 0,
        isDirty: true,
        underVeil: false,
        theme,
      })
    ).toEqual({ bottom: '32px', [sm]: { bottom: '32px' } });
  });

  it('nothing unsaved: no bottom at all, plain or under sm — whatever height the page still holds', () => {
    expect(
      plannerToastSx({
        dirtyBarHeight: 48,
        isDirty: false,
        underVeil: false,
        theme,
      })
    ).toEqual({});
  });

  it('under the veil: zIndex = modal − 1 — under the modal, still above the bar — beside the lift, or alone', () => {
    expect(
      plannerToastSx({
        dirtyBarHeight: 48,
        isDirty: true,
        underVeil: true,
        theme,
      })
    ).toEqual({
      bottom: '80px',
      [sm]: { bottom: '80px' },
      zIndex: theme.zIndex.modal - 1,
    });
    expect(
      plannerToastSx({
        dirtyBarHeight: 0,
        isDirty: false,
        underVeil: true,
        theme,
      })
    ).toEqual({ zIndex: theme.zIndex.modal - 1 });
    expect(theme.zIndex.modal - 1).toBeGreaterThan(theme.zIndex.appBar);
  });

  it('no veil: no zIndex at all', () => {
    expect(
      plannerToastSx({
        dirtyBarHeight: 48,
        isDirty: true,
        underVeil: false,
        theme,
      })
    ).not.toHaveProperty('zIndex');
  });
});
