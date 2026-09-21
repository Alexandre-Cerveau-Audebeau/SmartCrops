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
 *
 * The rows observed are the rows IN the list, by identity (fix round 1, #6 —
 * ledger `74b0ff36`): a row keyed on its content — a task whose id is a
 * digest of its sentence — is a NEW element after a refresh that changed it,
 * at the same count. The list's own box does not move, the count does not
 * change, and a set of rows fixed at mount would never see the new one. A
 * MutationObserver on the list's children keeps the observed set equal to
 * what the DOM holds, and recomputes on every change of it.
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

    /** Counts the whole rows whose heights and gaps fit the list's measured height, and stores that budget. */
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

    // The observed rows follow the list's children by IDENTITY: a row that
    // left is unobserved, a row that arrived is observed — whatever the count.
    const observed = new Set<Element>();
    /** Observes the rows now in the list, and no longer the ones that left it. */
    const syncRows = () => {
      const rows = new Set(Array.from(element.children));
      for (const row of observed) {
        if (!rows.has(row)) {
          observer.unobserve(row);
          observed.delete(row);
        }
      }
      for (const row of rows) {
        if (!observed.has(row)) {
          observer.observe(row);
          observed.add(row);
        }
      }
    };
    syncRows();
    const children =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            syncRows();
            compute();
          });
    children?.observe(element, { childList: true });

    compute();
    return () => {
      observer.disconnect();
      children?.disconnect();
    };
  }, [list, rowCount, gap]);

  return budget;
}
