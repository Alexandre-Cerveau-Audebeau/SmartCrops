import { memo } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import StatusBadge from '../../components/plantDetail/StatusBadge';
import { Sym } from '../../components/Sym';
import type { EasterEggEntry } from '../types';

/**
 * Section 07 for an easter egg: CultureSection's icon rows, verbatim, over this
 * entry's written facts instead of the Perenual propagation fields.
 */
export const EggCulture = memo(function EggCulture({
  egg,
}: {
  egg: EasterEggEntry;
}) {
  const { t } = useTranslation();
  const dark = useTheme().palette.mode === 'dark';
  return (
    <Box id="edible" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t('plantDetail.sections.edibleAndPropagation')}
        badge={<StatusBadge variant="build" />}
        mb="16px"
      />
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'borderSubtle',
          borderRadius: '12px',
          p: '18px 20px',
          boxShadow: dark ? 'none' : '0 1px 3px rgba(27,94,58,0.05)',
        }}
      >
        <Stack spacing="10px">
          {egg.culture.map((r) => (
            <Box
              // The label is the row's identity; the icon is a presentation
              // choice two rows may legitimately share.
              key={r.label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                p: '10px 12px',
                bgcolor: 'surfaceSubtle',
                color: 'primary.main',
                borderRadius: '9px',
              }}
            >
              <Sym name={r.icon} size={20} color="inherit" />
              <Box
                sx={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'text.primary',
                }}
              >
                {r.label}
              </Box>
              <Box sx={{ fontSize: 14, fontWeight: 700, color: 'heading' }}>
                {r.value}
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
});
