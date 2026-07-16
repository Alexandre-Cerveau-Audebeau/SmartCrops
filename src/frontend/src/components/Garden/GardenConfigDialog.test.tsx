import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import GardenConfigDialog from './GardenConfigDialog';
import type { GardenConfig } from '../../types/Garden';

const EMPTY_CONFIG: GardenConfig = {
  orientation: null,
  gardenType: null,
  lightSchedule: null,
  hemisphere: null,
  latitudeBand: null,
};

function renderDialog(
  overrides: Partial<ComponentProps<typeof GardenConfigDialog>> = {}
) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <GardenConfigDialog
      open
      isFirstSetup={false}
      initialWidth={10}
      initialHeight={8}
      initialCellSize="50cm"
      initialConfig={EMPTY_CONFIG}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

const savedConfig = (onConfirm: ReturnType<typeof vi.fn>): GardenConfig =>
  onConfirm.mock.calls[0]![1] as GardenConfig;

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => vi.clearAllMocks());

describe('GardenConfigDialog (SMA-17, §12)', () => {
  it('renders every section and all five garden-type cards', () => {
    renderDialog();
    expect(screen.getByText('Garden settings')).toBeInTheDocument();
    expect(screen.getByText('DIMENSIONS')).toBeInTheDocument();
    expect(screen.getByText('ORIENTATION')).toBeInTheDocument();
    expect(screen.getByText('GARDEN TYPE')).toBeInTheDocument();
    expect(screen.getByText('HEMISPHERE')).toBeInTheDocument();
    expect(screen.getByText('LATITUDE BAND')).toBeInTheDocument();
    for (const label of ['Balcony', 'Terrace', 'Open ground', 'Greenhouse', 'Indoor']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('reveals the lightSchedule zone only when Indoor is selected', () => {
    renderDialog();
    expect(screen.queryByText('Automated lighting (lightSchedule)')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Indoor' }));
    expect(
      screen.getByText('Automated lighting (lightSchedule)')
    ).toBeInTheDocument();

    // Switching away hides it again.
    fireEvent.click(screen.getByRole('radio', { name: 'Balcony' }));
    expect(screen.queryByText('Automated lighting (lightSchedule)')).toBeNull();
  });

  it('defaults hemisphere=N and latitudeBand=mid and round-trips them on save', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const config = savedConfig(onConfirm);
    expect(config.hemisphere).toBe('N');
    expect(config.latitudeBand).toBe('mid');
  });

  it('reports the dimensions on save', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onConfirm.mock.calls[0]![0]).toEqual({
      cols: 10,
      rows: 8,
      cellSize: '50cm',
    });
  });

  it('maps the FR "O" orientation to canonical W on save', async () => {
    await i18n.changeLanguage('fr');
    const { onConfirm } = renderDialog();
    // The UI shows "O" (Ouest) in French; the STORED value must be canonical W.
    fireEvent.click(screen.getByRole('radio', { name: 'O' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(savedConfig(onConfirm).orientation).toBe('W');
  });

  it('sends lightSchedule null for a non-indoor garden', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Balcony' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const config = savedConfig(onConfirm);
    expect(config.gardenType).toBe('balcony');
    expect(config.lightSchedule).toBeNull();
  });

  it('builds a well-formed lightSchedule payload for an indoor garden', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Indoor' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a time slot/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const config = savedConfig(onConfirm);
    expect(config.gardenType).toBe('indoor');
    expect(config.lightSchedule).toEqual([{ start: '08:00', end: '12:00' }]);
  });

  it('filters null/malformed lightSchedule entries at hydration instead of crashing (SMA-17 R6)', () => {
    // Legacy stored JSON can deserialize to [null] — the dialog must open and
    // render only the well-shaped slot, never dereference slot.start on null.
    const { onConfirm } = renderDialog({
      initialConfig: {
        orientation: null,
        gardenType: 'indoor',
        lightSchedule: [
          null,
          { start: '06:00', end: '10:00' },
        ] as unknown as GardenConfig['lightSchedule'],
        hemisphere: null,
        latitudeBand: null,
      },
    });

    // Dialog opened (no crash) and exactly ONE slot row survived the filter.
    expect(screen.getByText('Garden settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Start time 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start time 2')).toBeNull();

    // The surviving valid slot saves cleanly.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(savedConfig(onConfirm).lightSchedule).toEqual([
      { start: '06:00', end: '10:00' },
    ]);
  });

  it('keeps grid dimensions integer-only: decimals are truncated (SMA-17 R6)', () => {
    const { onConfirm } = renderDialog();

    fireEvent.change(screen.getByLabelText('Columns'), {
      target: { value: '7.9' },
    });
    fireEvent.change(screen.getByLabelText('Rows'), {
      target: { value: '3.5' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // Stored state holds only integers (trunc, 2–50 bounds preserved).
    expect(onConfirm.mock.calls[0]![0]).toEqual({
      cols: 7,
      rows: 3,
      cellSize: '50cm',
    });
  });

  it('disables Save when an indoor slot is invalid, and never confirms (CR b16df5ac)', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Indoor' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a time slot/i }));
    // Make the slot invalid: end before start.
    fireEvent.change(screen.getByLabelText('End time 1'), {
      target: { value: '07:00' },
    });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('hydrates from the loaded GardenResponse config', () => {
    const { onConfirm } = renderDialog({
      initialConfig: {
        orientation: 'S',
        gardenType: 'greenhouse',
        lightSchedule: null,
        hemisphere: 'S',
        latitudeBand: 'high',
      },
    });
    // The pre-selected garden-type card reads as checked without any click.
    expect(screen.getByRole('radio', { name: 'Greenhouse' })).toBeChecked();
    // Saving untouched returns the same values back out.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const config = savedConfig(onConfirm);
    expect(config).toMatchObject({
      orientation: 'S',
      gardenType: 'greenhouse',
      hemisphere: 'S',
      latitudeBand: 'high',
    });
  });
});
