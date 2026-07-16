import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import type { Moment, Season } from '../../utils/exposure';
import { GridControls } from './GridControls';

// F3 lock (develop-store review on ef076f0): while a save is in flight, the
// Cancel action must be unavailable — a local restore/discard would report
// "changes discarded" while saveLayout still persists the submitted snapshot.

function renderControls(
  overrides: {
    saving?: boolean;
    exposureVisible?: boolean;
    exposureMoment?: Moment;
    exposureSeason?: Season;
    onToggleExposure?: () => void;
    onSetExposureMoment?: (moment: Moment) => void;
    onSetExposureSeason?: (season: Season) => void;
  } = {}
) {
  return render(
    <GridControls
      gardenName="Test garden"
      hasGrid
      shapeEditMode={false}
      zoom={1}
      isDirty
      saving={overrides.saving ?? false}
      exposureVisible={overrides.exposureVisible ?? false}
      exposureMoment={overrides.exposureMoment ?? 'noon'}
      exposureSeason={overrides.exposureSeason ?? 'summer'}
      onSelectAll={vi.fn()}
      onDeselectAll={vi.fn()}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
      onOpenSettings={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      onToggleExposure={overrides.onToggleExposure ?? vi.fn()}
      onSetExposureMoment={overrides.onSetExposureMoment ?? vi.fn()}
      onSetExposureSeason={overrides.onSetExposureSeason ?? vi.fn()}
    />
  );
}

describe('GridControls save/cancel gating (F3)', () => {
  it('enables Cancel on a dirty layout when no save is in flight', () => {
    renderControls();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('disables BOTH Cancel and Save while saving', () => {
    renderControls({ saving: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
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
