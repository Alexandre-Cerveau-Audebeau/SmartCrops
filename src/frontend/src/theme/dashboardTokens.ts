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
  /**
   * The weather widget's palette (SMA-336 PR 3b/5, pre-flight § F.1) —
   * `A5MeteoTailles.dc.html` helmet, verbatim, day l. 51-52 / night l. 82-83:
   * `--sun` colours the sunny glyphs, `--cloud` the cloudy ones, `--rain` the
   * rainy ones and the probability of rain above 50 %.
   */
  sun: string;
  cloud: string;
  rain: string;
  /**
   * `--rain` as TEXT (the « 80 % » of a day row, 14 px / 700). NOT the
   * artboards' `#4A7FB5` by day (same rule as `ornText`, round 7 S40): on the
   * white card it measures 4,20:1, under the 4,5:1 floor WCAG AA sets for 14 px
   * text, and § 7 of the design contract makes « contraste conforme » an
   * invariant. One step darker on the same hue: 4,68:1. The glyphs and the
   * bars keep `rain` itself — graphics need 3:1, which `#4A7FB5` clears. The
   * night value (8,28:1 over the card) needed nothing.
   */
  rainText: string;
  /** The two ends of the min–max bar's gradient (`--temp-cold` → `--temp-warm`, l. 51 / 82). */
  tempCold: string;
  tempWarm: string;
  /**
   * The `.pill.warn` alert chip (l. 34 / 66): fill, text, glyph and 1 px
   * border — and the `.pill.wx` weather cell of the Gardens table, which draws
   * the same fill and text (l. 151).
   */
  warnBg: string;
  warnText: string;
  warnIcon: string;
  warnBorder: string;
  /** `--track` (l. 30 / 62): the mask over the gradient outside a day's min–max, and every bar's empty track. */
  track: string;
  /**
   * `--tint` (l. 30 / 62): the fill of the ACTIVE place tab (`.wx-tab.on`) and,
   * since PR 4a/5, of the CURRENT MONTH's column in the calendar grid
   * (`.cal .mh.now`, `.nowcol` — `A3Expert.dc.html` l. 211, 215).
   */
  tint: string;
  /**
   * The band of every OTHER row of the calendar grid (SMA-336 PR 4a/5, round 2
   * V33) — « un bleu plus clair en mode nuit », « gris ou bleu clair » by day.
   *
   * DERIVED, not invented: it is the palette's own `surfaceSubtle` in each
   * mode (`theme.ts` — `#F2F6F0` by day, `#1E3358` at night), the surface the
   * product already uses to lift a band off the card. It lives here rather
   * than being read from the palette because the dashboard's grounds are
   * declared in one place, and because the calendar is free to move it
   * without moving every subtle surface of the product with it.
   *
   * It carries WORDS — the variety names — so unlike the four lane tokens it
   * owes 4,5:1 and not 3:1, and it owes it in both themes. Asserted, not
   * recorded (`MonthBlock.test.tsx`).
   */
  zebraRow: string;
  /**
   * The four lanes of the « Ce mois-ci » calendar (SMA-336 PR 4a/5) —
   * `A3Expert.dc.html` helmet, verbatim, day l. 50 / night l. 81.
   *
   * Three of them are the plant detail timeline's own colours, which
   * `_spec.md` § 5 names as their source (« pistes du calendrier =
   * LifecycleSection.tsx, récolte éclaircie en nuit `#C8744A` »); the fourth,
   * {@link stagePrune}, exists nowhere else in the product — the detail page
   * has no pruning track — and is why these live here rather than being
   * imported from a component.
   *
   * They colour BARS, never text: 4 px lanes and 12 px legend squares are
   * graphics (3:1), and each legend square is named beside its colour, so the
   * meaning never rests on the hue alone (§ 7).
   */
  stagePrune: string;
  stageSow: string;
  stageFlower: string;
  stageHarvest: string;
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
  sun: '#E8890C',
  cloud: '#6E7F8E',
  rain: '#4A7FB5',
  rainText: '#4677AB',
  tempCold: '#6E9CC4',
  tempWarm: '#E8890C',
  warnBg: '#FFF4D6',
  warnText: '#8A6A14',
  warnIcon: '#E8890C',
  warnBorder: '#EFD27E',
  track: '#E9EFE7',
  tint: '#EAF5EE',
  zebraRow: '#F2F6F0',
  stagePrune: '#2C3E6B',
  stageSow: '#8FB996',
  stageFlower: '#E0A93B',
  stageHarvest: '#A0522D',
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
  sun: '#FFCB54',
  cloud: '#9FB0C2',
  rain: '#90CAF9',
  rainText: '#90CAF9',
  tempCold: '#7FB0DC',
  tempWarm: '#FFCB54',
  warnBg: 'rgba(255,203,84,0.13)',
  warnText: '#FFD98A',
  warnIcon: '#FFCB54',
  warnBorder: 'rgba(255,203,84,0.55)',
  track: '#31456B',
  tint: 'rgba(79,179,124,0.16)',
  zebraRow: '#1E3358',
  stagePrune: '#6E8AC8',
  stageSow: '#8FB996',
  stageFlower: '#E0A93B',
  // The one lane the artboards lighten at night, so an earth brown stays
  // visible on the dark card (`_spec.md` § 5).
  stageHarvest: '#C8744A',
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

