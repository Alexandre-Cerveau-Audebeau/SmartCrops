/**
 * SMA-336 round 6 (Extension #4-14 / #5-15) — the DOM probes every dashboard
 * suite was carrying its own copy of.
 *
 * `emotionClass` and the rule reader existed five times across the cohort, and
 * the copies had already diverged — one returned the array of `<style>` texts,
 * the others a joined string, and the error messages differed. The slot
 * traversal (`card.parentElement?.parentElement`) existed three times under
 * three names. Style assertions against Emotion output are the load-bearing
 * technique of the whole design-freeze suite, and `SortableWidget` owns the
 * slot: a single added wrapper element broke four helpers in two files, each
 * failing with a different message and none naming the real cause. One owner,
 * one failure message.
 *
 * A module under `src/test/` rather than a helper exported from a test file:
 * importing from a `*.test.tsx` would run that file's suite as a side effect.
 */

/**
 * The Emotion class of a node, matched by its `css-` prefix rather than taken
 * as « the last class » (round 3, E″2): MUI puts a `MuiBox-root` before it and
 * may put a component class after it, so position is not a contract. Throws
 * rather than returning nothing, so a structural change is reported as a
 * missing node and not as a missing CSS rule.
 */
export function emotionClass(node: Element): string {
  const found = [...node.classList].find((name) => name.startsWith('css-'));
  if (!found) {
    throw new Error(
      `No Emotion class on <${node.tagName.toLowerCase()} class="${node.className}">`
    );
  }
  return found;
}

/** The `<style>` texts Emotion emitted that mention the node's class. */
export const emittedRules = (node: Element): string[] =>
  [...document.querySelectorAll('style')]
    .map((tag) => tag.textContent ?? '')
    .filter((text) => text.includes(emotionClass(node)));

/** The same rules, joined — what most assertions read. */
export const rulesFor = (node: Element): string => emittedRules(node).join(' ');

/**
 * The SortableWidget slot of a widget — the grid ITEM between the grid and the
 * card, which is the node the spans and `min-height: 0` are declared on.
 */
export function slotOf(widget: string): HTMLElement {
  const card = document.querySelector(`[data-widget="${widget}"]`);
  if (!card) throw new Error(`No widget "${widget}" rendered`);
  const slot = card.parentElement?.parentElement;
  if (!slot) {
    throw new Error(`The slot of "${widget}" is not where it was expected`);
  }
  return slot as HTMLElement;
}

/**
 * The grid container: the widget cards sit inside a SortableWidget slot, which
 * sits inside the grid. Guarded at every step (round 3, E″2) so a change of
 * structure fails as « the grid was not found » instead of silently handing
 * back an unrelated node whose rules happen to be empty.
 */
export function gridNode(): HTMLElement {
  const card = document.querySelector('[data-widget]');
  if (!card) throw new Error('No widget rendered: the grid cannot be located');
  const grid = card.parentElement?.parentElement?.parentElement;
  if (!grid) throw new Error('The grid container is not where it was expected');
  if (!emittedRules(grid).some((text) => text.includes('display:grid'))) {
    throw new Error('The node reached is not the display:grid container');
  }
  return grid as HTMLElement;
}
