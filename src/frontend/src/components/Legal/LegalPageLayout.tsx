import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import TranslateIcon from '@mui/icons-material/Translate';
import { adaptBadge } from '../../utils/badgeColors';
import PlaceholderChip from './PlaceholderChip';

interface LegalPageLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * SMA-35: shared template for the three legal pages — centered header
 * (title, optional subtitle, last-updated placeholder), a courtesy-translation
 * notice when the active language is EN (the French version prevails), and a
 * white reading-column card whose numbered sections are separated by dividers.
 */
export default function LegalPageLayout({
  title,
  subtitle,
  children,
}: LegalPageLayoutProps) {
  const { t, i18n } = useTranslation();
  const isEnglish = i18n.resolvedLanguage === 'en';
  const courtesy = adaptBadge(
    { bg: '#EAF1F7', fg: '#3D5A75', border: '#D4E0EC' },
    useTheme().palette.mode
  );

  return (
    <Box sx={{ py: { xs: 4, md: 6 }, px: { xs: 2, sm: 3 } }}>
      <Box sx={{ maxWidth: 760, mx: 'auto' }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 700, mb: 1 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', fontStyle: 'italic', mb: 1 }}
            >
              {subtitle}
            </Typography>
          )}
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {t('legal.layout.lastUpdated')}{' '}
            <PlaceholderChip text={t('legal.layout.updatedDate')} />
          </Typography>
        </Box>

        {isEnglish && (
          <Paper
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              bgcolor: courtesy.bg,
              border: '1px solid',
              borderColor: courtesy.border,
              px: 2,
              py: 1.5,
              mb: 3,
            }}
          >
            <TranslateIcon
              aria-hidden="true"
              sx={{ color: courtesy.fg, fontSize: 20, flexShrink: 0 }}
            />
            <Typography variant="body2" sx={{ color: courtesy.fg }}>
              {t('legal.layout.courtesy')}
            </Typography>
          </Paper>
        )}

        <Card sx={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack
              divider={<Divider sx={{ borderColor: 'divider' }} />}
              spacing={3.5}
            >
              {children}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
