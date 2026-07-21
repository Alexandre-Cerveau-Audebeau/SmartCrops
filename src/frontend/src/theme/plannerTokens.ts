// Garden Planner design tokens (SMA-17, phase 5.3) — the single source for the
// planner config dialog (§12) and the compass rose (§8), so no hex is hardcoded
// in a component (tokens doc §14 note 1). Values are transcribed VERBATIM from
// docs/design/SmartCrops_GardenPlanner_Design_Tokens.md §1 (day) / §2 (night) /
// §8 (compass) / §12 (dialog). This lot ships only the subset those two surfaces
// consume; the grid/layer/legend tokens land with their own lots.
//
// Compass letter colors: §8 names `compTx` (N letter) and `compMut` (E/S/O)
// WITHOUT giving hex values (CodeRabbit flagged this on the develop review of
// a605d2a, Finding 3). Resolved by explicit product decision (SMA-17):
// compTx -> --t-title, compMut -> --muted. Do NOT invent other values here — if
// a token is missing from the doc, STOP AND REPORT rather than guessing.

import type { ExposureCategory } from '../utils/exposure';
import type { InfrastructureType } from '../utils/infrastructure';

export type PlannerThemeMode = 'light' | 'dark';

/** Fill + border of one exposure category (§3 — day solids / night veils). */
export interface ExposureSwatch {
  fill: string;
  border: string;
}

/**
 * One §6 infrastructure style: bg + full border CSS + optional pattern
 * (bricks / lattice / dots as background-image) + icon and label colors.
 * Where §6 gives only a border COLOR, the width defaults to the table's
 * explicit 1px solid (the wall row); the trellis carries its own 1.5px
 * dashed treatment in both modes.
 */
export interface InfraStyle {
  bg: string;
  bd: string;
  image?: string;
  /** background-size for the pattern (§6 path: "size 9×9"). */
  imageSize?: string;
  icon: string;
  label: string;
}

export interface PlannerTokens {
  // Surfaces / chrome
  card: string;
  cardBd: string;
  divider: string;
  shadow: string;
  scrim: string;
  // Text
  tTitle: string;
  tMeta: string;
  tSci: string;
  muted: string;
  // Accents
  prim: string;
  expoIcc: string;
  // Inputs / rose circle
  inputBd: string;
  searchBg: string;
  // Segmented controls (§10)
  segBg: string;
  segOnBg: string;
  segOnTx: string;
  segShadow: string;
  // Outlined button (Annuler)
  obtnBd: string;
  obtnTx: string;
  // Counter/duration chip (§1/§2)
  cntChipBg: string;
  cntChipTx: string;
  // Help banner (§1/§2 --banner-*)
  bannerBg: string;
  bannerBd: string;
  bannerTx: string;
  // lightSchedule green zone (§12)
  zoneABg: string;
  zoneABd: string;
  // Selected garden-type card (§12)
  typeSelBg: string;
  // Compass (§8)
  compRing: string;
  compNeedle: string;
  compSTail: string;
  compTx: string; // N letter — --t-title (SMA-17 decision)
  compMut: string; // E/S/O letters — --muted (SMA-17 decision)
  // Switch track (§10 row 2 — inactive toggle)
  track: string;
  // Grid cells (§1/§2 — SMA-209 night grid palette)
  cellOn: string;
  cellOnBd: string;
  cellOff: string;
  cellOffBd: string;
  // Exposure layer (§3): per-category fill/border + the "Ombre" hatch
  expo: Record<ExposureCategory, ExposureSwatch>;
  hatch: string;
  // DnD (lot 2): §3 red collision hatch, §7 ghost bg/text, §1/§2 hint pill.
  redHatch: string;
  ghostBg: string;
  ghostTx: string;
  hintBg: string;
  hintTx: string;
  // Danger chip (§1/§2 --dang-* — the INFRAS. "Bloque la lumière" badge)
  dangBg: string;
  dangBd: string;
  dangTx: string;
  // Infrastructures (§6): per-type region style. The fence row is ratified
  // (SMA-303, 20 Jul 2026): §6 now carries the Clôture row — COMPOSED of
  // existing §6 values only (Mur palette + the Treillis dashed border
  // treatment); the tokens doc records the same ratification. Do NOT invent
  // new hex here — if a §6 value is missing, STOP AND REPORT (file-header
  // rule).
  infra: Record<InfrastructureType, InfraStyle>;
}

