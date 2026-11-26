import { fireEvent, render, screen, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { ThemeProvider, getOverlayAlpha } from '@mui/material/styles';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from '../../i18n/i18n';
import { createAppTheme } from '../../theme';
import { declaredAtBreakpoint, rulesFor, slotOf } from '../../test/dashboardDom';
import { contrast, hex, over } from '../../test/contrast';
import SortableWidget from './SortableWidget';
import type { DashboardBlock, DashboardSize, DashboardSizeStep } from '../../types/Dashboard';

// SMA-437 lot 1, PR A, step A2 (pre-flight D3) — the size control is drawn
// only for a widget that has more than one size at its formula. A-N11: « Chiffres
// clés — une seule taille, pas de poignée ». No widget of PR A has one size, so
// the rule is pinned on the cell itself, whatever list it is given. Since
// SMA-437's size stepper (Alexandre, 05/10, validated on 26/11) that control is
// the pill of « − » and « + », in place of the corner grip.

/** What the two segments lead to on the cells these tests draw with a pill: a Medium, between Small and Large. */
const MEDIUM_STEPS = { smaller: 'Small', larger: 'Large' } as const;

/** One grid cell — in Edit mode unless told otherwise — inside the drag context the grid gives it. */
function renderCell(
  block: DashboardBlock,
  resizable: boolean,
  editing = true,
  {
    sizeLabel = 'Medium',
    sizeSteps = MEDIUM_STEPS,
    onResize = () => {},
  }: {
    sizeLabel?: string;
    sizeSteps?: Record<DashboardSizeStep, string | null>;
    onResize?: (step: DashboardSizeStep) => void;
  } = {}
) {
  return render(
    <ThemeProvider theme={createAppTheme('light')}>
      <DndContext>
        <SortableContext items={[block.key]}>
          <SortableWidget
            block={block}
            label="Tips"
            editing={editing}
            sizeLabel={sizeLabel}
            sizeSteps={resizable ? sizeSteps : null}
            onHide={() => {}}
            onResize={onResize}
          >
            <div data-widget={block.key}>Tips body</div>
          </SortableWidget>
        </SortableContext>
      </DndContext>
    </ThemeProvider>
  );
}

describe('SortableWidget — the size pill follows the sizes of the formula (SMA-437, A-N11)', () => {
  const tips: DashboardBlock = { key: 'tips', size: 'medium', hidden: false };

  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  // REWRITTEN by SMA-437's size stepper: it pinned the absence of the corner
  // grip, read by the grip's name. What a one-size widget does not get is the
  // size pill now.
  it('draws no size pill for a widget that has one size: three controls, hide, move and options', () => {
    renderCell(tips, false);

    expect(screen.queryByRole('group', { name: /^Size of Tips/ })).toBeNull();
    expect(document.querySelector('[data-size-step]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide Tips' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Tips' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tips options' })).toBeInTheDocument();
  });

  // REWRITTEN likewise: it pinned the grip's name, « Change the size of Tips —
  // currently Medium ».
  it('draws it for a widget that has several: ONE group beside the card, named with the size it stands at, holding « − » then « + », each named with the size it leads to', () => {
    renderCell(tips, true);

    const pill = screen.getByRole('group', { name: 'Size of Tips: Medium' });
    // One direct child of the widget's wrapper, beside the card (D5).
    expect(pill.parentElement).toBe(document.querySelector('[data-widget="tips"]')!.parentElement);
    const segments = within(pill).getAllByRole('button');
    expect(segments.map((segment) => segment.getAttribute('data-size-step'))).toEqual(['smaller', 'larger']);
    expect(segments[0]).toHaveAccessibleName('Make Tips smaller — to Small');
    expect(segments[1]).toHaveAccessibleName('Make Tips larger — to Large');
    expect(segments[0]!.querySelector('svg[data-testid="RemoveRoundedIcon"]')).not.toBeNull();
    expect(segments[1]!.querySelector('svg[data-testid="AddRoundedIcon"]')).not.toBeNull();
  });

  // SMA-437 (D3) — the end of the scale on the cell itself: what the page
  // tests walk to with clicks (`GardensDashboard.edit.test.tsx`).
  it('makes a segment at the end of the scale inert — aria-disabled, never disabled, named for the end — and its click asks for no step, where the other one asks for its own', () => {
    const onResize = vi.fn();
    renderCell(tips, true, true, { sizeLabel: 'Small', sizeSteps: { smaller: null, larger: 'Medium' }, onResize });

    const shrink = screen.getByRole('button', { name: 'Make Tips smaller — already at the smallest size' });
    expect(shrink).toHaveAttribute('aria-disabled', 'true');
    expect(shrink).toBeEnabled();
    fireEvent.click(shrink);
    expect(onResize).not.toHaveBeenCalled();

    const grow = screen.getByRole('button', { name: 'Make Tips larger — to Medium' });
    expect(grow).not.toHaveAttribute('aria-disabled');
    fireEvent.click(grow);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith('larger');
  });
});

