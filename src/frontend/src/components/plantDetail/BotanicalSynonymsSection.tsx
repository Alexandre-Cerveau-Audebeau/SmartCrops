import { memo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import type { PlantSynonym } from '../../types/Plant';

const S = 'plantDetail.synonyms';
const PREVIEW_COUNT = 12;

interface BotanicalSynonymsSectionProps {
  synonyms: readonly PlantSynonym[];
}

/**
 * Botanical synonyms for Plant Detail v2 (SMA-223, section 10). A wrap of
 * italic synonym chips; when there are more than PREVIEW_COUNT, the surplus
 * is hidden behind a "+N more" toggle chip. Each chip carries its botanical
 * authority (e.g. "Mill.") in a tooltip when present. Real data only. BUILD
 * NOW badge. Mounted only when >0 synonyms (gating preserved). Mode-aware.
 */
export const BotanicalSynonymsSection = memo(function BotanicalSynonymsSection({
  synonyms,
}: BotanicalSynonymsSectionProps) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';
  const [expanded, setExpanded] = useState(false);

  const hasOverflow = synonyms.length > PREVIEW_COUNT;
  const visible = expanded ? synonyms : synonyms.slice(0, PREVIEW_COUNT);
  const hiddenCount = synonyms.length - PREVIEW_COUNT;

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
        {t(`${S}.caption`, { count: synonyms.length })}
      </Typography>

      <Box
        id="synonyms-list"
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
      >
        {visible.map((s) => {
          const chipSx: SxProps<Theme> = {
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
                sx={chipSx}
                tabIndex={0}
                aria-label={`${s.synonym} (${s.authority})`}
              >
                {s.synonym}
              </Box>
            </Tooltip>
          ) : (
            <Box key={s.id} sx={chipSx}>
              {s.synonym}
            </Box>
          );
        })}

        {hasOverflow && (
          <Box
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
