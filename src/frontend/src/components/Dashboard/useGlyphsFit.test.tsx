import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlyphsFit } from './useGlyphsFit';

// SMA-437 lot 1, PR A, step A7a — whether one-line rows can carry their
// chips' glyphs, measured. jsdom lays nothing out, so the geometry is stubbed
// as `useRowBudget.test.tsx` stubs it: a row answers the width its `data-w`
// declares, a child the natural width its `data-sw` declares (`scrollWidth`),
// and a ResizeObserver fires when the test says so.

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

/** Widths from `data-w`, natural widths from `data-sw`; returns the restore. */
function stubWidths() {
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')!;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const width = Number(this.getAttribute('data-w') ?? 0);
    return {
      x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0,
      width, height: 0, toJSON: () => ({}),
    } as DOMRect;
  };
  Object.defineProperty(Element.prototype, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      return Number(this.getAttribute('data-sw') ?? 0);
    },
  });
  return () => {
    Element.prototype.getBoundingClientRect = originalRect;
    Object.defineProperty(Element.prototype, 'scrollWidth', originalScroll);
  };
}

/**
 * A row: its width, and the natural widths of its children WITH their glyphs
 * (`full`) and without (`bare`) — the form drawn is the one the hook answers,
 * so a row that fits bare and not full is the case that could oscillate.
 */
interface Row {
  w: number;
  full: number[];
  bare: number[];
}

function Rows({ rows, content = 'a', enabled = true }: { rows: Row[]; content?: string; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const bare = useGlyphsFit(ref, '[data-row]', content, enabled);
  return (
    <>
      <div ref={ref} data-w={600}>
        {rows.map((row, index) => (
          <div key={index} data-row data-w={row.w} style={{ columnGap: '10px' }}>
            {(bare ? row.bare : row.full).map((width, child) => (
              <span key={child} data-sw={width} />
            ))}
          </div>
        ))}
      </div>
      <output data-testid="bare">{String(bare)}</output>
    </>
  );
}

/** Whether the rendered rows are drawn bare. */
const bare = () => screen.getByTestId('bare').textContent;

/** The Balcon sud row of the harness: « Balcon sud » 81, its two chips 191 with their glyphs, 152 without. */
const balcon = (w: number): Row => ({ w, full: [81, 191], bare: [81, 152] });

describe('useGlyphsFit — the chips keep their glyphs wherever they fit (SMA-437, A7a)', () => {
  let restore: () => void;

  beforeEach(() => {
    ManualResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', ManualResizeObserver);
    restore = stubWidths();
  });

  afterEach(() => {
    restore();
    vi.unstubAllGlobals();
  });

  it('keeps the glyphs while nothing has a width (jsdom, the first paint) — no glyph dropped on a guess', () => {
    restore();
    render(<Rows rows={[balcon(0)]} />);
    expect(bare()).toBe('false');
  });

  it('keeps the glyphs where the row holds them: 81 + 10 + 191 = 282 in the 286.5 px of a 1 280 px desktop', () => {
    render(<Rows rows={[balcon(286.5)]} />);
    expect(bare()).toBe('false');
  });

  it('drops them where it does not: 282 in the 272.5 px of a 600 px tablet', () => {
    render(<Rows rows={[balcon(272.5)]} />);
    expect(bare()).toBe('true');
  });

  it('keeps a pixel for the rounding of `scrollWidth`: 282 fits 283, not 282.5', () => {
    render(<Rows rows={[balcon(283)]} />);
    expect(bare()).toBe('false');
    render(<Rows rows={[balcon(282.5)]} />);
    expect(screen.getAllByTestId('bare')[1]!.textContent).toBe('true');
  });

  it('answers for the whole card: one row short, every row bare', () => {
    render(<Rows rows={[{ w: 272.5, full: [64, 90], bare: [64, 70] }, balcon(272.5)]} />);
    expect(bare()).toBe('true');
  });

  it('stays bare while the full form still does not fit — the bare form fitting is no reason to go back', () => {
    render(<Rows rows={[balcon(272.5)]} />);
    expect(bare()).toBe('true');
    fireAll();
    fireAll();
    expect(bare()).toBe('true');
  });

  it('gives the glyphs back once the rows are wide enough for the full form it measured', () => {
    const { rerender } = render(<Rows rows={[balcon(272.5)]} />);
    expect(bare()).toBe('true');

    rerender(<Rows rows={[balcon(278)]} />);
    fireAll();
    expect(bare()).toBe('true');

    rerender(<Rows rows={[balcon(286.5)]} />);
    fireAll();
    expect(bare()).toBe('false');
  });

  it('measures again when the content changes — a shorter name gets its glyphs at once', () => {
    const { rerender } = render(<Rows rows={[balcon(272.5)]} />);
    expect(bare()).toBe('true');
    rerender(<Rows rows={[{ w: 272.5, full: [40, 191], bare: [40, 152] }]} content="b" />);
    expect(bare()).toBe('false');
  });

  it('observes the container, every row and every row’s child, and nothing once unmounted', () => {
    const { unmount } = render(<Rows rows={[balcon(286.5), balcon(286.5)]} />);
    const observer = ManualResizeObserver.instances.at(-1)!;
    expect(observer.targets.size).toBe(1 + 2 + 4);
    unmount();
    expect(observer.targets.size).toBe(0);
  });

  it('does nothing when disabled — the phone row has no glyph to drop', () => {
    render(<Rows rows={[balcon(272.5)]} enabled={false} />);
    expect(bare()).toBe('false');
    expect(ManualResizeObserver.instances).toHaveLength(0);
  });
});
