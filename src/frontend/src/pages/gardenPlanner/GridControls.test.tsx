import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import { GridControls } from './GridControls';

// F3 lock (develop-store review on ef076f0): while a save is in flight, the
// Cancel action must be unavailable — a local restore/discard would report
// "changes discarded" while saveLayout still persists the submitted snapshot.

function renderControls(overrides: { saving?: boolean } = {}) {
  return render(
    <GridControls
      gardenName="Test garden"
      hasGrid
      shapeEditMode={false}
      zoom={1}
      isDirty
      saving={overrides.saving ?? false}
      onSelectAll={vi.fn()}
      onDeselectAll={vi.fn()}
      onZoomIn={vi.fn()}
      onZoomOut={vi.fn()}
      onOpenSettings={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
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