// Day-contrast deviation v2 (product decision, 16/07/2026): the mockup's day
// palette is judged too low-contrast — font AND border day values are
// DARKENED vs the mockup, in sync with the tokens doc §1 annotation (same
// commit). The mockup stays the STRUCTURE reference; these values win for
// day COLORS. Night (§2) untouched.
const LIGHT: PlannerTokens = {
  card: '#FFFFFF',
  cardBd: '#CBD5CA', // contrast v2 16/07 (mockup #F0F4EE)
  divider: '#CBD5CA', // contrast v2 16/07 (mockup #EDF2EC)
  shadow: '0 2px 10px rgba(27,94,58,0.07)',
  scrim: 'rgba(9,22,16,0.52)',
  tTitle: '#22302A',
  tMeta: '#2F3B34', // contrast v2 16/07 (mockup #3C4A42)
  tSci: '#5E6B64', // contrast v2 16/07 (mockup #75827A)
  muted: '#4F5A54', // contrast v2 16/07 (mockup #7A8781)
  prim: '#2E8B57',
  expoIcc: '#E8890C',
  inputBd: '#B4C1B4', // contrast v2 16/07 (mockup #D8E0D8)
  searchBg: '#FBFDFA',
  segBg: '#EFF3EE',
  segOnBg: '#FFFFFF',
  segOnTx: '#1B5E3A',
  segShadow: '0 1px 4px rgba(0,0,0,0.18)',
  obtnBd: '#B4C1B4', // contrast v2 16/07 (mockup #D8E0D8)
  obtnTx: '#2F3B34', // contrast v2 16/07 (mockup #3C4A42)
  cntChipBg: '#E4F3E9',
  cntChipTx: '#20713F',
  bannerBg: '#EFF6FD',
  bannerBd: '#BBD8F2',
  bannerTx: '#2C5A8A',
  zoneABg: '#EEF7F0',
  zoneABd: '#CDE6D6',
  typeSelBg: '#F0F9F3',
  compRing: '#D8E0D8',
  compNeedle: '#D64545',
  compSTail: '#D3DAD2',
  compTx: '#22302A',
  compMut: '#4F5A54', // = --muted (SMA-17 decision) → follows the v2 deviation
  track: '#E2EADF',
  cellOn: '#F1F7EE',
  cellOnBd: '#BCCBB6', // contrast v2 16/07 (mockup #DEE9DA)
  cellOff: '#ECEEEA',
  cellOffBd: '#C4CBC2', // contrast v2 16/07 (mockup #E3E6E1)
  expo: {
    full: { fill: '#FFE7A3', border: '#EFD27E' },
    morning: { fill: '#EDF3B4', border: '#D9E38C' },
    afternoon: { fill: '#FFD6A6', border: '#EFBD7F' },
    shade: { fill: '#CBD8E4', border: '#B4C5D6' },
  },
  hatch:
    'repeating-linear-gradient(45deg, rgba(71,94,120,0.18) 0px, rgba(71,94,120,0.18) 3px, transparent 3px, transparent 8px)',
  // §3 --red-hatch-day, §7 ghost day, §1 --hint-* — all doc-verbatim.
  redHatch:
    'repeating-linear-gradient(45deg, rgba(198,40,40,0.30) 0px, rgba(198,40,40,0.30) 4px, rgba(198,40,40,0.08) 4px, rgba(198,40,40,0.08) 9px)',
  ghostBg: 'rgba(191,227,203,0.92)',
  ghostTx: '#14532D',
  hintBg: 'rgba(34,48,42,0.88)',
  hintTx: '#fff',
  dangBg: '#FDEDED',
  dangBd: '#F2B8B5',
  dangTx: '#B3261E',
  // §6 day column, verbatim. Pattern line thickness (lattice 1px) is layout
  // plumbing — §6 specs the angle (±45°), color and 8px pitch only.
  infra: {
    wall: {
      bg: '#8A919C',
      bd: '1px solid #767E8A',
      image:
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.28) 0 1.5px, transparent 1.5px 13px), repeating-linear-gradient(90deg, rgba(255,255,255,0.28) 0 1.5px, transparent 1.5px 24px)',
      icon: '#fff',
      label: '#fff',
    },
    // Ratified (SMA-303): Mur palette + Treillis dashed treatment — see the
    // interface note above.
    fence: {
      bg: '#8A919C',
      bd: '1.5px dashed #767E8A',
      icon: '#fff',
      label: '#fff',
    },
    trellis: {
      bg: 'rgba(46,139,87,0.08)',
      bd: '1.5px dashed #2E8B57',
      image:
        'repeating-linear-gradient(45deg, rgba(46,139,87,0.30) 0 1px, transparent 1px 8px), repeating-linear-gradient(-45deg, rgba(46,139,87,0.30) 0 1px, transparent 1px 8px)',
      icon: '#2E8B57',
      label: '#20713F',
    },
    path: {
      bg: '#EDE4D3',
      bd: '1px solid #DCCFB8',
      image:
        'radial-gradient(circle at 4px 4px, rgba(120,100,70,0.30) 1.4px, transparent 2px)',
      imageSize: '9px 9px',
      icon: '#8A7351',
      label: '#6E5B40',
    },
    water: {
      bg: '#CCE7FA',
      bd: '1px solid #9FCDEE',
      icon: '#1565C0',
      label: '#1565C0',
    },
    pot: {
      bg: '#EFD7C3',
      bd: '1px solid #DDB894',
      icon: '#A0522D',
      label: '#A0522D',
    },
  },
};

