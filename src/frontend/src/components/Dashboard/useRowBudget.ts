import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * SMA-336 mobile lot (arbitrage 3, steps 3 and 5) — how many of a list's rows
 * FIT in the height the list actually has, MEASURED, whole rows only.
 *
 * The To-do card at rest lists four tasks; on a desktop card of 273 px, four
 * sentences of two lines are 198 px for 193 of list, and the fourth used to be
 * printed under « +N tâches → » (V34). The Large weather card's five days used
 * to run under the partial invitation (pre-flight, constat 12). No
 * declaration can say how many rows fit: a row is as tall as its text wraps,
 * and the text wraps by the width the card has. So the list and its rows are
 * observed, and the budget is the count of whole rows whose heights and gaps
 * add up to the list's own height — never a row cut in the middle of a line.
 *
 * `Infinity` while nothing has been measured — jsdom, whose every rect is
 * zero, and the first paint before the observer fires — which reads as « show
 * everything »: an unmeasured list must not hide a row on a guess.
 *
 * The rows beyond the budget stay IN the DOM (`visibility: hidden`, out of the
 * accessibility tree): still measurable, so a list that grows back — a wider
 * window, a font that lands — reveals them again. Hiding a row can make the
 * « +N » line appear and shorten the list, which can hide one more row; that
 * chain only ever hides, never reveals, so it settles in at most one step.
 */
export function useRowBudget(
  list: RefObject<HTMLElement | null>,
  rowCount: number,
  /** The list's row gap, in px — the same number its `gap` declares. */
  gap: number
): number {
  const [budget, setBudget] = useState<number>(Infinity);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const compute = () => {
      const available = element.getBoundingClientRect().height;
      if (available <= 0) {
        setBudget(Infinity);
        return;
      }
      const rows = Array.from(element.children);
      let used = 0;
      let fit = 0;
      for (const row of rows) {
        const height = row.getBoundingClientRect().height;
        if (height <= 0) {
          // An unmeasured row: no verdict on this pass.
          fit = rows.length;
          break;
        }
        const next = used + (fit > 0 ? gap : 0) + height;
        if (next > available + 0.5) break;
        used = next;
        fit += 1;
      }
      setBudget(fit);
    };

    const observer = new ResizeObserver(compute);
    observer.observe(element);
    for (const row of Array.from(element.children)) observer.observe(row);
    compute();
    return () => observer.disconnect();
  }, [list, rowCount, gap]);

  return budget;
}
