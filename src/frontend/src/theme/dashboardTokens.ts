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
  /**
   * The GREEN count pill (`--chip-ok-bg` / `--chip-ok-tx`) — « 50 plantes » at
   * the right of a Medium Gardens row (`A2Novice.dc.html`, `.pill.ok`).
   *
   * Its own pair rather than {@link invIcBg}: that one is the disc behind an
   * invitation's icon and the artboards give the two different night values
   * (0.15 against 0.16), so sharing would tie a count pill to an invitation
   * motif that has no reason to move with it.
   */
  okBg: string;
  okText: string;
  /**
   * The NEUTRAL count pill of a widget header (`--pill-bg` / `--pill-tx`) —
   * « 3 jardins » on Gardens, « 42,5 m² · occupation moyenne 67 % » on
   * Statistics (`Main.dc.html` l. 146, `.pill.n`).
   *
   * The artboards draw every header chip FILLED; the widgets drew them as MUI
   * outlines, which is a different object — a bordered ghost where the design
   * has a tinted lozenge (round 5, A10-5).
   */
  pillBg: string;
  pillText: string;
  /**
   * The 45° hatch the artboards lay over the SHADE exposure swatch
   * (`--hatch`, `Main.dc.html` l. 46 and 77; used by `.ex-shade`, l. 206).
   *
   * Shade is the one category whose fill is a cool grey, and the hatch is what
   * keeps it from reading as « no data » next to three saturated colours. It is
   * also the one signal of the four that survives a greyscale print.
   */
  exposureHatch: string;
  /** Fill of a variety avatar standing in for a photo (`--ph-fill`). */
  avatarFill: string;
  /**
   * The 1 px ring of a Counters colour pastille (round 6, partie E1) —
   * `Main.dc.html` l. 158-159: `.dot { border: 1px solid rgba(0,0,0,0.12) }`
   * and `.night .dot { border-color: rgba(255,255,255,0.18) }`. It is what keeps
   * a pale plant hue from dissolving into the card.
   */
  dotRing: string;
  /**
   * The 1 px border of every OUTLINED chip of the page (`--chip-bd`) — the type
   * chips, the level chip, the unselected garden filters (round 6, N6-4).
   * MUI's outlined chip draws `grey[400]` by day and `grey[700]` by night; the
   * artboards draw `#B4C1B4` and `#2C3F63`, and at night the two are not close.
   */
  chipBorder: string;
}

const LIGHT: DashboardTokens = {
  invBg: '#F6FBF4',
  invBd: '#C5D9C6',
  invIcBg: '#E4F3E9',
  thumbCellOn: '#F1F7EE',
  thumbCellFrame: '#BCCBB6',
  ornBg: '#F8E3EC',
  // NOT the artboards' `--orn-tx` `#A34D74` (round 7, S40 — Extension #7-25):
  // on `--orn-bg` it measures 4,44:1, under the 4,5:1 floor WCAG AA sets for
  // 13 px text, and § 7 of the design contract makes « contraste conforme » an
  // invariant the artboards' own point 31 already amended a colour for. One
  // step darker on the same hue: 5,29:1. The night pair (5,84:1 over the card)
  // needed nothing.
  ornText: '#93436A',
  okBg: '#E4F3E9',
  okText: '#20713F',
  pillBg: '#EFF3EE',
  pillText: '#55645B',
  exposureHatch:
    'repeating-linear-gradient(45deg, rgba(71,94,120,0.18) 0px, rgba(71,94,120,0.18) 3px, transparent 3px, transparent 8px)',
  avatarFill: '#DCE9DF',
  dotRing: 'rgba(0,0,0,0.12)',
  chipBorder: '#B4C1B4',
};

const DARK: DashboardTokens = {
  invBg: 'rgba(76,180,124,0.07)',
  invBd: 'rgba(76,180,124,0.35)',
  invIcBg: 'rgba(76,180,124,0.15)',
  thumbCellOn: '#1B3050',
  thumbCellFrame: '#2C4771',
  ornBg: 'rgba(244,143,177,0.16)',
  ornText: '#F4A7C3',
  okBg: 'rgba(76,180,124,0.16)',
  okText: '#7ED0A4',
  pillBg: 'rgba(126,140,166,0.16)',
  pillText: '#B4C0D4',
  exposureHatch:
    'repeating-linear-gradient(45deg, rgba(142,170,206,0.30) 0px, rgba(142,170,206,0.30) 3px, transparent 3px, transparent 8px)',
  avatarFill: '#24395F',
  dotRing: 'rgba(255,255,255,0.18)',
  chipBorder: '#2C3F63',
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
  /**
   * Widget title: 800, uppercase, letter-spacing .06em, muted.
   *
   * 15px, not the artboards' 13 (amendment A1, round 4). The frozen design has
   * `.hd-t { font-size: 13px }`, and Alexandre asked for the titles to read
   * bigger: « les titres en haut des widgets doivent être un peu plus gros,
   * avec une plus grande police ». Everything else about the rule — the weight,
   * the capitals, the tracking, the colour — is the artboard's, unchanged.
   */
  title: 15,
  titleLetterSpacing: '0.06em',
  /**
   * The icon that precedes a widget title (amendment A2, round 4). The artboards
   * draw it at 18 (`<svg class="ic" width="18">` before `<span class="hd-t">`);
   * 20 is the amendment, taken with the 13 → 15 of the title so the two stay in
   * proportion.
   */
  titleIcon: 20,
  /** Body copy — list rows, tips, tasks, variety names. */
  body: 15,
  /** Secondary copy — sub-lines, captions. Never below 14. */
  secondary: 14,
  /** Links (« Voir la case F3 → »). */
  link: 15,
  /** Chip labels; chips are 26px high. */
  chip: 13,
  chipHeight: 26,
  /**
   * Chips INSIDE the comparison table are 24 px (round 6, N5-2):
   * `Main.dc.html` l. 200, `.tbl .pill { height: 24px; font-size: 13px;
   * padding: 0 8px; gap: 4px }` — two pixels shorter than the 26 px `.pill`
   * everywhere else, so a 44 px row keeps its air.
   */
  tableChipHeight: 24,
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
