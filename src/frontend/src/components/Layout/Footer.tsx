import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import OutlinedInput from '@mui/material/OutlinedInput';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { NAV_BG } from '../../constants/colors';
import LogoButton from '../LogoButton';

const exploreLinks = [
  { key: 'footer.library', to: '/library' },
  { key: 'footer.plantFinder', to: '/finder' },
];

const aboutLinks = [
  { key: 'footer.aboutUs', to: '/about' },
  { key: 'footer.contact', to: '/contact' },
  { key: 'footer.privacy', to: '/privacy' },
];

function FooterLink({ label, to }: { label: string; to: string }) {
  return (
    <Link
      component={RouterLink}
      to={to}
      underline="hover"
      sx={{
        color: 'rgba(255,255,255,0.75)',
        display: 'block',
        mb: 0.75,
        fontSize: 14,
      }}
    >
      {label}
    </Link>
  );
}

export default function Footer() {
  const { t } = useTranslation();
  return (
    <Box
      component="footer"
      sx={{ bgcolor: NAV_BG, color: '#fff', pt: 6, pb: 3 }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* Column 1: Brand */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}
            >
              <LogoButton height={36} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                SmartCrops
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}
            >
              {t('footer.tagline')}
            </Typography>
          </Grid>

          {/* Column 2: Explore */}
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, mb: 1.5, letterSpacing: 0.5 }}
            >
              {t('footer.explore').toUpperCase()}
            </Typography>
            {exploreLinks.map((l) => (
              <FooterLink key={l.key} label={t(l.key)} to={l.to} />
            ))}
          </Grid>

          {/* Column 3: About */}
          <Grid size={{ xs: 6, sm: 3, md: 3 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, mb: 1.5, letterSpacing: 0.5 }}
            >
              {t('footer.about').toUpperCase()}
            </Typography>
            {aboutLinks.map((l) => (
              <FooterLink key={l.key} label={t(l.key)} to={l.to} />
            ))}
          </Grid>

          {/* Column 4: Connect */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, mb: 1.5, letterSpacing: 0.5 }}
            >
              {t('footer.connect').toUpperCase()}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255,255,255,0.7)', mb: 1.5 }}
            >
              {t('footer.connectDescription')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <OutlinedInput
                placeholder={t('footer.emailPlaceholder')}
                type="email"
                inputProps={{ 'aria-label': t('footer.emailAriaLabel') }}
                size="small"
                sx={{
                  flexGrow: 1,
                  bgcolor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 13,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.3)',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.6)',
                  },
                  '& input::placeholder': { color: 'rgba(255,255,255,0.5)' },
                }}
              />
              <Button
                variant="contained"
                color="primary"
                size="small"
                sx={{ whiteSpace: 'nowrap' }}
              >
                {t('footer.subscribe')}
              </Button>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 4 }} />

        {/* SMA-35: light wiring only — Legal Notice/Terms on the copyright line. */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            columnGap: 1.5,
            rowGap: 0.5,
          }}
        >
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </Typography>
          <Typography
            variant="body2"
            component="span"
            sx={{ color: 'rgba(255,255,255,0.35)' }}
          >
            ·
          </Typography>
          <Link
            component={RouterLink}
            to="/legal-notice"
            underline="hover"
            sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}
          >
            {t('footer.legalNotice')}
          </Link>
          <Typography
            variant="body2"
            component="span"
            sx={{ color: 'rgba(255,255,255,0.35)' }}
          >
            ·
          </Typography>
          <Link
            component={RouterLink}
            to="/terms"
            underline="hover"
            sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}
          >
            {t('footer.termsOfUse')}
          </Link>
        </Box>
      </Container>
    </Box>
  );
}
