import type { Plant } from '../types/Plant';
import type { FaqItem } from '../utils/plantDetailFaq';
import type { ExternalResourceCard } from '../components/plantDetail/ExternalResourcesSection';
import type { WrittenTimeline } from '../components/plantDetail/LifecycleSection';
import type { WrittenScientificData } from '../components/plantDetail/ScientificDataSection';

/**
 * SMA-394: the shape of one easter egg.
 *
 * An entry is DATA, not markup. Almost everything it carries travels through
 * `plant`, or through a written-content prop, into the page's real section
 * components, which render it with the same markup and the same classes as any
 * catalogue plant. The fields below cover only what those components have no
 * slot for.
 *
 * Adding a SECOND easter egg later is: write one more file next to
 * `entries/hikari.ts`, add it to the registry array in `index.ts`, done.
 */

/** One icon-card of the hero "Growing conditions" row. */
export interface EggGauge {
  readonly key: string;
  /** Material Symbols glyph name, as the real gauges use. */
  readonly icon: string;
  readonly label: string;
  readonly value: string;
}

/**
 * A written paragraph attached to a section, rendered under the section's own
 * component in the page's card treatment.
 * - `badge` promotes the paragraph's opening label into a pill, which is how
 *   this page names a subject without reaching for a dash.
 * - `lead` is the opening line of a block (heading weight, brand colour).
 * - `quote` is a short call-out, centred and larger (used for the JP response).
 * - `closing` is the last line of a block (italic, brand colour).
 */
export interface EggNote {
  readonly text: string;
  readonly badge?: string;
  readonly tone?: 'lead' | 'quote' | 'closing';
}

/** Bar-set adjustments handed to the real CharacteristicsSection. */
export interface EggBars {
  readonly omit?: readonly string[];
  readonly extra?: readonly {
    readonly key: string;
    readonly label: string;
    readonly level: string;
    readonly pct: number;
    readonly color: string;
  }[];
  readonly tooltips?: Readonly<Record<string, string>>;
}

export interface EasterEggEntry {
  /** Accepted search keys, ALREADY normalised (trimmed, lower-case, single spaces). */
  readonly keys: readonly string[];
  /** The URL slug, and the card's `id`, which is what makes PlantCard link here. */
  readonly slug: string;
  /** What the library grid renders. */
  readonly card: Plant;
  /**
   * What PlantDetail renders instead of fetching. Its fields drive the real
   * gauges, chips, rows, pest cards and synonym chips: see `entries/hikari.ts`.
   */
  readonly plant: Plant;

  // ── Written content, fed INTO the real components ────────────────────────

  /** Replaces PlantHeroGauges: this entry's own eight conditions. */
  readonly gauges: readonly EggGauge[];
  /** Centred lines laid over the distribution map. */
  readonly mapOverlay: readonly string[];
  /** Her day, hour by hour, in place of the twelve-month calendar. */
  readonly timeline: WrittenTimeline;
  /** Extra rows and chip groups for the scientific "Available" column. */
  readonly scientific: WrittenScientificData;
  /** Bars kept, dropped, added and annotated in the characteristics panel. */
  readonly bars: EggBars;
  /**
   * Region pill text, written rather than coded: the TDWG mapping would
   * flatten "Japan" to "Asia".
   */
  readonly regions: { readonly native: string; readonly distribution: string };
  /** Written rows for the cultivation card. */
  readonly culture: readonly {
    readonly icon: string;
    readonly label: string;
    readonly value: string;
  }[];
  /** Bars of the observations chart, one per city, with a hover note. */
  readonly observations: readonly {
    readonly label: string;
    readonly value: number;
    readonly note: string;
  }[];
  readonly observationsTitle: string;
  readonly contributors: readonly {
    readonly name: string;
    readonly count: string;
  }[];
  /** Overlay lines of the similar-plants section. */
  readonly similar: readonly string[];
  /** Written questions for FaqSection, replacing the derived ones. */
  readonly faq: readonly FaqItem[];
  /** Written cards for ExternalResourcesSection, replacing the catalogue links. */
  readonly resources: readonly ExternalResourceCard[];

  /** Prose attached under each section whose component takes no prose. */
  readonly notes: {
    readonly gallery: readonly EggNote[];
    readonly lifecycle: readonly EggNote[];
    readonly scientific: readonly EggNote[];
    readonly characteristics: readonly EggNote[];
    readonly culture: readonly EggNote[];
    readonly pests: readonly EggNote[];
  };

  /** The last thing on the page, alone and centred. */
  readonly finalLine: string;
  /**
   * Font stack for this entry's non-latin runs. Applied through a conditional
   * `sx` on PlantDetail's Container, so no stylesheet is touched.
   */
  readonly fontStack: string;
}
