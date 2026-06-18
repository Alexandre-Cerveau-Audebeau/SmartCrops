import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useScrollSpy } from './useScrollSpy';

/**
 * State of a TOC entry (SMA-178 part B):
 * - `live`           — the section renders real content for this plant (clickable, scroll-spy).
 * - `empty`          — a live-capable section with no data for this plant (grey, non-clickable).
 * - `coming-data`    — a teaser section not built yet, pending data (orange, non-clickable).
 * - `coming-backend` — a teaser section not built yet, pending backend (blue, non-clickable).
 */
export type TocState = 'live' | 'empty' | 'coming-data' | 'coming-backend';

export interface TocSection {
  /** Fixed zero-padded entry number ('01'..'15') — NOT positional. */
  num: string;
  /** Anchor id of the on-page section. */
  id: string;
  /** i18n key; resolved by this component so the page only builds structure. */
  labelKey: string;
  state: TocState;
}

interface PlantDetailTocProps {
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

// SMA-184: dark-mode / AA-contrast audit pending — the palette is captured here
// in one place so that pass can retune every state from a single spot.
const LIVE_GREEN = '#2E8B57'; // = theme primary
const ACTIVE_BG = '#EAF5EE'; // primary ~12% opacity
const ACTIVE_TEXT = '#1B5E3A';
const IDLE_TEXT = '#4a564d';
const COMING_DATA = '#C88968';
const COMING_BACKEND = '#6D7DA4';
const EMPTY_DOT = '#C9D3CC';

/** Bullet colour per state (the small leading disc). */
function dotColor(state: TocState): string {
  switch (state) {
    case 'live':
      return LIVE_GREEN;
    case 'coming-data':
      return COMING_DATA;
    case 'coming-backend':
      return COMING_BACKEND;
    default:
      return EMPTY_DOT; // 'empty'
  }
}

/**
 * Frozen 15-entry table of contents for Plant Detail v2 (SMA-178 part B). The
 * skeleton is fixed and numbered 01–15: a section that has no content for the
 * current plant renders as a greyed, non-clickable entry rather than being
 * dropped. Four states drive the visuals (see {@link TocState}). Only `live`
 * entries are clickable, scroll-spied and eligible for the active highlight.
 *
 * Desktop = sticky left sidebar card; mobile = horizontal scrollable pill bar.
 * Anchors jump via native `#id` links; the on-page sections carry a matching
 * `scroll-margin-top` so the jump clears the navbar. `activeId` is computed by
 * the page's scroll-spy (here restricted to the live anchors).
 */
export default function PlantDetailToc({
  sections,
  activeId: activeIdProp,
  disableSticky = false,
}: PlantDetailTocProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  // Scroll-spy only the live anchors — non-live entries have no section to
  // observe and must never be highlighted (SMA-178 part B).
  const liveIds = sections.filter((s) => s.state === 'live').map((s) => s.id);
  const spyActiveId = useScrollSpy(liveIds);
  const activeId = activeIdProp ?? spyActiveId;

  if (sections.length === 0) return null;

  if (isMobile) {
    return (
      <Box
        component="nav"
        aria-label={t('plantDetail.toc.ariaLabel')}
        sx={{
          position: disableSticky ? 'static' : 'sticky',
          top: disableSticky ? 'auto' : 56,
          zIndex: 2,
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          py: 1,
          bgcolor: '#FAFDF7',
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
              component={live ? 'a' : 'div'}
              href={live ? `#${s.id}` : undefined}
              aria-current={active ? 'location' : undefined}
              sx={{
                flexShrink: 0,
                px: 1.5,
                py: 0.9,
                borderRadius: 999,
                border: '1px solid',
                borderColor: active
                  ? LIVE_GREEN
                  : coming
                    ? dotColor(s.state)
                    : '#d8e0d6',
                bgcolor: active ? LIVE_GREEN : '#fff',
                color: active ? '#fff' : live ? IDLE_TEXT : 'text.secondary',
                fontSize: 13.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                cursor: live ? 'pointer' : 'default',
                opacity: live ? 1 : 0.75,
                ...(live && {
                  '&:focus-visible': {
                    outline: `2px solid ${LIVE_GREEN}`,
                    outlineOffset: 2,
                  },
                }),
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
        // maxHeight ignored). Here we just flex-grow into the remaining height and
        // scroll the list internally so every 01–15 entry stays reachable.
        flexGrow: 1,
        minHeight: 0,
        overflowY: 'auto',
        bgcolor: '#fff',
        border: '1px solid #ECF1EA',
        borderRadius: 3,
        p: 1,
        boxShadow: '0 1px 3px rgba(27,94,58,0.06)',
      }}
    >
      <Typography
        component="div"
        sx={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: '#7a857f',
          fontWeight: 700,
          px: 1.25,
          pt: 1,
          pb: 0.75,
        }}
      >
        {t('plantDetail.toc.title')}
      </Typography>
      {sections.map((s) => {
        const live = s.state === 'live';
        const active = live && s.id === activeId;
        const coming =
          s.state === 'coming-data' || s.state === 'coming-backend';
        return (
          <Box
            key={s.id}
            component={live ? 'a' : 'div'}
            href={live ? `#${s.id}` : undefined}
            aria-current={active ? 'location' : undefined}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              px: 1.25,
              py: 1.1,
              borderRadius: 2,
              borderLeft: '3px solid',
              borderLeftColor: active ? LIVE_GREEN : 'transparent',
              bgcolor: active ? ACTIVE_BG : 'transparent',
              color: active
                ? ACTIVE_TEXT
                : live
                  ? 'text.primary'
                  : 'text.secondary',
              fontWeight: active ? 500 : 400,
              fontSize: 14,
              textDecoration: 'none',
              cursor: live ? 'pointer' : 'default',
              ...(live && {
                '&:hover': { bgcolor: active ? ACTIVE_BG : '#F2F6F0' },
                '&:focus-visible': {
                  outline: `2px solid ${LIVE_GREEN}`,
                  outlineOffset: 2,
                },
              }),
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
                bgcolor: dotColor(s.state),
              }}
            />
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: active ? LIVE_GREEN : 'text.secondary',
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
  );
}
