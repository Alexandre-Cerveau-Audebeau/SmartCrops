import type { Plant } from '../types/Plant';

/**
 * SMA-394 — the shape of one easter egg.
 *
 * Everything an entry needs lives in this one object, so adding a SECOND easter
 * egg later is: write one more file next to `erina.ts`, add it to the registry
 * array in `index.ts`, done. No application file changes again.
 */

/** One icon-card of the hero "Growing conditions" row. */
export interface EggGauge {
  readonly key: string;
  /** Material Symbols glyph name, as the real gauges use. */
  readonly icon: string;
  readonly label: string;
  readonly value: string;
}

/** A label / value row of a definition-style card. */
export interface EggRow {
  readonly label: string;
  readonly value: string;
}

export interface EggFaqItem {
  readonly q: string;
  /**
   * Optional. An entry whose copy supplies no answer renders the question card
   * without the expand affordance rather than opening onto an empty panel —
   * inventing an answer would be writing copy that was never validated.
   */
  readonly a?: string;
}

export interface EggObservation {
  readonly date: string;
  readonly location: string;
  readonly note: string;
  /** Marks the row the copy calls out as the key observation. */
  readonly starred?: boolean;
}

export interface EggResource {
  readonly label: string;
  readonly note: string;
}

export interface EggPest {
  readonly name: string;
  readonly response: string;
}

export interface EggPhase {
  readonly phase: string;
  readonly period: string;
  readonly notes: string;
}

/** Sections of the real page an entry may switch off entirely. */
export type EggHideableSection =
  | 'distribution'
  | 'community'
  | 'cta'
  | 'planMyGarden';

export interface EasterEggEntry {
  /** Accepted search keys, ALREADY normalised (trimmed, lower-case, single spaces). */
  readonly keys: readonly string[];
  /** The URL slug — and the card's `id`, which is what makes PlantCard link here. */
  readonly slug: string;
  /** What the library grid renders. */
  readonly card: Plant;
  /** What PlantDetail renders instead of fetching. */
  readonly plant: Plant;

  // ── Section overrides. Each replaces one block of the real page. ──────────
  readonly gauges: readonly EggGauge[];
  readonly calendar: {
    readonly title: string;
    readonly body: string;
    readonly protocolTitle: string;
    readonly protocolBody: string;
    /** Japanese — gets the JP font stack. */
    readonly protocolResponse: string;
    readonly phases: readonly EggPhase[];
  };
  readonly scientific: {
    readonly spacingLabel: string;
    readonly spacing: string;
    readonly waterTitle: string;
    readonly water: readonly string[];
    readonly rows: readonly EggRow[];
  };
  readonly characteristics: readonly EggRow[];
  readonly nativeRange: string;
  readonly distribution: string;
  readonly cultivation: readonly string[];
  readonly pestIntro: string;
  readonly pests: readonly EggPest[];
  readonly pestTreatment: string;
  readonly pestOutro: string;
  readonly synonyms: readonly EggRow[];
  readonly observations: readonly EggObservation[];
  readonly resources: readonly EggResource[];
  readonly similar: {
    readonly title: string;
    readonly body: readonly string[];
  };
  readonly faq: readonly EggFaqItem[];

  readonly hiddenSections: readonly EggHideableSection[];
  /** The last thing on the page, alone and centred. */
  readonly finalLine: string;
  /**
   * Font stack for this entry's non-latin runs. Applied through a conditional
   * `sx` on PlantDetail's Container, so no stylesheet is touched.
   */
  readonly fontStack: string;
}
