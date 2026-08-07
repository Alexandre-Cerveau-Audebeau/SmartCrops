import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { visuallyHidden } from '@mui/utils';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import StatusBadge from '../../components/plantDetail/StatusBadge';
import { Sym } from '../../components/Sym';
import type { EasterEggEntry } from '../types';

const D = 'plantDetail.distribution';

// Decorative continent blobs, copied verbatim from DistributionSection so the
// map is the same map.
type DecorativeBlobPosition = {
  left: string;
  top: string;
  w: number;
  h: number;
};

const BLOBS: DecorativeBlobPosition[] = [
  { left: '6%', top: '26%', w: 200, h: 130 },
  { left: '29%', top: '55%', w: 130, h: 165 },
  { left: '49%', top: '16%', w: 95, h: 70 },
  { left: '52%', top: '40%', w: 150, h: 200 },
  { left: '62%', top: '14%', w: 240, h: 135 },
  { left: '82%', top: '60%', w: 95, h: 55 },
];
const CORES: DecorativeBlobPosition[] = [
  { left: '14%', top: '50%', w: 62, h: 38 },
  { left: '33%', top: '60%', w: 56, h: 34 },
  { left: '58%', top: '49%', w: 60, h: 38 },
  { left: '70%', top: '47%', w: 72, h: 34 },
  { left: '85%', top: '62%', w: 44, h: 24 },
];

/**
 * Section 03 for an easter egg: the catalogue's decorative blob map, unchanged,
 * with a centred message over it in the legend chips' own styling. The map box
 * is aria-hidden, so the words are repeated in a visually hidden sibling rather
 * than being swallowed by assistive technology.
 */
export function EggDistribution({ egg }: { egg: EasterEggEntry }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';

  const mapBg = dark ? '#16242C' : '#E8F1F6';
  const gridLine = dark ? 'rgba(255,255,255,0.06)' : '#D5E3EB';
  const blob = dark ? 'rgba(120,170,105,0.38)' : 'rgba(123,168,107,0.50)';
  const core = dark ? 'rgba(110,180,95,0.52)' : 'rgba(94,145,80,0.62)';
  const chipBg = dark ? palette.background.paper : '#ffffff';
  const chipText = dark ? palette.text.secondary : '#42524A';
  const zoomText = dark ? palette.text.primary : '#3A4A42';
  const dotFav = dark ? '#7CA86C' : '#1B5E3A';
  const sqLand = dark ? 'rgba(120,170,105,0.5)' : '#BBD6AC';

  return (
    <Box id="distribution" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t(`${D}.sectionTitle`)}
        badge={<StatusBadge variant="data" />}
        mb="4px"
      />
      <Typography
        sx={{ m: 0, mb: '14px', fontSize: 13, color: 'text.secondary' }}
      >
        {t(`${D}.caption`)}
      </Typography>

      <Box sx={visuallyHidden}>{egg.mapOverlay.join(' ')}</Box>

      <Box
        aria-hidden
        sx={{
          position: 'relative',
          height: { xs: 240, md: 320 },
          borderRadius: 3,
          overflow: 'hidden',
          bgcolor: mapBg,
          border: '1px solid',
          borderColor: 'borderSubtle',
          backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
        }}
      >
        {BLOBS.map((b, i) => (
          <Box
            key={`b${i}`}
            sx={{
              position: 'absolute',
              left: b.left,
              top: b.top,
              width: b.w,
              height: b.h,
              borderRadius: '50%',
              background: `radial-gradient(ellipse at center, ${blob} 0%, ${blob} 45%, transparent 75%)`,
              filter: 'blur(7px)',
            }}
          />
        ))}
        {CORES.map((c, i) => (
          <Box
            key={`c${i}`}
            sx={{
              position: 'absolute',
              left: c.left,
              top: c.top,
              width: c.w,
              height: c.h,
              borderRadius: '50%',
              background: `radial-gradient(ellipse at center, ${core} 0%, transparent 70%)`,
              filter: 'blur(5px)',
            }}
          />
        ))}

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
              maxWidth: 520,
              textAlign: 'center',
              bgcolor: chipBg,
              borderRadius: 5,
              px: 2.25,
              py: 1.25,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            {egg.mapOverlay.map((line) => (
              <Typography
                key={line}
                sx={{ fontSize: 13, fontWeight: 600, color: chipText }}
              >
                {line}
              </Typography>
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: chipBg,
            borderRadius: 1.5,
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          <Box
            role="presentation"
            sx={{
              width: 34,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: zoomText,
              borderBottom: '1px solid',
              borderColor: 'borderSubtle',
            }}
          >
            <Sym name="add" size={18} />
          </Box>
          <Box
            role="presentation"
            sx={{
              width: 34,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: zoomText,
            }}
          >
            <Sym name="remove" size={18} />
          </Box>
        </Box>

        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            display: 'flex',
            gap: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              bgcolor: chipBg,
              borderRadius: 5,
              px: 1.25,
              py: 0.5,
              boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: dotFav,
              }}
            />
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: chipText }}>
              {t(`${D}.legendFavorable`)}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              bgcolor: chipBg,
              borderRadius: 5,
              px: 1.25,
              py: 0.5,
              boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            }}
          >
            <Box
              sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: sqLand }}
            />
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: chipText }}>
              {t(`${D}.legendLandmass`)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
