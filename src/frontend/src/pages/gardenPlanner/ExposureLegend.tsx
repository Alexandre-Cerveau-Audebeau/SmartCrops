import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { getPlannerTokens } from '../../theme/plannerTokens';
import type { ExposureCategory, Moment, Season } from '../../utils/exposure';

const CATEGORIES: ExposureCategory[] = ['full', 'morning', 'afternoon', 'shade'];

interface ExposureLegendProps {
  season: Season;
  moment: Moment;
}

/**
 * Exposure-layer legend card (SMA-17 5.3-D, tokens §9): rendered only while
 * the layer is visible. Title "Exposition — {saison} · {moment}" (lowercased
 * per §13's reference format "Exposition — été · midi"), then the 4 category
 * swatches — 16 px (13 mobile), radius 5, category fill/border, "Ombre" with
 * the §3 hatch. The legend is DYNAMIC by design: the 5th "Ombre portée"
 * swatch ships with 5.4 infrastructures (nothing casts a shadow before then),
 * and the DnD swatches ship with chantier E.
 */
export const ExposureLegend = memo(function ExposureLegend({
  season,
  moment,
}: ExposureLegendProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const tk = getPlannerTokens(theme.palette.mode === 'dark' ? 'dark' : 'light');

  // §13 shows the title terms lowercase ("été · midi") while the row-2
  // presets are capitalized ("Été · Midi") — one set of keys, locale-aware
  // lowercasing for the title.
  const title = t('planner.exposure.legendTitle', {
    season: t(`planner.exposure.seasons.${season}`).toLocaleLowerCase(
      i18n.language
    ),
    moment: t(`planner.exposure.moments.${moment}`).toLocaleLowerCase(
      i18n.language
    ),
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: { xs: '10px', sm: '16px' },
        mt: 1.5,
        p: '12px 16px',
        borderRadius: '12px',
        bgcolor: tk.card,
        border: `1px solid ${tk.cardBd}`,
        boxShadow: tk.shadow,
      }}
    >
      <Typography
        component="h3"
        sx={{ fontSize: { xs: 11, sm: 13 }, fontWeight: 800, color: tk.tTitle }}
      >
        {title}
      </Typography>
      {CATEGORIES.map((category) => (
        <Box
          key={category}
          sx={{ display: 'flex', alignItems: 'center', gap: '7px' }}
        >
          <Box
            sx={{
              width: { xs: 13, sm: 16 },
              height: { xs: 13, sm: 16 },
              borderRadius: '5px',
              bgcolor: tk.expo[category].fill,
              border: `1px solid ${tk.expo[category].border}`,
              ...(category === 'shade' && { backgroundImage: tk.hatch }),
            }}
          />
          <Typography
            sx={{
              fontSize: { xs: 10.5, sm: 12.5 },
              fontWeight: 600,
              color: tk.tMeta,
            }}
          >
            {t(`planner.exposure.categories.${category}`)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
});
