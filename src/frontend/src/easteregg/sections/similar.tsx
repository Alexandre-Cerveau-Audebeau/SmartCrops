import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import StatusBadge from '../../components/plantDetail/StatusBadge';
import { Sym } from '../../components/Sym';
import type { EasterEggEntry } from '../types';

const S = 'plantDetail.similar';
const SKELETON_COUNT = 3;

/**
 * Section 13 for an easter egg: SimilarPlantsSection's ghost cards and its
 * centred overlay pill, verbatim. The catalogue's pill says the recommendation
 * engine is coming; this entry's says there is nothing to recommend.
 */
export function EggSimilar({ egg }: { egg: EasterEggEntry }) {
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

      {/* Skeleton carousel (decorative) + centered overlay */}
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
            <Sym name="favorite" size={18} color={overlayIcon} />
            <Box>
              {egg.similar.map((line) => (
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
}