// SMA-437 (D1) — where the pill stands and what it is made of: the card's top
// band, LEFT of the gear — 6 px down, 42 px in from the right edge (the gear's
// 10 px, its 26 px and a 6 px gap) —, 26 px high, two segments 26 px wide
// around a 1 px rule, the chips' own tokens and the drag pill's 14 px radius.
// Read on the rules Emotion emits, under the product theme so the tokens
// resolve; the harness measures the drawn boxes (`dashboardLayout.test.tsx`).
describe('SortableWidget — the size pill’s place and make (SMA-437, D1)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('stands it in the top band left of the gear — top 6, right 42, 26 px high, the 14 px radius — on the chips’ surface and border, its two 26 px segments around a 1 px rule, its glyphs at 16 px', () => {
    const { palette } = createAppTheme('light');
    renderCell({ key: 'tips', size: 'medium', hidden: false }, true);
    const pill = screen.getByRole('group', { name: 'Size of Tips: Medium' });
    const flat = (node: Element) => rulesFor(node).toLowerCase().replace(/\s+/g, '');

    const rules = flat(pill);
    expect(rules).toContain('position:absolute');
    expect(rules).toContain('top:6px');
    expect(rules).toContain('right:42px');
    expect(rules).toContain('height:26px');
    expect(rules).toContain('box-sizing:border-box');
    expect(rules).toContain('border-radius:14px');
    expect(rules).toContain(`background-color:${palette.surfaceSubtle.toLowerCase()}`);
    expect(rules).toContain(`border-color:${palette.borderSubtle.toLowerCase()}`);

    const [shrink, rule, grow] = [...pill.children];
    for (const segment of [shrink!, grow!]) {
      expect(flat(segment)).toContain('width:26px');
      expect(flat(segment.querySelector('svg')!)).toContain('font-size:16px');
    }
    expect(flat(rule!)).toContain('width:1px');
    expect(flat(rule!)).toContain(`background-color:${palette.borderSubtle.toLowerCase()}`);
  });
});

// SMA-437 lot 1, PR A, step A3 (pre-flight D5, A-N10) — the rows are `auto`
// from 600 px up and the height lives on the cell: 273 px a row, 566 on two,
// by hand — and NOTHING for the Full width, whose row takes the height of its
// content, with no floor.
describe('SortableWidget — the pinned heights (SMA-437, A-N10)', () => {
  it.each<[DashboardSize, string]>([
    ['small', '273px'],
    ['medium', '273px'],
    ['large', '566px'],
  ])('pins a %s cell at %s from 600 px up, and leaves the phone to its content', (size, height) => {
    renderCell({ key: 'tips', size, hidden: false }, true, false);

    expect(declaredAtBreakpoint(slotOf('tips'), '600px', 'height')).toBe(height);
    expect(declaredAtBreakpoint(slotOf('tips'), '0px', 'height')).toBeNull();
  });

  it('gives a Full-width cell no height at all: its row is as tall as its content', () => {
    renderCell({ key: 'tips', size: 'wide', hidden: false }, true, false);

    const rules = rulesFor(slotOf('tips'));
    expect(declaredAtBreakpoint(slotOf('tips'), '600px', 'height')).toBeNull();
    expect(rules).not.toMatch(/[{;]height:/);
    // …and it spans every column of the desktop (D2).
    expect(declaredAtBreakpoint(slotOf('tips'), '1200px', 'grid-column')).toBe('span 4');
  });
});

// SMA-437 lot 1, PR B, step B5 (contract § 4.9, pre-flight D15) — at night MUI
// lightens a Paper by its elevation (`getOverlayAlpha(8)`, 11.9 % of white),
// and the options panel sat on #324260: its secondary text at 4.27:1, under
// the 4.5 of V14. The veil is removed on THIS Popover only — the theme's own
// `MuiPaper` keeps it for every dialog and menu.
describe('SortableWidget — the options panel at night (SMA-437, D15)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('draws the panel WITHOUT the night veil, so its secondary text holds 4.5:1', () => {
    const theme = createAppTheme('dark');
    render(
      <ThemeProvider theme={theme}>
        <DndContext>
          <SortableContext items={['tips']}>
            <SortableWidget
              block={{ key: 'tips', size: 'medium', hidden: false }}
              label="Tips"
              editing
              sizeLabel="Medium"
              sizeSteps={MEDIUM_STEPS}
              onHide={() => {}}
              onResize={() => {}}
            >
              <div data-widget="tips">Tips body</div>
            </SortableWidget>
          </SortableContext>
        </DndContext>
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tips options' }));
    const paper = screen.getByRole('dialog').closest('.MuiPaper-root') ?? screen.getByRole('dialog');

    expect(rulesFor(paper).replace(/\s+/g, '')).toContain('background-image:none');

    // The arithmetic of the two backgrounds: the card's, and the veiled one.
    const paperColor = hex(theme.palette.background.paper);
    const secondary = hex(theme.palette.text.secondary);
    expect(contrast(secondary, paperColor)).toBeGreaterThanOrEqual(4.5);
    const veiled = over(`rgba(255,255,255,${getOverlayAlpha(8)})`, paperColor);
    expect(contrast(secondary, veiled)).toBeLessThan(4.5);
  });
});
