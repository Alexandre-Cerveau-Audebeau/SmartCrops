import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import { LanguageProvider } from '../../contexts/LanguageContext';
import ReorderableList from './ReorderableList';

// SMA-437 lot 1, PR B, step B5 (contract § 4.5, § 7.3; pre-flight D14) — the
// reorderable list is a BRICK: the Key figures band's four emplacements are its
// first user, the Customize panel's widgets and the gardens' own order the
// next two. What it owes all three: a handle taken by the pointer or the
// keyboard (Space, arrows, Space — Escape cancels), ▲ ▼ that keep the focus on
// themselves and say the new place, and ends that stay reachable.

const NAMES = ['Cases libres', 'Occupation', 'Variétés', 'À faire aujourd’hui'];
const ordinal = (index: number) => (index === 0 ? '1ʳᵉ place' : `${index + 1}ᵉ place`);

function Harness({
  onMove = () => {},
  onDraggingChange = () => {},
}: {
  onMove?: (from: number, to: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const [items, setItems] = useState(NAMES);
  const [said, setSaid] = useState('');
  return (
    <LanguageProvider>
      <p role="status" data-said>
        {said}
      </p>
      <ReorderableList
        items={items}
        getId={(name) => name}
        getName={(name) => name}
        placeOf={ordinal}
        label="Vos quatre chiffres"
        renderRow={(name) => <span>{name}</span>}
        onAnnounce={setSaid}
        onDraggingChange={onDraggingChange}
        onMove={(from, to) => {
          onMove(from, to);
          setItems((current) => {
            const next = [...current];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved!);
            return next;
          });
        }}
      />
    </LanguageProvider>
  );
}

/** The owner's live region — by its attribute: dnd-kit renders a `role="status"` of its own. */
const said = () => document.querySelector('[data-said]') as HTMLElement;

const rows = () => within(screen.getByRole('list', { name: 'Vos quatre chiffres' })).getAllByRole('listitem');
const order = () => rows().map((row) => row.textContent?.match(/Cases libres|Occupation|Variétés|À faire aujourd’hui/)?.[0]);

// jsdom implements no `scrollIntoView`; dnd-kit's keyboard sensor calls it
// when a row is picked up (the `Contact.test.tsx` idiom).
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.restoreAllMocks();
});

describe('ReorderableList — ▲ ▼ at the keyboard', () => {
  it('lists its rows, each with a handle, ▲ and ▼ named after the row', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    render(<Harness />);
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Déplacer «\u00a0Occupation\u00a0»' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monter «\u00a0Occupation\u00a0»' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descendre «\u00a0Occupation\u00a0»' })).toBeInTheDocument();
  });

  it('▲ moves the row up one place, SAYS its new place — and the focus stays on ▲', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    const up = screen.getByRole('button', { name: 'Monter «\u00a0Variétés\u00a0»' });
    up.focus();
    fireEvent.click(up);

    expect(onMove).toHaveBeenCalledWith(2, 1);
    expect(order()).toEqual(['Cases libres', 'Variétés', 'Occupation', 'À faire aujourd’hui']);
    expect(said()).toHaveTextContent('« Variétés » passe en 2ᵉ place.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Monter «\u00a0Variétés\u00a0»' }));
  });

  it('▼ moves the row down one place, and says so', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Descendre «\u00a0Cases libres\u00a0»' }));
    expect(order()).toEqual(['Occupation', 'Cases libres', 'Variétés', 'À faire aujourd’hui']);
    expect(said()).toHaveTextContent('« Cases libres » passe en 2ᵉ place.');
  });

  // SMA-437 lot 1, PR B, round 1, S1 — ▼ keeps the focus on ▼. On ▼, React
  // moves the FOCUSED row itself in the DOM (its keyed reconciliation moves the
  // row that falls behind), the engine drops the focus of the moved node — jsdom
  // as Chrome — and React's commit gives it back to the element focused before
  // it. These tests pin that end state; the harness reads it in Chrome, bare
  // and in a Popover (`test/layout/focusProbe.tsx`).
  it('▼ moves the row down one place — and the focus stays on ▼', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    render(<Harness />);
    const down = screen.getByRole('button', { name: 'Descendre «\u00a0Cases libres\u00a0»' });
    down.focus();
    fireEvent.click(down);
    expect(order()).toEqual(['Occupation', 'Cases libres', 'Variétés', 'À faire aujourd’hui']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Descendre «\u00a0Cases libres\u00a0»' }));
  });

  it('keeps the focus on ▼ when the row reaches the bottom — the button turns aria-disabled under it', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    render(<Harness />);
    const down = screen.getByRole('button', { name: 'Descendre «\u00a0Variétés\u00a0»' });
    down.focus();
    fireEvent.click(down);
    const again = screen.getByRole('button', { name: 'Descendre «\u00a0Variétés\u00a0»' });
    expect(order()).toEqual(['Cases libres', 'Occupation', 'À faire aujourd’hui', 'Variétés']);
    expect(document.activeElement).toBe(again);
    expect(again).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the ends REACHABLE: ▲ of the first row and ▼ of the last are aria-disabled, not disabled, and do nothing', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    const top = screen.getByRole('button', { name: 'Monter «\u00a0Cases libres\u00a0»' });
    const bottom = screen.getByRole('button', { name: 'Descendre «\u00a0À faire aujourd’hui\u00a0»' });
    expect(top).toHaveAttribute('aria-disabled', 'true');
    expect(top).not.toBeDisabled();
    expect(bottom).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(top);
    fireEvent.click(bottom);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('keeps the focus on ▲ when the row reaches the top — the button turns aria-disabled under it', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    render(<Harness />);
    const up = screen.getByRole('button', { name: 'Monter «\u00a0Occupation\u00a0»' });
    up.focus();
    fireEvent.click(up);
    const again = screen.getByRole('button', { name: 'Monter «\u00a0Occupation\u00a0»' });
    expect(document.activeElement).toBe(again);
    expect(again).toHaveAttribute('aria-disabled', 'true');
    expect(said()).toHaveTextContent('« Occupation » passe en 1ʳᵉ place.');
  });
});

describe('ReorderableList — the handle, at the keyboard', () => {
  it('picks the row up with Space, says so, and Escape CANCELS: nothing moves', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    const onMove = vi.fn();
    const onDraggingChange = vi.fn();
    render(<Harness onMove={onMove} onDraggingChange={onDraggingChange} />);
    const handle = screen.getByRole('button', { name: 'Déplacer «\u00a0Occupation\u00a0»' });
    handle.focus();

    await act(async () => {
      fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
      // dnd-kit's keyboard sensor listens for the next key a tick AFTER the
      // one that picked the row up.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onDraggingChange).toHaveBeenLastCalledWith(true);
    expect(said()).toHaveTextContent('« Occupation » en cours de déplacement');

    await act(async () => {
      fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
    });
    expect(onDraggingChange).toHaveBeenLastCalledWith(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(order()).toEqual(NAMES);
    expect(said()).toHaveTextContent('Déplacement de « Occupation » annulé.');
  });

  it('says the same in English', () => {
    localStorage.setItem('smartcrops-language', 'en');
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Move “Occupation” up' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move “Occupation” down' }));
    expect(said()).toHaveTextContent('“Occupation” moves to 3ᵉ place.');
  });
});
