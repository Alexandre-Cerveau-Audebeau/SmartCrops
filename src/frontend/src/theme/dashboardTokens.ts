// Gardens Dashboard design tokens (SMA-336). Values are transcribed VERBATIM
// from the frozen artboards committed with the design
// (`Gardens Dashboard/sources/*.dc.html` helmet, `_spec.md` § 5): the
// invitation motif in both modes, and the widget type scale of `_spec.md` § 2.
//
// A module of its OWN rather than two more entries in plannerTokens.ts: the
// planner is out of scope for this lot, and the invitation motif belongs to the
// dashboard, not to the grid surfaces plannerTokens serves. Same rule as there
// applies here — if a token is missing from the frozen design, STOP AND REPORT
// rather than guessing a value.

export type DashboardThemeMode = 'light' | 'dark';

export interface DashboardTokens {
  /** Background of an invitation panel (`--inv-bg`). */
  invBg: string;
  /** Its 1px border (`--inv-bd`). */
  invBd: string;
  /** The soft disc behind an invitation's icon (`--inv-ic-bg`). */
  invIcBg: string;
  /**
   * Plan-thumbnail cell fill (`--cell-on`) and the frame behind the grid
   * (`--cell-on-bd`), for the DASHBOARD only.
   *
   * They exist here rather than in `plannerTokens` because the frozen design
   * moved them for the thumbnail and only for the thumbnail: at night the
   * planner's `#132740` / `#1F3556` sit at 1.04:1 and 1.22:1 against the widget
   * card, where a 2 px-per-cell sketch reads as an empty rectangle. The planner
   * grid keeps its own values — it is a full-size interactive surface, it is out
   * of this lot's scope, and `GardenGrid.test.tsx` pins `#132740` for it.
   *
   * The day values are the planner's, unchanged: the contrast problem the design
   * measured is a night one.
   */
  thumbCellOn: string;
  thumbCellFrame: string;
  /** Ornamental chip (`--orn-bg` / `--orn-tx`) — a garden with no edible variety. */
  ornBg: string;
  ornText: string;
  /** Fill of a variety avatar standing in for a photo (`--ph-fill`). */
  avatarFill: string;
}

const LIGHT: DashboardTokens = {
  invBg: '#F6FBF4',
  invBd: '#C5D9C6',
  invIcBg: '#E4F3E9',
  thumbCellOn: '#F1F7EE',
  thumbCellFrame: '#BCCBB6',
  ornBg: '#F8E3EC',
  ornText: '#A34D74',
  avatarFill: '#DCE9DF',
};

const DARK: DashboardTokens = {
  invBg: 'rgba(76,180,124,0.07)',
  invBd: 'rgba(76,180,124,0.35)',
  invIcBg: 'rgba(76,180,124,0.15)',
  thumbCellOn: '#1B3050',
  thumbCellFrame: '#2C4771',
  ornBg: 'rgba(244,143,177,0.16)',
  ornText: '#F4A7C3',
  avatarFill: '#24395F',
};

export function getDashboardTokens(mode: DashboardThemeMode): DashboardTokens {
  return mode === 'dark' ? DARK : LIGHT;
}

/**
 * T1 — the widget type scale (`_spec.md` § 2), in px. Fixed sizes, not MUI
 * variants: the round-2 design pass exists precisely because the widgets had
 * inherited the page's variants and read too small. Every widget surface takes
 * its font-size from here so the scale stays in one place.
 */
export const DASHBOARD_TYPE = {
  /** Widget title: 13px, 800, uppercase, letter-spacing .06em, muted. */
  title: 13,
  titleLetterSpacing: '0.06em',
  /** Body copy — list rows, tips, tasks, variety names. */
  body: 15,
  /** Secondary copy — sub-lines, captions. Never below 14. */
  secondary: 14,
  /** Links (« Voir la case F3 → »). */
  link: 15,
  /** Chip labels; chips are 26px high. */
  chip: 13,
  chipHeight: 26,
  /** Key numbers (counters, m², %): 28–32; 30 is the default. */
  big: 30,
  bigSmall: 28,
  /** Garden name on a Gardens card. */
  gardenName: 15,
} as const;

/** T2 — air (`_spec.md` § 3). */
export const DASHBOARD_SPACING = {
  /** Widget padding: 20px, 24px on a Large card. */
  padding: 20,
  paddingLarge: 24,
  /** Between elements inside a widget. */
  gap: 12,
  /** Between sections inside a widget. */
  sectionGap: 20,
  /** Grid gutter. */
  gutter: 20,
} as const;