const DARK: PlannerTokens = {
  card: '#16294A',
  cardBd: '#22375C',
  divider: '#24395F',
  shadow: '0 2px 10px rgba(0,0,0,0.28)',
  scrim: 'rgba(9,22,16,0.52)',
  tTitle: '#F2F6FA',
  tMeta: '#D6DEEC',
  tSci: '#9FACC2',
  muted: '#7E8CA6',
  prim: '#4CB47C',
  expoIcc: '#FFCB54',
  inputBd: '#2C3F63',
  searchBg: '#0F2038',
  segBg: '#0F2038',
  segOnBg: '#4CB47C',
  segOnTx: '#0D1D34',
  segShadow: '0 1px 4px rgba(0,0,0,0.18)',
  obtnBd: '#31456B',
  obtnTx: '#DCE4F0',
  cntChipBg: 'rgba(76,180,124,0.16)',
  cntChipTx: '#7ED0A4',
  bannerBg: 'rgba(76,140,220,0.12)',
  bannerBd: 'rgba(96,160,235,0.35)',
  bannerTx: '#A8C6EE',
  zoneABg: 'rgba(76,180,124,0.10)',
  zoneABd: 'rgba(76,180,124,0.32)',
  typeSelBg: 'rgba(76,180,124,0.12)',
  compRing: '#31456B',
  compNeedle: '#D64545',
  compSTail: '#31456B',
  compTx: '#F2F6FA',
  compMut: '#7E8CA6',
  track: '#31456B',
  cellOn: '#132740',
  cellOnBd: '#1F3556',
  cellOff: '#0B1830',
  cellOffBd: '#152742',
  expo: {
    full: { fill: 'rgba(255,203,84,0.36)', border: 'rgba(255,203,84,0.55)' },
    morning: { fill: 'rgba(196,214,100,0.30)', border: 'rgba(196,214,100,0.48)' },
    afternoon: { fill: 'rgba(255,148,92,0.34)', border: 'rgba(255,148,92,0.52)' },
    shade: { fill: 'rgba(124,152,190,0.22)', border: 'rgba(124,152,190,0.42)' },
  },
  hatch:
    'repeating-linear-gradient(45deg, rgba(142,170,206,0.30) 0px, rgba(142,170,206,0.30) 3px, transparent 3px, transparent 8px)',
  // §3 --red-hatch-night, §7 ghost night, §2 --hint-* — all doc-verbatim.
  redHatch:
    'repeating-linear-gradient(45deg, rgba(229,90,90,0.40) 0px, rgba(229,90,90,0.40) 4px, rgba(229,90,90,0.10) 4px, rgba(229,90,90,0.10) 9px)',
  ghostBg: 'rgba(76,180,124,0.45)',
  ghostTx: '#EAFBF2',
  hintBg: 'rgba(242,246,250,0.92)',
  hintTx: '#16294A',
  dangBg: 'rgba(229,90,90,0.13)',
  dangBd: 'rgba(229,90,90,0.45)',
  dangTx: '#F08A8A',
  // §6 night column, verbatim (fence ratified — night Mur palette + dashed).
  infra: {
    wall: {
      bg: '#3A4556',
      bd: '1px solid #4A5568',
      image:
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0 1.5px, transparent 1.5px 13px), repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1.5px, transparent 1.5px 24px)',
      icon: '#B9C4D6',
      label: '#D6DEEC',
    },
    fence: {
      bg: '#3A4556',
      bd: '1.5px dashed #4A5568',
      icon: '#B9C4D6',
      label: '#D6DEEC',
    },
    trellis: {
      bg: 'rgba(76,180,124,0.10)',
      bd: '1.5px dashed #4CB47C',
      image:
        'repeating-linear-gradient(45deg, rgba(76,180,124,0.35) 0 1px, transparent 1px 8px), repeating-linear-gradient(-45deg, rgba(76,180,124,0.35) 0 1px, transparent 1px 8px)',
      icon: '#7ED0A4',
      label: '#7ED0A4',
    },
    path: {
      bg: '#2E3A50',
      bd: '1px solid #3C4A63',
      image:
        'radial-gradient(circle at 4px 4px, rgba(214,222,236,0.28) 1.4px, transparent 2px)',
      imageSize: '9px 9px',
      icon: '#9FACC2',
      label: '#B4C0D4',
    },
    water: {
      bg: 'rgba(100,181,246,0.22)',
      bd: '1px solid rgba(100,181,246,0.5)',
      icon: '#90CAF9',
      label: '#90CAF9',
    },
    pot: {
      bg: 'rgba(200,120,70,0.26)',
      bd: '1px solid rgba(220,140,90,0.5)',
      icon: '#E9A06B',
      label: '#E9A06B',
    },
  },
};

