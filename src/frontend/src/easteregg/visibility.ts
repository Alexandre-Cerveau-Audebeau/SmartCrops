import type { EasterEggEntry } from './types';

/**
 * SMA-394: whether each section of the hidden page exists for a given entry.
 *
 * One predicate per section, in one module, so the three things that must agree
 * — the section, its notes card, and its table-of-contents entry — all read the
 * same expression. Before this existed `EggPests` returned null while its notes
 * and its sommaire entry rendered anyway; えりな J has nine pests, so nothing on
 * the page showed it.
 *
 * 🔴 THE RULE, and it is not ours to widen. The frozen skeleton names its
 * required anchors and makes exactly ONE of the fifteen conditional:
 *
 *   "Plant Detail v2 must preserve the frozen 15-section skeleton and its
 *    required anchors: #scientific-data, #characteristics, #edible, and
 *    conditional #pests rendered only when pests.length > 0."
 *
 * So `pestsVisible` is the only predicate here that may ever return false. A
 * section short of data renders its heading and its anchor and says so inside;
 * it does not vanish. Round 9 generalised the mechanism to #scientific-data,
 * which the guideline does not allow, and this file is where that was decided.
 *
 * It lives here rather than beside each component because
 * `react-refresh/only-export-components` forbids a section module from
 * exporting anything but its component.
 *
 * THE FIFTEEN, and which of them can be absent. Fourteen emit their
 * `<Box id=…>` unconditionally; 08 is the single exception.
 *
 *   01 overview          hero card, owned by `EasterEggDetail`   unconditional
 *   02 gallery           local section                           unconditional
 *   03 distribution      local section                           unconditional
 *   04 lifecycle         local section                           unconditional
 *   05 scientific-data   local section                           unconditional
 *   06 characteristics   local section                           unconditional
 *   07 edible            local section                           unconditional
 *   08 pests             local section                           CONDITIONAL
 *   09 common-names      shared, renders an empty state          unconditional
 *   10 synonyms          shared, renders an empty state          unconditional
 *   11 plantnet          local section                           unconditional
 *   12 sources           local section                           unconditional
 *   13 similar           local section                           unconditional
 *   14 faq               local section                           unconditional
 *   15 community         shared                                  unconditional
 *
 * Ten local sections above are unconditional, 08 is the eleventh and is the
 * conditional one; three are shared components and one is the hero card.
 * 14 + 1 = 15.
 *
 * The visibility map in `EasterEggDetail` is exhaustive at compile time and
 * will not let a new section be forgotten.
 */

/**
 * The Perenual xData section 05 is built from, or null. Section 05 renders
 * either way — see `scientificVisible` — but a null here means every
 * Perenual-derived row is unavailable, and it must NEVER fall back to the
 * legacy `Plants` columns: those are ~6% filled and would print wrong numbers.
 */
export const scientificData = (egg: EasterEggEntry) =>
  egg.plant.perenualData ?? null;

/**
 * Section 05 ALWAYS exists: `#scientific-data` is a required anchor. It takes
 * no entry BECAUSE it depends on none — that empty parameter list is the point,
 * and it is where anyone tempted to make this conditional again will land.
 */
export const scientificVisible = (): boolean => true;

/** Section 08 — THE one conditional section the frozen skeleton allows. */
export const pestsVisible = (egg: EasterEggEntry): boolean =>
  egg.plant.pests.length > 0;
