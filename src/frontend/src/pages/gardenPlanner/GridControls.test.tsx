import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import type { Moment, Season } from '../../utils/exposure';
import { GridControls } from './GridControls';

// R2 (SMA-17 5.3-D): GridControls is now the TOOLBAR CARD only — the garden
// title and the Réglages/Annuler/Enregistrer actions moved to the page
// header, so the F3 save/cancel gating pin lives in GardenPlanner.test.tsx.

// SMA-393: the no-stored-choice default is now French — pin English as a returning EN visitor would.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderControls(
  overrides: {
    isMobile?: boolean;
    canUndo?: boolean;
    exposureVisible?: boolean;
    exposureMoment?: Moment;
    exposureSeason?: Season;
    placeMode?: boolean;
    onUndo?: () => void;
    onToggleExposure?: () => void;
    onSetExposureMoment?: (moment: Moment) => void;
    onSetExposureSeason?: (season: Season) => void;
    onSelectionMode?: () => void;
    onInfraMode?: () => void;
    onPlaceMode?: () => void;
  } = {}
) {
  return render(
    <GridControls
      hasGrid
      // R3: the breakpoint decision is the PAGE's (threaded prop) — the
      // default exercises the desktop toolbar, where the undo/zoom cluster
      // mounts here rather than in the grid card; R4 adds the mobile case.
      isMobile={overrides.isMobile ?? false}
      shapeEditMode={false}
      placeMode={overrides.placeMode}
      onSelectionMode={overrides.onSelectionMode}
      onInfraMode={overrides.onInfraMode}
      onPlaceMode={overrides.onPlaceMode}
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

  // R4 (Extension 141b7798): the component-level leg of the invariant the
  // page tests already pin (the R2 one-control-per-name and
  // breakpoint-crossing tests) — below sm the toolbar's undo/zoom cluster
  // must not mount here at all (its home is the in-grid row).
  it('does not mount the toolbar undo/zoom cluster on mobile', () => {
    renderControls({ isMobile: true });
    expect(
      screen.queryByRole('button', { name: 'Undo last action' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom out' })).toBeNull();
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

// SMA-193 (5.5 lot 3 R2) — the Placer mode button opens WITHOUT an armed
// plant (product ruling 22 Jul: armless entry = move-only mode; deliberate
// divergence from the Infrastructures button's armed gate).
describe('GridControls Placer button (SMA-193 5.5)', () => {
  const modeHandlers = () => ({
    onSelectionMode: vi.fn(),
    onInfraMode: vi.fn(),
    onPlaceMode: vi.fn(),
  });

  it('is enabled without an armed plant and fires onPlaceMode (move-only entry)', () => {
    const handlers = modeHandlers();
    renderControls({ ...handlers });
    const place = screen.getByRole('button', { name: 'Place' });
    expect(place).toBeEnabled();
    fireEvent.click(place);
    expect(handlers.onPlaceMode).toHaveBeenCalledTimes(1);
  });

  it('stays clickable while ACTIVE', () => {
    renderControls({ ...modeHandlers(), placeMode: true });
    expect(screen.getByRole('button', { name: 'Place' })).toBeEnabled();
  });
});

// SMA-18 — the mockup mode-button icons (Etats L1014: arrow_selector_tool /
// potted_plant / fence). The glyphs are DECORATIVE: each button carries an
// aria-hidden svg and its accessible name must stay strictly the label.
describe('GridControls mode-button icons (SMA-18)', () => {
  it('each mode button contains its aria-hidden svg icon under an unchanged name', () => {
    renderControls({
      onSelectionMode: vi.fn(),
      onInfraMode: vi.fn(),
      onPlaceMode: vi.fn(),
    });
    for (const name of ['Selection', 'Place', 'Infrastructures']) {
      const button = screen.getByRole('button', { name });
      // The name query above IS the a11y-tree pin: an icon leaking into the
      // accessible name would make getByRole fail. The svg itself is hidden.
      expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