/**
 * T4 — the weather widget's measures (SMA-336 PR 3b/5), in px, transcribed
 * VERBATIM from the CSS of `A5MeteoTailles.dc.html` (l. 221-237) and
 * `_spec.md` § 6 / § 10.26 / § 10.30. The widget is the one card without a
 * title row — « le lieu tient lieu de titre, dans tous ses états »
 * (`_spec.md:108`) — so its own scale lives beside the shared one.
 */
export const DASHBOARD_WEATHER = {
  /** `.wx-place`: 14 px / 700, a 17 px pin, gap 7. */
  place: 14,
  placeIcon: 17,
  placeGap: 7,
  /** `.wx-temp`: 56 px / 800, letter-spacing −0.03em, tabular; `.wx-temp.s` 44 px on the Small card. */
  temperature: 56,
  temperatureSmall: 44,
  /** The hero glyph beside the temperature: 44 px on Medium and Large, 36 on Small. */
  heroIcon: 44,
  heroIconSmall: 36,
  /** `.wx-cond`: 16 px / 600 — the three sizes alike (`_spec.md` § 10.28). */
  condition: 16,
  /** `.wx-mm`: 15 px, « 29° / 16° ». */
  minMax: 15,
  /** The left column of the Medium and Large heads: 160 px; 200 with the « 1/3 localisé » chip (A4). */
  heroColumn: 160,
  heroColumnWithChip: 200,
  /** The Large head is 136 px FIXED: 17 + 12 + 56 + 12 + 39 (`_spec.md` § 10.26). */
  largeHead: 136,
  /** `.wx-h`: six columns, each 92–124 px high and centred (§ 10.30); hour 13 / 700, glyph 28, temperature 16 / 800. */
  hourMinHeight: 92,
  hourMaxHeight: 124,
  hourLabel: 13,
  hourIcon: 28,
  hourTemperature: 16,
  hourGap: 6,
  /**
   * The STACKED head of the phone (SMA-336 mobile lot, step 3 — pre-flight
   * D2, arbitrage 1): under 600 px the hero takes the full width, the six
   * slots the full width under it, the band under them. Measured on
   * `5282852` at 360 px: side by side, the 160 px hero left the six slots
   * 104 px — 12.3 px each for 24-30 px of glyphs — and no height could fix a
   * width; stacked, 48 px a slot, zero overlap in the four weather states.
   * Three gaps and nothing else: the type, the hero column and the 136 px
   * Large head are the desktop's, untouched from `sm` up.
   */
  stackGap: 12,
  heroStackGap: 6,
  hourStackGap: 4,
  /** `.gard`: the gardener's band — radius 12, padding 11 / 16, 16 px / 600, a 20 px glyph, gap 10. */
  bandRadius: 12,
  bandPaddingY: 11,
  bandPaddingX: 16,
  bandText: 16,
  bandIcon: 20,
  bandGap: 10,
  /** `.wx-day`: rows ≥ 44 px, gap 12; day 44 px wide / 15 / 700; glyph 24; probability 42 px / 14 / 700; min 34 px / 15; bar 8 px. */
  dayRow: 44,
  dayGap: 12,
  dayLabelWidth: 44,
  dayLabel: 15,
  dayIcon: 24,
  dayChanceWidth: 42,
  dayChance: 14,
  dayTempWidth: 34,
  dayTemp: 15,
  bar: 8,
  /** `.wx-tab`: 28 px high, padding 0 13, radius 15, 14 px / 700. */
  tab: 28,
  tabPaddingX: 13,
  tabRadius: 15,
  tabText: 14,
  tabGap: 6,
  /** `.pill.warn`: 28 px high, 14 px / 700, a 16 px glyph; the line wraps with a 10 px gap. */
  alertChip: 28,
  alertChipText: 14,
  alertChipIcon: 16,
  alertGap: 10,
  /** `.pill.wx` of the Gardens table: a 14 px glyph before the temperature. */
  cellIcon: 14,
  /** `.dv`: the 1 px divider between the band and the five days. */
  divider: 1,
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
  /**
   * One grid row from 600 px up (V7): a Small and a Medium are one row tall, a
   * Large two rows and the gutter between them. The one source of the grid's
   * row height, for the CSS and for the drag model alike (SMA-437, D5).
   */
  row: 273,
} as const;
