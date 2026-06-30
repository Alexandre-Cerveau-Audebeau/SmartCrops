import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import type { PlantSynonym } from '../../types/Plant';
import { BotanicalSynonymsSection } from './BotanicalSynonymsSection';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function syn(id: number, synonym: string, authority?: string): PlantSynonym {
  return { id, synonym, authority: authority ?? null };
}

// jsdom ships no layout engine — every node's offsetTop is 0, so the two-row
// clamp can't engage unless we stub offsetTop. The first three tests lock the
// no-layout path (all chips render, the always-mounted toggle stays hidden); the
// last simulates a wrapping layout to exercise the clamp + "+N more" toggle.
describe('BotanicalSynonymsSection (SMA-246 — two-row clamp)', () => {
  it('renders the header, pluralized caption and every synonym chip', () => {
    const synonyms = [
      syn(1, 'Lycopersicon esculentum', 'Mill.'),
      syn(2, 'Solanum esculentum'),
      syn(3, 'Lycopersicon lycopersicum', 'Karsten'),
    ];
    const { container } = render(
      <BotanicalSynonymsSection synonyms={synonyms} />
    );

    expect(screen.getByText('Botanical synonyms')).toBeInTheDocument();
    expect(screen.getByText('3 botanical synonyms')).toBeInTheDocument();

    for (const s of synonyms) {
      expect(screen.getByText(s.synonym)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('[data-syn-chip]')).toHaveLength(3);
  });

  it('exposes the botanical authority via an aria-labelled chip', () => {
    render(
      <BotanicalSynonymsSection
        synonyms={[syn(1, 'Lycopersicon esculentum', 'Mill.')]}
      />
    );
    expect(
      screen.getByLabelText('Lycopersicon esculentum (Mill.)')
    ).toBeInTheDocument();
  });

  it('keeps the toggle hidden (no accessible button) when nothing overflows', () => {
    const synonyms = Array.from({ length: 20 }, (_, i) =>
      syn(i + 1, `Synonym number ${i + 1}`)
    );
    const { container } = render(
      <BotanicalSynonymsSection synonyms={synonyms} />
    );

    // All 20 chips mounted; without layout there is no surplus to hide. The
    // toggle is in the DOM but display:none, so it is absent from the a11y tree.
    expect(container.querySelectorAll('[data-syn-chip]')).toHaveLength(20);
    expect(screen.queryByRole('button', { name: /more|fewer/i })).toBeNull();
  });

  it('clamps to two rows and reveals a "+N more" toggle when the layout wraps', async () => {
    // Simulate a 2-chips-per-row layout: chips report row = floor(domIndex/2)*24;
    // the toggle measures onto row 2 (24). With 6 chips this is three rows, so the
    // clamp engages and — measuring the toggle in flow — keeps the first four.
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute('data-syn-toggle')) return 24;
        if (this.hasAttribute('data-syn-chip')) {
          const parent = this.parentElement;
          const chips = parent
            ? Array.from(parent.querySelectorAll('[data-syn-chip]'))
            : [];
          return Math.floor(chips.indexOf(this) / 2) * 24;
        }
        return 0;
      }
    );

    const synonyms = Array.from({ length: 6 }, (_, i) =>
      syn(i + 1, `Synonym ${i + 1}`)
    );
    render(<BotanicalSynonymsSection synonyms={synonyms} />);

    // 6 chips → rows 0,0,24,24,48,48; four fit two rows with the toggle → "+ 2 more".
    const toggle = await screen.findByRole('button', {
      name: /\+\s*2\s*more/i,
    });
    expect(toggle).toBeInTheDocument();
  });
});
