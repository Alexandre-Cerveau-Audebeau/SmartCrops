import { memo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';
import type { PlantPest } from '../../types/Plant';

interface PestsSectionProps {
  pests: readonly PlantPest[];
}

/**
 * Pests & diseases for Plant Detail v2 (SMA-227, section 08). A responsive grid
 * of pest cards (real name + type, hatched placeholder) opening a detail modal.
 * The grid is LIVE (real `name`/`type`); the modal is an honest TEASER — the
 * rich fields (symptoms/solutions/photo) are 0%-filled in the DB today (raw in
 * PerenualPestCatalog, not yet linked — SMA-143 follow-up), so the modal shows
 * a "coming soon" state instead of invented content. BUILD NOW badge. Mounted
 * only when >0 pests (gating preserved). Colours are mode-aware.
 */
export const PestsSection = memo(function PestsSection({
  pests,
}: PestsSectionProps) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';
  const [activePest, setActivePest] = useState<PlantPest | null>(null);

  const typeLabel = (ty: string) => t(`plantDetail.pests.types.${ty}`, ty);

  const briqueLight =
    'repeating-linear-gradient(45deg,#f4ece9,#f4ece9 9px,#ecdfd9 9px,#ecdfd9 18px)';
  const briqueDark =
    'repeating-linear-gradient(45deg,rgba(255,255,255,0.04),rgba(255,255,255,0.04) 9px,rgba(255,255,255,0.07) 9px,rgba(255,255,255,0.07) 18px)';
  const brique = dark ? briqueDark : briqueLight;
  const pestIconColor = dark ? 'rgba(255,255,255,0.30)' : '#bda79d';

  return (
    <Box id="pests" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t('plantDetail.sections.pestsAndDiseases')}
        badge={<StatusBadge variant="build" />}
        mb="16px"
      />

      {/* Two-row horizontal carousel: cards fill column-by-column over two rows,
          beyond what fits the row scrolls horizontally (height-bounded, no cap).
          Scroll mechanics + scrollbar match the gallery filmstrip; card width is
          210px (richer content than the gallery's 150px image-only tiles). */}
      <Box
        sx={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(2, auto)',
          gridAutoColumns: '210px',
          gap: '14px',
          overflowX: 'scroll',
          overflowY: 'hidden',
          pb: '8px',
          scrollbarWidth: 'thin',
          scrollbarColor: `${palette.borderSubtle} transparent`,
          '&::-webkit-scrollbar': { height: '8px' },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
            borderRadius: '8px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: palette.borderSubtle,
            borderRadius: '8px',
          },
        }}
      >
        {pests.map((pest) => (
          <Box
            key={pest.id}
            component="button"
            type="button"
            onClick={() => setActivePest(pest)}
            aria-label={t('plantDetail.pests.viewDetailFor', {
              name: pest.name,
            })}
            sx={{
              textAlign: 'left',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '12px',
              overflow: 'hidden',
              cursor: 'pointer',
              p: 0,
              fontFamily: 'inherit',
              boxShadow: dark ? 'none' : '0 1px 3px rgba(27,94,58,0.05)',
              transition: 'border-color .15s',
              '&:hover': {
                borderColor: dark ? 'rgba(255,255,255,0.25)' : '#cdd6e8',
              },
            }}
          >
            <Box
              sx={{
                aspectRatio: '16/9',
                background: brique,
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Sym name="pest_control" size={26} color={pestIconColor} />
              </Box>
            </Box>
            <Box sx={{ px: '14px', py: '12px' }}>
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: dark ? '#86D2A6' : '#1B5E3A',
                }}
              >
                {pest.name}
              </Typography>
              <Typography
                sx={{ fontSize: 11, color: 'text.secondary', mt: '2px' }}
              >
                {typeLabel(pest.type)}
              </Typography>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  mt: '8px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#A0522D',
                }}
              >
                {t('plantDetail.pests.viewDetail')}
                <Sym name="arrow_forward" size={15} />
              </Box>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Detail modal — honest TEASER (MUI Dialog, a11y) */}
      <Dialog
        open={!!activePest}
        onClose={() => setActivePest(null)}
        disableScrollLock
        maxWidth={false}
        aria-labelledby="pest-modal-title"
        PaperProps={{
          sx: {
            width: '100%',
            maxWidth: '620px',
            borderRadius: '16px',
            overflow: 'hidden',
            m: 2,
          },
        }}
      >
        {activePest && (
          <>
            <Box
              sx={{
                aspectRatio: '21/9',
                background: brique,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sym name="pest_control" size={40} color={pestIconColor} />
              <IconButton
                onClick={() => setActivePest(null)}
                aria-label={t('common.close', 'Close')}
                sx={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  width: 38,
                  height: 38,
                  bgcolor: 'rgba(255,255,255,0.9)',
                  color: '#3a463f',
                  '&:hover': { bgcolor: '#fff' },
                }}
              >
                <Sym name="close" size={22} />
              </IconButton>
            </Box>
            <Box sx={{ px: '28px', py: '24px' }}>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#A0522D',
                }}
              >
                {typeLabel(activePest.type)}
              </Typography>
              <Typography
                id="pest-modal-title"
                component="h3"
                sx={{
                  m: '4px 0 20px',
                  fontSize: 24,
                  fontWeight: 800,
                  color: dark ? '#86D2A6' : '#1B5E3A',
                }}
              >
                {activePest.name}
              </Typography>
              {/* Honest empty state (symptoms/solutions = 0% in DB, unblocked by SMA-143) */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1.25,
                  py: 4,
                  textAlign: 'center',
                }}
              >
                <Sym
                  name="schedule"
                  size={30}
                  color={dark ? 'rgba(255,255,255,0.30)' : '#b0bbb2'}
                />
                <Typography
                  sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 380 }}
                >
                  {t('plantDetail.pests.modalTeaser')}
                </Typography>
                <Box
                  component="span"
                  sx={{
                    mt: 0.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    bgcolor: dark ? 'rgba(160,82,45,0.18)' : '#FBEEE6',
                    color: '#A0522D',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    borderRadius: '6px',
                    px: 1.25,
                    py: 0.5,
                  }}
                >
                  <Sym name="schedule" size={13} />
                  {t('plantDetail.pests.modalTeaserBadge')}
                </Box>
              </Box>
            </Box>
          </>
        )}
      </Dialog>
    </Box>
  );
});
