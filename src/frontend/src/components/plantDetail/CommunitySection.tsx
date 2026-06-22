import { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';

const S = 'plantDetail.community';

/**
 * Community teaser for Plant Detail v2 (SMA-78, section 15). Empty-state panel
 * carrying the "COMING SOON · BACKEND" badge: a disabled "suggest a correction"
 * bar, an honest empty comments state (no invented comments) and a locked
 * banner. Always mounted (teaser, not gated); the matching TOC entry
 * (`community`) stays `coming-backend` (non-clickable). Colours are mode-aware.
 * Real corrections/comments are wired later (SMA-78 follow-up).
 */
export const CommunitySection = memo(function CommunitySection() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';

  return (
    <Box id="community" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t(`${S}.sectionTitle`)}
        badge={<StatusBadge variant="backend" />}
        mb="4px"
      />
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: '14px' }}>
        {t(`${S}.caption`)}
      </Typography>

      <Box
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: dark ? 'none' : '0 1px 3px rgba(27,94,58,0.05)',
        }}
      >
        {/* (a) Correction bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.75,
            flexWrap: 'wrap',
            px: 2.5,
            py: 2,
            bgcolor: dark ? 'rgba(255,255,255,0.03)' : '#F7FBF5',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 700,
                color: dark ? '#86D2A6' : '#1B5E3A',
              }}
            >
              {t(`${S}.correctionTitle`)}
            </Typography>
            <Typography
              sx={{ fontSize: 12, color: 'text.secondary', mt: '1px' }}
            >
              {t(`${S}.correctionSubtitle`)}
            </Typography>
          </Box>
          <Box
            component="button"
            type="button"
            disabled
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: dark ? 'rgba(255,255,255,0.06)' : '#fff',
              color: dark ? '#9BB0D6' : '#2C3E6B',
              border: '1px solid',
              borderColor: dark ? 'rgba(255,255,255,0.15)' : '#cdd6e8',
              borderRadius: '8px',
              px: 2.25,
              py: 1.4,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'not-allowed',
              opacity: 0.7,
            }}
          >
            <Sym name="edit_note" size={19} />
            {t(`${S}.proposeButton`)}
          </Box>
        </Box>

        {/* (b) Comments — honest empty state */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            px: 2.5,
            py: 4,
            textAlign: 'center',
          }}
        >
          <Sym
            name="forum"
            size={26}
            color={dark ? 'rgba(255,255,255,0.30)' : '#b0bbb2'}
          />
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            {t(`${S}.emptyComments`)}
          </Typography>
        </Box>

        {/* (c) Locked banner */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.75,
            bgcolor: dark ? 'rgba(255,255,255,0.02)' : '#FAFDF7',
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Sym
            name="lock"
            size={22}
            color={dark ? 'rgba(255,255,255,0.35)' : '#b0bbb2'}
          />
          <Typography sx={{ flex: 1, fontSize: 13, color: 'text.secondary' }}>
            {t(`${S}.lockedMessage`)}
          </Typography>
          <Box
            component="span"
            sx={{
              bgcolor: dark ? 'rgba(155,176,214,0.15)' : '#EAF0FA',
              color: dark ? '#9BB0D6' : '#2C3E6B',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              borderRadius: '999px',
              px: 1.25,
              py: 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            {t(`${S}.soonPill`)}
          </Box>
        </Box>
      </Box>
    </Box>
  );
});
