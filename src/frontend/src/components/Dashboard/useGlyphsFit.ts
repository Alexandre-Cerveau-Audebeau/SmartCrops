import { useLayoutEffect, useRef, useState } from 'react';

/**
 * `scrollWidth` is an integer: a natural width it reports can be short of the
 * real one by a fraction of a pixel, so a row counts as holding its content
 * only with this much to spare.
 */
const ROUNDING = 1;

/**
 * SMA-437 lot 1, PR A, step A7a — whether a card's ONE-LINE rows can carry
 * their chips' glyphs, MEASURED: true when they must be drawn bare.
 *
 * `_spec.md` § 10.24: the type chip carries its glyph « partout où elle
 * tient », and « le chip Ornemental suit la même règle »; the design removed
 * it in the two dense contexts it measured, the phone (A9) and the table
 * cell. The tablet is a third one the design never drew: at 600 px a Medium
 * card is 552 px wide, and « Balcon sud », its « Balcon » chip and its
 * « Ornemental » chip — 81 + 10 + 191 px with their glyphs — do not fit the
 * 272.5 px group of the row, which cut the « Ornemental » chip by 6.3 px and
 * the name by 2.6. No breakpoint can say where that happens: a chip is as
 * wide as its label, in its language, beside a name of any length. So the rows
 * are measured, as `useRowBudget` measures a list's height.
 *
 * A row's NEED is its children's natural widths (`scrollWidth`: what they
 * hold, even cut) and the gaps between them; its room is its own width,
 * which its content does not decide (`flex: 1`, `min-width: 0`). One row
 * short, and the whole card goes bare — every row in one form, as the design
 * applies the rule by context, never chip by chip.
 *
 * The needs are measured on the FULL form and kept: bare, a row is narrower,
 * and would « fit » again at once — the card goes back to its glyphs only when
 * the rows have the room the full form measured, so the two forms cannot
 * alternate. A change of `content` — the names, the types, the language —
 * forgets those needs and measures the full form again.
 *
 * `false` — the glyphs — while nothing has a width (jsdom, the first paint):
 * no glyph is dropped on a guess. Inert when `enabled` is false.
 *
 * The measured node arrives through the returned CALLBACK `ref`, never read
 * off a ref object (PR #287, fix round 1, S1): the node is state, so the
 * observer attaches each time it mounts and detaches when it unmounts. A card
 * that shows its loading or error view has no rows to measure; when they
 * arrive with the same content — the same gardens, the same language —
 * nothing else the measure depends on changes, and an effect that read
 * `ref.current` never ran again: no observer, and the glyphs stayed where
 * they did not fit. The node's own mounting is now what starts the measure,
 * whatever state kept it off the page.
 */
export function useGlyphsFit(
  /** The rows inside the node given to `ref`: one-line flex rows whose children sit side by side. */
  rowSelector: string,
  /** What the rows hold, as one string: the needs are measured again when it changes. */
  content: string,
  enabled: boolean
): { bare: boolean; ref: (node: HTMLElement | null) => void } {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [verdict, setVerdict] = useState<{ content: string; bare: boolean }>({ content, bare: false });
  const needs = useRef<{ content: string; widths: number[] } | null>(null);
  const bare = enabled && verdict.content === content && verdict.bare;

  useLayoutEffect(() => {
    if (!enabled || !element || typeof ResizeObserver === 'undefined') return;

    /** Measures the rows, and flips the form when the one drawn is not the one they call for. */
    const compute = () => {
      const rows = Array.from(element.querySelectorAll<HTMLElement>(rowSelector));
      const room = rows.map((row) => row.getBoundingClientRect().width);
      // An unmeasured row: no verdict on this pass.
      if (rows.length === 0 || room.some((width) => width <= 0)) return;
      if (!bare) {
        const widths = rows.map(needOf);
        needs.current = { content, widths };
        if (widths.some((need, index) => need + ROUNDING > room[index]!)) setVerdict({ content, bare: true });
        return;
      }
      const full = needs.current;
      if (
        full &&
        full.content === content &&
        full.widths.length === rows.length &&
        full.widths.every((need, index) => need + ROUNDING <= room[index]!)
      ) {
        setVerdict({ content, bare: false });
      }
    };

    const observer = new ResizeObserver(compute);
    observer.observe(element);
    // A row's room, and its children's sizes: a font that lands changes what
    // they need without changing the card.
    for (const row of element.querySelectorAll(rowSelector)) {
      observer.observe(row);
      for (const child of row.children) observer.observe(child);
    }
    compute();
    return () => observer.disconnect();
  }, [element, rowSelector, content, enabled, bare]);

  return { bare, ref: setElement };
}

/** A row's natural width: its children's, and the gaps between them. */
function needOf(row: HTMLElement): number {
  const children = Array.from(row.children);
  const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
  return children.reduce((sum, child) => sum + child.scrollWidth, 0) + gap * Math.max(0, children.length - 1);
}
