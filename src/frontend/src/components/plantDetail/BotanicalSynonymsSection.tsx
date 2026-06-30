import { memo, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import type { PlantSynonym } from '../../types/Plant';

const S = 'plantDetail.synonyms';

interface BotanicalSynonymsSectionProps {
  synonyms: readonly PlantSynonym[];
}

/**
 * Botanical synonyms for Plant Detail v2 (SMA-223 / SMA-246, section 10). A wrap
 * of italic synonym chips clamped to TWO rows when collapsed: the surplus is
 * hidden behind a "+N more" toggle that reveals the rest. The clamp is measured
 * at runtime — chip `offsetTop` rows, with the toggle measured IN FLOW so it
 * never wraps onto a third line, plus a `ResizeObserver` (deferred to rAF to
 * avoid the "ResizeObserver loop" warning) so the count re-derives when the width
 * — and therefore the wrap — changes. Not a fixed count, so it stays exactly two
 * lines at any viewport. The toggle is always mounted (hidden via display when
 * there is no overflow) so it is measurable. Each chip carries its botanical
 * authority (e.g. "Mill.") in a tooltip when present. Real data only. BUILD NOW
 * badge. Mounted only when >0 synonyms (gating preserved). Mode-aware.
 *
 * Note: jsdom reports `offsetTop === 0` for every node and ships no layout, so
 * the clamp never engages there — all chips render and no toggle appears. Tests
 * simulate the layout by stubbing `offsetTop`; the real behaviour is also
 * validated visually on the running app.
 */
export const BotanicalSynonymsSection = memo(function BotanicalSynonymsSection({
  synonyms,
}: BotanicalSynonymsSectionProps) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';
  const [expanded, setExpanded] = useState(false);
  // null until measured → render everything (also the jsdom / no-layout path).
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const measure = () => {
      const chips = Array.from(
        container.querySelectorAll<HTMLElement>('[data-syn-chip]')
      );
      if (chips.length === 0) return;
      const toggle = container.querySelector<HTMLElement>('[data-syn-toggle]');

      // Phase 1 — every chip visible, toggle out of flow: how many distinct rows
      // do the chips naturally wrap onto? Inline styles override the emotion class
      // for this (pre-paint) layout pass only.
      chips.forEach((c) => {
        c.style.display = 'inline-flex';
      });
      if (toggle) toggle.style.display = 'none';

      const rowTops: number[] = [];
      for (const c of chips) {
        const top = c.offsetTop;
        if (!rowTops.includes(top)) rowTops.push(top);
      }

      let next: number;
      if (rowTops.length <= 2) {
        next = chips.length; // fits in two rows → no overflow, no toggle.
      } else {
        // Phase 2 — measure the toggle IN FLOW: show it, then shrink the visible
        // count until { chips[0..n), toggle } occupy at most two rows, so the
        // toggle never wraps onto a third line (the old `fitTwoRows - 1` was a
        // guess; this measures the real fit).
        const thirdRowTop = rowTops[2];
        const fitTwoRows = chips.filter(
          (c) => c.offsetTop < thirdRowTop
        ).length;
        if (toggle) toggle.style.display = 'inline-flex';

        const rowsWith = (n: number) => {
          chips.forEach((c, i) => {
            c.style.display = i < n ? 'inline-flex' : 'none';
          });
          const tops = new Set<number>();
          for (let i = 0; i < n; i++) tops.add(chips[i].offsetTop);
          if (toggle) tops.add(toggle.offsetTop);
          return tops.size;
        };

        let candidate = Math.max(1, fitTwoRows);
        while (candidate > 1 && rowsWith(candidate) > 2) candidate--;
        next = candidate;
      }

      // Hand control back to the React-driven sx classes.
      chips.forEach((c) => {
        c.style.display = '';
      });
      if (toggle) toggle.style.display = '';

      // Anti-loop guard: stop re-rendering as soon as the count converges. With
      // `visibleCount` in the deps below this lets a measure re-run once after the
      // count changes (so the toggle, now in flow, is reflected) and then settle.
      setVisibleCount((prev) => (prev === next ? prev : next));
    };

    // Initial pass runs synchronously (pre-paint) to avoid a flash of all chips.
    measure();

    // Resize-driven passes are deferred to requestAnimationFrame: writing
    // `display` straight inside the ResizeObserver callback trips the
    // "ResizeObserver loop completed with undelivered notifications" warning, so
    // we move the read/write cycle out of the callback and debounce bursts.
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(container);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [synonyms, visibleCount]);

  const total = synonyms.length;
  const hasOverflow = visibleCount != null && visibleCount < total;
  const hiddenCount = total - (visibleCount ?? total);

  const chipBg = dark ? 'rgba(255,255,255,0.05)' : '#F2F6F0';
  const chipBorder = dark ? 'rgba(255,255,255,0.10)' : '#E2EADF';
  const chipText = dark ? palette.text.primary : '#3A463F';
  const toggleBg = dark ? 'transparent' : '#FFFFFF';
  const toggleColor = dark ? palette.primary.main : '#2E8B57';
  const toggleBorder = dark ? palette.primary.main : '#BCE2CC';

  return (
    <Box id="synonyms" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t('plantDetail.sections.synonyms')}
        badge={<StatusBadge variant="build" />}
        mb="4px"
      />
      <Typography
        sx={{ m: 0, mb: '12px', fontSize: 13, color: 'text.secondary' }}
      >
        {t(`${S}.caption`, { count: total })}
      </Typography>

      <Box
        id="synonyms-list"
        ref={listRef}
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
      >
        {synonyms.map((s, i) => {
          // When collapsed, only the first `visibleCount` chips stay in flow.
          const shown = expanded || visibleCount == null || i < visibleCount;
          const chipSx: SxProps<Theme> = {
            display: shown ? 'inline-flex' : 'none',
            px: '14px',
            py: '7px',
            borderRadius: '999px',
            border: '1px solid',
            borderColor: chipBorder,
            bgcolor: chipBg,
            fontSize: 13,
            fontStyle: 'italic',
            fontWeight: 500,
            lineHeight: 1.2,
            color: chipText,
            cursor: s.authority ? 'help' : 'default',
          };
          return s.authority ? (
            <Tooltip key={s.id} title={s.authority} arrow placement="top">
              <Box
                data-syn-chip
                sx={chipSx}
                tabIndex={0}
                aria-label={`${s.synonym} (${s.authority})`}
              >
                {s.synonym}
              </Box>
            </Tooltip>
          ) : (
            <Box key={s.id} data-syn-chip sx={chipSx}>
              {s.synonym}
            </Box>
          );
        })}

        {/* The toggle is always mounted (so the clamp can measure it in flow) and
            shown only on overflow; display:none keeps it out of flow + tab order. */}
        <Box
          data-syn-toggle
          component="button"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="synonyms-list"
          sx={{
            display: hasOverflow ? 'inline-flex' : 'none',
            px: '14px',
            py: '7px',
            borderRadius: '999px',
            border: '1px solid',
            borderColor: toggleBorder,
            bgcolor: toggleBg,
            color: toggleColor,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.2,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {expanded
            ? t(`${S}.showFewer`)
            : t(`${S}.showMore`, { count: hiddenCount })}
        </Box>
      </Box>
    </Box>
  );
});
