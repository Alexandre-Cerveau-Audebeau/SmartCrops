import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import ComingSoonChip from '../components/ComingSoonChip';

/** SMA-150 (footer half): /shop — sober placeholder page until the shop ships. */
export default function Shop() {
  const { t } = useTranslation();

  return (
    <Box sx={{ bgcolor: 'background.default' }}>
      <Container
        maxWidth="sm"
        sx={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 2,
          py: 8,
        }}
      >
        <Typography variant="h3" component="h1" sx={{ fontWeight: 700 }}>
          {t('shop.title')}
        </Typography>
        <ComingSoonChip size="medium" sx={{ fontSize: 16, py: 2, px: 1 }} />
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 460 }}
        >
          {t('shop.teaser')}
        </Typography>
        <Button
          variant="contained"
          component={RouterLink}
          to="/library"
          size="large"
          sx={{ mt: 1 }}
        >
          {t('shop.cta')}
        </Button>
      </Container>
    </Box>
  );
}
