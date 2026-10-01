import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup (vitest's `sequence.hooks = 'stack'`); what it puts
  // back below stays in place until the tree that reads it is gone.
  cleanup();
  vi.clearAllMocks();
});

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

  // SMA-454, fix round 1, R3 — the hemisphere's help says what is true now:
  // the garden's city fills it in (no « future geolocation API »), and the
  // choice here is for a garden without one.
  it('says where the hemisphere comes from — the garden’s city, and a choice here without one —, in English and in French (SMA-454, fix round 1, R3)', async () => {
    renderDialog();
    expect(screen.getByText("Filled in from the garden's city; without a city, choose it here.")).toBeInTheDocument();
    cleanup();

    await i18n.changeLanguage('fr');
    renderDialog();
    // The French no-break space before « ; » is matched by \s.
    expect(screen.getByText(/^Rempli d'après la ville du jardin\s; sans ville, choisissez-le ici\.$/)).toBeInTheDocument();
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

  // SMA-448, lot F3, step L3 — the dialog bounds the dimensions to the
  // formula's largest size (V3: the planner shows the limit and disables what
  // exceeds it), and says why. Without a bound — the catalogue not read — the
  // 50 of before, the server's refusal saying why.
  it('bounds the columns and rows to the formula: with 20 × 20, a 25 becomes 20, the inputs say max 20, and the reason is shown (SMA-448, F3)', () => {
    const { onConfirm } = renderDialog({
      maxCols: 20,
      maxRows: 20,
      limitNote: 'Your Novice formula allows up to 20 × 20 cells per garden.',
    });

    expect(screen.getByLabelText('Columns')).toHaveAttribute('max', '20');
    expect(screen.getByLabelText('Rows')).toHaveAttribute('max', '20');
    expect(screen.getByText('Your Novice formula allows up to 20 × 20 cells per garden.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onConfirm.mock.calls[0]![0]).toEqual({ cols: 20, rows: 20, cellSize: '50cm' });
  });

  it('lets an Expert reach 100 × 100 — the size the server accepts (Alexandre, 26/09)', () => {
    const { onConfirm } = renderDialog({ maxCols: 100, maxRows: 100 });

    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onConfirm.mock.calls[0]![0]).toEqual({ cols: 100, rows: 100, cellSize: '50cm' });
  });

  it('without a bound, 50 as before, and no reason shown', () => {
    const { onConfirm } = renderDialog();

    expect(screen.getByLabelText('Columns')).toHaveAttribute('max', '50');
    expect(document.querySelector('[data-config-limit]')).toBeNull();

    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onConfirm.mock.calls[0]![0]).toEqual({ cols: 50, rows: 8, cellSize: '50cm' });
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

  // SMA-454 — the garden's city: the dialog draws the LOCATION label around
  // what the planner hands it (the place and the door to the dashboard's
  // location dialog), and knows nothing of the network.
  it('carries the LOCATION section it is handed, between the orientation and the hemisphere — and none without it (SMA-454)', () => {
    renderDialog();
    expect(document.querySelector('[data-config-location]')).toBeNull();
    expect(screen.queryByText('LOCATION')).toBeNull();
    cleanup();

    renderDialog({ locationSection: <p>The place, and its door</p> });

    const section = document.querySelector<HTMLElement>('[data-config-location]');
    expect(section).not.toBeNull();
    expect(within(section!).getByRole('heading', { level: 3, name: 'LOCATION' })).toBeInTheDocument();
    expect(within(section!).getByText('The place, and its door')).toBeInTheDocument();
    const orientation = screen.getByRole('heading', { level: 3, name: 'ORIENTATION' });
    expect(orientation.compareDocumentPosition(section!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section!.compareDocumentPosition(screen.getByText('HEMISPHERE')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // SMA-454, fix round 1 — THE CITY IS AUTHORITATIVE: a city set from that
  // section is written at once, and the server writes the hemisphere and the
  // band from its latitude, always; the planner re-reads the garden, hands the
  // dialog the stored values and bumps `locatedSeq` as the re-read lands.
  describe('what a city set from LOCATION writes (SMA-454)', () => {
    const props = {
      open: true,
      isFirstSetup: false,
      initialWidth: 10,
      initialHeight: 8,
      initialCellSize: '50cm',
      onCancel: () => {},
    };
    const stored: GardenConfig = { ...EMPTY_CONFIG, hemisphere: 'N', latitudeBand: 'mid' };

    it('after a city write, shows the hemisphere and the band re-read — over a value chosen here', () => {
      const onConfirm = vi.fn();
      const { rerender } = render(
        <GardenConfigDialog {...props} onConfirm={onConfirm} initialConfig={stored} locatedSeq={0} />
      );
      expect(screen.getByRole('radio', { name: 'Northern' })).toBeChecked();
      // The band, chosen HERE.
      fireEvent.click(screen.getByRole('radio', { name: 'High' }));

      rerender(
        <GardenConfigDialog
          {...props}
          onConfirm={onConfirm}
          initialConfig={{ ...stored, hemisphere: 'S', latitudeBand: 'low' }}
          locatedSeq={1}
        />
      );

      expect(screen.getByRole('radio', { name: 'Southern' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Low' })).toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(savedConfig(onConfirm)).toMatchObject({ hemisphere: 'S', latitudeBand: 'low' });
    });

    it('a city that re-reads the values already stored still puts them back over a hand choice — the write says so, not a change of value', () => {
      const onConfirm = vi.fn();
      const { rerender } = render(
        <GardenConfigDialog {...props} onConfirm={onConfirm} initialConfig={stored} locatedSeq={0} />
      );
      // Chosen HERE: the south and the sub-polar band.
      fireEvent.click(screen.getByRole('radio', { name: 'Southern' }));
      fireEvent.click(screen.getByRole('radio', { name: 'High' }));

      // Lyon on a « N » / « mid » garden: the re-read brings what was stored.
      rerender(
        <GardenConfigDialog {...props} onConfirm={onConfirm} initialConfig={{ ...stored }} locatedSeq={1} />
      );

      expect(screen.getByRole('radio', { name: 'Northern' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Mid' })).toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(savedConfig(onConfirm)).toMatchObject({ hemisphere: 'N', latitudeBand: 'mid' });
    });

    it('without a city write, never moves what it shows: a stored hemisphere or band that changes under it is not adopted', () => {
      const onConfirm = vi.fn();
      const { rerender } = render(
        <GardenConfigDialog {...props} onConfirm={onConfirm} initialConfig={stored} locatedSeq={0} />
      );

      rerender(
        <GardenConfigDialog
          {...props}
          onConfirm={onConfirm}
          initialConfig={{ ...stored, hemisphere: 'S', latitudeBand: 'low' }}
          locatedSeq={0}
        />
      );

      expect(screen.getByRole('radio', { name: 'Northern' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Mid' })).toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(savedConfig(onConfirm)).toMatchObject({ hemisphere: 'N', latitudeBand: 'mid' });
    });
  });
});
