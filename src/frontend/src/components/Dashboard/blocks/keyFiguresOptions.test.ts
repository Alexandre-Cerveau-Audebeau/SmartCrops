import { describe, expect, it } from 'vitest';
import reference from '../../../constants/dashboardLayout.reference.json';
import {
  DEFAULT_KEY_FIGURES,
  KEY_FIGURES,
  keyFiguresOptions,
} from './keyFiguresOptions';

// SMA-437 lot 1, PR B, step B2 (pre-flight D9, D10) — the four figures of the
// Key figures band live on its block's `options`, `{ figures: [...] }`: FOUR
// keys, DISTINCT and KNOWN, or the band falls back to the four of 23/09. The
// document is persisted JSON this build may not have written, so every value
// is checked and nothing is trusted — and, like `countersOptions`, the keys
// another build owns are CARRIED, never dropped (Extension #4-11).

const DEFAULTS = ['free', 'occupancy', 'varieties', 'todo'];

describe('the catalogue and the defaults, pinned literally', () => {
  it('knows the 22 figures of V3-04, in its order (K_ORDER)', () => {
    expect([...KEY_FIGURES]).toEqual([
      'gardens', 'plants', 'varieties', 'edible', 'ornam',
      'surface', 'active', 'planted', 'occupancy', 'free', 'freeSun', 'sunShare',
      'prune', 'sow', 'harvest', 'flower',
      'todo', 'tips',
      'noplan', 'noorient', 'located', 'cities',
    ]);
  });

  it('defaults to cases libres, occupation, variétés, à faire aujourd’hui — in that order (23/09, point 3)', () => {
    expect([...DEFAULT_KEY_FIGURES]).toEqual(DEFAULTS);
  });

  it('reads the same catalogue and defaults as the server — the shared reference file', () => {
    expect([...KEY_FIGURES]).toEqual(reference.keyFigures.figures);
    expect([...DEFAULT_KEY_FIGURES]).toEqual(reference.keyFigures.defaults);
  });
});

describe('keyFiguresOptions — four distinct known figures, or the defaults', () => {
  it('reads no document as the defaults', () => {
    expect(keyFiguresOptions(null).figures).toEqual(DEFAULTS);
    expect(keyFiguresOptions(undefined).figures).toEqual(DEFAULTS);
    expect(keyFiguresOptions({}).figures).toEqual(DEFAULTS);
  });

  it('keeps four distinct known figures, in their stored order', () => {
    expect(keyFiguresOptions({ figures: ['cities', 'free', 'tips', 'surface'] }).figures).toEqual([
      'cities',
      'free',
      'tips',
      'surface',
    ]);
  });

  it.each([
    ['three figures', ['free', 'occupancy', 'varieties']],
    ['five figures', ['free', 'occupancy', 'varieties', 'todo', 'tips']],
    ['a duplicate', ['free', 'free', 'varieties', 'todo']],
    ['an unknown figure', ['free', 'occupancy', 'compost', 'todo']],
    ['a figure that is not a string', ['free', 'occupancy', 3, 'todo']],
    ['no array at all', 'free,occupancy,varieties,todo'],
    ['an object', { 0: 'free', 1: 'occupancy', 2: 'varieties', 3: 'todo' }],
    ['null', null],
  ])('falls back to the defaults on %s', (_label, figures) => {
    expect(keyFiguresOptions({ figures }).figures).toEqual(DEFAULTS);
  });

  it('never hands out the module’s own defaults: a caller may reorder its copy', () => {
    const first = keyFiguresOptions(null);
    first.figures.reverse();
    expect(keyFiguresOptions(null).figures).toEqual(DEFAULTS);
  });

  it('carries the keys another build owns, untouched — a newer setting survives an older tab', () => {
    const read = keyFiguresOptions({ figures: ['free', 'occupancy', 'varieties', 'todo'], density: 'compact' });
    expect(read.density).toBe('compact');
    // …and an invalid `figures` does not take them down with it.
    expect(keyFiguresOptions({ figures: 'nope', density: 'compact' }).density).toBe('compact');
  });
});
