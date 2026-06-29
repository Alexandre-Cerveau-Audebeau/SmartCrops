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
 * at runtime (chip `offsetTop` rows + a `ResizeObserver` so the count re-derives
 * when the width — and therefore the wrap — changes), not a fixed count, so it
 * stays exactly two lines at any viewport. Each chip carries its botanical
 * authority (e.g. "Mill.") in a tooltip when present. Real data only. BUILD NOW
 * badge. Mounted only when >0 synonyms (gating preserved). Mode-aware.
 *
 * Note: jsdom reports `offsetTop === 0` for every node and ships no layout, so
 * the clamp never engages under test — all chips render and no toggle appears.
 * The two-line behaviour is validated visually on the running app.
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

      // Force every chip visible and drop the toggle out of flow so the
      // measurement reflects the chips' NATURAL wrap. Inline styles override the
      // emotion class for the duration of the (pre-paint) layout pass only.
      const toggle = container.querySelector<HTMLElement>('[data-syn-toggle]');
      chips.forEach((c) => {
        c.style.display = 'inline-flex';
      });
      if (toggle) toggle.style.display = 'none';

      // Distinct row tops, in DOM (increasing) order.
      const rowTops: number[] = [];
      for (const c of chips) {
        const top = c.offsetTop;
        if (!rowTops.includes(top)) rowTops.push(top);
      }

      let next: number;
      if (rowTops.length <= 2) {
        next = chips.length; // fits in two rows → no overflow.
      } else {
        const thirdRowTop = rowTops[2];
        const fitTwoRows = chips.filter(
          (c) => c.offsetTop < thirdRowTop
        ).length;
        // Reserve one slot on row 2 for the toggle chip.
        next = Math.max(1, fitTwoRows - 1);
      }

      // Hand control back to the React-driven sx classes.
      chips.forEach((c) => {
        c.style.display = '';
      });
      if (toggle) toggle.style.display = '';

      setVisibleCount((prev) => (prev === next ? prev : next));
    };

    measure();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(container);
    }
    return () => observer?.disconnect();
  }, [synonyms]);

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

        {hasOverflow && (
          <Box
            data-syn-toggle
            component="button"
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="synonyms-list"
            sx={{
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
        )}
      </Box>
    </Box>
  );
});
