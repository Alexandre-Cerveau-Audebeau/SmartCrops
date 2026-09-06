import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../../theme';
import type { CellData } from '../../types/GardenLayout';
import type { ExposureCategory } from '../../utils/exposure';
import {
  afterTwoFrames,
  dataUrlToBlob,
  downloadBlob,
  EXPORT_CELL_PX,
  PNG_CAPTURE_TIMEOUT_MS,
  type PlanExportOutcome,
} from '../../utils/planExport';
import GardenGrid, { type PlacementOverlay } from './GardenGrid';

// Day palette whatever the app's mode (SMA-18 lot 3): the tokens are a pure
// function of the theme mode, so a local light ThemeProvider is all it takes.
const LIGHT_THEME = createAppTheme('light');

/** The mockup's "Image (PNG, 2×)". */
const PNG_PIXEL_RATIO = 2;

export interface PlanPngCaptureProps {
  grid: CellData[][];
  placements: PlacementOverlay[];
  /** The exposure layer to paint, or null (the "include" box unticked). */
  exposure: (ExposureCategory | null)[][] | null;
  castShadow: boolean[][] | null;
  fileName: string;
  /** Reported exactly once: the file was handed to the browser, or not. */
  onDone: (outcome: PlanExportOutcome) => void;
  /** Bound on the capture, in ms (default PNG_CAPTURE_TIMEOUT_MS); a capture
   * that has not settled by then is abandoned and reported as a failure. */
  timeoutMs?: number;
}

/**
 * PNG export stage (SMA-18 lot 3): the grid alone, read-only (no callbacks,
 * no selection, no drag target, nothing to hover), rendered OFF-SCREEN in the
 * day palette at the desktop cell size, then rasterized by html-to-image at
 * 2× on a transparent background and downloaded. html-to-image measures the
 * captured node's clientWidth/Height and copies its computed style onto the
 * clone, so the node it receives is the statically positioned stage — the
 * fixed off-screen wrapper stays its parent, never the capture root. The
 * library is imported on demand so nothing loads until an export runs.
 */
export function PlanPngCapture({
  grid,
  placements,
  exposure,
  castShadow,
  fileName,
  onDone,
  timeoutMs = PNG_CAPTURE_TIMEOUT_MS,
}: PlanPngCaptureProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    const run = async () => {
      // Two frames: React has committed the stage and the browser laid it out.
      await afterTwoFrames();
      if (cancelled) return;
      const node = stageRef.current;
      if (!node) throw new Error('plan stage unmounted');
      const { toPng } = await import('html-to-image');
      // Bounded (CodeRabbit #266 round 1): html-to-image awaits every font
      // and image fetch without a timeout. Past `timeoutMs` the race rejects
      // into the failure path below and the timer is cleared either way; a
      // rasterization that lands after the deadline has no continuation
      // left, so it can never download.
      const deadline = new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error('plan capture timed out')),
          timeoutMs
        );
      });
      let dataUrl: string;
      try {
        dataUrl = await Promise.race([
          toPng(node, {
            pixelRatio: PNG_PIXEL_RATIO,
            // Left undefined on purpose: no fill means a transparent canvas.
            backgroundColor: undefined,
            cacheBust: true,
          }),
          deadline,
        ]);
      } finally {
        clearTimer();
      }
      if (cancelled) return;
      downloadBlob(dataUrlToBlob(dataUrl), fileName);
      onDone({ ok: true });
    };
    run().catch(() => {
      if (!cancelled) onDone({ ok: false });
    });
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [fileName, onDone, timeoutMs]);

  return (
    <Box
      aria-hidden
      data-testid="plan-png-offscreen"
      sx={{
        position: 'fixed',
        top: 0,
        left: '-100000px',
        pointerEvents: 'none',
      }}
    >
      <Box
        ref={stageRef}
        data-testid="plan-png-stage"
        sx={{ display: 'inline-block' }}
      >
        <ThemeProvider theme={LIGHT_THEME}>
          <GardenGrid
            grid={grid}
            shapeEditMode={false}
            placements={placements}
            exposure={exposure}
            castShadow={castShadow}
            cellSizePx={EXPORT_CELL_PX}
          />
        </ThemeProvider>
      </Box>
    </Box>
  );
}
