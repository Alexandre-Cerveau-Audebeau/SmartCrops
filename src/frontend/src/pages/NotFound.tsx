import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
        textAlign: 'center',
        px: 2,
      }}
    >
      <Typography variant="h1" fontWeight={700} color="primary" sx={{ fontSize: { xs: '5rem', md: '8rem' } }}>
        {t('notFound.title')}
      </Typography>
      <Typography variant="h5" fontWeight={600}>
        {t('notFound.heading')}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {t('notFound.message')}
      </Typography>
      <Button component={RouterLink} to="/" variant="contained" color="primary" size="large" sx={{ mt: 1 }}>
        {t('notFound.backHome')}
      </Button>
    </Box>
  );
}
