import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/i18n';
import type { PlantSynonym } from '../../types/Plant';
import { BotanicalSynonymsSection } from './BotanicalSynonymsSection';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function syn(id: number, synonym: string, authority?: string): PlantSynonym {
  return {
    id,
    synonym,
    authority: authority ?? null,
  } as unknown as PlantSynonym;
}

// NOTE: jsdom ships no layout engine — every node's offsetTop is 0, so the
// two-row clamp never engages here (rowTops collapses to a single row). These
// tests therefore lock the no-layout path: all chips render and no toggle
// appears. The actual two-line clamp + "+N more" toggle is validated visually on
// the running app at several viewport widths.
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

  it('shows no toggle when the clamp cannot engage (no overflow measured)', () => {
    const synonyms = Array.from({ length: 20 }, (_, i) =>
      syn(i + 1, `Synonym number ${i + 1}`)
    );
    const { container } = render(
      <BotanicalSynonymsSection synonyms={synonyms} />
    );

    // All 20 chips mounted; without layout there is no surplus to hide.
    expect(container.querySelectorAll('[data-syn-chip]')).toHaveLength(20);
    expect(container.querySelector('[data-syn-toggle]')).toBeNull();
    expect(screen.queryByText('Show fewer')).toBeNull();
  });
});
