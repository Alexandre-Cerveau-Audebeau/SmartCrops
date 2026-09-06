import { render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import { toPng } from 'html-to-image';
import i18n from '../../i18n/i18n';
import { createAppTheme } from '../../theme';
import { getPlannerTokens } from '../../theme/plannerTokens';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import { PlanPngCapture } from './PlanPngCapture';

// SMA-18 lot 3 — the PNG stage: the grid alone, off-screen, day palette,
// html-to-image at 2× on a transparent background, then the Profile-style
// download. html-to-image is mocked at the module boundary (a third-party
// rasterizer jsdom cannot run); the real PNG is checked in the visual pass.

vi.mock('html-to-image', () => ({ toPng: vi.fn() }));

const grid: CellData[][] = [
  [{ active: true }, { active: true }],
  [{ active: false }, { active: true }],
];
const exposure: (ExposureCategory | null)[][] = [
  ['full', 'shade'],
  [null, 'morning'],
];
const placements = [
  {
    plantId: 'p1',
    startRow: 0,
    startCol: 0,
    spanRows: 1,
    spanCols: 1,
    plantName: 'Basil',
  },
];

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

let createObjectURL: Mock<(obj: Blob | MediaSource) => string>;
let revokeObjectURL: Mock<(url: string) => void>;
let clickSpy: MockInstance<() => void>;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  // jsdom has no createObjectURL — the Profile.test stub, verbatim.
  createObjectURL = vi.fn(() => 'blob:mock-url');
  revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
  );
  clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
});

afterEach(() => {
  clickSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderCapture(
  opts: { withLayer?: boolean; onDone?: (o: { ok: boolean }) => void } = {}
) {
  const onDone = opts.onDone ?? vi.fn();
  render(
    // DARK app theme on purpose: the stage must still paint the day palette.
    <ThemeProvider theme={createAppTheme('dark')}>
      <PlanPngCapture
        grid={grid}
        placements={placements}
        exposure={opts.withLayer === false ? null : exposure}
        castShadow={null}
        fileName="smartcrops-my-garden-plan.png"
        onDone={onDone}
      />
    </ThemeProvider>
  );
  return { onDone };
}

describe('PlanPngCapture (SMA-18 lot 3)', () => {
  it('rasterizes the off-screen read-only grid once, at 2× on a transparent background, in the day palette', async () => {
    vi.mocked(toPng).mockResolvedValue(PNG_DATA_URL);
    const { onDone } = renderCapture();

    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1));
    const [node, options] = vi.mocked(toPng).mock.calls[0]!;
    // The captured node is the statically positioned stage, not the fixed
    // off-screen wrapper (html-to-image copies the root's computed style).
    expect(node).toBe(screen.getByTestId('plan-png-stage'));
    expect(screen.getByTestId('plan-png-offscreen')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByTestId('plan-png-offscreen')).toContainElement(
      node as HTMLElement
    );
    expect(options).toMatchObject({ pixelRatio: 2, cacheBust: true });
    expect(options?.backgroundColor).toBeUndefined();

    const stage = within(node as HTMLElement);
    const cells = stage.getAllByRole('gridcell', { hidden: true });
    expect(cells).toHaveLength(4);
    // Day tokens despite the dark app theme; the exposure layer is painted.
    const tk = getPlannerTokens('light');
    expect(cells[0]).toHaveAttribute('data-exposure', 'full');
    expect(cells[0]).toHaveStyle({ backgroundColor: tk.expo.full.fill });
    expect(cells[1]).toHaveAttribute('data-exposure', 'shade');
    // Read-only: no cell is focusable, no callback was wired.
    expect(cells.every((cell) => cell.getAttribute('tabindex') === '-1')).toBe(
      true
    );
    // The plant block renders its initial (the column axis also reads "B",
    // hence the block selector rather than a text query).
    expect(
      (node as HTMLElement).querySelector('[data-plant-block]')
    ).toHaveTextContent('B');

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ ok: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('downloads the decoded PNG under the given file name (the Profile download precedent)', async () => {
    vi.mocked(toPng).mockResolvedValue(PNG_DATA_URL);
    const { onDone } = renderCapture();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ ok: true }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(8);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('smartcrops-my-garden-plan.png');
    await waitFor(() =>
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    );
  });

  it('paints no exposure layer when the box is unticked (plain day cells)', async () => {
    vi.mocked(toPng).mockResolvedValue(PNG_DATA_URL);
    renderCapture({ withLayer: false });

    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1));
    const node = vi.mocked(toPng).mock.calls[0]![0] as HTMLElement;
    expect(node.querySelector('[data-exposure]')).toBeNull();
    const cells = within(node).getAllByRole('gridcell', { hidden: true });
    expect(cells[0]).toHaveStyle({
      backgroundColor: getPlannerTokens('light').cellOn,
    });
  });

  it('reports a failure (and downloads nothing) when the rasterizer rejects', async () => {
    vi.mocked(toPng).mockRejectedValue(new Error('boom'));
    const { onDone } = renderCapture();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ ok: false }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
