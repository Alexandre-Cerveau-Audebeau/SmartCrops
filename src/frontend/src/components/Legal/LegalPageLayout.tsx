import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TranslateIcon from '@mui/icons-material/Translate';
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
              bgcolor: '#EAF1F7',
              border: '1px solid #D4E0EC',
              px: 2,
              py: 1.5,
              mb: 3,
            }}
          >
            <TranslateIcon
              sx={{ color: '#4A6B8A', fontSize: 20, flexShrink: 0 }}
            />
            <Typography variant="body2" sx={{ color: '#3D5A75' }}>
              {t('legal.layout.courtesy')}
            </Typography>
          </Paper>
        )}

        <Card sx={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack
              divider={<Divider sx={{ borderColor: 'rgba(0,0,0,0.08)' }} />}
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
