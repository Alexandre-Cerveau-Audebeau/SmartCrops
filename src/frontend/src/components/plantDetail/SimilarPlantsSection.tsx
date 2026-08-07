import { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';

const S = 'plantDetail.similar';
const SKELETON_COUNT = 3;

/**
 * Similar plants teaser for Plant Detail v2 (SMA-78, section 13). Empty-state
 * panel carrying the "COMING SOON · BACKEND" badge: a row of dimmed skeleton
 * cards (hatched placeholder + plant glyph + skeleton text bars) shows the
 * shape of the future carousel, with a centered "engine coming soon" pill on
 * top — no invented recommendations. Always mounted (teaser, not gated); the
 * matching TOC entry (`similar`) stays `coming-backend` (non-clickable).
 * Colours are mode-aware. Real recommendations are wired later (SMA-78 follow-up).
 */
export const SimilarPlantsSection = memo(function SimilarPlantsSection({
  // --- SMA-394 easter eggs — delete this line to remove ---
  message,
}: {
  /** Overlay lines replacing the "engine coming soon" pill's text. */
  message?: readonly string[];
  // --- end SMA-394 ---
} = {}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';

  const cardBg = palette.background.paper;
  const phBg = dark ? '#1C2A22' : '#EAF1EA';
  const phStripe = dark ? 'rgba(255,255,255,0.04)' : 'rgba(80,130,90,0.10)';
  const phIcon = dark ? 'rgba(255,255,255,0.18)' : 'rgba(60,100,70,0.25)';
  const skeletonBar = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const overlayBg = palette.background.paper;
  const overlayIcon = palette.text.secondary;

  return (
    <Box id="similar" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t(`${S}.sectionTitle`)}
        badge={<StatusBadge variant="backend" />}
        mb="4px"
      />
      <Typography
        sx={{ m: 0, mb: '14px', fontSize: 13, color: 'text.secondary' }}
      >
        {t(`${S}.caption`)}
      </Typography>

      {/* Skeleton carousel (decorative) + centered "coming soon" overlay */}
      <Box sx={{ position: 'relative' }}>
        <Box aria-hidden sx={{ display: 'flex', gap: 2, opacity: 0.55 }}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <Box
              key={i}
              sx={{
                flex: 1,
                minWidth: 0,
                border: '1px solid',
                borderColor: 'borderSubtle',
                borderRadius: 3,
                overflow: 'hidden',
                bgcolor: cardBg,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                sx={{
                  height: 150,
                  bgcolor: phBg,
                  backgroundImage: `repeating-linear-gradient(45deg, ${phStripe} 0, ${phStripe} 10px, transparent 10px, transparent 20px)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Sym name="potted_plant" size={40} color={phIcon} />
              </Box>
              <Box
                sx={{
                  p: 1.75,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: '70%',
                    height: 13,
                    borderRadius: 1,
                    bgcolor: skeletonBar,
                  }}
                />
                <Box
                  sx={{
                    width: '50%',
                    height: 11,
                    borderRadius: 1,
                    bgcolor: skeletonBar,
                  }}
                />
              </Box>
            </Box>
          ))}
        </Box>

        {/* Centered overlay message */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: overlayBg,
              border: '1px solid',
              borderColor: 'borderSubtle',
              borderRadius: 5,
              px: 2,
              py: 1,
              maxWidth: 520,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            <Sym
              name={message ? 'favorite' : 'schedule'}
              size={18}
              color={overlayIcon}
            />
            <Box>
              {(message ?? [t(`${S}.emptyMessage`)]).map((line) => (
                <Typography
                  key={line}
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'text.secondary',
                  }}
                >
                  {line}
                </Typography>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
});
