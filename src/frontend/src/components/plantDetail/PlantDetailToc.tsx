import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useScrollSpy } from './useScrollSpy';

export interface TocSection {
  id: string;
  label: string;
}

interface PlantDetailTocProps {
  sections: TocSection[];
  /**
   * Active section id. Omit to let the component track it itself via scroll-spy
   * (the page does this); pass it explicitly to drive the highlight in tests.
   */
  activeId?: string;
}

const ACTIVE_GREEN = '#2E8B57';
const ACTIVE_BG = '#EAF5EE';
const ACTIVE_TEXT = '#1B5E3A';
const IDLE_TEXT = '#4a564d';

/**
 * Sticky table of contents for Plant Detail v2 (SMA-169). The left column on
 * desktop (sticky under the fixed navbar, active section highlighted), a sticky
 * horizontal scrollable anchor bar on mobile. Anchors jump via native `#id`
 * links; the on-page sections carry a matching `scroll-margin-top` so the jump
 * clears the navbar. `activeId` is computed by the page's scroll-spy.
 */
export default function PlantDetailToc({
  sections,
  activeId: activeIdProp,
}: PlantDetailTocProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const spyActiveId = useScrollSpy(sections.map((s) => s.id));
  const activeId = activeIdProp ?? spyActiveId;

  if (sections.length === 0) return null;

  if (isMobile) {
    return (
      <Box
        component="nav"
        aria-label={t('plantDetail.toc.ariaLabel')}
        sx={{
          position: 'sticky',
          top: 56,
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
          const active = s.id === activeId;
          return (
            <Box
              key={s.id}
              component="a"
              href={`#${s.id}`}
              aria-current={active ? 'location' : undefined}
              sx={{
                flexShrink: 0,
                px: 1.5,
                py: 0.9,
                borderRadius: 999,
                border: '1px solid',
                borderColor: active ? ACTIVE_GREEN : '#d8e0d6',
                bgcolor: active ? ACTIVE_GREEN : '#fff',
                color: active ? '#fff' : IDLE_TEXT,
                fontSize: 13.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                '&:focus-visible': {
                  outline: `2px solid ${ACTIVE_GREEN}`,
                  outlineOffset: 2,
                },
              }}
            >
              {s.label}
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
        width: 288,
        flexShrink: 0,
        position: 'sticky',
        top: 80,
        alignSelf: 'flex-start',
        maxHeight: 'calc(100vh - 96px)',
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
      {sections.map((s, i) => {
        const active = s.id === activeId;
        return (
          <Box
            key={s.id}
            component="a"
            href={`#${s.id}`}
            aria-current={active ? 'location' : undefined}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 1.1,
              borderRadius: 2,
              borderLeft: '3px solid',
              borderLeftColor: active ? ACTIVE_GREEN : 'transparent',
              bgcolor: active ? ACTIVE_BG : 'transparent',
              color: active ? ACTIVE_TEXT : IDLE_TEXT,
              fontWeight: active ? 700 : 500,
              fontSize: 14,
              textDecoration: 'none',
              '&:hover': { bgcolor: active ? ACTIVE_BG : '#F2F6F0' },
              '&:focus-visible': {
                outline: `2px solid ${ACTIVE_GREEN}`,
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
                bgcolor: active ? ACTIVE_GREEN : '#C9D3CC',
              }}
            />
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: '#b3bdb6',
                width: 18,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </Box>
            <Box component="span" sx={{ flex: 1, lineHeight: 1.25 }}>
              {s.label}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
