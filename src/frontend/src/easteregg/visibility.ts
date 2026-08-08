import type { EasterEggEntry } from './types';

/**
 * SMA-394: whether each section of the hidden page exists for a given entry.
 *
 * One predicate per section that can suppress itself, in one module, so the
 * three things that must agree — the section, its notes card, and its
 * table-of-contents entry — all read the same expression. Before this existed
 * `EggPests` returned null while its notes and its sommaire entry rendered
 * anyway; えりな J has nine pests, so nothing on the page showed it.
 *
 * It lives here rather than beside each component because
 * `react-refresh/only-export-components` forbids a section module from
 * exporting anything but its component.
 *
 * HOW THIS LIST WAS ENUMERATED, rather than guessed: a section can only
 * suppress itself by returning before it emits its anchor, so every component
 * supplying one of the fifteen anchors was checked for an early return.
 * Exactly two have one. The other thirteen emit their `<Box id=…>`
 * unconditionally — eleven local sections, plus `CommonNamesSection` and
 * `BotanicalSynonymsSection`, which render an empty state rather than nothing,
 * plus `CommunitySection` and the hero card `EasterEggDetail` owns itself.
 *
 * Add a section that can self-suppress and it belongs here; the visibility map
 * in `EasterEggDetail` is exhaustive at compile time and will not let the entry
 * be forgotten.
 */

/** The one field section 05 is built from. */
export const scientificData = (egg: EasterEggEntry) =>
  egg.plant.perenualData ?? null;

/** Section 05 exists only when the entry carries Perenual xData. */
export const scientificVisible = (egg: EasterEggEntry): boolean =>
  scientificData(egg) !== null;

/** Section 08 exists only when the entry names at least one pest. */
export const pestsVisible = (egg: EasterEggEntry): boolean =>
  egg.plant.pests.length > 0;
