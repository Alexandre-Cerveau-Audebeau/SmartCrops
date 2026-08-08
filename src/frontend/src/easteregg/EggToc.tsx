import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useScrollSpy } from '../components/plantDetail/useScrollSpy';
import type {
  TocSection,
  TocState,
} from '../components/plantDetail/PlantDetailToc';

/**
 * SMA-394: the easter egg's own table of contents.
 *
 * Copied verbatim from `components/plantDetail/PlantDetailToc.tsx`, which stays
 * exactly as develop has it, and differing in ONE respect: every entry renders
 * as an anchor.
 *
 * The catalogue derives clickability from `state`, because on a real plant page
 * a non-live entry has no section to jump to. On this page all fifteen sections
 * render, including the four the rail still labels as teasers, so four filled
 * sections were unreachable from the rail. Only the CLICKABILITY changes here:
 * anchor, href, cursor, hover and focus ring. Everything the reader sees at
 * rest — dot colour, text colour, opacity, the COMING SOON tag and the active
 * highlight — is still driven by `state`, so the rail looks as it did and the
 * four badges stay honest about features that really are still coming.
 *
 * Scroll-spy deliberately still tracks the live ids only, so the four never
 * take the active treatment as the page scrolls. That is appearance, not reach.
 */

interface EggTocProps {
  sections: TocSection[];
  /**
   * Active section id. Omit to let the component track it itself via scroll-spy
   * (the page does this); pass it explicitly to drive the highlight in tests.
   */
  activeId?: string;
  /**
   * SMA-183: when true, the <nav> renders `position: static` (top auto) so a
   * sticky PARENT owns the positioning. Replaces the page's former fragile
   * `'& > nav': { position: 'static' }` override on the wrapper.
   */
  disableSticky?: boolean;
}

// SMA-184: the live/active neutrals + brand greens now resolve from theme tokens
// ('primary.main', 'brandTintBg', 'heading', 'text.*') so the TOC follows
// light/dark. The colored teaser-state indicators (orange/blue) stay literal —
// they're mid-tones legible on both light and navy. The empty-state grey dot is
// mode-aware (light grey → 'mutedText' navy-grey in dark).
const COMING_DATA = '#C88968';
const COMING_BACKEND = '#6D7DA4';
const EMPTY_DOT = '#C9D3CC';

/**
 * Bullet colour per state (the small leading disc). The `live` case returns the
 * 'primary.main' theme token (resolved by the consuming `sx`); `empty` returns
 * a mode-aware token; the teaser states are literal mid-tone colors.
 */
function dotColor(state: TocState, mode: 'light' | 'dark'): string {
  switch (state) {
    case 'live':
      return 'primary.main';
    case 'coming-data':
      return COMING_DATA;
    case 'coming-backend':
      return COMING_BACKEND;
    default:
      return mode === 'dark' ? 'mutedText' : EMPTY_DOT; // 'empty'
  }
}

/**
 * Frozen 15-entry table of contents, as the catalogue renders it, except that
 * every entry is an anchor because every section exists on this page. Four
 * states still drive the visuals (see {@link TocState}); only `live` entries
 * are scroll-spied and eligible for the active highlight.
 *
 * Desktop = sticky left sidebar card; mobile = horizontal scrollable pill bar.
 * Anchors jump via native `#id` links; the on-page sections carry a matching
 * `scroll-margin-top` so the jump clears the navbar. `activeId` is computed by
 * the page's scroll-spy (here restricted to the live anchors).
 */
