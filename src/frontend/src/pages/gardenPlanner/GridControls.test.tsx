import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import type { Moment, Season } from '../../utils/exposure';
import { GridControls } from './GridControls';

// R2 (SMA-17 5.3-D): GridControls is now the TOOLBAR CARD only — the garden
// title and the Réglages/Annuler/Enregistrer actions moved to the page
// header, so the F3 save/cancel gating pin lives in GardenPlanner.test.tsx.

function renderControls(
  overrides: {
    canUndo?: boolean;
    exposureVisible?: boolean;
    exposureMoment?: Moment;
    exposureSeason?: Season;
    onUndo?: () => void;
    onToggleExposure?: () => void;
    onSetExposureMoment?: (moment: Moment) => void;
    onSetExposureSeason?: (season: Season) => void;
  } = {}
) {
  return render(
    <GridControls
      hasGrid
      shapeEditMode={false}
      zoom={1}
      canUndo={overrides.canUndo ?? false}
      exposureVisible={overrides.exposureVisible ?? false}
      exposureMoment={overrides.exposureMoment ?? 'noon'}
      exposureSeason={overrides.exposureSeason ?? 'summer'}
      onSelectAll={vi.fn()}
      onDeselectAll={vi.fn()}
      onUndo={overrides.onUndo ?? vi.fn()}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
      onToggleExposure={overrides.onToggleExposure ?? vi.fn()}
      onSetExposureMoment={overrides.onSetExposureMoment ?? vi.fn()}
      onSetExposureSeason={overrides.onSetExposureSeason ?? vi.fn()}
    />
  );
}

// SMA-17 5.3-D R2 — the undo button: disabled state comes from the history
// stack (canUndo), the click dispatches UNDO.
describe('GridControls undo (SMA-17 5.3-D R2)', () => {
  it('is disabled while the history is empty', () => {
    renderControls({ canUndo: false });
    expect(
      screen.getByRole('button', { name: 'Undo last action' })
    ).toBeDisabled();
  });

  it('is enabled with history and fires onUndo', () => {
    const onUndo = vi.fn();
    renderControls({ canUndo: true, onUndo });
    const undo = screen.getByRole('button', { name: 'Undo last action' });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

// SMA-17 5.3-D — toolbar row 2: the Exposition toggle + the moment/season
// presets (tokens §10). The presets are inert while the layer is hidden.
describe('GridControls exposure row (SMA-17 5.3-D)', () => {
  it('renders the toggle with an accessible name and fires onToggleExposure', () => {
    const onToggleExposure = vi.fn();
    renderControls({ onToggleExposure });
    const toggle = screen.getByRole('switch', { name: 'Exposure' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onToggleExposure).toHaveBeenCalledTimes(1);
  });

  it('disables every preset option while the layer is hidden', () => {
    renderControls({ exposureVisible: false });
    for (const label of ['Morning', 'Noon', 'Evening', 'Summer', 'Winter']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
  });

  it('enables the presets when the layer is visible and dispatches the choices', () => {
    const onSetExposureMoment = vi.fn();
    const onSetExposureSeason = vi.fn();
    renderControls({
      exposureVisible: true,
      onSetExposureMoment,
      onSetExposureSeason,
    });
    const evening = screen.getByRole('button', { name: 'Evening' });
    expect(evening).toBeEnabled();
    fireEvent.click(evening);
    expect(onSetExposureMoment).toHaveBeenCalledWith('evening');
    fireEvent.click(screen.getByRole('button', { name: 'Winter' }));
    expect(onSetExposureSeason).toHaveBeenCalledWith('winter');
  });

  it('marks the active preset via aria-pressed', () => {
    renderControls({
      exposureVisible: true,
      exposureMoment: 'noon',
      exposureSeason: 'summer',
    });
    expect(screen.getByRole('button', { name: 'Noon' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Evening' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Summer' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
