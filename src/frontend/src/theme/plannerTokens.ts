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

export type PlannerThemeMode = 'light' | 'dark';

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
}

const LIGHT: PlannerTokens = {
  card: '#FFFFFF',
  cardBd: '#F0F4EE',
  divider: '#EDF2EC',
  shadow: '0 2px 10px rgba(27,94,58,0.07)',
  scrim: 'rgba(9,22,16,0.52)',
  tTitle: '#22302A',
  tMeta: '#3C4A42',
  muted: '#7A8781',
  prim: '#2E8B57',
  expoIcc: '#E8890C',
  inputBd: '#D8E0D8',
  searchBg: '#FBFDFA',
  segBg: '#EFF3EE',
  segOnBg: '#FFFFFF',
  segOnTx: '#1B5E3A',
  segShadow: '0 1px 4px rgba(0,0,0,0.18)',
  obtnBd: '#D8E0D8',
  obtnTx: '#3C4A42',
  zoneABg: '#EEF7F0',
  zoneABd: '#CDE6D6',
  typeSelBg: '#F0F9F3',
  compRing: '#D8E0D8',
  compNeedle: '#D64545',
  compSTail: '#D3DAD2',
  compTx: '#22302A',
  compMut: '#7A8781',
};

const DARK: PlannerTokens = {
  card: '#16294A',
  cardBd: '#22375C',
  divider: '#24395F',
  shadow: '0 2px 10px rgba(0,0,0,0.28)',
  scrim: 'rgba(9,22,16,0.52)',
  tTitle: '#F2F6FA',
  tMeta: '#D6DEEC',
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
  zoneABg: 'rgba(76,180,124,0.10)',
  zoneABd: 'rgba(76,180,124,0.32)',
  typeSelBg: 'rgba(76,180,124,0.12)',
  compRing: '#31456B',
  compNeedle: '#D64545',
  compSTail: '#31456B',
  compTx: '#F2F6FA',
  compMut: '#7E8CA6',
};

export function getPlannerTokens(mode: PlannerThemeMode): PlannerTokens {
  return mode === 'dark' ? DARK : LIGHT;
}
