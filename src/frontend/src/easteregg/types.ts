import type { Plant } from '../types/Plant';
import type { FaqItem } from '../utils/plantDetailFaq';
import type { ExternalResourceCard } from '../components/plantDetail/ExternalResourcesSection';

/**
 * SMA-394 — the shape of one easter egg.
 *
 * An entry is DATA, not markup. Almost everything it carries travels through
 * `plant` into the page's real section components, which render it with the
 * same markup and the same classes as any catalogue plant; the fields below
 * cover only what those components have no slot for.
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
 * - `lead` — the opening line of a block (heading weight, brand colour).
 * - `quote` — a short call-out, centred and larger (used for the JP response).
 * - `closing` — the last line of a block (italic, brand colour).
 */
export interface EggNote {
  readonly text: string;
  readonly tone?: 'lead' | 'quote' | 'closing';
}

/** One observation row of the travel log shown under section 11. */
export interface EggObservation {
  readonly date: string;
  readonly location: string;
  readonly note: string;
  /** Marks the row the copy calls out as the key observation. */
  readonly starred?: boolean;
}

/** Sections of the real page an entry may switch off entirely. */
export type EggHideableSection = 'cta' | 'planMyGarden';

export interface EasterEggEntry {
  /** Accepted search keys, ALREADY normalised (trimmed, lower-case, single spaces). */
  readonly keys: readonly string[];
  /** The URL slug — and the card's `id`, which is what makes PlantCard link here. */
  readonly slug: string;
  /** What the library grid renders. */
  readonly card: Plant;
  /**
   * What PlantDetail renders instead of fetching. Its fields drive the real
   * gauges, bars, chips, rows, timeline and cards — see `entries/hikari.ts`.
   */
  readonly plant: Plant;

  // ── What the real components have no slot for ────────────────────────────

  /** Replaces PlantHeroGauges: this entry's own eight conditions. */
  readonly gauges: readonly EggGauge[];
  /**
   * Region pill text for CharacteristicsSection, written rather than coded —
   * the TDWG mapping would flatten "Japan" to "Asia".
   */
  readonly regions: { readonly native: string; readonly distribution: string };
  /** Written questions for FaqSection, replacing the derived ones. */
  readonly faq: readonly FaqItem[];
  /** Written cards for ExternalResourcesSection, replacing the catalogue links. */
  readonly resources: readonly ExternalResourceCard[];
  /** The travel log, rendered as one more card under ObservationsSection. */
  readonly observations: readonly EggObservation[];
  /** Prose attached under each section whose component takes no prose. */
  readonly notes: {
    readonly lifecycle: readonly EggNote[];
    readonly scientific: readonly EggNote[];
    readonly characteristics: readonly EggNote[];
    readonly culture: readonly EggNote[];
    readonly pests: readonly EggNote[];
    readonly similar: readonly EggNote[];
  };

  readonly hiddenSections: readonly EggHideableSection[];
  /** The last thing on the page, alone and centred. */
  readonly finalLine: string;
  /**
   * Font stack for this entry's non-latin runs. Applied through a conditional
   * `sx` on PlantDetail's Container, so no stylesheet is touched.
   */
  readonly fontStack: string;
}