export default function EggToc({
  sections,
  activeId: activeIdProp,
  disableSticky = false,
}: EggTocProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const mode = theme.palette.mode;
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  // Scroll-spy only the live anchors — non-live entries have no section to
  // observe and must never be highlighted (SMA-178 part B).
  const liveIds = sections.filter((s) => s.state === 'live').map((s) => s.id);
  const spyActiveId = useScrollSpy(liveIds);
  const activeId = activeIdProp ?? spyActiveId;

  // SMA-247 — mobile only: keep the active pill centered as the user scrolls the
  // page. We scroll the PILL CONTAINER horizontally (never the page), so the
  // section view never jumps vertically — the trap with element.scrollIntoView.
  // useLayoutEffect (not useEffect): on the prefers-reduced-motion path the scroll
  // is instant, so running before paint avoids a visible off-center snap (this is
  // a client-only Vite SPA, so there is no SSR useLayoutEffect warning to guard).
  const mobileNavRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!isMobile || !activeId) return;
    const container = mobileNavRef.current;
    if (!container) return;
    const pill = container.querySelector<HTMLElement>(
      '[aria-current="location"]'
    );
    if (!pill) return;

    // Rect-based (robust, no offsetParent dependency): bring the active pill to
    // the horizontal center of the bar, clamped to the scrollable range.
    const cRect = container.getBoundingClientRect();
    const pRect = pill.getBoundingClientRect();
    let target =
      container.scrollLeft +
      (pRect.left - cRect.left) -
      (container.clientWidth - pRect.width) / 2;
    target = Math.max(
      0,
      Math.min(target, container.scrollWidth - container.clientWidth)
    );

    if (typeof container.scrollTo !== 'function') return; // jsdom / older engines
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({
      left: target,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeId, isMobile]);

  if (sections.length === 0) return null;

  if (isMobile) {
    return (
      <Box
        component="nav"
        ref={mobileNavRef}
        aria-label={t('plantDetail.toc.ariaLabel')}
        sx={{
          position: disableSticky ? 'static' : 'sticky',
          top: disableSticky ? 'auto' : 56,
          zIndex: 2,
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          py: 1,
          bgcolor: 'background.default',
          // Hide the scrollbar — the row scrolls horizontally by drag/swipe.
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {sections.map((s) => {
          const live = s.state === 'live';
          const active = live && s.id === activeId;
          const coming =
            s.state === 'coming-data' || s.state === 'coming-backend';
          return (
            <Box
              key={s.id}
              // SMA-394: always an anchor — every section renders on this page.
              component="a"
              href={`#${s.id}`}
              aria-current={active ? 'location' : undefined}
              sx={{
                flexShrink: 0,
                px: 1.5,
                py: 0.9,
                borderRadius: 999,
                border: '1px solid',
                borderColor: active
                  ? 'primary.main'
                  : coming
                    ? dotColor(s.state, mode)
                    : 'borderSubtle',
                bgcolor: active ? 'primary.main' : 'background.paper',
                color: active
                  ? '#fff'
                  : live
                    ? 'text.primary'
                    : 'text.secondary',
                fontSize: 13.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                // Clickability affordances follow the anchor; `opacity` stays
                // on `live` because that is appearance, not reach.
                cursor: 'pointer',
                opacity: live ? 1 : 0.75,
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
              }}
            >
              {t(s.labelKey)}
              {coming && (
                <Box
                  component="span"
                  sx={{
                    ml: 0.75,
                    fontSize: 9.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    opacity: 0.9,
                  }}
                >
                  {t('plantDetail.sections.comingSoonTag')}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box
      component="nav"
      aria-label={t('plantDetail.toc.ariaLabel')}
      sx={{
        width: '100%',
        position: disableSticky ? 'static' : 'sticky',
        top: disableSticky ? 'auto' : 80,
        // SMA-178 layout v2: the parent rail wrapper owns the viewport height cap
        // (it includes the unit toggle above this nav, which the old per-nav
        // maxHeight ignored). Here we just flex-grow into the remaining height; an
        // inner wrapper scrolls the list so every 01–15 entry stays reachable.
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        minHeight: 0,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'borderSubtle',
        borderRadius: 3,
        px: 1,
        pt: 1,
        pb: 2,
        boxShadow: '0 1px 3px rgba(27,94,58,0.06)',
      }}
    >
      <Typography
        component="div"
        sx={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'text.secondary',
          fontWeight: 700,
          px: 1.25,
          pt: 1,
          pb: 0.75,
        }}
      >
        {t('plantDetail.toc.title')}
      </Typography>
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: 'auto',
          // SMA-216: scroll scoped to the list only — the title stays fixed
          // above, so the scrollbar is physically shorter; the frame's pb
          // insets it from the rounded corners. Slim 4px; colour/thumb come
          // from the global style.
          '&::-webkit-scrollbar': { width: '4px' },
        }}
      >
        {sections.map((s) => {
          const live = s.state === 'live';
          const active = live && s.id === activeId;
          const coming =
            s.state === 'coming-data' || s.state === 'coming-backend';
          return (
            <Box
              key={s.id}
              // SMA-394: always an anchor — every section renders on this page.
              component="a"
              href={`#${s.id}`}
              aria-current={active ? 'location' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                px: 1.25,
                py: 1.1,
                borderRadius: 2,
                borderLeft: '3px solid',
                borderLeftColor: active ? 'primary.main' : 'transparent',
                bgcolor: active ? 'brandTintBg' : 'transparent',
                color: active
                  ? 'heading'
                  : live
                    ? 'text.primary'
                    : 'text.secondary',
                fontWeight: active ? 500 : 400,
                fontSize: 14,
                textDecoration: 'none',
                // Clickability affordances follow the anchor; the colours above
                // stay on `live`, so the rail reads exactly as it did.
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: active ? 'brandTintBg' : 'surfaceSubtle',
                },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
              }}
            >
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  mt: '6px',
                  bgcolor: dotColor(s.state, mode),
                }}
              />
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: active ? 'primary.main' : 'text.secondary',
                  width: 18,
                  flexShrink: 0,
                  mt: '1px',
                }}
              >
                {s.num}
              </Box>
              <Box component="span" sx={{ flex: 1, lineHeight: 1.25 }}>
                {t(s.labelKey)}
              </Box>
              {coming && (
                <Box
                  component="span"
                  sx={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                    flexShrink: 0,
                    mt: '2px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('plantDetail.sections.comingSoonTag')}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
