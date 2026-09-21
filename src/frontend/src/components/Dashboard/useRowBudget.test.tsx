import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRowBudget } from './useRowBudget';

// SMA-336 mobile lot (arbitrage 3) — the measured row budget. jsdom lays
// nothing out, so the geometry is stubbed the way the drag tests stub theirs:
// every element answers the height its `data-h` attribute declares, and a
// ResizeObserver that records its targets and fires when the test says so.

class ManualResizeObserver {
  static instances: ManualResizeObserver[] = [];
  readonly targets = new Set<Element>();
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ManualResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** Fires every observer the hook created, inside `act`. */
const fireAll = () =>
  act(() => {
    for (const instance of ManualResizeObserver.instances) instance.fire();
  });

/** Every element answers the height its `data-h` declares; returns the restore. */
function stubHeights() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const height = Number(this.getAttribute('data-h') ?? 0);
    return {
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height,
      width: 0, height, toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

/** A list of rows keyed by index, and the budget the hook answers for it. */
function List({ listHeight, rows, gap }: { listHeight: number; rows: number[]; gap: number }) {
  const ref = useRef<HTMLUListElement>(null);
  const budget = useRowBudget(ref, rows.length, gap);
  return (
    <>
      <ul ref={ref} data-h={listHeight}>
        {rows.map((height, index) => (
          <li key={index} data-h={height} />
        ))}
      </ul>
      <output data-testid="budget">{String(budget)}</output>
    </>
  );
}

/** The same list with KEYED rows: a changed key swaps the `<li>` for a new element, as a content-keyed task row does. */
function KeyedList({ listHeight, rows, gap }: { listHeight: number; rows: Array<{ key: string; height: number }>; gap: number }) {
  const ref = useRef<HTMLUListElement>(null);
  const budget = useRowBudget(ref, rows.length, gap);
  return (
    <>
      <ul ref={ref} data-h={listHeight}>
        {rows.map((row) => (
          <li key={row.key} data-h={row.height} />
        ))}
      </ul>
      <output data-testid="budget">{String(budget)}</output>
    </>
  );
}

/** The budget the rendered list prints. */
const budget = () => screen.getByTestId('budget').textContent;

describe('useRowBudget — whole rows that fit the measured list (SMA-336 mobile lot)', () => {
  let restore: () => void;

  beforeEach(() => {
    ManualResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', ManualResizeObserver);
    restore = stubHeights();
  });

  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  it('is Infinity — « show everything » — while nothing has a height (jsdom, the first paint)', () => {
    restore();
    render(<List listHeight={0} rows={[0, 0, 0]} gap={0} />);
    expect(budget()).toBe('Infinity');
  });

  it('counts the rows whose heights add up to the list’s: three 44 px days in 150 px', () => {
    render(<List listHeight={150} rows={[44, 44, 44, 44, 44]} gap={0} />);
    expect(budget()).toBe('3');
  });

  it('counts the gap between rows: 3 × 44 + 2 × 8 = 148 fits in 148, not in 147', () => {
    render(<List listHeight={148} rows={[44, 44, 44, 44]} gap={8} />);
    expect(budget()).toBe('3');
    render(<List listHeight={147} rows={[44, 44, 44, 44]} gap={8} />);
    expect(screen.getAllByTestId('budget')[1]!.textContent).toBe('2');
  });

  it('never cuts a row: rows of unequal heights are taken whole, in order', () => {
    // 22 + 8 + 44 + 8 + 44 = 126 fits in 130; the next 22 would need 156.
    render(<List listHeight={130} rows={[22, 44, 44, 22]} gap={8} />);
    expect(budget()).toBe('3');
  });

  it('observes the list AND every row, and follows a resize', () => {
    const { rerender } = render(<List listHeight={150} rows={[44, 44, 44, 44, 44]} gap={0} />);
    expect(budget()).toBe('3');
    const observer = ManualResizeObserver.instances.at(-1)!;
    expect(observer.targets.size).toBe(6);

    // The card grew: the observer fires, the budget follows.
    rerender(<List listHeight={230} rows={[44, 44, 44, 44, 44]} gap={0} />);
    fireAll();
    expect(budget()).toBe('5');

    // …and shrank again.
    rerender(<List listHeight={90} rows={[44, 44, 44, 44, 44]} gap={0} />);
    fireAll();
    expect(budget()).toBe('2');
  });

  it('is Infinity again when the list loses its height — a hidden card hides no row on a guess', () => {
    const { rerender } = render(<List listHeight={150} rows={[44, 44, 44, 44, 44]} gap={0} />);
    rerender(<List listHeight={0} rows={[44, 44, 44, 44, 44]} gap={0} />);
    fireAll();
    expect(budget()).toBe('Infinity');
  });

  // Fix round 1, #6 (ledger `74b0ff36`): a row REPLACED at a constant count —
  // a task whose content digest, and so its key, changed on a refresh — is
  // a new element the observer never saw, and the list's own box does not
  // move. The budget must follow the rows that are actually in the DOM.
  it('recomputes when a row is swapped for a taller one at the same count — the new element is observed too', async () => {
    const { rerender } = render(
      <KeyedList listHeight={100} rows={[{ key: 'a', height: 30 }, { key: 'b', height: 30 }, { key: 'c', height: 30 }]} gap={0} />
    );
    expect(budget()).toBe('3');
    const observer = ManualResizeObserver.instances.at(-1)!;
    expect(observer.targets.size).toBe(4);

    // The second row is another element now, twice as tall: 30 + 60 = 90
    // fits in 100, the third would need 120.
    await act(async () => {
      rerender(
        <KeyedList listHeight={100} rows={[{ key: 'a', height: 30 }, { key: 'b2', height: 60 }, { key: 'c', height: 30 }]} gap={0} />
      );
    });
    expect(budget()).toBe('2');
    // …and it is observed from now on, the replaced one no longer.
    const rows = [...document.querySelectorAll('li')];
    expect(rows.every((row) => observer.targets.has(row))).toBe(true);
    expect(observer.targets.size).toBe(4);
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<List listHeight={150} rows={[44, 44]} gap={0} />);
    const observer = ManualResizeObserver.instances.at(-1)!;
    expect(observer.targets.size).toBe(3);
    unmount();
    expect(observer.targets.size).toBe(0);
  });
});
