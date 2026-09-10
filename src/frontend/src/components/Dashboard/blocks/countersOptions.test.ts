import { describe, expect, it } from 'vitest';
import {
  COUNTERS_GARDEN_ALL,
  countersOptions,
  resolveCountersGarden,
} from './countersOptions';

describe('countersOptions — reading a persisted document', () => {
  it('falls back to the defaults on nothing at all', () => {
    expect(countersOptions(null)).toEqual({
      photos: false,
      garden: COUNTERS_GARDEN_ALL,
    });
    expect(countersOptions(undefined)).toEqual({
      photos: false,
      garden: COUNTERS_GARDEN_ALL,
    });
  });

  it('trusts nothing it did not recognise', () => {
    expect(countersOptions({ photos: 'yes', garden: 42 })).toEqual({
      photos: false,
      garden: COUNTERS_GARDEN_ALL,
    });
    expect(countersOptions({ photos: true, garden: '' }).garden).toBe(
      COUNTERS_GARDEN_ALL
    );
  });

  it('keeps a document it wrote itself', () => {
    expect(countersOptions({ photos: true, garden: 'g2' })).toEqual({
      photos: true,
      garden: 'g2',
    });
  });
});

describe('resolveCountersGarden — one owner for the fallback (round 1, E8)', () => {
  /** Only the id is read; the widget and the panel both pass their real list. */
  const list = (...ids: string[]) => ids.map((id) => ({ id }));

  // The rule used to exist twice: `CountersOptionsPanel` for its select and
  // `CountersBlock` for its list. Two owners of one contract have to agree for
  // the select and the rows to describe the same state, and nothing made them.
  it('keeps a garden that still exists', () => {
    expect(resolveCountersGarden('g2', list('g1', 'g2'))).toBe('g2');
  });

  it('falls back to « all » for a garden that has been deleted', () => {
    // MUI draws an unmatched select value as an empty box the reader cannot
    // read, and a list filtered on a garden that is gone is empty with no chip
    // left to clear it. Both are the same defect and both are answered here.
    expect(resolveCountersGarden('gone', list('g1', 'g2'))).toBe(
      COUNTERS_GARDEN_ALL
    );
  });

  it('leaves the « all » sentinel alone, whatever gardens exist', () => {
    expect(resolveCountersGarden(COUNTERS_GARDEN_ALL, list('g1'))).toBe(
      COUNTERS_GARDEN_ALL
    );
    expect(resolveCountersGarden(COUNTERS_GARDEN_ALL, list())).toBe(
      COUNTERS_GARDEN_ALL
    );
  });

  it('falls back when the user has no garden at all', () => {
    expect(resolveCountersGarden('g1', list())).toBe(COUNTERS_GARDEN_ALL);
  });
});
