import { afterEach, describe, expect, it } from 'vitest';
import { emittedRules, emotionClass } from './dashboardDom';

// ROUND 7 (S42 — Extension #8-16) — the probe reads the node's OWN rules.
describe('emittedRules — anchored on the selector, not on a substring', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  const styleTag = (css: string) => {
    const tag = document.createElement('style');
    tag.textContent = css;
    document.head.append(tag);
  };

  it('does not hand back the rules of a longer hash that starts the same way', () => {
    // Emotion hashes vary in length: `css-1a2b3c` is a prefix of `css-1a2b3cd`,
    // and an unanchored `includes` matched the neighbour's `<style>` too — a
    // design-freeze assertion could pass on a declaration the node never got.
    styleTag('.css-1a2b3c{color:red;}');
    styleTag('.css-1a2b3cd{width:44px;}');
    document.body.innerHTML = '<div class="MuiBox-root css-1a2b3c"></div>';
    const node = document.querySelector('div')!;

    expect(emotionClass(node)).toBe('css-1a2b3c');
    expect(emittedRules(node)).toEqual(['.css-1a2b3c{color:red;}']);
  });

  it('still reads a rule that qualifies the class with a pseudo-class or a descendant', () => {
    styleTag('.css-1a2b3c:hover{color:blue;}');
    styleTag('.css-1a2b3c .child{margin:0;}');
    document.body.innerHTML = '<div class="css-1a2b3c"></div>';
    const node = document.querySelector('div')!;

    expect(emittedRules(node)).toHaveLength(2);
  });
});