export function getPlannerTokens(mode: PlannerThemeMode): PlannerTokens {
  return mode === 'dark' ? DARK : LIGHT;
}

/**
 * iPhone-style switch (§10: 34×19 track fully enclosing the 15px thumb,
 * active `--prim`, inactive `--track`) — lifted VERBATIM from the Exposition
 * toggle (R5) so every planner switch shares the exact same look.
 */
/** §4 grid metrics: the inter-cell gap in px per breakpoint — the single
 * numeric source the grid, the overlays and the DnD pointer→cell math share
 * (lot 2: moved here from GardenGrid — component files must only export
 * components, react-refresh). */
export const GAP_PX = { xs: 2, sm: 3 } as const;

/** Footprint badge chip (SMA-193): solid border when the spacing is known,
 * dashed for the mockup's unknown "1×1?" (Achillea). Shared by the sidebar
 * rows and the DnD ghost's N×N chip (lot 2) so the variants never drift. */
export const footprintBadgeSx = (tk: PlannerTokens, known: boolean) => ({
  fontSize: 10.5,
  fontWeight: 700,
  lineHeight: 1.4,
  borderRadius: '999px',
  px: '8px',
  py: '1px',
  flexShrink: 0,
  bgcolor: tk.segBg,
  border: `1px ${known ? 'solid' : 'dashed'} ${tk.divider}`,
  color: tk.muted,
});

export const iosSwitchSx = (tk: PlannerTokens) =>
  ({
    width: 34,
    height: 19,
    p: 0,
    '& .MuiSwitch-switchBase': {
      p: '2px',
      '&.Mui-checked': {
        transform: 'translateX(15px)',
        color: '#fff',
        '& + .MuiSwitch-track': {
          backgroundColor: tk.prim,
          opacity: 1,
        },
      },
    },
    '& .MuiSwitch-thumb': {
      width: 15,
      height: 15,
      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    },
    '& .MuiSwitch-track': {
      borderRadius: 9.5,
      backgroundColor: tk.track,
      opacity: 1,
    },
  }) as const;
